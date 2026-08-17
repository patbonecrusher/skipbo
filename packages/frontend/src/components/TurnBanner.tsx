import { useEffect, useState } from 'react';

const AUTO_DISMISS_MS = 5000;
const FADE_MS = 300;

interface TurnBannerProps {
  text: string;
  onDone: () => void;
}

export function TurnBanner({ text, onDone }: TurnBannerProps) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFading(true), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!fading) return;
    const timer = setTimeout(onDone, FADE_MS);
    return () => clearTimeout(timer);
  }, [fading, onDone]);

  return (
    <div className={`turn-banner${fading ? ' turn-banner--fading' : ''}`} onClick={() => setFading(true)}>
      <div className="turn-banner__card">{text}</div>
    </div>
  );
}
