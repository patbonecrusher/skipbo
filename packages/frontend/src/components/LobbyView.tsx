import { useState } from 'react';
import type { ClientMessage, LobbyGameState } from '@skipbo/shared';

interface LobbyViewProps {
  state: LobbyGameState;
  send: (message: ClientMessage) => void;
  onLeave: () => void;
}

export function LobbyView({ state, send, onLeave }: LobbyViewProps) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/?game=${state.gameId}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permissions can fail silently on some browsers; the code/link is still shown
    }
  }

  const canStart = state.isHost && state.players.length >= state.minPlayers;

  return (
    <div className="waiting">
      <h1 className="home__title">Skip-Bo</h1>
      <p className="waiting__text">Share this with the other players:</p>
      <div className="waiting__code">{state.gameId}</div>
      <button type="button" className="home__submit" onClick={copyLink}>
        {copied ? 'Link copied!' : 'Copy invite link'}
      </button>
      <p className="waiting__link">{link}</p>

      <ul className="lobby__players">
        {state.players.map((p, i) => (
          <li key={p.id} className="lobby__player">
            <span className={`board__dot ${p.connected ? 'board__dot--on' : 'board__dot--off'}`} />
            {p.name}
            {i === state.youIndex && ' (you)'}
          </li>
        ))}
      </ul>

      {state.isHost ? (
        <>
          <button type="button" className="home__submit" disabled={!canStart} onClick={() => send({ action: 'startGame' })}>
            {canStart ? 'Start game' : `Waiting for ${state.minPlayers - state.players.length} more player(s)…`}
          </button>
          {state.players.length >= state.minPlayers && (
            <p className="waiting__hint">You can keep waiting for more players ({state.players.length}/{state.maxPlayers}), or start now.</p>
          )}
        </>
      ) : (
        <p className="waiting__hint">Waiting for the host to start the game…</p>
      )}

      <button type="button" className="board__leave" onClick={onLeave}>
        Cancel
      </button>
    </div>
  );
}
