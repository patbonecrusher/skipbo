import { CARD_BACK } from '../cardFaces';
import { useLanguage } from '../i18n/context';

interface HandCountCardProps {
  count: number;
  /** Stable DOM anchor (data-anim-key) other players' move animations use to find this hand's on-screen position. */
  animKey?: string;
}

/** A single face-down card standing in for an opponent's whole hand, with the card count overlaid. */
export function HandCountCard({ count, animKey }: HandCountCardProps) {
  const { t } = useLanguage();
  return (
    <div className="pile-stack" data-anim-key={animKey}>
      <div className="pile-stack__card-wrap">
        <div className="card">
          <img className="card__face" src={CARD_BACK} alt={t('board.handCount', { count })} draggable={false} />
          <span className="card__value-badge">{count}</span>
        </div>
      </div>
      <span className="pile-stack__label">{t('board.hand')}</span>
    </div>
  );
}
