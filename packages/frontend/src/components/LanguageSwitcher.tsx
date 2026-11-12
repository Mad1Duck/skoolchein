import { useI18n, type Lang } from '@/lib/i18n';

const LANGS: Lang[] = ['id', 'en'];

/** ID | EN toggle. */
export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className="flex border-2 border-black rounded-lg overflow-hidden text-xs font-bold"
    >
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`px-2 py-1 uppercase ${lang === l ? 'bg-black text-white' : 'bg-white'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
