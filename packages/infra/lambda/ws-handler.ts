import { ApiGatewayManagementApiClient, PostToConnectionCommand, GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import type { APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { MAX_PLAYERS, MIN_PLAYERS, applyDiscard, applyPlay, dealGame, redactForPlayer } from '@skipbo/shared';
import type { ClientMessage, RedactedGameState, ServerMessage } from '@skipbo/shared';
import {
  ConditionalCheckFailedException,
  GameRecord,
  createPendingGame,
  deleteConnection,
  getConnection,
  getGame,
  newPlayerId,
  parseState,
  putConnection,
  saveGame,
  withState,
} from './db.js';

const management = new ApiGatewayManagementApiClient({ endpoint: process.env.WS_MANAGEMENT_ENDPOINT });

async function send(connectionId: string, message: ServerMessage): Promise<void> {
  try {
    await management.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(message)),
      }),
    );
  } catch (err) {
    if (err instanceof GoneException) return; // client disconnected; safe to ignore
    throw err;
  }
}

function redactedForPlayer(record: GameRecord, playerId: string): RedactedGameState {
  if (record.status === 'waiting-for-players') {
    const youIndex = record.players.findIndex((p) => p.id === playerId);
    return {
      gameId: record.gameId,
      status: 'waiting-for-players',
      youIndex,
      isHost: record.hostId === playerId,
      players: record.players.map((p) => ({ id: p.id, name: p.name, connected: p.connectionId !== null })),
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
    };
  }
  return redactForPlayer(parseState(record), playerId);
}

async function broadcastState(record: GameRecord): Promise<void> {
  await Promise.all(
    record.players
      .filter((p): p is typeof p & { connectionId: string } => !!p.connectionId)
      .map((p) => send(p.connectionId, { type: 'state', state: redactedForPlayer(record, p.id) })),
  );
}

/** Reload + reapply `mutate` a few times in case of a concurrent write conflict. */
async function saveGameWithRetry(gameId: string, mutate: (record: GameRecord) => GameRecord): Promise<GameRecord> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const record = await getGame(gameId);
    if (!record) throw new Error('Game not found');
    const updated = mutate(record);
    try {
      await saveGame(updated);
      return updated;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error('Could not save game after several attempts');
}

async function handleConnect(): Promise<APIGatewayProxyResultV2> {
  return { statusCode: 200 };
}

async function handleDisconnect(connectionId: string): Promise<APIGatewayProxyResultV2> {
  const conn = await getConnection(connectionId);
  if (conn) {
    try {
      const record = await saveGameWithRetry(conn.gameId, (rec) => {
        const idx = rec.players.findIndex((p) => p.id === conn.playerId);
        if (idx === -1) return rec;
        const players = rec.players.map((p, i) => (i === idx ? { ...p, connectionId: null } : p));
        let updated: GameRecord = { ...rec, players };
        if (updated.stateJson) {
          const state = parseState(updated);
          state.players[idx].connected = false;
          updated = withState(updated, state);
        }
        return updated;
      });
      await broadcastState(record);
    } catch {
      // best effort; nothing more we can do if the game record is gone
    }
    await deleteConnection(connectionId);
  }
  return { statusCode: 200 };
}

async function handleMessage(connectionId: string, body: string): Promise<APIGatewayProxyResultV2> {
  let message: ClientMessage;
  try {
    message = JSON.parse(body) as ClientMessage;
  } catch {
    await send(connectionId, { type: 'error', message: 'Malformed message' });
    return { statusCode: 200 };
  }

  try {
    switch (message.action) {
      case 'createGame': {
        const playerId = newPlayerId();
        const record = await createPendingGame(playerId, message.playerName.slice(0, 40));
        record.players[0].connectionId = connectionId;
        await saveGame(record);
        await putConnection({ connectionId, gameId: record.gameId, playerId });
        await send(connectionId, { type: 'gameCreated', gameId: record.gameId, playerId });
        await broadcastState(record);
        return { statusCode: 200 };
      }

      case 'joinGame': {
        const playerId = newPlayerId();
        let failure: string | null = null;
        const record = await saveGameWithRetry(message.gameId, (rec) => {
          if (rec.status !== 'waiting-for-players') {
            failure = 'That game has already started';
            return rec;
          }
          if (rec.players.length >= MAX_PLAYERS) {
            failure = 'That game is full';
            return rec;
          }
          return {
            ...rec,
            players: [...rec.players, { id: playerId, name: message.playerName.slice(0, 40), connectionId }],
          };
        });
        if (failure) {
          await send(connectionId, { type: 'error', message: failure });
          return { statusCode: 200 };
        }
        await putConnection({ connectionId, gameId: record.gameId, playerId });
        await send(connectionId, { type: 'joined', gameId: record.gameId, playerId });
        await broadcastState(record);
        return { statusCode: 200 };
      }

      case 'rejoinGame': {
        const existing = await getGame(message.gameId);
        if (!existing || !existing.players.some((p) => p.id === message.playerId)) {
          await send(connectionId, { type: 'error', message: 'Game not found for that player' });
          return { statusCode: 200 };
        }
        const record = await saveGameWithRetry(message.gameId, (rec) => {
          const idx = rec.players.findIndex((p) => p.id === message.playerId);
          if (idx === -1) return rec;
          const players = rec.players.map((p, i) => (i === idx ? { ...p, connectionId } : p));
          let updated: GameRecord = { ...rec, players };
          if (updated.stateJson) {
            const state = parseState(updated);
            state.players[idx].connected = true;
            updated = withState(updated, state);
          }
          return updated;
        });
        await putConnection({ connectionId, gameId: record.gameId, playerId: message.playerId });
        await send(connectionId, { type: 'joined', gameId: record.gameId, playerId: message.playerId });
        await broadcastState(record);
        return { statusCode: 200 };
      }

      case 'startGame': {
        const conn = await getConnection(connectionId);
        if (!conn) {
          await send(connectionId, { type: 'error', message: 'Not connected to a game' });
          return { statusCode: 200 };
        }
        let failure: string | null = null;
        const record = await saveGameWithRetry(conn.gameId, (rec) => {
          if (rec.hostId !== conn.playerId) {
            failure = 'Only the host can start the game';
            return rec;
          }
          if (rec.status !== 'waiting-for-players') {
            failure = 'Game already started';
            return rec;
          }
          if (rec.players.length < MIN_PLAYERS) {
            failure = `Need at least ${MIN_PLAYERS} players to start`;
            return rec;
          }
          const freshState = dealGame(
            rec.gameId,
            rec.players.map((p) => ({ id: p.id, name: p.name })),
          );
          return withState(rec, freshState);
        });
        if (failure) {
          await send(connectionId, { type: 'error', message: failure });
        } else {
          await broadcastState(record);
        }
        return { statusCode: 200 };
      }

      case 'playCard':
      case 'discardCard': {
        const conn = await getConnection(connectionId);
        if (!conn) {
          await send(connectionId, { type: 'error', message: 'Not connected to a game' });
          return { statusCode: 200 };
        }
        let failure: string | null = null;
        const record = await saveGameWithRetry(conn.gameId, (rec) => {
          if (!rec.stateJson) {
            failure = 'Game has not started yet';
            return rec;
          }
          const state = parseState(rec);
          const result =
            message.action === 'playCard'
              ? applyPlay(state, { type: 'play', playerId: conn.playerId, source: message.source, buildPileIndex: message.buildPileIndex })
              : applyDiscard(state, { type: 'discard', playerId: conn.playerId, cardId: message.cardId, pileIndex: message.pileIndex });
          if (!result.ok) {
            failure = result.error ?? 'Invalid move';
            return rec;
          }
          return withState(rec, result.state);
        });
        if (failure) {
          await send(connectionId, { type: 'error', message: failure });
        } else {
          await broadcastState(record);
        }
        return { statusCode: 200 };
      }

      case 'rematch': {
        const conn = await getConnection(connectionId);
        if (!conn) {
          await send(connectionId, { type: 'error', message: 'Not connected to a game' });
          return { statusCode: 200 };
        }
        let failure: string | null = null;
        const record = await saveGameWithRetry(conn.gameId, (rec) => {
          if (rec.status !== 'finished') {
            failure = 'Game is not finished yet';
            return rec;
          }
          const freshState = dealGame(
            rec.gameId,
            rec.players.map((p) => ({ id: p.id, name: p.name })),
          );
          return withState(rec, freshState);
        });
        if (failure) {
          await send(connectionId, { type: 'error', message: failure });
        } else {
          await broadcastState(record);
        }
        return { statusCode: 200 };
      }

      default:
        await send(connectionId, { type: 'error', message: 'Unknown action' });
        return { statusCode: 200 };
    }
  } catch (err) {
    console.error('Error handling message', err);
    await send(connectionId, { type: 'error', message: 'Server error, please try again' });
    return { statusCode: 200 };
  }
}

export const handler = async (event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> => {
  const { routeKey, connectionId } = event.requestContext;
  if (routeKey === '$connect') return handleConnect();
  if (routeKey === '$disconnect') return handleDisconnect(connectionId);
  return handleMessage(connectionId, event.body ?? '{}');
};
