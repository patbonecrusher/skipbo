import { createFullDeck, shuffle } from './deck.js';
import {
  BUILD_PILE_COUNT,
  Card,
  DiscardCardAction,
  EngineResult,
  ErrorCode,
  GameState,
  HAND_SIZE,
  MAX_BUILD_VALUE,
  PileSummary,
  PlayCardAction,
  PlayerState,
  RedactedGameState,
  stockPileSizeForPlayerCount,
} from './types.js';

export interface NewPlayer {
  id: string;
  name: string;
  isBot?: boolean;
}

export function dealGame(gameId: string, players: NewPlayer[]): GameState {
  if (players.length < 2) throw new Error('At least 2 players are required');
  const stockSize = stockPileSizeForPlayerCount(players.length);
  const deck = shuffle(createFullDeck());
  let idx = 0;
  const take = (n: number): Card[] => {
    const slice = deck.slice(idx, idx + n);
    idx += n;
    return slice;
  };

  const dealtPlayers: PlayerState[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    connected: true,
    isBot: p.isBot ?? false,
    stockPile: take(stockSize),
    hand: [],
    discardPiles: [[], [], [], []],
  }));
  // Deal hands after all stock piles so a player's stock size never depends on deal order.
  for (const player of dealtPlayers) {
    player.hand = take(HAND_SIZE);
  }
  const drawPile = deck.slice(idx);

  return {
    gameId,
    status: 'in-progress',
    players: dealtPlayers,
    currentPlayerIndex: Math.floor(Math.random() * dealtPlayers.length),
    buildPiles: [[], [], [], []],
    drawPile,
    usedPile: [],
    winnerId: null,
    createdAt: Date.now(),
  };
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function getPlayerIndex(state: GameState, playerId: string): number {
  return state.players.findIndex((p) => p.id === playerId);
}

function canPlayOnBuildPile(card: Card, buildPile: Card[]): boolean {
  if (card.value === 'SKIPBO') return true;
  return card.value === buildPile.length + 1;
}

function drawUpToHandSize(state: GameState, player: PlayerState): void {
  while (player.hand.length < HAND_SIZE) {
    if (state.drawPile.length === 0) {
      if (state.usedPile.length === 0) return; // no cards left anywhere (cannot happen with a full deck)
      state.drawPile = shuffle(state.usedPile);
      state.usedPile = [];
    }
    const card = state.drawPile.pop();
    if (!card) return;
    player.hand.push(card);
  }
}

function clearCompletedBuildPiles(state: GameState): void {
  for (let i = 0; i < BUILD_PILE_COUNT; i++) {
    const pile = state.buildPiles[i];
    if (pile.length === MAX_BUILD_VALUE) {
      state.usedPile.push(...pile);
      state.buildPiles[i] = [];
    }
  }
}

function fail(state: GameState, error: ErrorCode): EngineResult {
  return { ok: false, error, state };
}

export function applyPlay(state: GameState, action: PlayCardAction): EngineResult {
  const next = cloneState(state);
  if (next.status !== 'in-progress') return fail(state, 'GAME_NOT_IN_PROGRESS');

  const playerIndex = getPlayerIndex(next, action.playerId);
  if (playerIndex === -1) return fail(state, 'UNKNOWN_PLAYER');
  if (playerIndex !== next.currentPlayerIndex) return fail(state, 'NOT_YOUR_TURN');

  const player = next.players[playerIndex];
  const buildPileIndex = action.buildPileIndex;
  if (buildPileIndex < 0 || buildPileIndex > 3) return fail(state, 'INVALID_BUILD_PILE');
  const buildPile = next.buildPiles[buildPileIndex];

  let card: Card | undefined;
  let removeFromSource: () => void;

  if (action.source.kind === 'hand') {
    const cardId = action.source.cardId;
    const handIdx = player.hand.findIndex((c) => c.id === cardId);
    card = player.hand[handIdx];
    removeFromSource = () => {
      player.hand.splice(handIdx, 1);
    };
  } else if (action.source.kind === 'stock') {
    card = player.stockPile[player.stockPile.length - 1];
    removeFromSource = () => {
      player.stockPile.pop();
    };
  } else {
    const pileIndex = action.source.pileIndex;
    if (pileIndex < 0 || pileIndex > 3) return fail(state, 'INVALID_DISCARD_PILE');
    const pile = player.discardPiles[pileIndex];
    card = pile[pile.length - 1];
    removeFromSource = () => {
      pile.pop();
    };
  }

  if (!card) return fail(state, 'NO_CARD_AT_SOURCE');
  if (!canPlayOnBuildPile(card, buildPile)) return fail(state, 'CARD_CANNOT_BE_PLAYED');

  const sourceKind = action.source.kind;
  removeFromSource();
  buildPile.push(card);
  clearCompletedBuildPiles(next);

  if (sourceKind === 'stock' && player.stockPile.length === 0) {
    next.status = 'finished';
    next.winnerId = player.id;
  } else if (sourceKind === 'hand' && player.hand.length === 0 && next.status === 'in-progress') {
    drawUpToHandSize(next, player);
  }

  return { ok: true, state: next };
}

export function applyDiscard(state: GameState, action: DiscardCardAction): EngineResult {
  const next = cloneState(state);
  if (next.status !== 'in-progress') return fail(state, 'GAME_NOT_IN_PROGRESS');

  const playerIndex = getPlayerIndex(next, action.playerId);
  if (playerIndex === -1) return fail(state, 'UNKNOWN_PLAYER');
  if (playerIndex !== next.currentPlayerIndex) return fail(state, 'NOT_YOUR_TURN');
  if (action.pileIndex < 0 || action.pileIndex > 3) return fail(state, 'INVALID_DISCARD_PILE');

  const player = next.players[playerIndex];
  const handIdx = player.hand.findIndex((c) => c.id === action.cardId);
  if (handIdx === -1) return fail(state, 'CARD_NOT_IN_HAND');

  const [card] = player.hand.splice(handIdx, 1);
  player.discardPiles[action.pileIndex].push(card);

  // End turn: advance to the next player (wrapping around) and draw them up to a full hand.
  const nextPlayerIndex = (playerIndex + 1) % next.players.length;
  next.currentPlayerIndex = nextPlayerIndex;
  drawUpToHandSize(next, next.players[nextPlayerIndex]);

  return { ok: true, state: next };
}

/** Advances the turn to the next player without any card action -- used when the current
 * player is a disconnected human, rather than guessing a discard on their behalf. */
export function skipTurn(state: GameState, playerId: string): EngineResult {
  const next = cloneState(state);
  if (next.status !== 'in-progress') return fail(state, 'GAME_NOT_IN_PROGRESS');

  const playerIndex = getPlayerIndex(next, playerId);
  if (playerIndex === -1) return fail(state, 'UNKNOWN_PLAYER');
  if (playerIndex !== next.currentPlayerIndex) return fail(state, 'NOT_YOUR_TURN');

  const nextPlayerIndex = (playerIndex + 1) % next.players.length;
  next.currentPlayerIndex = nextPlayerIndex;
  drawUpToHandSize(next, next.players[nextPlayerIndex]);

  return { ok: true, state: next };
}

function summarize(pile: Card[]): PileSummary {
  return { topCard: pile.length ? pile[pile.length - 1] : null, count: pile.length };
}

export function redactForPlayer(state: GameState, forPlayerId: string): RedactedGameState {
  const youIndex = getPlayerIndex(state, forPlayerId);
  if (youIndex === -1) throw new Error('Unknown player');
  const you = state.players[youIndex];

  const opponents = state.players
    .map((p, playerIndex) => ({ p, playerIndex }))
    .filter(({ playerIndex }) => playerIndex !== youIndex)
    // Order starting with whoever plays right after you, wrapping around.
    .sort((a, b) => ((a.playerIndex - youIndex + state.players.length) % state.players.length) - ((b.playerIndex - youIndex + state.players.length) % state.players.length))
    .map(({ p, playerIndex }) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      isBot: p.isBot,
      playerIndex,
      stockPile: summarize(p.stockPile),
      handCount: p.hand.length,
      discardPiles: p.discardPiles.map(summarize) as [PileSummary, PileSummary, PileSummary, PileSummary],
    }));

  return {
    gameId: state.gameId,
    status: state.status as 'in-progress' | 'finished',
    currentPlayerIndex: state.currentPlayerIndex,
    youIndex,
    you: {
      id: you.id,
      name: you.name,
      connected: you.connected,
      stockPile: summarize(you.stockPile),
      hand: you.hand.slice(),
      discardPiles: you.discardPiles.map(summarize) as [PileSummary, PileSummary, PileSummary, PileSummary],
    },
    opponents,
    buildPiles: state.buildPiles.map(summarize) as [PileSummary, PileSummary, PileSummary, PileSummary],
    drawPileCount: state.drawPile.length + state.usedPile.length,
    winnerId: state.winnerId,
  };
}
