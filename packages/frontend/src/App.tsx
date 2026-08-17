import { useCallback, useEffect, useRef, useState } from 'react';
import type { RedactedGameState, ServerMessage } from '@skipbo/shared';
import { useWebSocket } from './useWebSocket';
import { clearSession, loadSession, saveSession } from './session';
import { HomeScreen } from './components/HomeScreen';
import { WaitingRoom } from './components/WaitingRoom';
import { GameBoard } from './components/GameBoard';

type Phase = { kind: 'home' } | { kind: 'connecting-existing' } | { kind: 'waiting'; gameId: string } | { kind: 'game' };

async function resolveWsUrl(): Promise<string> {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl) return envUrl;
  const res = await fetch('/config.json');
  const data = (await res.json()) as { wsUrl: string };
  return data.wsUrl;
}

export default function App() {
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(() => (loadSession() ? { kind: 'connecting-existing' } : { kind: 'home' }));
  const [gameState, setGameState] = useState<RedactedGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingNameRef = useRef<string | null>(null);

  useEffect(() => {
    resolveWsUrl()
      .then(setWsUrl)
      .catch(() => setError('Could not reach the game server. Try reloading.'));
  }, []);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'gameCreated': {
        saveSession({ gameId: msg.gameId, playerId: msg.playerId, playerName: pendingNameRef.current ?? '' });
        setPhase({ kind: 'waiting', gameId: msg.gameId });
        setError(null);
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
        setPhase({ kind: 'game' });
        setError(null);
        break;
      }
      case 'error': {
        setError(msg.message);
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
  }, []);

  const { status, send } = useWebSocket(wsUrl, handleMessage);

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

  const handleLeave = useCallback(() => {
    clearSession();
    setGameState(null);
    setError(null);
    setPhase({ kind: 'home' });
  }, []);

  if (phase.kind === 'connecting-existing') {
    return (
      <div className="home">
        <h1 className="home__title">Skip-Bo</h1>
        <p className="waiting__hint">Reconnecting…</p>
      </div>
    );
  }

  if (phase.kind === 'waiting') {
    return <WaitingRoom gameId={phase.gameId} onLeave={handleLeave} />;
  }

  if (phase.kind === 'game' && gameState) {
    return (
      <>
        <GameBoard state={gameState} send={send} onLeave={handleLeave} />
        {error && <div className="toast">{error}</div>}
      </>
    );
  }

  const initialGameCode = new URLSearchParams(window.location.search).get('game');
  return <HomeScreen initialGameCode={initialGameCode} status={status} error={error} onCreate={handleCreate} onJoin={handleJoin} />;
}
