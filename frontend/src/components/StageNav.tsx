import type { Translator } from "../i18n";

export type AppStage = "project" | "build" | "run" | "diagnostics";

type StageNavProps = {
  t: Translator;
  activeStage: AppStage;
  onStageChange: (stage: AppStage) => void;
};

const stages: AppStage[] = ["project", "build", "run", "diagnostics"];

export function StageNav({ t, activeStage, onStageChange }: StageNavProps) {
  return (
    <nav className="stage-nav" aria-label="Primary workflow stages">
      {stages.map((stage, index) => (
        <button
          key={stage}
          type="button"
          className={`stage-tab ${activeStage === stage ? "active" : ""}`}
          onClick={() => onStageChange(stage)}
        >
          <span className="stage-index">{index + 1}</span>
          <span>{t(`nav.${stage}`)}</span>
        </button>
      ))}
    </nav>
  );
}
