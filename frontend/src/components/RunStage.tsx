import { useEffect, useState } from "react";

import type { Translator } from "../i18n";
import type {
  MemoryEntry,
  WorkflowAgentSession,
  WorkflowArtifactDocument,
  WorkflowRun,
  WorkflowRunArtifacts,
} from "../types";

type RunDetailTab = "overview" | "artifacts" | "sessions" | "trace";

type RunStageProps = {
  t: Translator;
  selectedProject: string;
  runs: WorkflowRun[];
  selectedRunId: string;
  selectedRun: WorkflowRun | null;
  runArtifacts: WorkflowRunArtifacts | null;
  artifactLoading: boolean;
  artifactError: string;
  runLog: string;
  agentSessions: WorkflowAgentSession[];
  agentSessionsLoading: boolean;
  agentSessionsError: string;
  selectedArtifactKey: WorkflowArtifactDocument["key"];
  onSelectRun: (runId: string) => void;
  onSelectArtifact: (key: WorkflowArtifactDocument["key"]) => void;
  onExecuteRun: (runId: string) => void;
  onCancelRun: (runId: string) => void;
  onApproveRun: (runId: string) => void;
  onResumeRun: (runId: string) => void;
  onRetryRun: (runId: string) => void;
  runLoading: boolean;
  runNeedsDangerousApproval: (run: WorkflowRun | null) => boolean;
  runStatusNote: (run: WorkflowRun) => string | null;
  backendLabel: (backend: WorkflowRun["steps"][number]["backend"]) => string;
  statusLabel: (status: string) => string;
  formatDateTime: (value: string) => string;
  memorySummary: (items: MemoryEntry[]) => string;
  finalizedStepCount: (run: WorkflowRun) => number;
  readyArtifactCount: (artifacts: WorkflowRunArtifacts | null) => number;
  writtenMemoryCount: (run: WorkflowRun | null) => number;
  recalledMemoryCount: (run: WorkflowRun | null) => number;
  promotedGlobalRuleCount: (run: WorkflowRun | null) => number;
};

export function RunStage({
  t,
  runs,
  selectedRunId,
  selectedRun,
  runArtifacts,
  artifactLoading,
  artifactError,
  runLog,
  agentSessions,
  agentSessionsLoading,
  agentSessionsError,
  selectedArtifactKey,
  onSelectRun,
  onSelectArtifact,
  onExecuteRun,
  onCancelRun,
  onApproveRun,
  onResumeRun,
  onRetryRun,
  runLoading,
  runNeedsDangerousApproval,
  runStatusNote,
  backendLabel,
  statusLabel,
  formatDateTime,
  memorySummary,
  finalizedStepCount,
  readyArtifactCount,
  writtenMemoryCount,
  recalledMemoryCount,
  promotedGlobalRuleCount,
}: RunStageProps) {
  const [detailTab, setDetailTab] = useState<RunDetailTab>("overview");

  useEffect(() => {
    setDetailTab("overview");
  }, [selectedRunId]);

  const selectedArtifact =
    runArtifacts?.documents.find((document) => document.key === selectedArtifactKey) ?? runArtifacts?.documents[0] ?? null;
  const artifactCount = readyArtifactCount(runArtifacts);
  const artifactTarget = runArtifacts?.documents.length ?? 0;
  const stepProgress = selectedRun ? `${finalizedStepCount(selectedRun)} / ${selectedRun.step_runs.length}` : "0 / 0";
  const recalledCount = recalledMemoryCount(selectedRun);
  const writtenCount = writtenMemoryCount(selectedRun);
  const promotedRuleCount = promotedGlobalRuleCount(selectedRun);
  const selectedRunNeedsApproval = runNeedsDangerousApproval(selectedRun);

  return (
    <section className="stage-panel">
      <div className="stage-intro">
        <div>
          <p className="eyebrow">{t("nav.run")}</p>
          <h2>{t("run.heading")}</h2>
          <p>{t("run.description")}</p>
        </div>
      </div>

      <div className="run-stage-layout">
        <article className="glass-panel run-ledger-panel">
          <div className="panel-header">
            <h3>{t("run.ledger")}</h3>
            <span>{runs.length}</span>
          </div>
          <div className="run-list">
            {runs.length === 0 ? (
              <div className="empty-state">{t("run.ledgerEmpty")}</div>
            ) : (
              runs.map((run) => {
                const pendingDangerousApproval = runNeedsDangerousApproval(run);
                return (
                  <article
                    key={run.id}
                    className={`run-item ${selectedRunId === run.id ? "selected" : ""}`}
                    onClick={() => onSelectRun(run.id)}
                  >
                    <div className="step-header">
                      <strong>{run.team_name}</strong>
                      <span className={`step-mode ${run.status}`}>{statusLabel(run.status)}</span>
                    </div>
                    <p>{run.task}</p>
                    <div className="step-meta">
                      <span>{formatDateTime(run.started_at ?? run.created_at)}</span>
                      <span>{run.attempt_count > 1 ? `${t("run.attempt")} ${run.attempt_count}` : run.status}</span>
                    </div>
                    {runStatusNote(run) ? <div className="run-note">{runStatusNote(run)}</div> : null}
                    {run.error ? <div className="inline-error">{run.error}</div> : null}
                    <div className="button-row">
                      {run.status === "planned" ? (
                        <>
                          {pendingDangerousApproval ? (
                            <button type="button" className="secondary-button" onClick={() => onApproveRun(run.id)} disabled={runLoading}>
                              {t("run.approveDangerous")}
                            </button>
                          ) : (
                            <button type="button" className="secondary-button" onClick={() => onExecuteRun(run.id)} disabled={runLoading}>
                              {t("run.start")}
                            </button>
                          )}
                          <button type="button" className="secondary-button" onClick={() => onCancelRun(run.id)} disabled={runLoading}>
                            {t("run.cancel")}
                          </button>
                        </>
                      ) : null}
                      {run.status === "running" ? (
                        <button type="button" className="secondary-button" onClick={() => onCancelRun(run.id)} disabled={runLoading || Boolean(run.cancel_requested_at)}>
                          {run.cancel_requested_at ? t("run.cancelling") : t("run.cancelRun")}
                        </button>
                      ) : null}
                      {(run.status === "failed" || run.status === "cancelled") && !pendingDangerousApproval ? (
                        <>
                          <button type="button" className="secondary-button" onClick={() => onResumeRun(run.id)} disabled={runLoading}>
                            {t("run.resume")}
                          </button>
                          <button type="button" className="secondary-button" onClick={() => onRetryRun(run.id)} disabled={runLoading}>
                            {t("run.retry")}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </article>

        <article className="glass-panel run-detail-panel">
          {!selectedRun ? (
            <div className="empty-state">{t("run.detailEmpty")}</div>
          ) : (
            <>
              <div className="panel-header">
                <h3>{selectedRun.team_name}</h3>
                <span>{selectedRun.id}</span>
              </div>
              <div className="summary-grid">
                <article className="summary-card">
                  <span className="meta-label">{t("run.lifecycle")}</span>
                  <strong>{statusLabel(selectedRun.status)}</strong>
                  <p>{selectedRun.error ?? selectedRun.summary}</p>
                </article>
                <article className="summary-card">
                  <span className="meta-label">{t("run.stepProgress")}</span>
                  <strong>{stepProgress}</strong>
                  <p>{selectedRun.step_runs.length}</p>
                </article>
                <article className="summary-card">
                  <span className="meta-label">{t("run.artifacts")}</span>
                  <strong>{artifactTarget ? `${artifactCount} / ${artifactTarget}` : t("common.none")}</strong>
                  <p>{artifactLoading ? t("common.refreshing") : selectedRun.report_path}</p>
                </article>
                <article className="summary-card">
                  <span className="meta-label">{t("run.safety")}</span>
                  <strong>
                    {selectedRun.requires_dangerous_command_confirmation
                      ? selectedRunNeedsApproval
                        ? t("run.safetyNeeded")
                        : t("run.safetyApproved")
                      : t("run.safetyNotRequired")}
                  </strong>
                  <p>{selectedRunNeedsApproval ? t("run.safetyNote") : (runStatusNote(selectedRun) ?? t("common.ready"))}</p>
                </article>
                <article className="summary-card">
                  <span className="meta-label">{t("run.memoryRecalled")}</span>
                  <strong>{recalledCount}</strong>
                  <p>{memorySummary([...selectedRun.memory_context.recalled_project, ...selectedRun.memory_context.recalled_global])}</p>
                </article>
                <article className="summary-card">
                  <span className="meta-label">{t("run.memoryWritten")}</span>
                  <strong>{writtenCount}</strong>
                  <p>{writtenCount ? memorySummary([...selectedRun.memory_context.written_project, ...selectedRun.memory_context.written_global]) : t("common.none")}</p>
                </article>
                <article className="summary-card">
                  <span className="meta-label">{t("run.globalRules")}</span>
                  <strong>{promotedRuleCount}</strong>
                  <p>{selectedRun.codex_session_id ?? t("common.none")}</p>
                </article>
                <article className="summary-card">
                  <span className="meta-label">{t("run.trace")}</span>
                  <strong>{selectedRun.completed_at ? formatDateTime(selectedRun.completed_at) : t("status.running")}</strong>
                  <p>{selectedRun.log_path}</p>
                </article>
              </div>

              <div className="detail-tab-row">
                {(["overview", "artifacts", "sessions", "trace"] as RunDetailTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`detail-tab ${detailTab === tab ? "selected" : ""}`}
                    onClick={() => setDetailTab(tab)}
                  >
                    {t(`run.${tab === "artifacts" ? "artifactTab" : tab === "sessions" ? "sessionTab" : tab === "trace" ? "traceTab" : "overview"}`)}
                  </button>
                ))}
              </div>

              {detailTab === "overview" ? (
                <div className="detail-section">
                  <div className="panel-header">
                    <h3>{t("run.stepLedger")}</h3>
                    <span>{stepProgress}</span>
                  </div>
                  <div className="step-list">
                    {selectedRun.step_runs.map((stepRun) => (
                      <article key={stepRun.step_id} className="step-item">
                        <div className="step-header">
                          <strong>{stepRun.title}</strong>
                          <span className={`step-mode ${stepRun.status}`}>{statusLabel(stepRun.status)}</span>
                        </div>
                        <p>{stepRun.goal}</p>
                        <div className="step-meta">
                          <span>{stepRun.agent_role}</span>
                          <span>{backendLabel(stepRun.backend)}</span>
                          <span>{stepRun.depends_on.length ? t("common.after", { steps: stepRun.depends_on.join(", ") }) : t("common.entryStep")}</span>
                          <span>{stepRun.summary ?? t("common.waiting")}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {detailTab === "artifacts" ? (
                <div className="detail-section">
                  <div className="artifact-tab-row">
                    {(runArtifacts?.documents ?? []).map((document) => (
                      <button
                        key={document.key}
                        type="button"
                        className={`artifact-tab ${selectedArtifact?.key === document.key ? "selected" : ""}`}
                        onClick={() => onSelectArtifact(document.key)}
                      >
                        <strong>{document.title}</strong>
                        <span>{document.available ? t("common.ready") : t("common.waiting")}</span>
                      </button>
                    ))}
                  </div>
                  {artifactError ? <div className="inline-error">{artifactError}</div> : null}
                  {selectedArtifact ? (
                    <pre className={`artifact-viewer ${selectedArtifact.content_type}`}>{selectedArtifact.content || t("run.artifactEmpty")}</pre>
                  ) : (
                    <div className="empty-state">{t("run.artifactEmpty")}</div>
                  )}
                </div>
              ) : null}

              {detailTab === "sessions" ? (
                <div className="detail-section">
                  <div className="panel-header">
                    <h3>{t("run.agentSessions")}</h3>
                    <span>{agentSessions.length}</span>
                  </div>
                  {agentSessionsError ? <div className="inline-error">{agentSessionsError}</div> : null}
                  <div className="step-list">
                    {agentSessionsLoading ? (
                      <div className="empty-state">{t("run.agentSessionsLoading")}</div>
                    ) : agentSessions.length === 0 ? (
                      <div className="empty-state">{t("run.agentSessionsEmpty")}</div>
                    ) : (
                      agentSessions.map((session) => (
                        <article key={session.id} className="step-item">
                          <div className="step-header">
                            <strong>{session.title}</strong>
                            <span className={`step-mode ${session.status}`}>{statusLabel(session.status)}</span>
                          </div>
                          <p>{session.summary ?? session.error ?? t("common.waiting")}</p>
                          <div className="step-meta">
                            <span>{session.agent_role}</span>
                            <span>{backendLabel(session.backend)}</span>
                            <span>{session.provider ?? t("common.none")}</span>
                            <span>{session.owner_worker_id ?? "sync"}</span>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {detailTab === "trace" ? (
                <div className="detail-section">
                  <pre className="log-viewer">{runLog || t("run.traceEmpty")}</pre>
                </div>
              ) : null}
            </>
          )}
        </article>
      </div>
    </section>
  );
}
