import { useState } from 'react';

interface WaitingRoomProps {
  gameId: string;
  onLeave: () => void;
}

export function WaitingRoom({ gameId, onLeave }: WaitingRoomProps) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/?game=${gameId}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permissions can fail silently on some browsers; the code/link is still shown
    }
  }

  return (
    <div className="waiting">
      <h1 className="home__title">Skip-Bo</h1>
      <p className="waiting__text">Share this with the other player:</p>
      <div className="waiting__code">{gameId}</div>
      <button type="button" className="home__submit" onClick={copyLink}>
        {copied ? 'Link copied!' : 'Copy invite link'}
      </button>
      <p className="waiting__link">{link}</p>
      <p className="waiting__hint">Waiting for them to join…</p>
      <button type="button" className="board__leave" onClick={onLeave}>
        Cancel
      </button>
    </div>
  );
}
