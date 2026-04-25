import type { CodexCapabilities, CodexSummary } from "../types";
import type { Locale, Translator } from "../i18n";

type AppHeaderProps = {
  t: Translator;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  summary: CodexSummary | null;
  capabilities: CodexCapabilities | null;
};

export function AppHeader({ t, locale, onLocaleChange, summary, capabilities }: AppHeaderProps) {
  const codexStatusLabel = summary?.codex_cli_available ? t("hero.codexReady") : t("hero.localMode");

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <p className="eyebrow">{t("app.badge")}</p>
        <div className="app-title-row">
          <h1>{t("app.title")}</h1>
          <span className="header-chip">{t("app.alpha")}</span>
        </div>
        <p className="hero-copy compact">{t("app.subtitle")}</p>
      </div>

      <div className="header-side">
        <label className="locale-switcher">
          <span>{t("common.language")}</span>
          <select value={locale} onChange={(event) => onLocaleChange(event.target.value as Locale)}>
            <option value="zh-CN">{t("locale.zh-CN")}</option>
            <option value="en-US">{t("locale.en-US")}</option>
          </select>
        </label>

        <div className="header-meta-row">
          <span className="header-meta-chip">
            {codexStatusLabel}
          </span>
          <span className="header-meta-chip">
            {t("hero.workflowStrict")}
          </span>
        </div>
      </div>
    </header>
  );
}
