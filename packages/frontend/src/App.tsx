import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, RedactedGameState, ServerMessage } from '@skipbo/shared';
import { useWebSocket } from './useWebSocket';
import { clearSession, loadSession, saveSession } from './session';
import { useLanguage } from './i18n/context';
import type { TranslationKey } from './i18n/translations';
import { HomeScreen } from './components/HomeScreen';
import { LobbyView } from './components/LobbyView';
import { GameBoard } from './components/GameBoard';
import { LanguageToggle } from './components/LanguageToggle';

type Phase = { kind: 'home' } | { kind: 'connecting-existing' } | { kind: 'connected' };

async function resolveWsUrl(): Promise<string> {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl) return envUrl;
  const res = await fetch('/config.json');
  const data = (await res.json()) as { wsUrl: string };
  return data.wsUrl;
}

export default function App() {
  const { t } = useLanguage();
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(() => (loadSession() ? { kind: 'connecting-existing' } : { kind: 'home' }));
  const [gameState, setGameState] = useState<RedactedGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingNameRef = useRef<string | null>(null);
  const pendingSoloRef = useRef(false);
  // handleMessage needs to send follow-up messages, but useWebSocket (which produces `send`)
  // takes handleMessage as an argument -- a ref breaks that circular dependency.
  const sendRef = useRef<(message: ClientMessage) => void>(() => {});

  useEffect(() => {
    resolveWsUrl()
      .then(setWsUrl)
      .catch(() => setError(t('app.connectionError')));
  }, [t]);

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case 'gameCreated': {
          saveSession({ gameId: msg.gameId, playerId: msg.playerId, playerName: pendingNameRef.current ?? '' });
          setError(null);
          if (pendingSoloRef.current) {
            sendRef.current({ action: 'addBot' });
          }
          break;
        }
        case 'joined': {
          const existing = loadSession();
          saveSession({ gameId: msg.gameId, playerId: msg.playerId, playerName: existing?.playerName ?? pendingNameRef.current ?? '' });
          setError(null);
          break;
        }
        case 'state': {
          setGameState(msg.state);
          setPhase({ kind: 'connected' });
          setError(null);
          if (pendingSoloRef.current && msg.state.status === 'waiting-for-players' && msg.state.players.length >= 2) {
            pendingSoloRef.current = false;
            sendRef.current({ action: 'startGame' });
          }
          break;
        }
        case 'error': {
          setError(t(`error.${msg.code}` as TranslationKey, msg.params));
          setPhase((prev) => {
            if (prev.kind === 'connecting-existing') {
              clearSession();
              return { kind: 'home' };
            }
            return prev;
          });
          break;
        }
      }
    },
    [t],
  );

  const { status, send } = useWebSocket(wsUrl, handleMessage);
  sendRef.current = send;

  useEffect(() => {
    if (status !== 'open') return;
    const existing = loadSession();
    if (existing) {
      send({ action: 'rejoinGame', gameId: existing.gameId, playerId: existing.playerId });
    }
  }, [status, send]);

  const handleCreate = useCallback(
    (name: string) => {
      pendingNameRef.current = name;
      send({ action: 'createGame', playerName: name });
    },
    [send],
  );

  const handleJoin = useCallback(
    (gameId: string, name: string) => {
      pendingNameRef.current = name;
      send({ action: 'joinGame', gameId, playerName: name });
    },
    [send],
  );

  const handlePlaySolo = useCallback(
    (name: string) => {
      pendingNameRef.current = name;
      pendingSoloRef.current = true;
      send({ action: 'createGame', playerName: name });
    },
    [send],
  );

  const handleLeave = useCallback(() => {
    clearSession();
    setGameState(null);
    setError(null);
    setPhase({ kind: 'home' });
  }, []);

  if (phase.kind === 'connecting-existing') {
    return (
      <div className="home">
        <div className="home-lang-toggle">
          <LanguageToggle />
        </div>
        <h1 className="home__title">{t('app.title')}</h1>
        <p className="waiting__hint">{t('app.reconnecting')}</p>
      </div>
    );
  }

  if (phase.kind === 'connected' && gameState) {
    if (gameState.status === 'waiting-for-players') {
      return <LobbyView state={gameState} send={send} onLeave={handleLeave} />;
    }
    return (
      <>
        <GameBoard state={gameState} send={send} onLeave={handleLeave} />
        {error && <div className="toast">{error}</div>}
      </>
    );
  }

  const initialGameCode = new URLSearchParams(window.location.search).get('game');
  return (
    <HomeScreen
      initialGameCode={initialGameCode}
      status={status}
      error={error}
      onCreate={handleCreate}
      onJoin={handleJoin}
      onPlaySolo={handlePlaySolo}
    />
  );
}
