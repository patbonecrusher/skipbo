import { useRef, useState } from 'react';
import type { PileSummary } from '@skipbo/shared';
import { Card } from './Card';

const LONG_PRESS_MS = 450;

interface PileStackProps {
  pile: PileSummary;
  label: string;
  /** Set false to hide the text label -- useful when piles are fanned/overlapping and per-pile labels would collide. */
  showLabel?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  /** If provided, a quick tap always calls onClick (select-as-source); holding the pile down instead fires this. */
  onLongPress?: () => void;
  longPressHint?: string;
  /** For a SKIPBO card on top of this pile, the number it's currently standing in for (build piles only). */
  effectiveValue?: number;
}

export function PileStack({
  pile,
  label,
  showLabel = true,
  selected,
  dimmed,
  interactive,
  onClick,
  onLongPress,
  longPressHint,
  effectiveValue,
}: PileStackProps) {
  const timerRef = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const [holding, setHolding] = useState(false);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function handlePointerDown() {
    if (!interactive || !onLongPress) return;
    longPressFired.current = false;
    setHolding(true);
    timerRef.current = window.setTimeout(() => {
      longPressFired.current = true;
      setHolding(false);
      onLongPress();
    }, LONG_PRESS_MS);
  }

  function handlePointerUp() {
    clearTimer();
    setHolding(false);
  }

  function handleClick() {
    if (longPressFired.current) {
      // The long-press already fired the discard action; swallow the click that follows pointer-up.
      longPressFired.current = false;
      return;
    }
    onClick?.();
  }

  return (
    <div
      className="pile-stack"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => onLongPress && e.preventDefault()}
    >
      <div className="pile-stack__card-wrap">
        <Card
          card={pile.topCard}
          emptyLabel={showLabel ? label : undefined}
          selected={selected}
          dimmed={dimmed}
          interactive={interactive}
          holding={holding}
          effectiveValue={effectiveValue}
          onClick={handleClick}
        />
        {pile.count > 0 && <span className="pile-stack__count">{pile.count}</span>}
      </div>
      {showLabel && <span className="pile-stack__label">{label}</span>}
      {onLongPress && longPressHint && <span className="pile-stack__hint">{longPressHint}</span>}
    </div>
  );
}
