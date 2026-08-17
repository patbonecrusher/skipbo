import { useState } from 'react';
import type { ClientMessage, LobbyGameState } from '@skipbo/shared';
import { useLanguage } from '../i18n/context';
import { LanguageToggle } from './LanguageToggle';

interface LobbyViewProps {
  state: LobbyGameState;
  send: (message: ClientMessage) => void;
  onLeave: () => void;
}

export function LobbyView({ state, send, onLeave }: LobbyViewProps) {
  const { t } = useLanguage();
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
      <div className="home-lang-toggle">
        <LanguageToggle />
      </div>
      <h1 className="home__title">{t('app.title')}</h1>
      <p className="waiting__text">{t('lobby.shareText')}</p>
      <div className="waiting__code">{state.gameId}</div>
      <button type="button" className="home__submit" onClick={copyLink}>
        {copied ? t('lobby.linkCopied') : t('lobby.copyLink')}
      </button>
      <p className="waiting__link">{link}</p>

      <ul className="lobby__players">
        {state.players.map((p, i) => (
          <li key={p.id} className="lobby__player">
            <span className={`board__dot ${p.connected ? 'board__dot--on' : 'board__dot--off'}`} />
            {p.isBot && '🤖 '}
            {p.name}
            {i === state.youIndex && ` ${t('lobby.you')}`}
          </li>
        ))}
      </ul>

      {state.isHost ? (
        <>
          <button type="button" className="home__submit" disabled={!canStart} onClick={() => send({ action: 'startGame' })}>
            {canStart ? t('lobby.startGame') : t('lobby.waitingForMore', { count: state.minPlayers - state.players.length })}
          </button>
          {state.players.length >= state.minPlayers && (
            <p className="waiting__hint">{t('lobby.canStartOrWait', { count: state.players.length, max: state.maxPlayers })}</p>
          )}
          {state.players.length < state.maxPlayers && (
            <button type="button" className="lobby__add-bot" onClick={() => send({ action: 'addBot' })}>
              {t('lobby.addBot')}
            </button>
          )}
        </>
      ) : (
        <p className="waiting__hint">{t('lobby.waitingForHost')}</p>
      )}

      <button type="button" className="board__leave" onClick={onLeave}>
        {t('lobby.cancel')}
      </button>
    </div>
  );
}
