import type { Card as CardModel } from '@skipbo/shared';

const VALUE_COLORS: Record<number, string> = {
  1: '#c0392b',
  2: '#d35400',
  3: '#e67e22',
  4: '#f39c12',
  5: '#27ae60',
  6: '#16a085',
  7: '#2980b9',
  8: '#2c3e50',
  9: '#8e44ad',
  10: '#6c3483',
  11: '#943126',
  12: '#1a5276',
};

interface CardProps {
  card: CardModel | null;
  emptyLabel?: string;
  selected?: boolean;
  dimmed?: boolean;
  interactive?: boolean;
  holding?: boolean;
  /** For a SKIPBO card sitting on top of a build pile, the number it's currently standing in for. */
  effectiveValue?: number;
  onClick?: () => void;
}

export function Card({ card, emptyLabel, selected, dimmed, interactive, holding, effectiveValue, onClick }: CardProps) {
  if (!card) {
    return (
      <div className={`card card--empty${interactive ? ' card--interactive' : ''}`} onClick={interactive ? onClick : undefined}>
        {emptyLabel ? <span className="card__empty-label">{emptyLabel}</span> : null}
      </div>
    );
  }

  const isWild = card.value === 'SKIPBO';
  const style = isWild ? undefined : { background: VALUE_COLORS[card.value as number] };

  return (
    <button
      type="button"
      className={[
        'card',
        isWild ? 'card--wild' : '',
        selected ? 'card--selected' : '',
        dimmed ? 'card--dimmed' : '',
        interactive ? 'card--interactive' : '',
        holding ? 'card--holding' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      disabled={!interactive}
      onClick={onClick}
    >
      {isWild && effectiveValue ? (
        <>
          <span className="card__main-value">{effectiveValue}</span>
          <span className="card__wild-badge">SB</span>
        </>
      ) : isWild ? (
        'SB'
      ) : (
        card.value
      )}
    </button>
  );
}
