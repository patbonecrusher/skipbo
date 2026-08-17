import { describe, expect, it } from 'vitest';
import { dealGame, applyPlay, applyDiscard, redactForPlayer } from './engine.js';
import type { ActiveGameState, Card, GameState } from './types.js';

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

describe('dealGame', () => {
  it('deals 30-card stock piles for 2 players', () => {
    const state = dealGame('g1', [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }]);
    expect(state.players).toHaveLength(2);
    state.players.forEach((p) => expect(p.stockPile).toHaveLength(30));
    state.players.forEach((p) => expect(p.hand).toHaveLength(5));
    expect(state.drawPile).toHaveLength(162 - 30 * 2 - 5 * 2);
  });

  it('deals 20-card stock piles for 3-4 players', () => {
    const three = dealGame('g1', [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }]);
    three.players.forEach((p) => expect(p.stockPile).toHaveLength(20));

    const four = dealGame('g2', [
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
      { id: 'p3', name: 'C' },
      { id: 'p4', name: 'D' },
    ]);
    four.players.forEach((p) => expect(p.stockPile).toHaveLength(20));
  });

  it('deals 15-card stock piles for 5-6 players', () => {
    const six = dealGame(
      'g1',
      Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` })),
    );
    expect(six.players).toHaveLength(6);
    six.players.forEach((p) => expect(p.stockPile).toHaveLength(15));
  });

  it('deals every card exactly once with no duplicates or overlaps', () => {
    const state = dealGame(
      'g1',
      Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` })),
    );
    const allIds = new Set<string>();
    const allCards = [
      ...state.players.flatMap((p) => [...p.stockPile, ...p.hand]),
      ...state.drawPile,
    ];
    allCards.forEach((c) => allIds.add(c.id));
    expect(allIds.size).toBe(162);
    expect(allCards).toHaveLength(162);
  });

  it('rejects fewer than 2 players', () => {
    expect(() => dealGame('g1', [{ id: 'p1', name: 'Solo' }])).toThrow();
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

  it('wraps turn order around from the last player back to the first', () => {
    const state = baseState({
      players: [
        { id: 'p1', name: 'A', connected: true, stockPile: [], hand: [card('h1', 1)], discardPiles: [[], [], [], []] },
        { id: 'p2', name: 'B', connected: true, stockPile: [], hand: [], discardPiles: [[], [], [], []] },
        { id: 'p3', name: 'C', connected: true, stockPile: [], hand: [], discardPiles: [[], [], [], []] },
      ],
      currentPlayerIndex: 0,
    });
    // First advance to the last player (index 2) via two discards, then confirm the third wraps to 0.
    let result = applyDiscard(state, { type: 'discard', playerId: 'p1', cardId: 'h1', pileIndex: 0 });
    expect(result.state.currentPlayerIndex).toBe(1);
    result.state.players[1].hand = [card('h2', 1)];
    result = applyDiscard(result.state, { type: 'discard', playerId: 'p2', cardId: 'h2', pileIndex: 0 });
    expect(result.state.currentPlayerIndex).toBe(2);
    result.state.players[2].hand = [card('h3', 1)];
    result = applyDiscard(result.state, { type: 'discard', playerId: 'p3', cardId: 'h3', pileIndex: 0 });
    expect(result.state.currentPlayerIndex).toBe(0);
  });

  it('rejects discarding a card not in hand', () => {
    const state = baseState();
    const result = applyDiscard(state, { type: 'discard', playerId: 'p1', cardId: 'nope', pileIndex: 0 });
    expect(result.ok).toBe(false);
  });
});

describe('redactForPlayer', () => {
  it('hides opponent hand values but keeps your own visible (2 players)', () => {
    const state = baseState();
    state.players[1].hand = [card('h2', 2), card('h3', 9)];
    const view = redactForPlayer(state, 'p1') as ActiveGameState;
    expect(view.you.hand.map((c) => c.value)).toEqual([1]);
    expect(view.opponents).toHaveLength(1);
    expect(view.opponents[0].handCount).toBe(2);
    expect((view.opponents[0] as unknown as { hand?: unknown }).hand).toBeUndefined();
  });

  it('lists opponents starting with the next player after you, wrapping around', () => {
    const state = baseState({
      players: [
        { id: 'p1', name: 'A', connected: true, stockPile: [], hand: [], discardPiles: [[], [], [], []] },
        { id: 'p2', name: 'B', connected: true, stockPile: [], hand: [], discardPiles: [[], [], [], []] },
        { id: 'p3', name: 'C', connected: true, stockPile: [], hand: [], discardPiles: [[], [], [], []] },
        { id: 'p4', name: 'D', connected: true, stockPile: [], hand: [], discardPiles: [[], [], [], []] },
      ],
    });
    const view = redactForPlayer(state, 'p3') as ActiveGameState;
    expect(view.opponents.map((o) => o.name)).toEqual(['D', 'A', 'B']);
  });
});
