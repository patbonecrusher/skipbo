import type { Card as CardModel } from '@skipbo/shared';
import { CARD_FACES } from '../cardFaces';

interface CardProps {
  card: CardModel | null;
  emptyLabel?: string;
  selected?: boolean;
  dimmed?: boolean;
  interactive?: boolean;
  /** True while this exact card has been lifted into a drag — it stays in place, ghosted, while a floating copy follows the pointer. */
  lifted?: boolean;
  /** For a SKIPBO card sitting on top of a build pile, the number it's currently standing in for. */
  effectiveValue?: number;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  /** Stable DOM anchor (data-anim-key) other players' move animations use to find this card's on-screen position. */
  animKey?: string;
}

export function Card({ card, emptyLabel, selected, dimmed, interactive, lifted, effectiveValue, onClick, onPointerDown, animKey }: CardProps) {
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
        onPointerDown ? 'card--drag-source' : '',
        lifted ? 'card--lifted' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={!interactive}
      onClick={onClick}
      onPointerDown={onPointerDown}
      data-anim-key={animKey}
    >
      <img className="card__face" src={CARD_FACES[card.value]} alt={isWild ? 'Skip-Bo' : String(card.value)} draggable={false} />
      {isWild && effectiveValue ? <span className="card__value-badge">{effectiveValue}</span> : null}
    </button>
  );
}
