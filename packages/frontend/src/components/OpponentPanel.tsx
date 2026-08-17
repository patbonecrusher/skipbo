import type { RedactedOpponent } from '@skipbo/shared';
import { PileStack } from './PileStack';
import { CARD_BACK } from '../cardFaces';

interface OpponentPanelProps {
  opponent: RedactedOpponent;
  isTheirTurn: boolean;
}

export function OpponentPanel({ opponent, isTheirTurn }: OpponentPanelProps) {
  return (
    <div className={`opponent-panel${isTheirTurn ? ' opponent-panel--active' : ''}`}>
      <div className="board__player-label">
        <span className={`board__dot ${opponent.connected ? 'board__dot--on' : 'board__dot--off'}`} />
        {opponent.name}
      </div>
      <div className="board__piles board__piles--compact">
        <PileStack pile={opponent.stockPile} label="Stock" />
        <div className="board__hand-count" title={`${opponent.handCount} cards in hand`}>
          {Array.from({ length: opponent.handCount }).map((_, i) => (
            <img key={i} src={CARD_BACK} className="board__hand-back" alt="" draggable={false} />
          ))}
        </div>
        <div className="board__discard-fan">
          {opponent.discardPiles.map((pile, i) => (
            <PileStack key={i} pile={pile} label={`D${i + 1}`} showLabel={false} />
          ))}
        </div>
      </div>
    </div>
  );
}
