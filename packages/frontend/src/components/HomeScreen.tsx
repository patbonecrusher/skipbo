import { useState } from 'react';
import type { SocketStatus } from '../useWebSocket';

interface HomeScreenProps {
  initialGameCode: string | null;
  status: SocketStatus;
  error: string | null;
  onCreate: (name: string) => void;
  onJoin: (gameId: string, name: string) => void;
}

export function HomeScreen({ initialGameCode, status, error, onCreate, onJoin }: HomeScreenProps) {
  const [mode, setMode] = useState<'create' | 'join'>(initialGameCode ? 'join' : 'create');
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialGameCode ?? '');

  const ready = status === 'open';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !ready) return;
    if (mode === 'create') {
      onCreate(name.trim());
    } else {
      if (!code.trim()) return;
      onJoin(code.trim().toUpperCase(), name.trim());
    }
  }

  return (
    <div className="home">
      <h1 className="home__title">Skip-Bo</h1>

      <div className="home__tabs">
        <button type="button" className={mode === 'create' ? 'home__tab home__tab--active' : 'home__tab'} onClick={() => setMode('create')}>
          Start a game
        </button>
        <button type="button" className={mode === 'join' ? 'home__tab home__tab--active' : 'home__tab'} onClick={() => setMode('join')}>
          Join a game
        </button>
      </div>

      <form className="home__form" onSubmit={submit}>
        <label className="home__label">
          Your name
          <input
            className="home__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mom"
            maxLength={40}
            autoFocus
          />
        </label>

        {mode === 'join' && (
          <label className="home__label">
            Room code
            <input
              className="home__input home__input--code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
            />
          </label>
        )}

        <button type="submit" className="home__submit" disabled={!ready || !name.trim() || (mode === 'join' && !code.trim())}>
          {mode === 'create' ? 'Create game' : 'Join game'}
        </button>

        {!ready && <p className="home__hint">Connecting…</p>}
        {error && <p className="home__error">{error}</p>}
      </form>
    </div>
  );
}
