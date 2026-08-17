export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 'SKIPBO';

export interface Card {
  id: string;
  value: CardValue;
}

export const STOCK_PILE_SIZE = 30;
export const HAND_SIZE = 5;
export const BUILD_PILE_COUNT = 4;
export const DISCARD_PILE_COUNT = 4;
export const MAX_BUILD_VALUE = 12;

export interface PlayerState {
  id: string;
  name: string;
  connected: boolean;
  stockPile: Card[]; // top of pile = last element
  hand: Card[];
  discardPiles: [Card[], Card[], Card[], Card[]];
}

export type GameStatus = 'waiting-for-players' | 'in-progress' | 'finished';

export interface GameState {
  gameId: string;
  status: GameStatus;
  players: [PlayerState, PlayerState];
  currentPlayerIndex: 0 | 1;
  buildPiles: [Card[], Card[], Card[], Card[]];
  drawPile: Card[];
  usedPile: Card[]; // cleared (completed) build piles, reshuffled into drawPile when it empties
  winnerId: string | null;
  createdAt: number;
}

// ---- Actions a client can request ----

export type PlaySource =
  | { kind: 'hand'; cardId: string }
  | { kind: 'stock' }
  | { kind: 'discard'; pileIndex: 0 | 1 | 2 | 3 };

export interface PlayCardAction {
  type: 'play';
  playerId: string;
  source: PlaySource;
  buildPileIndex: 0 | 1 | 2 | 3;
}

export interface DiscardCardAction {
  type: 'discard';
  playerId: string;
  cardId: string;
  pileIndex: 0 | 1 | 2 | 3;
}

export type GameAction = PlayCardAction | DiscardCardAction;

export interface EngineResult {
  ok: boolean;
  error?: string;
  state: GameState;
}

// ---- Redacted (per-player) view sent to clients ----

export interface PileSummary {
  topCard: Card | null;
  count: number;
}

export interface RedactedSelf {
  id: string;
  name: string;
  connected: boolean;
  stockPile: PileSummary;
  hand: Card[];
  discardPiles: [PileSummary, PileSummary, PileSummary, PileSummary];
}

export interface RedactedOpponent {
  id: string;
  name: string;
  connected: boolean;
  stockPile: PileSummary;
  handCount: number;
  discardPiles: [PileSummary, PileSummary, PileSummary, PileSummary];
}

export interface RedactedGameState {
  gameId: string;
  status: GameStatus;
  currentPlayerIndex: 0 | 1;
  you: RedactedSelf;
  youIndex: 0 | 1;
  opponent: RedactedOpponent;
  buildPiles: [PileSummary, PileSummary, PileSummary, PileSummary];
  drawPileCount: number;
  winnerId: string | null;
}
