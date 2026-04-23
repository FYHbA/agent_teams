import type { CodexSession, CodexSessionBridge, WorkflowPlan } from "../types";
import type { Translator } from "../i18n";

type BuildStageProps = {
  t: Translator;
  selectedProject: string;
  sessions: CodexSession[];
  selectedSessionId: string;
  bridge: CodexSessionBridge | null;
  bridgeLoading: boolean;
  bridgeError: string;
  task: string;
  allowNetwork: boolean;
  allowInstalls: boolean;
  plan: WorkflowPlan | null;
  loading: boolean;
  runLoading: boolean;
  planError: string;
  runError: string;
  backendLabel: (backend: WorkflowPlan["steps"][number]["backend"]) => string;
  executionLabel: (execution: WorkflowPlan["steps"][number]["execution"]) => string;
  onTaskChange: (value: string) => void;
  onAllowNetworkChange: (value: boolean) => void;
  onAllowInstallsChange: (value: boolean) => void;
  onPrepareBridge: (sessionId: string) => void;
  onDraftWorkflow: () => void;
  onCreateRun: () => void;
};

export function BuildStage({
  t,
  selectedProject,
  sessions,
  selectedSessionId,
  bridge,
  bridgeLoading,
  bridgeError,
  task,
  allowNetwork,
  allowInstalls,
  plan,
  loading,
  runLoading,
  planError,
  runError,
  backendLabel,
  executionLabel,
  onTaskChange,
  onAllowNetworkChange,
  onAllowInstallsChange,
  onPrepareBridge,
  onDraftWorkflow,
  onCreateRun,
}: BuildStageProps) {
  return (
    <section className="stage-panel">
      <div className="stage-intro">
        <div>
          <p className="eyebrow">{t("nav.build")}</p>
          <h2>{t("build.heading")}</h2>
          <p>{t("build.description")}</p>
        </div>
        <span className="project-pill">{selectedProject || t("project.notSelected")}</span>
      </div>

      <div className="build-stage-grid">
        <article className="glass-panel build-composer">
          <label className="field-group">
            <span>{t("build.taskLabel")}</span>
            <textarea value={task} onChange={(event) => onTaskChange(event.target.value)} rows={8} />
          </label>
          <div className="toggle-row">
            <label>
              <input type="checkbox" checked={allowNetwork} onChange={(event) => onAllowNetworkChange(event.target.checked)} />
              {t("build.allowNetwork")}
            </label>
            <label>
              <input type="checkbox" checked={allowInstalls} onChange={(event) => onAllowInstallsChange(event.target.checked)} />
              {t("build.allowInstalls")}
            </label>
          </div>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={onDraftWorkflow} disabled={loading || task.trim().length < 8}>
              {loading ? t("build.planLoading") : t("build.planButton")}
            </button>
            <button type="button" className="primary-button" onClick={onCreateRun} disabled={runLoading || task.trim().length < 8 || !selectedProject}>
              {runLoading ? t("build.runLoading") : t("build.runButton")}
            </button>
          </div>
          {planError ? <div className="inline-error">{planError}</div> : null}
          {runError ? <div className="inline-error">{runError}</div> : null}
        </article>

        <article className="glass-panel">
          <div className="panel-header">
            <h3>{t("build.sessionHeading")}</h3>
            <span>{sessions.length}</span>
          </div>
          <div className="session-list compact-list">
            {sessions.length === 0 ? (
              <div className="empty-state">{t("build.sessionEmpty")}</div>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`session-item ${selectedSessionId === session.id ? "selected" : ""}`}
                  onClick={() => onPrepareBridge(session.id)}
                >
                  <strong>{session.thread_name}</strong>
                  <span>{session.updated_at}</span>
                  <code>{selectedSessionId === session.id ? t("build.sessionSelected") : session.id}</code>
                </button>
              ))
            )}
          </div>

          <div className="panel-header subheader">
            <h3>{t("build.bridgeHeading")}</h3>
            <span>{bridgeLoading ? t("build.sessionPrepare") : bridge?.can_resume ? t("common.ready") : t("common.waiting")}</span>
          </div>
          <div className="command-list compact-list">
            {bridge?.commands?.length ? (
              bridge.commands.map((command) => (
                <article key={`${command.mode}-${command.argv.join(" ")}`} className="command-item">
                  <strong>{command.purpose}</strong>
                  <span className="meta-label">{command.mode}</span>
                  <code>{command.argv.join(" ")}</code>
                </article>
              ))
            ) : (
              <div className="empty-state">{t("build.bridgeEmpty")}</div>
            )}
          </div>
          {bridgeError ? <div className="inline-error">{bridgeError}</div> : null}
        </article>
      </div>

      <article className="glass-panel">
        <div className="panel-header">
          <h3>{t("build.planSummary")}</h3>
          <span>{plan?.team_name ?? t("common.waiting")}</span>
        </div>
        {plan ? (
          <>
            <p className="workflow-copy">{plan.summary}</p>
            <div className="agent-grid">
              {plan.agents.map((agent) => (
                <article key={agent.role} className="agent-card">
                  <span className="agent-role">{agent.role}</span>
                  <strong>{agent.name}</strong>
                  <p>{agent.reason}</p>
                </article>
              ))}
            </div>
            <div className="step-list">
              {plan.steps.map((step) => (
                <article key={step.id} className="step-item">
                  <div className="step-header">
                  <strong>{step.title}</strong>
                  <span className={`step-mode ${step.execution}`}>{executionLabel(step.execution)}</span>
                </div>
                  <p>{step.goal}</p>
                  <div className="step-meta">
                    <span>{step.agent_role}</span>
                    <span>{backendLabel(step.backend)}</span>
                    <span>{step.depends_on.length ? t("common.after", { steps: step.depends_on.join(", ") }) : t("common.entryStep")}</span>
                  </div>
                </article>
              ))}
            </div>
            <div className="guidance-grid">
              <article className="summary-card">
                <span className="meta-label">{t("build.memoryPlanner")}</span>
                <strong>{plan.memory_guidance.planner.length}</strong>
                <p>{plan.memory_guidance.planner.join(" | ") || t("common.none")}</p>
              </article>
              <article className="summary-card">
                <span className="meta-label">{t("build.memoryReviewer")}</span>
                <strong>{plan.memory_guidance.reviewer.length}</strong>
                <p>{plan.memory_guidance.reviewer.join(" | ") || t("common.none")}</p>
              </article>
              <article className="summary-card">
                <span className="meta-label">{t("build.memoryReporter")}</span>
                <strong>{plan.memory_guidance.reporter.length}</strong>
                <p>{plan.memory_guidance.reporter.join(" | ") || t("common.none")}</p>
              </article>
            </div>
          </>
        ) : (
          <div className="empty-state">{t("build.planEmpty")}</div>
        )}
      </article>
    </section>
  );
}
