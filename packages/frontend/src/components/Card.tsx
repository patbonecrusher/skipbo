import type { Card as CardModel } from '@skipbo/shared';
import { CARD_FACES } from '../cardFaces';

interface CardProps {
  card: CardModel | null;
  emptyLabel?: string;
  selected?: boolean;
  dimmed?: boolean;
  interactive?: boolean;
  /** For a SKIPBO card sitting on top of a build pile, the number it's currently standing in for. */
  effectiveValue?: number;
  onClick?: () => void;
}

export function Card({ card, emptyLabel, selected, dimmed, interactive, effectiveValue, onClick }: CardProps) {
  if (!card) {
    return (
      <div className={`card card--empty${interactive ? ' card--interactive' : ''}`} onClick={interactive ? onClick : undefined}>
        {emptyLabel ? <span className="card__empty-label">{emptyLabel}</span> : null}
      </div>
    );
  }

  const isWild = card.value === 'SKIPBO';

  return (
    <button
      type="button"
      className={[
        'card',
        selected ? 'card--selected' : '',
        dimmed ? 'card--dimmed' : '',
        interactive ? 'card--interactive' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={!interactive}
      onClick={onClick}
    >
      <img className="card__face" src={CARD_FACES[card.value]} alt={isWild ? 'Skip-Bo' : String(card.value)} draggable={false} />
      {isWild && effectiveValue ? <span className="card__value-badge">{effectiveValue}</span> : null}
    </button>
  );
}
