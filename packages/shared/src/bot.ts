import { BUILD_PILE_COUNT, Card, DiscardCardAction, GameState, PlayCardAction } from './types.js';

function canPlayOnBuildPile(card: Card, buildPile: Card[]): boolean {
  return card.value === 'SKIPBO' || card.value === buildPile.length + 1;
}

function findLegalBuildPile(card: Card, state: GameState): 0 | 1 | 2 | 3 | null {
  for (let i = 0; i < BUILD_PILE_COUNT; i++) {
    if (canPlayOnBuildPile(card, state.buildPiles[i])) return i as 0 | 1 | 2 | 3;
  }
  return null;
}

/**
 * Picks a single next action for a bot player: one play, or (if no play is available) a
 * discard that ends its turn. The caller applies the action and calls this again if the
 * bot's turn continues, which produces a naturally animatable sequence of individual moves.
 */
export function chooseBotAction(state: GameState, botPlayerId: string): PlayCardAction | DiscardCardAction {
  const playerIndex = state.players.findIndex((p) => p.id === botPlayerId);
  const player = state.players[playerIndex];

  // 1. Stock pile first -- emptying it is the actual win condition.
  const stockTop = player.stockPile[player.stockPile.length - 1];
  if (stockTop) {
    const buildPileIndex = findLegalBuildPile(stockTop, state);
    if (buildPileIndex !== null) {
      return { type: 'play', playerId: botPlayerId, source: { kind: 'stock' }, buildPileIndex };
    }
  }

  // 2. Hand cards next, saving SKIPBO wilds for when nothing else works.
  const handByPriority = [...player.hand].sort((a, b) => (a.value === 'SKIPBO' ? 1 : 0) - (b.value === 'SKIPBO' ? 1 : 0));
  for (const card of handByPriority) {
    const buildPileIndex = findLegalBuildPile(card, state);
    if (buildPileIndex !== null) {
      return { type: 'play', playerId: botPlayerId, source: { kind: 'hand', cardId: card.id }, buildPileIndex };
    }
  }

  // 3. Own discard piles -- recover a playable card if one's sitting on top.
  for (let pileIndex = 0; pileIndex < BUILD_PILE_COUNT; pileIndex++) {
    const pile = player.discardPiles[pileIndex];
    const top = pile[pile.length - 1];
    if (!top) continue;
    const buildPileIndex = findLegalBuildPile(top, state);
    if (buildPileIndex !== null) {
      return {
        type: 'play',
        playerId: botPlayerId,
        source: { kind: 'discard', pileIndex: pileIndex as 0 | 1 | 2 | 3 },
        buildPileIndex,
      };
    }
  }

  // 4. No legal play anywhere: discard to end the turn. Keep SKIPBO wilds (they're flexible),
  // discard the highest-value ordinary card, onto whichever own discard pile has the fewest cards.
  const nonWild = player.hand.filter((c) => c.value !== 'SKIPBO');
  const candidates = nonWild.length ? nonWild : player.hand;
  const cardToDiscard = candidates.reduce((worst, c) =>
    c.value !== 'SKIPBO' && (worst.value === 'SKIPBO' || c.value > worst.value) ? c : worst,
  );

  let targetPile: 0 | 1 | 2 | 3 = 0;
  let fewestCards = Infinity;
  player.discardPiles.forEach((pile, i) => {
    if (pile.length < fewestCards) {
      fewestCards = pile.length;
      targetPile = i as 0 | 1 | 2 | 3;
    }
  });

  return { type: 'discard', playerId: botPlayerId, cardId: cardToDiscard.id, pileIndex: targetPile };
}
