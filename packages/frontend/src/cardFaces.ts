import c1 from './assets/cards/1.png';
import c2 from './assets/cards/2.png';
import c3 from './assets/cards/3.png';
import c4 from './assets/cards/4.png';
import c5 from './assets/cards/5.png';
import c6 from './assets/cards/6.png';
import c7 from './assets/cards/7.png';
import c8 from './assets/cards/8.png';
import c9 from './assets/cards/9.png';
import c10 from './assets/cards/10.png';
import c11 from './assets/cards/11.png';
import c12 from './assets/cards/12.png';
import cSkipboWild from './assets/cards/skipbo-wild.png';
import cSkipboLogo from './assets/cards/skipbo-logo.png';

export const CARD_FACES: Record<number | 'SKIPBO', string> = {
  1: c1,
  2: c2,
  3: c3,
  4: c4,
  5: c5,
  6: c6,
  7: c7,
  8: c8,
  9: c9,
  10: c10,
  11: c11,
  12: c12,
  SKIPBO: cSkipboWild,
};

export const CARD_BACK = cSkipboLogo;
