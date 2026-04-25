import type { ReactNode } from "react";

import type { Translator } from "../i18n";
import type {
  ProjectRecord,
  ProjectRuntime,
  ProjectRuntimeMirrorResult,
  RecentProjectRecord,
} from "../types";

type WorkspaceStageProps = {
  t: Translator;
  selectedProject: string;
  runtime: ProjectRuntime | null;
  runtimeLoading: boolean;
  runtimeError: string;
  mirrorLoading: boolean;
  mirrorResult: ProjectRuntimeMirrorResult | null;
  mirrorError: string;
  recentProjects: RecentProjectRecord[];
  projects: ProjectRecord[];
  sourceLabel: (source: ProjectRecord["source"]) => string;
  runtimeStateLabel: (state: ProjectRuntime["state"] | null | undefined) => string;
  activeSection: "build" | "run";
  onSectionChange: (section: "build" | "run") => void;
  onOpenProject: (path: string, source?: "manual" | "picker" | "codex-config" | "filesystem") => void;
  onOpenLauncher: () => void;
  onInitRuntime: () => void;
  onMirrorRuntime: () => void;
  onExportRuntime: () => void;
  onImportRuntime: () => void;
  buildContent: ReactNode;
  runContent: ReactNode;
  diagnosticsContent: ReactNode;
};

export function WorkspaceStage({
  t,
  selectedProject,
  runtime,
  runtimeLoading,
  runtimeError,
  mirrorLoading,
  mirrorResult,
  mirrorError,
  recentProjects,
  projects,
  sourceLabel,
  runtimeStateLabel,
  activeSection,
  onSectionChange,
  onOpenProject,
  onOpenLauncher,
  onInitRuntime,
  onMirrorRuntime,
  onExportRuntime,
  onImportRuntime,
  buildContent,
  runContent,
  diagnosticsContent,
}: WorkspaceStageProps) {
  const quickSwitchItems = [
    ...recentProjects
      .filter((project) => project.path !== selectedProject)
      .map((project) => ({
        key: `recent-${project.path}`,
        path: project.path,
        source: "filesystem" as const,
        meta: project.updated_at,
      })),
    ...projects
      .filter((project) => project.path !== selectedProject)
      .filter((project) => !recentProjects.some((recentProject) => recentProject.path === project.path))
      .map((project) => ({
        key: `project-${project.path}`,
        path: project.path,
        source: project.source,
        meta: sourceLabel(project.source),
      })),
  ].slice(0, 4);

  const mirrorResultMessage = mirrorResult
    ? t("project.mirrorResult", {
        operation: t(`mirror.operation.${mirrorResult.operation}`),
        runs: mirrorResult.run_count,
        queue: mirrorResult.queue_item_count,
        sessions: mirrorResult.agent_session_count,
        path: mirrorResult.path,
      })
    : "";

  return (
    <section className="stage-panel workspace-stage">
      <div className="stage-intro workspace-intro">
        <div>
          <p className="eyebrow">{t("workspace.badge")}</p>
          <h2>{t("workspace.heading")}</h2>
          <p>{t("workspace.description")}</p>
        </div>
        <div className="workspace-header-actions">
          <span className="project-pill">{runtimeStateLabel(runtime?.state)}</span>
          <button type="button" className="secondary-button" onClick={onOpenLauncher}>
            {t("workspace.changeProject")}
          </button>
        </div>
      </div>

      <div className="workspace-context-strip">
        <div className="workspace-context-item">
          <span className="meta-label">{t("project.current")}</span>
          <strong>{selectedProject || t("project.notSelected")}</strong>
          <span>{t("workspace.currentProjectHint")}</span>
        </div>
        <div className="workspace-context-item">
          <span className="meta-label">{t("project.runtimeState")}</span>
          <strong>{runtimeStateLabel(runtime?.state)}</strong>
          <span>{runtime?.runtime_path ?? t("workspace.runtimeHint")}</span>
        </div>
      </div>

      {runtimeError ? <div className="inline-error">{runtimeError}</div> : null}

      <details className="workspace-runtime-shell glass-panel">
        <summary>{t("workspace.runtimeTools")}</summary>
        <div className="workspace-runtime-body">
          <p className="launcher-lead">{t("workspace.runtimeHint")}</p>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={onInitRuntime}
              disabled={runtimeLoading || runtime?.state !== "missing"}
            >
              {runtimeLoading ? t("project.runtimeInitLoading") : t("project.runtimeInit")}
            </button>
            <button type="button" className="secondary-button" onClick={onMirrorRuntime} disabled={mirrorLoading}>
              {mirrorLoading ? t("project.mirrorLoading") : t("project.mirror")}
            </button>
            <button type="button" className="secondary-button" onClick={onExportRuntime} disabled={mirrorLoading}>
              {t("project.export")}
            </button>
            <button type="button" className="secondary-button" onClick={onImportRuntime} disabled={mirrorLoading}>
              {t("project.import")}
            </button>
          </div>
          {mirrorError ? <div className="inline-error">{mirrorError}</div> : null}
          {mirrorResultMessage ? <div className="empty-state">{mirrorResultMessage}</div> : null}

          <div className="panel-header subheader">
            <h3>{t("workspace.quickSwitchHeading")}</h3>
            <span>{quickSwitchItems.length}</span>
          </div>
          <div className="project-card-list compact-list">
            {quickSwitchItems.length === 0 ? (
              <div className="empty-state">{t("workspace.quickSwitchEmpty")}</div>
            ) : (
              quickSwitchItems.map((project) => (
                <button
                  key={project.key}
                  type="button"
                  className="project-card"
                  onClick={() => onOpenProject(project.path, project.source)}
                >
                  <strong>{project.path}</strong>
                  <span>{project.meta}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </details>

      <div className="workspace-main-column">
        <nav className="workspace-switcher" aria-label="Workspace sections">
          <button
            type="button"
            className={`workspace-switcher-tab ${activeSection === "build" ? "active" : ""}`}
            onClick={() => onSectionChange("build")}
          >
            <span className="workspace-switcher-kicker">{t("nav.build")}</span>
            <strong>{t("workspace.buildTabTitle")}</strong>
            <span>{t("workspace.buildTabHint")}</span>
          </button>
          <button
            type="button"
            className={`workspace-switcher-tab ${activeSection === "run" ? "active" : ""}`}
            onClick={() => onSectionChange("run")}
          >
            <span className="workspace-switcher-kicker">{t("nav.run")}</span>
            <strong>{t("workspace.runTabTitle")}</strong>
            <span>{t("workspace.runTabHint")}</span>
          </button>
        </nav>

        <div key={activeSection} className={`workspace-stage-surface is-${activeSection}`}>
          {activeSection === "build" ? (
            <div className="workspace-section workspace-build-section">{buildContent}</div>
          ) : (
            <div className="workspace-section workspace-run-section">{runContent}</div>
          )}
        </div>
        <details className="workspace-diagnostics-shell glass-panel">
          <summary>{t("workspace.diagnosticsToggle")}</summary>
          <div className="workspace-diagnostics-body">{diagnosticsContent}</div>
        </details>
      </div>
    </section>
  );
}
