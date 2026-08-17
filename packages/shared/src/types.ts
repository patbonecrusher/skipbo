export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 'SKIPBO';

export interface Card {
  id: string;
  value: CardValue;
}

export const HAND_SIZE = 5;
export const BUILD_PILE_COUNT = 4;
export const DISCARD_PILE_COUNT = 4;
export const MAX_BUILD_VALUE = 12;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** Official Skip-Bo stock pile size scales down as more players share the 162-card deck. */
export function stockPileSizeForPlayerCount(playerCount: number): number {
  if (playerCount <= 2) return 30;
  if (playerCount <= 4) return 20;
  return 15;
}

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
  players: PlayerState[];
  currentPlayerIndex: number;
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
  playerIndex: number;
  stockPile: PileSummary;
  handCount: number;
  discardPiles: [PileSummary, PileSummary, PileSummary, PileSummary];
}

export interface LobbyPlayer {
  id: string;
  name: string;
  connected: boolean;
}

export interface LobbyGameState {
  gameId: string;
  status: 'waiting-for-players';
  youIndex: number;
  isHost: boolean;
  players: LobbyPlayer[];
  minPlayers: number;
  maxPlayers: number;
}

export interface ActiveGameState {
  gameId: string;
  status: 'in-progress' | 'finished';
  currentPlayerIndex: number;
  youIndex: number;
  you: RedactedSelf;
  /** All other players, in turn order starting with whoever plays right after you. */
  opponents: RedactedOpponent[];
  buildPiles: [PileSummary, PileSummary, PileSummary, PileSummary];
  drawPileCount: number;
  winnerId: string | null;
}

export type RedactedGameState = LobbyGameState | ActiveGameState;
