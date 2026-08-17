import { CARD_BACK } from '../cardFaces';

interface HandCountCardProps {
  count: number;
}

/** A single face-down card standing in for an opponent's whole hand, with the card count overlaid. */
export function HandCountCard({ count }: HandCountCardProps) {
  return (
    <div className="pile-stack">
      <div className="pile-stack__card-wrap">
        <div className="card">
          <img className="card__face" src={CARD_BACK} alt={`${count} cards in hand`} draggable={false} />
          <span className="card__value-badge">{count}</span>
        </div>
      </div>
      <span className="pile-stack__label">Hand</span>
    </div>
  );
}
