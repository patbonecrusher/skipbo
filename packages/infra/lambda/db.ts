import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { GameState } from '@skipbo/shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const GAMES_TABLE = process.env.GAMES_TABLE!;
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;

const GAME_TTL_SECONDS = 60 * 60 * 24 * 3; // games are cleaned up 3 days after creation
// API Gateway WebSocket connections are force-closed after 2 hours at the latest, so this only
// ever catches connections whose $disconnect event never made it to us (crash, dropped network).
const CONNECTION_TTL_SECONDS = 60 * 60 * 24;

export interface GamePlayer {
  id: string;
  name: string;
  connectionId: string | null;
  isBot: boolean;
}

export interface GameRecord {
  gameId: string;
  status: 'waiting-for-players' | 'in-progress' | 'finished';
  hostId: string;
  players: GamePlayer[];
  stateJson: string | null;
  version: number;
  createdAt: number;
  expiresAt: number;
  /** Snapshot of stateJson from just before undoPlayerId's last play, or null if there's nothing to undo. */
  undoStateJson: string | null;
  undoPlayerId: string | null;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

export function randomGameCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function newPlayerId(): string {
  return crypto.randomUUID();
}

export async function createPendingGame(hostId: string, hostName: string): Promise<GameRecord> {
  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    const gameId = randomGameCode();
    const record: GameRecord = {
      gameId,
      status: 'waiting-for-players',
      hostId,
      players: [{ id: hostId, name: hostName, connectionId: null, isBot: false }],
      stateJson: null,
      version: 0,
      createdAt: now,
      expiresAt: Math.floor(now / 1000) + GAME_TTL_SECONDS,
      undoStateJson: null,
      undoPlayerId: null,
    };
    try {
      await client.send(
        new PutCommand({
          TableName: GAMES_TABLE,
          Item: record,
          ConditionExpression: 'attribute_not_exists(gameId)',
        }),
      );
      return record;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) continue; // extremely unlikely code collision, retry
      throw err;
    }
  }
  throw new Error('Failed to allocate a unique game code');
}

export async function getGame(gameId: string): Promise<GameRecord | undefined> {
  const res = await client.send(new GetCommand({ TableName: GAMES_TABLE, Key: { gameId } }));
  return res.Item as GameRecord | undefined;
}

/** Optimistic-locking save: fails if the record has been modified since it was read. */
export async function saveGame(record: GameRecord): Promise<void> {
  const expectedVersion = record.version;
  const updated: GameRecord = { ...record, version: expectedVersion + 1 };
  await client.send(
    new PutCommand({
      TableName: GAMES_TABLE,
      Item: updated,
      ConditionExpression: 'version = :expected',
      ExpressionAttributeValues: { ':expected': expectedVersion },
    }),
  );
  record.version = updated.version;
}

export function parseState(record: GameRecord): GameState {
  if (!record.stateJson) throw new Error('Game has not started yet');
  return JSON.parse(record.stateJson) as GameState;
}

export function withState(record: GameRecord, state: GameState): GameRecord {
  return {
    ...record,
    stateJson: JSON.stringify(state),
    status: state.status === 'finished' ? 'finished' : 'in-progress',
    // Committing a new state always starts from "nothing to undo" -- callers that want an undo
    // point available afterward (a human's own play) set it back explicitly.
    undoStateJson: null,
    undoPlayerId: null,
  };
}

export interface ConnectionRecord {
  connectionId: string;
  gameId: string;
  playerId: string;
}

export async function putConnection(rec: ConnectionRecord): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + CONNECTION_TTL_SECONDS;
  await client.send(new PutCommand({ TableName: CONNECTIONS_TABLE, Item: { ...rec, expiresAt } }));
}

export async function getConnection(connectionId: string): Promise<ConnectionRecord | undefined> {
  const res = await client.send(new GetCommand({ TableName: CONNECTIONS_TABLE, Key: { connectionId } }));
  return res.Item as ConnectionRecord | undefined;
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await client.send(new DeleteCommand({ TableName: CONNECTIONS_TABLE, Key: { connectionId } }));
}

export { ConditionalCheckFailedException };
