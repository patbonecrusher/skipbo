import { CARD_BACK } from '../cardFaces';
import { useLanguage } from '../i18n/context';

interface DrawPileStackProps {
  count: number;
  /** Stable DOM anchor (data-anim-key) the deal animation uses to find this pile's on-screen position. */
  animKey?: string;
}

/** The shared draw pile, drawn as a few layered face-down cards to read as a stack rather than a
 * single card -- the actual count is all that's known about it (its cards are never revealed). */
export function DrawPileStack({ count, animKey }: DrawPileStackProps) {
  const { t } = useLanguage();
  return (
    <div className="pile-stack" data-anim-key={animKey}>
      <div className="pile-stack__card-wrap draw-pile-stack__wrap">
        <div className="card draw-pile-stack__top">
          <img className="card__face" src={CARD_BACK} alt={t('board.drawPile')} draggable={false} />
        </div>
        {count > 0 && <span className="pile-stack__count">{count}</span>}
      </div>
      <span className="pile-stack__label">{t('board.drawPile')}</span>
    </div>
  );
}
