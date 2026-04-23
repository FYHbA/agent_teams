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
  return (
    <header className="app-header">
      <div className="hero-copy-block">
        <p className="eyebrow">{t("app.badge")}</p>
        <h1>{t("app.title")}</h1>
        <p className="hero-copy">{t("app.subtitle")}</p>
      </div>

      <div className="header-side">
        <label className="locale-switcher">
          <span>{t("common.language")}</span>
          <select value={locale} onChange={(event) => onLocaleChange(event.target.value as Locale)}>
            <option value="zh-CN">中文</option>
            <option value="en-US">English</option>
          </select>
        </label>

        <div className="header-status-grid">
          <article className="status-card">
            <span className="status-label">{t("hero.codex")}</span>
            <strong>{summary?.codex_cli_available ? t("hero.codexDetected") : t("hero.codexUnavailable")}</strong>
            <span>{capabilities?.version ?? summary?.integration_mode ?? t("common.waiting")}</span>
          </article>
          <article className="status-card accent">
            <span className="status-label">{t("hero.workflowMode")}</span>
            <strong>{t("hero.workflowStrict")}</strong>
            <span>{t("hero.workflowStrictNote")}</span>
          </article>
        </div>
      </div>
    </header>
  );
}
