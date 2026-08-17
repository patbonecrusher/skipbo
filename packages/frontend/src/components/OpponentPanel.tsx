import type { RedactedOpponent } from '@skipbo/shared';
import { PileStack } from './PileStack';
import { HandCountCard } from './HandCountCard';
import { useLanguage } from '../i18n/context';

interface OpponentPanelProps {
  opponent: RedactedOpponent;
  isTheirTurn: boolean;
}

export function OpponentPanel({ opponent, isTheirTurn }: OpponentPanelProps) {
  const { t } = useLanguage();
  return (
    <div className={`opponent-panel${isTheirTurn ? ' opponent-panel--active' : ''}`}>
      <div className="board__player-label">
        <span className={`board__dot ${opponent.connected ? 'board__dot--on' : 'board__dot--off'}`} />
        {opponent.name}
      </div>
      <div className="board__piles board__piles--compact">
        <PileStack pile={opponent.stockPile} label={t('board.stock')} />
        <HandCountCard count={opponent.handCount} />
        {opponent.discardPiles.map((pile, i) => (
          <PileStack key={i} pile={pile} label={`D${i + 1}`} />
        ))}
      </div>
    </div>
  );
}
