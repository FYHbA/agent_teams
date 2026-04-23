import type { ChangeEvent } from "react";

import type { Translator } from "../i18n";
import type {
  ProjectRecord,
  ProjectRootEntry,
  ProjectRuntime,
  ProjectRuntimeMirrorResult,
  ProjectTreeEntry,
  RecentProjectRecord,
} from "../types";

type ProjectStageProps = {
  t: Translator;
  projects: ProjectRecord[];
  recentProjects: RecentProjectRecord[];
  projectRoots: ProjectRootEntry[];
  browserRoot: string;
  browserEntries: ProjectTreeEntry[];
  browserLoading: boolean;
  browserError: string;
  selectedProject: string;
  manualProjectPath: string;
  onManualProjectPathChange: (value: string) => void;
  onOpenProject: (path: string, source?: "manual" | "picker" | "codex-config" | "filesystem") => void;
  onPickProject: () => void;
  onBrowseRoot: (path: string) => void;
  onOpenFromBrowser: (path: string) => void;
  pickerAvailable: boolean;
  runtime: ProjectRuntime | null;
  runtimeLoading: boolean;
  runtimeError: string;
  onInitRuntime: () => void;
  onMirrorRuntime: () => void;
  onExportRuntime: () => void;
  onImportRuntime: () => void;
  mirrorLoading: boolean;
  mirrorResult: ProjectRuntimeMirrorResult | null;
  mirrorError: string;
  sourceLabel: (source: ProjectRecord["source"]) => string;
};

export function ProjectStage({
  t,
  projects,
  recentProjects,
  projectRoots,
  browserRoot,
  browserEntries,
  browserLoading,
  browserError,
  selectedProject,
  manualProjectPath,
  onManualProjectPathChange,
  onOpenProject,
  onPickProject,
  onBrowseRoot,
  onOpenFromBrowser,
  pickerAvailable,
  runtime,
  runtimeLoading,
  runtimeError,
  onInitRuntime,
  onMirrorRuntime,
  onExportRuntime,
  onImportRuntime,
  mirrorLoading,
  mirrorResult,
  mirrorError,
  sourceLabel,
}: ProjectStageProps) {
  const recentWithoutSelected = recentProjects.filter((project) => project.path !== selectedProject);

  return (
    <section className="stage-panel">
      <div className="stage-intro">
        <div>
          <p className="eyebrow">{t("nav.project")}</p>
          <h2>{t("project.heading")}</h2>
          <p>{t("project.description")}</p>
        </div>
      </div>

      <div className="project-stage-layout">
        <article className="glass-panel">
          <div className="panel-header">
            <h3>{t("project.current")}</h3>
            <span>{selectedProject ? t("common.ready") : t("common.waiting")}</span>
          </div>
          <p className="project-current-path">{selectedProject || t("project.notSelected")}</p>
          <label className="field-group">
            <span>{t("project.manualLabel")}</span>
            <div className="path-entry-row">
              <input
                type="text"
                value={manualProjectPath}
                placeholder={t("project.manualPlaceholder")}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onManualProjectPathChange(event.target.value)}
              />
              <button
                type="button"
                className="primary-button"
                onClick={() => onOpenProject(manualProjectPath, "manual")}
                disabled={!manualProjectPath.trim()}
              >
                {t("project.openPath")}
              </button>
            </div>
          </label>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={onPickProject} disabled={!pickerAvailable}>
              {pickerAvailable ? t("project.pickFolder") : t("project.pickFolderUnavailable")}
            </button>
          </div>
          {runtimeError ? <div className="inline-error">{runtimeError}</div> : null}
        </article>

        <article className="glass-panel">
          <div className="panel-header">
            <h3>{t("project.recent")}</h3>
            <span>{recentWithoutSelected.length}</span>
          </div>
          <div className="project-card-list">
            {recentWithoutSelected.length === 0 ? (
              <div className="empty-state">{t("project.noneRecent")}</div>
            ) : (
              recentWithoutSelected.map((project) => (
                <button key={project.path} type="button" className="project-card" onClick={() => onOpenProject(project.path, "filesystem")}>
                  <strong>{project.path}</strong>
                  <span>{project.updated_at}</span>
                  <span>{t("project.openRecent")}</span>
                </button>
              ))
            )}
          </div>
        </article>

        <article className="glass-panel">
          <div className="panel-header">
            <h3>{t("project.discovered")}</h3>
            <span>{projects.length}</span>
          </div>
          <div className="project-card-list">
            {projects.length === 0 ? (
              <div className="empty-state">{t("project.noneDiscovered")}</div>
            ) : (
              projects.map((project) => (
                <button
                  key={project.path}
                  type="button"
                  className={`project-card ${selectedProject === project.path ? "selected" : ""}`}
                  onClick={() => onOpenProject(project.path, project.source)}
                >
                  <strong>{project.path}</strong>
                  <span>{sourceLabel(project.source)}</span>
                </button>
              ))
            )}
          </div>
        </article>
      </div>

      <div className="project-stage-layout">
        <article className="glass-panel">
          <div className="panel-header">
            <h3>Server browser</h3>
            <span>{browserLoading ? t("common.loading") : browserRoot || t("common.waiting")}</span>
          </div>
          <div className="button-row">
            {projectRoots.map((root) => (
              <button key={root.path} type="button" className="secondary-button" onClick={() => onBrowseRoot(root.path)}>
                {root.name}
              </button>
            ))}
          </div>
          {browserError ? <div className="inline-error">{browserError}</div> : null}
          <div className="project-card-list compact-list">
            {browserEntries.length === 0 ? (
              <div className="empty-state">{browserLoading ? t("common.loading") : t("project.noneDiscovered")}</div>
            ) : (
              browserEntries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className="project-card"
                  onClick={() => (entry.entry_type === "directory" ? onBrowseRoot(entry.path) : onOpenFromBrowser(entry.path))}
                >
                  <strong>{entry.name}</strong>
                  <span>{entry.path}</span>
                  <span>{entry.entry_type}</span>
                </button>
              ))
            )}
          </div>
        </article>
      </div>

      <div className="project-stage-layout">
        <article className="glass-panel">
          <div className="panel-header">
            <h3>{t("project.runtime")}</h3>
            <span>{runtime?.state ?? t("common.waiting")}</span>
          </div>
          <div className="meta-grid compact">
            <div>
              <span className="meta-label">{t("project.runtimeState")}</span>
              <strong>{runtime?.state ?? t("common.waiting")}</strong>
            </div>
            <div>
              <span className="meta-label">{t("project.runtimePath")}</span>
              <strong>{runtime?.runtime_path ?? t("project.runtimeMissing")}</strong>
            </div>
            <div>
              <span className="meta-label">{t("project.runtimePolicy")}</span>
              <strong>{runtime?.policy.git_strategy ?? "manual"}</strong>
            </div>
          </div>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={onInitRuntime} disabled={runtimeLoading || !selectedProject}>
              {runtimeLoading ? t("project.runtimeInitLoading") : t("project.runtimeInit")}
            </button>
          </div>
        </article>

        <article className="glass-panel">
          <div className="panel-header">
            <h3>{t("diagnostics.mirror")}</h3>
            <span>{mirrorLoading ? t("common.loading") : t("common.ready")}</span>
          </div>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={onMirrorRuntime} disabled={mirrorLoading || !selectedProject}>
              {mirrorLoading ? t("project.mirrorLoading") : t("project.mirror")}
            </button>
            <button type="button" className="secondary-button" onClick={onExportRuntime} disabled={mirrorLoading || !selectedProject}>
              {t("project.export")}
            </button>
            <button type="button" className="secondary-button" onClick={onImportRuntime} disabled={mirrorLoading || !selectedProject}>
              {t("project.import")}
            </button>
          </div>
          {mirrorError ? <div className="inline-error">{mirrorError}</div> : null}
          {mirrorResult ? (
            <div className="run-note">
              {t("project.mirrorResult", {
                operation: t(`mirror.operation.${mirrorResult.operation}`),
                runs: mirrorResult.run_count,
                queue: mirrorResult.queue_item_count,
                sessions: mirrorResult.agent_session_count,
                path: mirrorResult.path,
              })}
            </div>
          ) : (
            <div className="empty-state">{t("diagnostics.mirrorEmpty")}</div>
          )}
        </article>
      </div>
    </section>
  );
}
