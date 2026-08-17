import { useLanguage } from '../i18n/context';

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="lang-toggle">
      <button type="button" className={lang === 'en' ? 'lang-toggle__btn lang-toggle__btn--active' : 'lang-toggle__btn'} onClick={() => setLang('en')}>
        EN
      </button>
      <button type="button" className={lang === 'fr' ? 'lang-toggle__btn lang-toggle__btn--active' : 'lang-toggle__btn'} onClick={() => setLang('fr')}>
        FR
      </button>
    </div>
  );
}
