import { useState } from 'react';
import type { ActiveGameState, ClientMessage, PileSummary, PlaySource } from '@skipbo/shared';
import { Card } from './Card';
import { PileStack } from './PileStack';
import { OpponentPanel } from './OpponentPanel';

type Selection = { kind: 'hand'; cardId: string } | { kind: 'stock' } | { kind: 'discard'; pileIndex: 0 | 1 | 2 | 3 };

interface GameBoardProps {
  state: ActiveGameState;
  send: (message: ClientMessage) => void;
  onLeave: () => void;
}

function canPlayOnPile(value: number | 'SKIPBO', pile: PileSummary): boolean {
  return value === 'SKIPBO' || value === pile.count + 1;
}

export function GameBoard({ state, send, onLeave }: GameBoardProps) {
  const [selected, setSelected] = useState<Selection | null>(null);

  const isYourTurn = state.currentPlayerIndex === state.youIndex && state.status === 'in-progress';
  const gameOver = state.status === 'finished';
  const youWon = gameOver && state.winnerId === state.you.id;
  const winnerName = gameOver && !youWon ? state.opponents.find((o) => o.id === state.winnerId)?.name ?? 'Someone' : null;
  const activePlayerName = state.opponents.find((o) => o.playerIndex === state.currentPlayerIndex)?.name ?? null;

  const selectedCard =
    selected?.kind === 'hand'
      ? state.you.hand.find((c) => c.id === selected.cardId) ?? null
      : selected?.kind === 'stock'
        ? state.you.stockPile.topCard
        : selected?.kind === 'discard'
          ? state.you.discardPiles[selected.pileIndex].topCard
          : null;

  function toSource(sel: Selection): PlaySource {
    if (sel.kind === 'hand') return { kind: 'hand', cardId: sel.cardId };
    if (sel.kind === 'stock') return { kind: 'stock' };
    return { kind: 'discard', pileIndex: sel.pileIndex };
  }

  function handleHandCardClick(cardId: string) {
    if (!isYourTurn) return;
    setSelected((prev) => (prev?.kind === 'hand' && prev.cardId === cardId ? null : { kind: 'hand', cardId }));
  }

  function handleStockClick() {
    if (!isYourTurn || !state.you.stockPile.topCard) return;
    setSelected((prev) => (prev?.kind === 'stock' ? null : { kind: 'stock' }));
  }

  function handleDiscardPileClick(pileIndex: 0 | 1 | 2 | 3) {
    // A quick tap always selects this pile's top card as a new source (never discards),
    // so changing your mind about a selection can never accidentally fire a discard.
    if (!isYourTurn) return;
    if (selected?.kind === 'discard' && selected.pileIndex === pileIndex) {
      setSelected(null);
      return;
    }
    if (state.you.discardPiles[pileIndex].topCard) {
      setSelected({ kind: 'discard', pileIndex });
    }
  }

  function handleDiscardLongPress(pileIndex: 0 | 1 | 2 | 3) {
    if (!isYourTurn || selected?.kind !== 'hand') return;
    send({ action: 'discardCard', cardId: selected.cardId, pileIndex });
    setSelected(null);
  }

  function handleBuildPileClick(index: 0 | 1 | 2 | 3) {
    if (!isYourTurn || !selected || !selectedCard) return;
    if (!canPlayOnPile(selectedCard.value, state.buildPiles[index])) return;
    send({ action: 'playCard', source: toSource(selected), buildPileIndex: index });
    setSelected(null);
  }

  const buildPilesPlayable = isYourTurn && !!selectedCard;

  return (
    <div className="board">
      <header className="board__topbar">
        <span className="board__room-code">Room {state.gameId}</span>
        {gameOver ? (
          <span className="board__status">{youWon ? 'You won! 🎉' : `${winnerName} won`}</span>
        ) : (
          <span className="board__status">{isYourTurn ? 'Your turn' : `${activePlayerName ?? '...'}'s turn`}</span>
        )}
        <button type="button" className="board__leave" onClick={onLeave}>
          Leave
        </button>
      </header>

      <section className="board__opponents">
        {state.opponents.map((opponent) => (
          <OpponentPanel key={opponent.id} opponent={opponent} isTheirTurn={opponent.playerIndex === state.currentPlayerIndex} />
        ))}
      </section>

      <section className="board__build-row">
        {state.buildPiles.map((pile, i) => (
          <PileStack
            key={i}
            pile={pile}
            label={`${i + 1}`}
            interactive={buildPilesPlayable}
            dimmed={buildPilesPlayable && selectedCard ? !canPlayOnPile(selectedCard.value, pile) : false}
            effectiveValue={pile.count}
            onClick={() => handleBuildPileClick(i as 0 | 1 | 2 | 3)}
          />
        ))}
      </section>

      <section className="board__player-row board__player-row--you">
        <div className="board__you-piles">
          <div className="board__player-label">
            <span className={`board__dot ${state.you.connected ? 'board__dot--on' : 'board__dot--off'}`} />
            {state.you.name} (you)
          </div>
          <div className="board__piles">
            <PileStack
              pile={state.you.stockPile}
              label="Stock"
              selected={selected?.kind === 'stock'}
              interactive={isYourTurn && !!state.you.stockPile.topCard}
              onClick={handleStockClick}
            />
            {state.you.discardPiles.map((pile, i) => (
              <PileStack
                key={i}
                pile={pile}
                label={`D${i + 1}`}
                selected={selected?.kind === 'discard' && selected.pileIndex === i}
                interactive={isYourTurn && (selected?.kind === 'hand' || !!pile.topCard)}
                onClick={() => handleDiscardPileClick(i as 0 | 1 | 2 | 3)}
                onLongPress={selected?.kind === 'hand' ? () => handleDiscardLongPress(i as 0 | 1 | 2 | 3) : undefined}
                longPressHint={selected?.kind === 'hand' ? 'hold to discard' : undefined}
              />
            ))}
          </div>
        </div>

        <div className="board__hand-section">
          <div className="board__player-label board__player-label--hand">MY HAND</div>
          <div className="board__hand-row">
            {state.you.hand.map((c) => (
              <Card
                key={c.id}
                card={c}
                interactive={isYourTurn}
                selected={selected?.kind === 'hand' && selected.cardId === c.id}
                onClick={() => handleHandCardClick(c.id)}
              />
            ))}
          </div>
        </div>
      </section>

      {isYourTurn && selected?.kind === 'hand' && (
        <p className="board__hint">Tap a build pile to play this card, or hold a discard pile below to end your turn there.</p>
      )}

      {gameOver && (
        <div className="board__overlay">
          <div className="board__overlay-card">
            <h2>{youWon ? 'You won! 🎉' : `${winnerName} won`}</h2>
            <div className="board__overlay-actions">
              <button type="button" className="board__overlay-primary" onClick={() => send({ action: 'rematch' })}>
                Play again
              </button>
              <button type="button" className="board__overlay-secondary" onClick={onLeave}>
                Back to home
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
