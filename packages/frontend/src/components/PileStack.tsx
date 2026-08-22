import type { PileSummary } from '@skipbo/shared';
import { Card } from './Card';

interface PileStackProps {
  pile: PileSummary;
  label: string;
  selected?: boolean;
  dimmed?: boolean;
  interactive?: boolean;
  lifted?: boolean;
  onClick?: () => void;
  onPointerDownCard?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  /** If provided, a small "discard here" button is overlaid on the pile (separate tap target from the card itself). */
  onDiscardHere?: () => void;
  discardHereLabel?: string;
  /** For a SKIPBO card on top of this pile, the number it's currently standing in for (build piles only). */
  effectiveValue?: number;
  /** Identifies this pile as a drag-and-drop target, e.g. "build-0" or "discard-2". */
  dropZone?: string;
  /** True while a dragged card is hovering over this pile and could be dropped here. */
  dropHover?: boolean;
  /** Stable DOM anchor (data-anim-key) other players' move animations use to find this pile's on-screen position. */
  animKey?: string;
}

export function PileStack({
  pile,
  label,
  selected,
  dimmed,
  interactive,
  lifted,
  onClick,
  onPointerDownCard,
  onDiscardHere,
  discardHereLabel,
  effectiveValue,
  dropZone,
  dropHover,
  animKey,
}: PileStackProps) {
  return (
    <div className={`pile-stack${dropHover ? ' pile-stack--drop-hover' : ''}`} data-drop-zone={dropZone} data-anim-key={animKey}>
      <div className="pile-stack__card-wrap">
        <Card
          card={pile.topCard}
          emptyLabel={label}
          selected={selected}
          dimmed={dimmed}
          interactive={interactive}
          lifted={lifted}
          effectiveValue={effectiveValue}
          onClick={onClick}
          onPointerDown={onPointerDownCard}
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
