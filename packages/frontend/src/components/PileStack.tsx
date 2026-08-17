import type { PileSummary } from '@skipbo/shared';
import { Card } from './Card';

interface PileStackProps {
  pile: PileSummary;
  label: string;
  selected?: boolean;
  dimmed?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  /** If provided, a small "discard here" button is overlaid on the pile (separate tap target from the card itself). */
  onDiscardHere?: () => void;
  discardHereLabel?: string;
  /** For a SKIPBO card on top of this pile, the number it's currently standing in for (build piles only). */
  effectiveValue?: number;
}

export function PileStack({ pile, label, selected, dimmed, interactive, onClick, onDiscardHere, discardHereLabel, effectiveValue }: PileStackProps) {
  return (
    <div className="pile-stack">
      <div className="pile-stack__card-wrap">
        <Card
          card={pile.topCard}
          emptyLabel={label}
          selected={selected}
          dimmed={dimmed}
          interactive={interactive}
          effectiveValue={effectiveValue}
          onClick={onClick}
        />
        {pile.count > 0 && <span className="pile-stack__count">{pile.count}</span>}
        {onDiscardHere && (
          <button type="button" className="pile-stack__discard-badge" title={discardHereLabel} aria-label={discardHereLabel} onClick={onDiscardHere}>
            ↓
          </button>
        )}
      </div>
      <span className="pile-stack__label">{label}</span>
    </div>
  );
}
