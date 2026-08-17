import type { Card, CardValue } from './types.js';

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `c${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Standard Skip-Bo deck: 12 copies each of 1-12 (144 cards) + 18 Skip-Bo wilds = 162 cards.
 */
export function createFullDeck(): Card[] {
  const cards: Card[] = [];
  const numberValues: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  for (const value of numberValues) {
    for (let i = 0; i < 12; i++) {
      cards.push({ id: nextId(), value });
    }
  }
  for (let i = 0; i < 18; i++) {
    cards.push({ id: nextId(), value: 'SKIPBO' });
  }
  return cards;
}

export function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
