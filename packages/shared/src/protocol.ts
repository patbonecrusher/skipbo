import type { ErrorCode, PlaySource, RedactedGameState } from './types.js';

// ---- Client -> Server ----

export interface CreateGameMessage {
  action: 'createGame';
  playerName: string;
}

export interface JoinGameMessage {
  action: 'joinGame';
  gameId: string;
  playerName: string;
}

export interface RejoinGameMessage {
  action: 'rejoinGame';
  gameId: string;
  playerId: string;
}

export interface StartGameMessage {
  action: 'startGame';
}

export interface AddBotMessage {
  action: 'addBot';
}

export interface PlayCardMessage {
  action: 'playCard';
  source: PlaySource;
  buildPileIndex: 0 | 1 | 2 | 3;
}

export interface DiscardCardMessage {
  action: 'discardCard';
  cardId: string;
  pileIndex: 0 | 1 | 2 | 3;
}

export interface UndoMessage {
  action: 'undo';
}

export interface RematchMessage {
  action: 'rematch';
}

export interface LeaveGameMessage {
  action: 'leaveGame';
}

export type ClientMessage =
  | CreateGameMessage
  | JoinGameMessage
  | RejoinGameMessage
  | StartGameMessage
  | AddBotMessage
  | PlayCardMessage
  | DiscardCardMessage
  | UndoMessage
  | RematchMessage
  | LeaveGameMessage;

// ---- Server -> Client ----

export interface GameCreatedMessage {
  type: 'gameCreated';
  gameId: string;
  playerId: string;
}

export interface JoinedMessage {
  type: 'joined';
  gameId: string;
  playerId: string;
}

export interface StateMessage {
  type: 'state';
  state: RedactedGameState;
}

export interface ErrorMessage {
  type: 'error';
  code: ErrorCode;
  params?: Record<string, string | number>;
}

/** Non-error, informational broadcasts -- e.g. someone left, or a disconnected player's turn was skipped. */
export type NoticeCode = 'PLAYER_LEFT' | 'TURN_SKIPPED';

export interface NoticeMessage {
  type: 'notice';
  code: NoticeCode;
  params?: Record<string, string | number>;
}

export type ServerMessage = GameCreatedMessage | JoinedMessage | StateMessage | ErrorMessage | NoticeMessage;
