import type { PileSummary } from '@skipbo/shared';
import { Card } from './Card';

interface PileStackProps {
  pile: PileSummary;
  label: string;
  selected?: boolean;
  dimmed?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}

export function PileStack({ pile, label, selected, dimmed, interactive, onClick }: PileStackProps) {
  return (
    <div className="pile-stack">
      <div className="pile-stack__card-wrap">
        <Card card={pile.topCard} emptyLabel={label} selected={selected} dimmed={dimmed} interactive={interactive} onClick={onClick} />
        {pile.count > 0 && <span className="pile-stack__count">{pile.count}</span>}
      </div>
      <span className="pile-stack__label">{label}</span>
    </div>
  );
}
