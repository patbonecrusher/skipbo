import { createFullDeck, shuffle } from './deck.js';
import {
  BUILD_PILE_COUNT,
  Card,
  DiscardCardAction,
  EngineResult,
  GameState,
  HAND_SIZE,
  MAX_BUILD_VALUE,
  PileSummary,
  PlayCardAction,
  PlayerState,
  RedactedGameState,
  STOCK_PILE_SIZE,
} from './types.js';

export interface NewPlayer {
  id: string;
  name: string;
}

export function createGame(gameId: string, p1: NewPlayer, p2: NewPlayer): GameState {
  const deck = shuffle(createFullDeck());
  let idx = 0;
  const take = (n: number): Card[] => {
    const slice = deck.slice(idx, idx + n);
    idx += n;
    return slice;
  };

  const stock1 = take(STOCK_PILE_SIZE);
  const stock2 = take(STOCK_PILE_SIZE);
  const hand1 = take(HAND_SIZE);
  const hand2 = take(HAND_SIZE);
  const drawPile = deck.slice(idx);

  const players: [PlayerState, PlayerState] = [
    { id: p1.id, name: p1.name, connected: true, stockPile: stock1, hand: hand1, discardPiles: [[], [], [], []] },
    { id: p2.id, name: p2.name, connected: true, stockPile: stock2, hand: hand2, discardPiles: [[], [], [], []] },
  ];

  return {
    gameId,
    status: 'in-progress',
    players,
    currentPlayerIndex: Math.random() < 0.5 ? 0 : 1,
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

function getPlayerIndex(state: GameState, playerId: string): 0 | 1 | -1 {
  if (state.players[0].id === playerId) return 0;
  if (state.players[1].id === playerId) return 1;
  return -1;
}

function canPlayOnBuildPile(card: Card, buildPile: Card[]): boolean {
  if (card.value === 'SKIPBO') return true;
  return card.value === buildPile.length + 1;
}

function drawUpToHandSize(state: GameState, player: PlayerState): void {
  while (player.hand.length < HAND_SIZE) {
    if (state.drawPile.length === 0) {
      if (state.usedPile.length === 0) return; // no cards left anywhere (cannot happen with a full deck in a 2-player game)
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

function fail(state: GameState, error: string): EngineResult {
  return { ok: false, error, state };
}

export function applyPlay(state: GameState, action: PlayCardAction): EngineResult {
  const next = cloneState(state);
  if (next.status !== 'in-progress') return fail(state, 'Game is not in progress');

  const playerIndex = getPlayerIndex(next, action.playerId);
  if (playerIndex === -1) return fail(state, 'Unknown player');
  if (playerIndex !== next.currentPlayerIndex) return fail(state, 'Not your turn');

  const player = next.players[playerIndex];
  const buildPileIndex = action.buildPileIndex;
  if (buildPileIndex < 0 || buildPileIndex > 3) return fail(state, 'Invalid build pile');
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
    if (pileIndex < 0 || pileIndex > 3) return fail(state, 'Invalid discard pile');
    const pile = player.discardPiles[pileIndex];
    card = pile[pile.length - 1];
    removeFromSource = () => {
      pile.pop();
    };
  }

  if (!card) return fail(state, 'No card available at that source');
  if (!canPlayOnBuildPile(card, buildPile)) return fail(state, 'Card cannot be played on that build pile');

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
  if (next.status !== 'in-progress') return fail(state, 'Game is not in progress');

  const playerIndex = getPlayerIndex(next, action.playerId);
  if (playerIndex === -1) return fail(state, 'Unknown player');
  if (playerIndex !== next.currentPlayerIndex) return fail(state, 'Not your turn');
  if (action.pileIndex < 0 || action.pileIndex > 3) return fail(state, 'Invalid discard pile');

  const player = next.players[playerIndex];
  const handIdx = player.hand.findIndex((c) => c.id === action.cardId);
  if (handIdx === -1) return fail(state, 'Card not in hand');

  const [card] = player.hand.splice(handIdx, 1);
  player.discardPiles[action.pileIndex].push(card);

  // End turn: switch to the other player and draw them up to a full hand.
  const nextPlayerIndex: 0 | 1 = playerIndex === 0 ? 1 : 0;
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
  const oppIndex: 0 | 1 = youIndex === 0 ? 1 : 0;
  const you = state.players[youIndex];
  const opp = state.players[oppIndex];

  return {
    gameId: state.gameId,
    status: state.status,
    currentPlayerIndex: state.currentPlayerIndex,
    youIndex,
    you: {
      id: you.id,
      name: you.name,
      connected: you.connected,
      stockPile: summarize(you.stockPile),
      hand: you.hand.slice(),
      discardPiles: you.discardPiles.map(summarize) as RedactedGameState['you']['discardPiles'],
    },
    opponent: {
      id: opp.id,
      name: opp.name,
      connected: opp.connected,
      stockPile: summarize(opp.stockPile),
      handCount: opp.hand.length,
      discardPiles: opp.discardPiles.map(summarize) as RedactedGameState['opponent']['discardPiles'],
    },
    buildPiles: state.buildPiles.map(summarize) as RedactedGameState['buildPiles'],
    drawPileCount: state.drawPile.length + state.usedPile.length,
    winnerId: state.winnerId,
  };
}
