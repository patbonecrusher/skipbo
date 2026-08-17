import { ApiGatewayManagementApiClient, PostToConnectionCommand, GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import type { APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { applyDiscard, applyPlay, createGame, redactForPlayer } from '@skipbo/shared';
import type { ClientMessage, ServerMessage } from '@skipbo/shared';
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

async function broadcastState(record: GameRecord): Promise<void> {
  if (!record.stateJson) return;
  const state = parseState(record);
  const targets: Array<[string | null, string]> = [
    [record.player1ConnectionId, record.player1Id],
    [record.player2ConnectionId, record.player2Id ?? ''],
  ];
  await Promise.all(
    targets
      .filter((t): t is [string, string] => !!t[0] && !!t[1])
      .map(([connectionId, playerId]) => send(connectionId, { type: 'state', state: redactForPlayer(state, playerId) })),
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
        if (!rec.stateJson) return rec;
        const state = parseState(rec);
        const idx = state.players[0].id === conn.playerId ? 0 : 1;
        state.players[idx].connected = false;
        return withState(rec, state);
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
        record.player1ConnectionId = connectionId;
        await saveGame(record);
        await putConnection({ connectionId, gameId: record.gameId, playerId });
        await send(connectionId, { type: 'gameCreated', gameId: record.gameId, playerId });
        return { statusCode: 200 };
      }

      case 'joinGame': {
        const existing = await getGame(message.gameId);
        if (!existing) {
          await send(connectionId, { type: 'error', message: 'Game not found' });
          return { statusCode: 200 };
        }
        if (existing.player2Id) {
          await send(connectionId, { type: 'error', message: 'That game already has two players' });
          return { statusCode: 200 };
        }
        const playerId = newPlayerId();
        const state = createGame(
          existing.gameId,
          { id: existing.player1Id, name: existing.player1Name },
          { id: playerId, name: message.playerName.slice(0, 40) },
        );
        const record = withState(
          { ...existing, player2Id: playerId, player2Name: message.playerName.slice(0, 40), player2ConnectionId: connectionId },
          state,
        );
        await saveGame(record);
        await putConnection({ connectionId, gameId: record.gameId, playerId });
        await send(connectionId, { type: 'joined', gameId: record.gameId, playerId });
        await broadcastState(record);
        return { statusCode: 200 };
      }

      case 'rejoinGame': {
        const existing = await getGame(message.gameId);
        if (!existing || (existing.player1Id !== message.playerId && existing.player2Id !== message.playerId)) {
          await send(connectionId, { type: 'error', message: 'Game not found for that player' });
          return { statusCode: 200 };
        }
        const isPlayer1 = existing.player1Id === message.playerId;
        const record: GameRecord = {
          ...existing,
          player1ConnectionId: isPlayer1 ? connectionId : existing.player1ConnectionId,
          player2ConnectionId: !isPlayer1 ? connectionId : existing.player2ConnectionId,
        };
        let toSave = record;
        if (record.stateJson) {
          const state = parseState(record);
          state.players[isPlayer1 ? 0 : 1].connected = true;
          toSave = withState(record, state);
        }
        await saveGame(toSave);
        await putConnection({ connectionId, gameId: toSave.gameId, playerId: message.playerId });
        await send(connectionId, { type: 'joined', gameId: toSave.gameId, playerId: message.playerId });
        await broadcastState(toSave);
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
          if (rec.status !== 'finished' || !rec.player2Id || !rec.player2Name) {
            failure = 'Game is not finished yet';
            return rec;
          }
          const freshState = createGame(
            rec.gameId,
            { id: rec.player1Id, name: rec.player1Name },
            { id: rec.player2Id, name: rec.player2Name },
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
