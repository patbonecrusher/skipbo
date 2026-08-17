import { describe, expect, it } from 'vitest';
import { createGame, applyPlay, applyDiscard, redactForPlayer } from './engine.js';
import type { Card, GameState } from './types.js';

function card(id: string, value: Card['value']): Card {
  return { id, value };
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'g1',
    status: 'in-progress',
    players: [
      {
        id: 'p1',
        name: 'Alice',
        connected: true,
        stockPile: [card('s1', 5)],
        hand: [card('h1', 1)],
        discardPiles: [[], [], [], []],
      },
      {
        id: 'p2',
        name: 'Bob',
        connected: true,
        stockPile: [card('s2', 7)],
        hand: [card('h2', 2)],
        discardPiles: [[], [], [], []],
      },
    ],
    currentPlayerIndex: 0,
    buildPiles: [[], [], [], []],
    drawPile: [],
    usedPile: [],
    winnerId: null,
    createdAt: 0,
    ...overrides,
  };
}

describe('createGame', () => {
  it('deals the correct number of cards to each pile', () => {
    const state = createGame('g1', { id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' });
    expect(state.players[0].stockPile).toHaveLength(30);
    expect(state.players[1].stockPile).toHaveLength(30);
    expect(state.players[0].hand).toHaveLength(5);
    expect(state.players[1].hand).toHaveLength(5);
    expect(state.drawPile).toHaveLength(162 - 30 - 30 - 5 - 5);

    const allIds = new Set<string>();
    const allCards = [
      ...state.players[0].stockPile,
      ...state.players[1].stockPile,
      ...state.players[0].hand,
      ...state.players[1].hand,
      ...state.drawPile,
    ];
    allCards.forEach((c) => allIds.add(c.id));
    expect(allIds.size).toBe(162);
  });
});

describe('applyPlay', () => {
  it('allows playing a 1 from hand onto an empty build pile', () => {
    const state = baseState();
    const result = applyPlay(state, { type: 'play', playerId: 'p1', source: { kind: 'hand', cardId: 'h1' }, buildPileIndex: 0 });
    expect(result.ok).toBe(true);
    expect(result.state.buildPiles[0]).toHaveLength(1);
    expect(result.state.players[0].hand).toHaveLength(0);
  });

  it('rejects playing a non-1 onto an empty build pile', () => {
    const state = baseState({
      players: [
        { ...baseState().players[0], hand: [card('h1', 2)] },
        baseState().players[1],
      ],
    });
    const result = applyPlay(state, { type: 'play', playerId: 'p1', source: { kind: 'hand', cardId: 'h1' }, buildPileIndex: 0 });
    expect(result.ok).toBe(false);
    expect(result.state.buildPiles[0]).toHaveLength(0);
  });

  it('allows a SKIPBO wild to play as any needed value', () => {
    const state = baseState({ buildPiles: [[card('b1', 1), card('b2', 2)], [], [], []] });
    state.players[0].hand = [card('h1', 'SKIPBO')];
    const result = applyPlay(state, { type: 'play', playerId: 'p1', source: { kind: 'hand', cardId: 'h1' }, buildPileIndex: 0 });
    expect(result.ok).toBe(true);
    expect(result.state.buildPiles[0]).toHaveLength(3);
  });

  it('rejects a play when it is not that player\'s turn', () => {
    const state = baseState({ currentPlayerIndex: 1 });
    const result = applyPlay(state, { type: 'play', playerId: 'p1', source: { kind: 'hand', cardId: 'h1' }, buildPileIndex: 0 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not your turn/i);
  });

  it('clears a build pile once it reaches 12 and moves the cards to the used pile', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => card(`b${i}`, (i + 1) as Card['value']));
    const state = baseState({ buildPiles: [eleven, [], [], []] });
    // Keep a second hand card so playing the 12 doesn't also empty the hand and
    // trigger the separate auto-redraw-from-used-pile behavior, which would
    // immediately reshuffle these same 12 cards back into the draw pile.
    state.players[0].hand = [card('h1', 12), card('h2', 3)];
    const result = applyPlay(state, { type: 'play', playerId: 'p1', source: { kind: 'hand', cardId: 'h1' }, buildPileIndex: 0 });
    expect(result.ok).toBe(true);
    expect(result.state.buildPiles[0]).toHaveLength(0);
    expect(result.state.usedPile).toHaveLength(12);
  });

  it('reshuffles the used pile into the draw pile when the draw pile empties mid-turn', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => card(`b${i}`, (i + 1) as Card['value']));
    const state = baseState({ buildPiles: [eleven, [], [], []], drawPile: [] });
    state.players[0].hand = [card('h1', 12)];
    const result = applyPlay(state, { type: 'play', playerId: 'p1', source: { kind: 'hand', cardId: 'h1' }, buildPileIndex: 0 });
    expect(result.ok).toBe(true);
    // The completed pile's 12 cards get reshuffled into the draw pile to refill the hand to 5.
    expect(result.state.players[0].hand).toHaveLength(5);
    expect(result.state.usedPile).toHaveLength(0);
    expect(result.state.drawPile).toHaveLength(7);
  });

  it('declares a win when the stock pile is emptied via a stock play', () => {
    const state = baseState();
    state.players[0].stockPile = [card('s1', 1)];
    const result = applyPlay(state, { type: 'play', playerId: 'p1', source: { kind: 'stock' }, buildPileIndex: 0 });
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('finished');
    expect(result.state.winnerId).toBe('p1');
  });

  it('auto-redraws up to a full hand when the last hand card is played mid-turn', () => {
    const state = baseState({ drawPile: [card('d1', 3), card('d2', 4), card('d3', 5), card('d4', 6), card('d5', 7)] });
    state.players[0].hand = [card('h1', 1)];
    const result = applyPlay(state, { type: 'play', playerId: 'p1', source: { kind: 'hand', cardId: 'h1' }, buildPileIndex: 0 });
    expect(result.ok).toBe(true);
    expect(result.state.players[0].hand).toHaveLength(5);
    expect(result.state.drawPile).toHaveLength(0);
  });

  it('plays from the top of a discard pile', () => {
    const state = baseState();
    state.players[0].discardPiles[2] = [card('dp1', 1)];
    const result = applyPlay(state, { type: 'play', playerId: 'p1', source: { kind: 'discard', pileIndex: 2 }, buildPileIndex: 0 });
    expect(result.ok).toBe(true);
    expect(result.state.players[0].discardPiles[2]).toHaveLength(0);
    expect(result.state.buildPiles[0]).toHaveLength(1);
  });
});

describe('applyDiscard', () => {
  it('ends the turn, switches players, and draws the next player up to 5', () => {
    const state = baseState({
      drawPile: [card('d1', 1), card('d2', 1), card('d3', 1), card('d4', 1)],
    });
    state.players[1].hand = [card('h2', 2)];
    const result = applyDiscard(state, { type: 'discard', playerId: 'p1', cardId: 'h1', pileIndex: 0 });
    expect(result.ok).toBe(true);
    expect(result.state.players[0].discardPiles[0]).toHaveLength(1);
    expect(result.state.players[0].hand).toHaveLength(0);
    expect(result.state.currentPlayerIndex).toBe(1);
    expect(result.state.players[1].hand).toHaveLength(5);
  });

  it('rejects discarding a card not in hand', () => {
    const state = baseState();
    const result = applyDiscard(state, { type: 'discard', playerId: 'p1', cardId: 'nope', pileIndex: 0 });
    expect(result.ok).toBe(false);
  });
});

describe('redactForPlayer', () => {
  it('hides the opponent hand values but keeps your own visible', () => {
    const state = baseState();
    state.players[1].hand = [card('h2', 2), card('h3', 9)];
    const view = redactForPlayer(state, 'p1');
    expect(view.you.hand.map((c) => c.value)).toEqual([1]);
    expect(view.opponent.handCount).toBe(2);
    expect((view.opponent as unknown as { hand?: unknown }).hand).toBeUndefined();
  });
});
