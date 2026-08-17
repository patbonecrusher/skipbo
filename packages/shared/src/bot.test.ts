import { describe, expect, it } from 'vitest';
import { chooseBotAction } from './bot.js';
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
        id: 'bot',
        name: 'Robot 1',
        connected: true,
        isBot: true,
        stockPile: [],
        hand: [],
        discardPiles: [[], [], [], []],
      },
      {
        id: 'human',
        name: 'Alice',
        connected: true,
        isBot: false,
        stockPile: [],
        hand: [],
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

describe('chooseBotAction', () => {
  it('prefers playing from the stock pile when legal', () => {
    const state = baseState();
    state.players[0].stockPile = [card('s1', 1)];
    state.players[0].hand = [card('h1', 1)]; // also playable, but stock should win
    const action = chooseBotAction(state, 'bot');
    expect(action.type).toBe('play');
    if (action.type === 'play') expect(action.source.kind).toBe('stock');
  });

  it('falls back to a hand card when the stock top is not playable', () => {
    const state = baseState();
    state.players[0].stockPile = [card('s1', 5)]; // not playable on an empty pile
    state.players[0].hand = [card('h1', 1)];
    const action = chooseBotAction(state, 'bot');
    expect(action).toEqual({ type: 'play', playerId: 'bot', source: { kind: 'hand', cardId: 'h1' }, buildPileIndex: 0 });
  });

  it('recovers a card from its own discard pile if nothing else is playable', () => {
    const state = baseState();
    state.players[0].stockPile = [card('s1', 9)];
    state.players[0].hand = [card('h1', 8)];
    state.players[0].discardPiles[2] = [card('d1', 1)];
    const action = chooseBotAction(state, 'bot');
    expect(action).toEqual({ type: 'play', playerId: 'bot', source: { kind: 'discard', pileIndex: 2 }, buildPileIndex: 0 });
  });

  it('discards the highest-value card when no play is possible', () => {
    // A SKIPBO can always be played somewhere (it substitutes for any needed value), so a
    // real "nothing is playable" hand can never contain one -- keep this fixture wild-free.
    const state = baseState();
    state.players[0].stockPile = [card('s1', 9)];
    state.players[0].hand = [card('h1', 8), card('h2', 12), card('h3', 4)];
    const action = chooseBotAction(state, 'bot');
    expect(action.type).toBe('discard');
    if (action.type === 'discard') expect(action.cardId).toBe('h2'); // the 12, the highest ordinary card
  });

  it('never discards a SKIPBO wild -- it is always played instead', () => {
    const state = baseState();
    state.players[0].stockPile = [card('s1', 9)];
    state.players[0].hand = [card('h1', 8), card('h2', 'SKIPBO')];
    const action = chooseBotAction(state, 'bot');
    expect(action).toEqual({ type: 'play', playerId: 'bot', source: { kind: 'hand', cardId: 'h2' }, buildPileIndex: 0 });
  });

  it('discards to whichever own pile currently has the fewest cards', () => {
    const state = baseState();
    state.players[0].stockPile = [card('s1', 9)];
    state.players[0].hand = [card('h1', 8)];
    state.players[0].discardPiles = [
      [card('a', 3), card('b', 4)],
      [],
      [card('c', 5)],
      [card('d', 6), card('e', 7), card('f', 8)],
    ];
    const action = chooseBotAction(state, 'bot');
    expect(action).toEqual({ type: 'discard', playerId: 'bot', cardId: 'h1', pileIndex: 1 });
  });
});
