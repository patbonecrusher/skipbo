import { useEffect, useRef, useState } from 'react';
import type { ActiveGameState, Card as CardModel, ClientMessage, PileSummary, PlaySource } from '@skipbo/shared';
import { Card } from './Card';
import { PileStack } from './PileStack';
import { OpponentPanel } from './OpponentPanel';
import { LanguageToggle } from './LanguageToggle';
import { TurnBanner } from './TurnBanner';
import { FlightCard, FLIGHT_DURATION_MS } from './FlightCard';
import { DrawPileStack } from './DrawPileStack';
import { useLanguage } from '../i18n/context';

type Selection = { kind: 'hand'; cardId: string } | { kind: 'stock' } | { kind: 'discard'; pileIndex: 0 | 1 | 2 | 3 };

/** How far the pointer must move before a press turns into a drag instead of a tap. */
const DRAG_THRESHOLD_PX = 6;
/** Delay between each dealt card's flight when a player is topped back up to a full hand. */
const DEAL_STAGGER_MS = 140;

interface DragState {
  source: Selection;
  card: CardModel;
  x: number;
  y: number;
  overZone: string | null;
}

interface Flight {
  id: number;
  card: CardModel | null;
  from: DOMRect;
  to: DOMRect;
}

interface GameBoardProps {
  state: ActiveGameState;
  send: (message: ClientMessage) => void;
  onLeave: () => void;
  onBackToHome: () => void;
}

function canPlayOnPile(value: number | 'SKIPBO', pile: PileSummary): boolean {
  return value === 'SKIPBO' || value === pile.count + 1;
}

/** Finds where an opponent's card came from when it lands on a pile, by comparing the previous and
 * next state -- the server broadcasts one full state per move, so exactly one pile changes at a time.
 * Returns null for a card that came from your own side (those already get feedback from your own
 * drag/tap), or when the source can't be identified (e.g. a play that empties and instantly refills
 * a hand, which this simple count-based heuristic doesn't cover). */
function findOpponentMoveSource(prev: ActiveGameState, next: ActiveGameState, card: CardModel): string | null {
  for (const prevOpp of prev.opponents) {
    const nextOpp = next.opponents.find((o) => o.id === prevOpp.id);
    if (!nextOpp) continue;
    if (prevOpp.stockPile.topCard?.id === card.id && nextOpp.stockPile.count === prevOpp.stockPile.count - 1) {
      return `opp-${prevOpp.id}-stock`;
    }
    for (let j = 0; j < 4; j++) {
      if (prevOpp.discardPiles[j].topCard?.id === card.id && nextOpp.discardPiles[j].count === prevOpp.discardPiles[j].count - 1) {
        return `opp-${prevOpp.id}-discard-${j}`;
      }
    }
    if (nextOpp.handCount === prevOpp.handCount - 1) {
      return `opp-${prevOpp.id}-hand`;
    }
  }
  return null;
}

export function GameBoard({ state, send, onLeave, onBackToHome }: GameBoardProps) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const prevStateRef = useRef<ActiveGameState | null>(null);
  const nextFlightIdRef = useRef(0);
  const [flights, setFlights] = useState<Flight[]>([]);

  const isYourTurn = state.currentPlayerIndex === state.youIndex && state.status === 'in-progress';
  const gameOver = state.status === 'finished';
  const youWon = gameOver && state.winnerId === state.you.id;
  const winnerName = gameOver && !youWon ? state.opponents.find((o) => o.id === state.winnerId)?.name ?? t('board.someone') : null;
  const activePlayerName = state.opponents.find((o) => o.playerIndex === state.currentPlayerIndex)?.name ?? null;

  const [showTurnBanner, setShowTurnBanner] = useState(false);
  const wasYourTurnRef = useRef(false);
  useEffect(() => {
    if (isYourTurn && !wasYourTurnRef.current) setShowTurnBanner(true);
    wasYourTurnRef.current = isYourTurn;
  }, [isYourTurn]);

  function getPileRect(animKey: string): DOMRect | null {
    return boardRef.current?.querySelector<HTMLElement>(`[data-anim-key="${animKey}"]`)?.getBoundingClientRect() ?? null;
  }

  function flyCard(card: CardModel | null, fromKey: string, toKey: string) {
    const from = getPileRect(fromKey);
    const to = getPileRect(toKey);
    if (!from || !to) return;
    const id = nextFlightIdRef.current++;
    setFlights((fs) => [...fs, { id, card, from, to }]);
    setTimeout(() => setFlights((fs) => fs.filter((f) => f.id !== id)), FLIGHT_DURATION_MS + 100);
  }

  /** Animates `count` face-down cards flying from the draw pile to a hand, one after another. */
  function dealCards(count: number, toKey: string) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => flyCard(null, 'draw-pile', toKey), i * DEAL_STAGGER_MS);
    }
  }

  // Whenever a fresh state arrives, compare it against the previous one to see whether an
  // opponent's move just landed a card somewhere, or whether someone was just dealt back up to
  // a full hand (always at the start of their turn), and animate whichever happened.
  // Every server broadcast corresponds to exactly one move, so at most one pile changes -- except
  // a discard can simultaneously refill the next player's hand, so these checks aren't exclusive.
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (!prev) return;
    // A rematch deals a fresh deck -- drawPileCount can only grow via a fresh deal, never during
    // normal play, so treat any increase as a reset rather than diffing across two different games.
    if (state.drawPileCount > prev.drawPileCount) return;

    for (let i = 0; i < 4; i++) {
      if (state.buildPiles[i].count === prev.buildPiles[i].count + 1) {
        const card = state.buildPiles[i].topCard;
        if (card) {
          const fromKey = findOpponentMoveSource(prev, state, card);
          if (fromKey) flyCard(card, fromKey, `build-${i}`);
        }
        break;
      }
    }

    for (const prevOpp of prev.opponents) {
      const nextOpp = state.opponents.find((o) => o.id === prevOpp.id);
      if (!nextOpp) continue;
      for (let i = 0; i < 4; i++) {
        if (nextOpp.discardPiles[i].count === prevOpp.discardPiles[i].count + 1) {
          const card = nextOpp.discardPiles[i].topCard;
          if (card) flyCard(card, `opp-${prevOpp.id}-hand`, `opp-${prevOpp.id}-discard-${i}`);
          break;
        }
      }
    }

    for (const prevOpp of prev.opponents) {
      const nextOpp = state.opponents.find((o) => o.id === prevOpp.id);
      if (!nextOpp) continue;
      const dealt = nextOpp.handCount - prevOpp.handCount;
      if (dealt > 0) dealCards(dealt, `opp-${prevOpp.id}-hand`);
    }
    const selfDealt = state.you.hand.length - prev.you.hand.length;
    if (selfDealt > 0) dealCards(selfDealt, 'self-hand');
  }, [state]);

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

  /** A drop always ends by releasing over a real element, which fires a native click right after.
   * Swallow exactly that one click so the drop doesn't double-fire through the tap handlers. */
  function guardClick(): boolean {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  }

  function handleHandCardClick(cardId: string) {
    if (guardClick() || !isYourTurn) return;
    setSelected((prev) => (prev?.kind === 'hand' && prev.cardId === cardId ? null : { kind: 'hand', cardId }));
  }

  function handleStockClick() {
    if (guardClick() || !isYourTurn || !state.you.stockPile.topCard) return;
    setSelected((prev) => (prev?.kind === 'stock' ? null : { kind: 'stock' }));
  }

  function handleDiscardPileClick(pileIndex: 0 | 1 | 2 | 3) {
    // A quick tap always selects this pile's top card as a new source (never discards),
    // so changing your mind about a selection can never accidentally fire a discard.
    if (guardClick() || !isYourTurn) return;
    if (selected?.kind === 'discard' && selected.pileIndex === pileIndex) {
      setSelected(null);
      return;
    }
    if (state.you.discardPiles[pileIndex].topCard) {
      setSelected({ kind: 'discard', pileIndex });
    }
  }

  function handleDiscardHere(pileIndex: 0 | 1 | 2 | 3) {
    if (guardClick() || !isYourTurn || selected?.kind !== 'hand') return;
    send({ action: 'discardCard', cardId: selected.cardId, pileIndex });
    setSelected(null);
  }

  function handleBuildPileClick(index: 0 | 1 | 2 | 3) {
    if (guardClick() || !isYourTurn || !selected || !selectedCard) return;
    if (!canPlayOnPile(selectedCard.value, state.buildPiles[index])) return;
    send({ action: 'playCard', source: toSource(selected), buildPileIndex: index });
    setSelected(null);
  }

  /** Finds the drop zone (a build or discard pile) under a given point, if any. */
  function zoneAt(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-zone]');
    return el?.dataset.dropZone ?? null;
  }

  function resolveDrop(source: Selection, card: CardModel, zone: string | null) {
    if (!zone) return;
    if (zone.startsWith('build-')) {
      const index = Number(zone.slice('build-'.length)) as 0 | 1 | 2 | 3;
      if (!canPlayOnPile(card.value, state.buildPiles[index])) return;
      send({ action: 'playCard', source: toSource(source), buildPileIndex: index });
    } else if (zone.startsWith('discard-') && source.kind === 'hand') {
      const index = Number(zone.slice('discard-'.length)) as 0 | 1 | 2 | 3;
      send({ action: 'discardCard', cardId: source.cardId, pileIndex: index });
    }
  }

  /** Starts tracking a press that may turn into a drag. Attach to onPointerDown of a draggable source card. */
  function beginPress(e: React.PointerEvent, source: Selection, card: CardModel) {
    if (!isYourTurn || e.button !== 0) return;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
        dragging = true;
      }
      ev.preventDefault();
      setDrag({ source, card, x: ev.clientX, y: ev.clientY, overZone: zoneAt(ev.clientX, ev.clientY) });
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (dragging) {
        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
        resolveDrop(source, card, zoneAt(ev.clientX, ev.clientY));
        setDrag(null);
        setSelected(null);
      }
    }

    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      setDrag(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  const buildPilesPlayable = isYourTurn && !!(selectedCard || drag);
  const effectiveSelectedCard = drag?.card ?? selectedCard;

  return (
    <div className="board" ref={boardRef}>
      <header className="board__topbar">
        <span className="board__room-code">{t('board.room', { code: state.gameId })}</span>
        {gameOver ? (
          <span className="board__status">{youWon ? t('board.youWon') : t('board.playerWon', { name: winnerName ?? '' })}</span>
        ) : (
          <span className="board__status">{isYourTurn ? t('board.yourTurn') : t('board.playerTurn', { name: activePlayerName ?? '…' })}</span>
        )}
        <div className="board__topbar-right">
          <LanguageToggle />
          <button type="button" className="board__leave" onClick={onLeave}>
            {t('board.leave')}
          </button>
        </div>
      </header>

      <section className="board__opponents">
        {state.opponents.map((opponent) => (
          <OpponentPanel key={opponent.id} opponent={opponent} isTheirTurn={opponent.playerIndex === state.currentPlayerIndex} />
        ))}
      </section>

      <section className="board__build-row">
        <DrawPileStack count={state.drawPileCount} animKey="draw-pile" />
        {state.buildPiles.map((pile, i) => {
          const zone = `build-${i}`;
          return (
            <PileStack
              key={i}
              pile={pile}
              label={`${i + 1}`}
              interactive={buildPilesPlayable}
              dimmed={buildPilesPlayable && effectiveSelectedCard ? !canPlayOnPile(effectiveSelectedCard.value, pile) : false}
              dropZone={zone}
              dropHover={drag?.overZone === zone}
              animKey={zone}
              effectiveValue={pile.count}
              onClick={() => handleBuildPileClick(i as 0 | 1 | 2 | 3)}
            />
          );
        })}
      </section>

      <section className="board__player-row board__player-row--you">
        <div className="board__you-piles">
          <div className="board__player-label">
            <span className={`board__dot ${state.you.connected ? 'board__dot--on' : 'board__dot--off'}`} />
            {state.you.name} ({t('board.you')})
          </div>
          <div className="board__piles">
            <PileStack
              pile={state.you.stockPile}
              label={t('board.stock')}
              selected={selected?.kind === 'stock'}
              interactive={isYourTurn && !!state.you.stockPile.topCard}
              lifted={drag?.source.kind === 'stock'}
              onClick={handleStockClick}
              onPointerDownCard={
                isYourTurn && state.you.stockPile.topCard
                  ? (e) => beginPress(e, { kind: 'stock' }, state.you.stockPile.topCard!)
                  : undefined
              }
            />
            {state.you.discardPiles.map((pile, i) => {
              const zone = `discard-${i}`;
              return (
                <PileStack
                  key={i}
                  pile={pile}
                  label={`D${i + 1}`}
                  selected={selected?.kind === 'discard' && selected.pileIndex === i}
                  interactive={isYourTurn && (selected?.kind === 'hand' || drag?.source.kind === 'hand' || !!pile.topCard)}
                  lifted={drag?.source.kind === 'discard' && drag.source.pileIndex === i}
                  dropZone={zone}
                  dropHover={drag?.source.kind === 'hand' && drag.overZone === zone}
                  onClick={() => handleDiscardPileClick(i as 0 | 1 | 2 | 3)}
                  onPointerDownCard={
                    isYourTurn && pile.topCard
                      ? (e) => beginPress(e, { kind: 'discard', pileIndex: i as 0 | 1 | 2 | 3 }, pile.topCard!)
                      : undefined
                  }
                  onDiscardHere={selected?.kind === 'hand' ? () => handleDiscardHere(i as 0 | 1 | 2 | 3) : undefined}
                  discardHereLabel={t('board.discardHere')}
                />
              );
            })}
          </div>
        </div>

        <div className="board__hand-section">
          <div className="board__player-label board__player-label--hand">{t('board.myHand')}</div>
          <div className="board__hand-row" data-anim-key="self-hand">
            {state.you.hand.map((c) => (
              <Card
                key={c.id}
                card={c}
                interactive={isYourTurn}
                selected={selected?.kind === 'hand' && selected.cardId === c.id}
                lifted={drag?.source.kind === 'hand' && drag.source.cardId === c.id}
                onClick={() => handleHandCardClick(c.id)}
                onPointerDown={isYourTurn ? (e) => beginPress(e, { kind: 'hand', cardId: c.id }, c) : undefined}
              />
            ))}
          </div>
        </div>
      </section>

      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          <Card card={drag.card} />
        </div>
      )}

      {flights.map((f) => (
        <FlightCard key={f.id} card={f.card} from={f.from} to={f.to} onDone={() => setFlights((fs) => fs.filter((x) => x.id !== f.id))} />
      ))}

      {isYourTurn && selected?.kind === 'hand' && <p className="board__hint">{t('board.hint')}</p>}

      {showTurnBanner && <TurnBanner text={t('board.yourTurnBanner')} onDone={() => setShowTurnBanner(false)} />}

      {gameOver && (
        <div className="board__overlay">
          <div className="board__overlay-card">
            <h2>{youWon ? t('board.youWon') : t('board.playerWon', { name: winnerName ?? '' })}</h2>
            <div className="board__overlay-actions">
              <button type="button" className="board__overlay-primary" onClick={() => send({ action: 'rematch' })}>
                {t('board.playAgain')}
              </button>
              <button type="button" className="board__overlay-secondary" onClick={onBackToHome}>
                {t('board.backToHome')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
