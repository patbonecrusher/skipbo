import { useEffect, useState } from 'react';
import type { Card as CardModel } from '@skipbo/shared';
import { Card } from './Card';
import { CARD_BACK } from '../cardFaces';

export const FLIGHT_DURATION_MS = 550;

interface FlightCardProps {
  /** null shows a face-down card back -- used when dealing, since the source pile doesn't reveal the card. */
  card: CardModel | null;
  from: DOMRect;
  to: DOMRect;
  onDone: () => void;
}

/** A floating card that flies from one pile's on-screen position to another's, used to show an
 * opponent's move landing. Positioned once at `from`'s center, then a CSS transform transition
 * carries it to `to`'s center -- transform-only so the browser can animate it off the main thread. */
export function FlightCard({ card, from, to, onDone }: FlightCardProps) {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setStarted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const fromCx = from.left + from.width / 2;
  const fromCy = from.top + from.height / 2;
  const dx = to.left + to.width / 2 - fromCx;
  const dy = to.top + to.height / 2 - fromCy;

  return (
    <div
      className="flight-card"
      style={{
        left: fromCx,
        top: fromCy,
        transitionDuration: `${FLIGHT_DURATION_MS}ms`,
        transform: started ? `translate(-50%, -50%) translate(${dx}px, ${dy}px)` : 'translate(-50%, -50%) scale(0.85)',
      }}
      onTransitionEnd={onDone}
    >
      {card ? (
        <Card card={card} />
      ) : (
        <div className="card">
          <img className="card__face" src={CARD_BACK} alt="" draggable={false} />
        </div>
      )}
    </div>
  );
}
