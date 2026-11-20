import React from 'react';
import { useI18n } from '../../i18n/I18nContext';

export interface LanguageToggleProps {
  className?: string;
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({ className = '' }) => {
  const { locale, setLocale } = useI18n();

  return (
    <div
      role="group"
      aria-label="Language selector"
      data-testid="language-toggle"
      className={`inline-flex items-center p-0.5 rounded-full bg-space-surface border border-hairline backdrop-blur-md select-none text-xs transition-colors ${className}`}
    >
      <button
        type="button"
        data-testid="lang-btn-zh"
        onClick={() => setLocale('zh')}
        className={`px-2 py-0.5 rounded-full font-medium transition-all duration-200 cursor-pointer ${
          locale === 'zh'
            ? 'bg-accent-silver text-space-void font-semibold shadow-sm'
            : 'text-zinc-400 hover:text-white'
        }`}
      >
        中
      </button>
      <span className="text-zinc-600 px-0.5 text-[10px] pointer-events-none">|</span>
      <button
        type="button"
        data-testid="lang-btn-en"
        onClick={() => setLocale('en')}
        className={`px-2 py-0.5 rounded-full font-medium transition-all duration-200 cursor-pointer ${
          locale === 'en'
            ? 'bg-accent-silver text-space-void font-semibold shadow-sm'
            : 'text-zinc-400 hover:text-white'
        }`}
      >
        EN
      </button>
    </div>
  );
};

export default LanguageToggle;
