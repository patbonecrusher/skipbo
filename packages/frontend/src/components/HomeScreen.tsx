import { useState } from 'react';
import type { SocketStatus } from '../useWebSocket';
import { useLanguage } from '../i18n/context';
import { LanguageToggle } from './LanguageToggle';

interface HomeScreenProps {
  initialGameCode: string | null;
  status: SocketStatus;
  error: string | null;
  onCreate: (name: string) => void;
  onJoin: (gameId: string, name: string) => void;
}

export function HomeScreen({ initialGameCode, status, error, onCreate, onJoin }: HomeScreenProps) {
  const { t } = useLanguage();
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
      <div className="home-lang-toggle">
        <LanguageToggle />
      </div>
      <h1 className="home__title">{t('app.title')}</h1>

      <div className="home__tabs">
        <button type="button" className={mode === 'create' ? 'home__tab home__tab--active' : 'home__tab'} onClick={() => setMode('create')}>
          {t('home.tabCreate')}
        </button>
        <button type="button" className={mode === 'join' ? 'home__tab home__tab--active' : 'home__tab'} onClick={() => setMode('join')}>
          {t('home.tabJoin')}
        </button>
      </div>

      <form className="home__form" onSubmit={submit}>
        <label className="home__label">
          {t('home.yourName')}
          <input
            className="home__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('home.namePlaceholder')}
            maxLength={40}
            autoFocus
          />
        </label>

        {mode === 'join' && (
          <label className="home__label">
            {t('home.roomCode')}
            <input
              className="home__input home__input--code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t('home.codePlaceholder')}
              maxLength={6}
            />
          </label>
        )}

        <button type="submit" className="home__submit" disabled={!ready || !name.trim() || (mode === 'join' && !code.trim())}>
          {mode === 'create' ? t('home.createButton') : t('home.joinButton')}
        </button>

        {!ready && <p className="home__hint">{t('home.connecting')}</p>}
        {error && <p className="home__error">{error}</p>}
      </form>
    </div>
  );
}
