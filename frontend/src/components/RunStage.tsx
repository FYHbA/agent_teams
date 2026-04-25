import { useEffect, useState } from "react";

import type { Translator } from "../i18n";
import type {
  MemoryEntry,
  WorkflowAgentSession,
  WorkflowArtifactDocument,
  WorkflowRun,
  WorkflowRunArtifacts,
} from "../types";

type RunDetailTab = "overview" | "artifacts" | "chat" | "trace";

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
  onApproveRun: (runId: string, commandIds?: string[]) => void;
  onResumeRun: (runId: string) => void;
  onRetryRun: (runId: string) => void;
  runLoading: boolean;
  runNeedsDangerousApproval: (run: WorkflowRun | null) => boolean;
  runStatusNote: (run: WorkflowRun) => string | null;
  backendLabel: (backend: WorkflowRun["steps"][number]["backend"]) => string;
  agentRoleLabel: (role: string) => string;
  statusLabel: (status: string) => string;
  formatDateTime: (value: string) => string;
  memorySummary: (items: MemoryEntry[]) => string;
  finalizedStepCount: (run: WorkflowRun) => number;
  readyArtifactCount: (artifacts: WorkflowRunArtifacts | null) => number;
  writtenMemoryCount: (run: WorkflowRun | null) => number;
  recalledMemoryCount: (run: WorkflowRun | null) => number;
  promotedGlobalRuleCount: (run: WorkflowRun | null) => number;
  embedded?: boolean;
};

type ChatMessage = {
  id: string;
  agentRole: string;
  title: string;
  body: string;
  status: string;
  timestamp: string | null;
  backend: WorkflowRun["steps"][number]["backend"];
  provider: string | null;
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
  agentRoleLabel,
  statusLabel,
  formatDateTime,
  memorySummary,
  finalizedStepCount,
  readyArtifactCount,
  writtenMemoryCount,
  recalledMemoryCount,
  promotedGlobalRuleCount,
  embedded = false,
}: RunStageProps) {
  const [detailTab, setDetailTab] = useState<RunDetailTab>("overview");

  useEffect(() => {
    setDetailTab("overview");
  }, [selectedRunId]);

  function compactText(value: string, maxLength = 96): string {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  function avatarLabel(role: string): string {
    const labels: Record<string, string> = {
      planner: "PL",
      researcher: "RS",
      coder: "CD",
      "runner/tester": "VR",
      reviewer: "RV",
      summarizer: "RP",
    };
    return labels[role] ?? "AG";
  }

  function avatarTone(role: string): string {
    const tones: Record<string, string> = {
      planner: "planner",
      researcher: "researcher",
      coder: "coder",
      "runner/tester": "runner",
      reviewer: "reviewer",
      summarizer: "summarizer",
    };
    return tones[role] ?? "default";
  }

  const selectedArtifact =
    runArtifacts?.documents.find((document) => document.key === selectedArtifactKey) ?? runArtifacts?.documents[0] ?? null;
  const artifactCount = readyArtifactCount(runArtifacts);
  const artifactTarget = runArtifacts?.documents.length ?? 0;
  const stepProgress = selectedRun ? `${finalizedStepCount(selectedRun)} / ${selectedRun.step_runs.length}` : "0 / 0";
  const recalledCount = recalledMemoryCount(selectedRun);
  const writtenCount = writtenMemoryCount(selectedRun);
  const promotedRuleCount = promotedGlobalRuleCount(selectedRun);
  const selectedRunNeedsApproval = runNeedsDangerousApproval(selectedRun);
  const confirmableStepRuns =
    selectedRun?.step_runs.filter((stepRun) => stepRun.command_previews.some((preview) => preview.requires_confirmation)) ?? [];
  const pendingDangerousCommands = confirmableStepRuns.flatMap((stepRun) =>
    stepRun.command_previews.filter((preview) => preview.requires_confirmation && !preview.confirmed_at),
  );
  const approvedDangerousCommands = confirmableStepRuns.flatMap((stepRun) =>
    stepRun.command_previews.filter((preview) => preview.requires_confirmation && preview.confirmed_at),
  );
  const promotedRuleTitles =
    selectedRun?.memory_context.written_global
      .filter((entry) => entry.entry_kind === "global_rule")
      .map((entry) => entry.title) ?? [];

  const chatMessages: ChatMessage[] =
    agentSessions.length > 0
      ? agentSessions.map((session) => ({
          id: session.id,
          agentRole: session.agent_role,
          title: session.title,
          body: session.summary ?? session.error ?? t("run.chatPending"),
          status: session.status,
          timestamp: session.completed_at ?? session.started_at,
          backend: session.backend,
          provider: session.provider,
        }))
      : selectedRun?.step_runs.map((stepRun) => ({
          id: stepRun.step_id,
          agentRole: stepRun.agent_role,
          title: stepRun.title,
          body: stepRun.summary ?? stepRun.goal ?? t("run.chatPending"),
          status: stepRun.status,
          timestamp: stepRun.completed_at ?? stepRun.started_at,
          backend: stepRun.backend,
          provider: null,
        })) ?? [];

  const content = (
    <>
      <div className="stage-intro">
        <div>
          <p className="eyebrow">{t("nav.run")}</p>
          <h2>{t("run.heading")}</h2>
          {!embedded ? <p>{t("run.description")}</p> : null}
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
                  <article key={run.id} className={`run-item ${selectedRunId === run.id ? "selected" : ""}`}>
                    <button
                      type="button"
                      className="run-item-button"
                      onClick={() => onSelectRun(run.id)}
                      aria-pressed={selectedRunId === run.id}
                    >
                      <div className="step-header">
                        <strong>{run.team_name}</strong>
                        <span className={`step-mode ${run.status}`}>{statusLabel(run.status)}</span>
                      </div>
                      <p>{run.task}</p>
                      <div className="step-meta">
                        <span>{formatDateTime(run.started_at ?? run.created_at)}</span>
                        <span>{run.attempt_count > 1 ? `${t("run.attempt")} ${run.attempt_count}` : statusLabel(run.status)}</span>
                      </div>
                      {runStatusNote(run) ? <div className="run-note">{runStatusNote(run)}</div> : null}
                      {run.error ? <div className="inline-error">{run.error}</div> : null}
                    </button>
                    <div className="button-row run-item-actions">
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
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => onCancelRun(run.id)}
                          disabled={runLoading || Boolean(run.cancel_requested_at)}
                        >
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
                  <p>{compactText(selectedRun.error ?? selectedRun.summary, 140)}</p>
                </article>
                <article className="summary-card">
                  <span className="meta-label">{t("run.stepProgress")}</span>
                  <strong>{stepProgress}</strong>
                  <p>{selectedRun.step_runs.length}</p>
                </article>
                <article className="summary-card">
                  <span className="meta-label">{t("run.artifacts")}</span>
                  <strong>{artifactTarget ? `${artifactCount} / ${artifactTarget}` : t("common.none")}</strong>
                  <p>{artifactLoading ? t("common.refreshing") : t("run.artifactsHint", { count: artifactCount })}</p>
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
                  <p>{compactText(memorySummary([...selectedRun.memory_context.recalled_project, ...selectedRun.memory_context.recalled_global]))}</p>
                </article>
                <article className="summary-card">
                  <span className="meta-label">{t("run.memoryWritten")}</span>
                  <strong>{writtenCount}</strong>
                  <p>
                    {writtenCount
                      ? compactText(memorySummary([...selectedRun.memory_context.written_project, ...selectedRun.memory_context.written_global]))
                      : t("common.none")}
                  </p>
                </article>
                <article className="summary-card">
                  <span className="meta-label">{t("run.globalRules")}</span>
                  <strong>{promotedRuleCount}</strong>
                  <p>{promotedRuleTitles.length ? compactText(promotedRuleTitles.join(" | ")) : t("run.globalRulesHint")}</p>
                </article>
                <article className="summary-card">
                  <span className="meta-label">{t("run.trace")}</span>
                  <strong>{selectedRun.completed_at ? formatDateTime(selectedRun.completed_at) : t("status.running")}</strong>
                  <p>{t("run.traceHint")}</p>
                </article>
              </div>

              <div className="detail-tab-row">
                {(["overview", "artifacts", "chat", "trace"] as RunDetailTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`detail-tab ${detailTab === tab ? "selected" : ""}`}
                    onClick={() => setDetailTab(tab)}
                  >
                    {t(`run.${tab === "artifacts" ? "artifactTab" : tab === "chat" ? "chatTab" : tab === "trace" ? "traceTab" : "overview"}`)}
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
                          <span>{agentRoleLabel(stepRun.agent_role)}</span>
                          <span>{backendLabel(stepRun.backend)}</span>
                          <span>{stepRun.depends_on.length ? t("common.after", { steps: stepRun.depends_on.join(", ") }) : t("common.entryStep")}</span>
                          <span>{stepRun.summary ?? t("common.waiting")}</span>
                        </div>
                        {stepRun.command_previews.length ? (
                          <div className="command-list compact-list">
                            {stepRun.command_previews.map((preview) => (
                              <article key={`${stepRun.step_id}-${preview.label}-${preview.argv.join(" ")}`} className="command-item">
                                <strong>{preview.label}</strong>
                                <code>{preview.argv.join(" ")}</code>
                                {preview.cwd ? <span>{t("run.commandCwd")}: {preview.cwd}</span> : null}
                              </article>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>

                  {selectedRun.requires_dangerous_command_confirmation || selectedRun.codex_commands.length || selectedRun.warnings.length ? (
                    <div className="detail-subsection">
                      <div className="panel-header">
                        <h3>{t("run.safetyPreview")}</h3>
                        <span>{selectedRunNeedsApproval ? t("run.safetyNeeded") : t("run.safetyApproved")}</span>
                      </div>

                      {pendingDangerousCommands.length ? (
                        <div className="button-row">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => onApproveRun(selectedRun.id, pendingDangerousCommands.map((preview) => preview.command_id))}
                            disabled={runLoading}
                          >
                            {t("run.approveRemaining", { count: pendingDangerousCommands.length })}
                          </button>
                        </div>
                      ) : null}

                      {confirmableStepRuns.length ? (
                        <div className="step-list">
                          {confirmableStepRuns.map((stepRun) => (
                            <article key={stepRun.step_id} className="step-item">
                              <div className="step-header">
                                <strong>{stepRun.title}</strong>
                                <span className={`step-mode ${stepRun.status}`}>{statusLabel(stepRun.status)}</span>
                              </div>
                              <p>{stepRun.goal}</p>
                              <div className="step-meta">
                                <span>{agentRoleLabel(stepRun.agent_role)}</span>
                                <span>{backendLabel(stepRun.backend)}</span>
                                <span>{stepRun.depends_on.length ? t("common.after", { steps: stepRun.depends_on.join(", ") }) : t("common.entryStep")}</span>
                              </div>
                              {stepRun.command_previews.length ? (
                                <div className="command-list compact-list">
                                  {stepRun.command_previews.map((preview) => (
                                    <article key={`${stepRun.step_id}-${preview.label}-${preview.argv.join(" ")}`} className="command-item">
                                      <strong>{preview.label}</strong>
                                      <span className="meta-label">
                                        {preview.confirmed_at ? t("run.commandApproved") : t("run.commandPending")}
                                      </span>
                                      <code>{preview.argv.join(" ")}</code>
                                      {preview.cwd ? <span>{t("run.commandCwd")}: {preview.cwd}</span> : null}
                                      {preview.confirmed_at ? <span>{t("run.commandApprovedAt")}: {formatDateTime(preview.confirmed_at)}</span> : null}
                                      {preview.requires_confirmation && !preview.confirmed_at ? (
                                        <div className="button-row">
                                          <button
                                            type="button"
                                            className="secondary-button"
                                            onClick={() => onApproveRun(selectedRun.id, [preview.command_id])}
                                            disabled={runLoading}
                                          >
                                            {t("run.approveCommand")}
                                          </button>
                                        </div>
                                      ) : null}
                                    </article>
                                  ))}
                                </div>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="empty-state">{t("run.safetyPreviewEmpty")}</div>
                      )}

                      {approvedDangerousCommands.length ? (
                        <div className="run-note">
                          {t("run.approvalSummary", {
                            approved: approvedDangerousCommands.length,
                            pending: pendingDangerousCommands.length,
                          })}
                        </div>
                      ) : null}

                      {selectedRun.codex_commands.length ? (
                        <div className="detail-subsection">
                          <div className="panel-header">
                            <h3>{t("run.commandPreview")}</h3>
                            <span>{selectedRun.codex_commands.length}</span>
                          </div>
                          <div className="command-list compact-list">
                            {selectedRun.codex_commands.map((command) => (
                              <article key={`${command.mode}-${command.argv.join(" ")}`} className="command-item">
                                <strong>{command.purpose}</strong>
                                <span className="meta-label">{command.mode}</span>
                                <code>{command.argv.join(" ")}</code>
                                {command.cwd ? <span>{t("run.commandCwd")}: {command.cwd}</span> : null}
                              </article>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {selectedRun.warnings.length ? (
                        <div className="detail-subsection">
                          <div className="panel-header">
                            <h3>{t("run.warningsHeading")}</h3>
                            <span>{selectedRun.warnings.length}</span>
                          </div>
                          <div className="command-list compact-list">
                            {selectedRun.warnings.map((warning) => (
                              <article key={warning} className="command-item">
                                <strong>{warning}</strong>
                              </article>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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

              {detailTab === "chat" ? (
                <div className="detail-section">
                  <div className="panel-header">
                    <h3>{t("run.chatHeading")}</h3>
                    <span>{chatMessages.length}</span>
                  </div>
                  {agentSessionsError ? <div className="inline-error">{agentSessionsError}</div> : null}
                  <div className="chat-thread">
                    {agentSessionsLoading ? (
                      <div className="empty-state">{t("run.agentSessionsLoading")}</div>
                    ) : chatMessages.length === 0 ? (
                      <div className="empty-state">{t("run.chatEmpty")}</div>
                    ) : (
                      chatMessages.map((message) => (
                        <article key={message.id} className={`chat-message ${message.status}`}>
                          <div className={`chat-avatar ${avatarTone(message.agentRole)}`}>{avatarLabel(message.agentRole)}</div>
                          <div className="chat-bubble">
                            <div className="chat-meta">
                              <strong>{agentRoleLabel(message.agentRole)}</strong>
                              <span>{message.timestamp ? formatDateTime(message.timestamp) : t("common.waiting")}</span>
                            </div>
                            <div className="chat-title-row">
                              <span className="chat-title">{message.title}</span>
                              <span className={`step-mode ${message.status}`}>{statusLabel(message.status)}</span>
                            </div>
                            <p>{message.body}</p>
                            <div className="chat-submeta">
                              <span>{backendLabel(message.backend)}</span>
                              {message.provider ? <span>{message.provider}</span> : null}
                            </div>
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
    </>
  );

  if (embedded) {
    return <div className="embedded-stage embedded-run-stage">{content}</div>;
  }

  return <section className="stage-panel">{content}</section>;
}
