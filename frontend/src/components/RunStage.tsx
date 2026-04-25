import { useDeferredValue, useEffect, useState } from "react";

import { ArtifactDocumentViewer, extractMarkdownOutline, parseMarkdown } from "./ArtifactDocumentViewer";
import { TraceLogViewer } from "./TraceLogViewer";
import type { Translator } from "../i18n";
import type {
  MemoryEntry,
  WorkflowAgentSession,
  WorkflowArtifactDocument,
  WorkflowCommandPreview,
  WorkflowRun,
  WorkflowRunArtifacts,
} from "../types";

type RunDetailTab = "overview" | "artifacts" | "chat" | "trace";
type RunLedgerFilter = "all" | "attention" | "running" | "finished";
type RunGroup = {
  key: string;
  label: string;
  runs: WorkflowRun[];
};

type RunStageProps = {
  t: Translator;
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
  goal: string | null;
  dependsOn: string[];
  commandPreviews: WorkflowCommandPreview[];
};

type ChatActionItem = {
  label: string;
  value: string;
  meta?: string;
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
  const [runQuery, setRunQuery] = useState("");
  const [runFilter, setRunFilter] = useState<RunLedgerFilter>("all");
  const [chatExpanded, setChatExpanded] = useState<Record<string, boolean>>({});
  const deferredRunQuery = useDeferredValue(runQuery);

  useEffect(() => {
    setDetailTab("overview");
    setChatExpanded({});
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
  const artifactDocuments = runArtifacts?.documents ?? [];
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
  const normalizedRunQuery = deferredRunQuery.trim().toLowerCase();
  const ledgerFilterItems: Array<{ key: RunLedgerFilter; label: string; count: number }> = [
    { key: "all", label: t("run.filterAll"), count: runs.length },
    {
      key: "attention",
      label: t("run.filterAttention"),
      count: runs.filter((run) => runNeedsDangerousApproval(run) || run.status === "failed" || run.status === "cancelled").length,
    },
    {
      key: "running",
      label: t("run.filterRunning"),
      count: runs.filter((run) => run.status === "running" || run.status === "planned").length,
    },
    {
      key: "finished",
      label: t("run.filterFinished"),
      count: runs.filter((run) => ["completed", "failed", "cancelled"].includes(run.status)).length,
    },
  ];
  const visibleRuns = runs.filter((run) => {
    const matchesFilter =
      runFilter === "all"
        ? true
        : runFilter === "attention"
        ? runNeedsDangerousApproval(run) || run.status === "failed" || run.status === "cancelled"
        : runFilter === "running"
        ? run.status === "running" || run.status === "planned"
        : ["completed", "failed", "cancelled"].includes(run.status);

    if (!matchesFilter) {
      return false;
    }

    if (!normalizedRunQuery) {
      return true;
    }

    return [run.team_name, run.task, run.id].some((value) => value.toLowerCase().includes(normalizedRunQuery));
  });
  const runGroups = groupRunsByDay(visibleRuns);
  const selectedArtifactIndex = artifactDocuments.findIndex((document) => document.key === selectedArtifact?.key);
  const availableArtifactDocuments = artifactDocuments.filter((document) => document.available);
  const selectedAvailableArtifactIndex = availableArtifactDocuments.findIndex((document) => document.key === selectedArtifact?.key);
  const previousArtifact = selectedAvailableArtifactIndex > 0 ? availableArtifactDocuments[selectedAvailableArtifactIndex - 1] : null;
  const nextArtifact =
    selectedAvailableArtifactIndex >= 0 && selectedAvailableArtifactIndex < availableArtifactDocuments.length - 1
      ? availableArtifactDocuments[selectedAvailableArtifactIndex + 1]
      : null;
  const selectedArtifactBlocks =
    selectedArtifact?.content_type === "markdown" && selectedArtifact.content ? parseMarkdown(selectedArtifact.content) : [];
  const artifactOutline = extractMarkdownOutline(selectedArtifactBlocks);
  const artifactKindLabel = selectedArtifact ? t(`run.artifactKind.${selectedArtifact.content_type}`) : "";
  const artifactDocumentMap = new Map(artifactDocuments.map((document) => [document.key, document]));

  const stepRunById = new Map(selectedRun?.step_runs.map((stepRun) => [stepRun.step_id, stepRun]) ?? []);

  const chatMessages: ChatMessage[] =
    agentSessions.length > 0
      ? agentSessions.map((session) => ({
          goal: stepRunById.get(session.step_id)?.goal ?? null,
          dependsOn: stepRunById.get(session.step_id)?.depends_on ?? [],
          commandPreviews: stepRunById.get(session.step_id)?.command_previews ?? [],
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
          goal: stepRun.goal,
          dependsOn: stepRun.depends_on,
          commandPreviews: stepRun.command_previews,
        })) ?? [];

  function isChatExpanded(message: ChatMessage): boolean {
    if (Object.prototype.hasOwnProperty.call(chatExpanded, message.id)) {
      return chatExpanded[message.id];
    }
    return message.status === "running" || message.status === "failed" || message.status === "cancelled";
  }

  function toggleChatMessage(messageId: string) {
    setChatExpanded((current) => ({
      ...current,
      [messageId]: !current[messageId],
    }));
  }

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
          <p className="workflow-copy">
            {t("run.ledgerSummary", {
              visible: visibleRuns.length,
              total: runs.length,
            })}
          </p>
          <div className="run-ledger-tools">
            <input
              type="search"
              className="run-ledger-search"
              value={runQuery}
              placeholder={t("run.searchPlaceholder")}
              onChange={(event) => setRunQuery(event.target.value)}
            />
            <div className="run-filter-row">
              {ledgerFilterItems.map((filterItem) => (
                <button
                  key={filterItem.key}
                  type="button"
                  className={`detail-tab ${runFilter === filterItem.key ? "selected" : ""}`}
                  onClick={() => setRunFilter(filterItem.key)}
                >
                  {filterItem.label} <span>{filterItem.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="run-list">
            {runs.length === 0 ? (
              <div className="empty-state">{t("run.ledgerEmpty")}</div>
            ) : visibleRuns.length === 0 ? (
              <div className="empty-state">{t("run.ledgerEmptyFiltered")}</div>
            ) : (
              <div className="run-ledger-groups">
                {runGroups.map((group) => (
                  <section key={group.key} className="run-group">
                    <div className="run-group-header">
                      <span className="meta-label">{group.label}</span>
                      <span>{group.runs.length}</span>
                    </div>
                    <div className="run-list">
                      {group.runs.map((run) => {
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
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </article>

        <article className="glass-panel run-detail-panel">
          {!selectedRun ? (
            <div className="empty-state">{t("run.detailEmpty")}</div>
          ) : (
            <>
              <div className="run-detail-header">
                <div className="run-detail-heading">
                  <div className="run-detail-title-row">
                    <h3>{selectedRun.team_name}</h3>
                    <span className={`step-mode ${selectedRun.status}`}>{statusLabel(selectedRun.status)}</span>
                  </div>
                  <p className="workflow-copy">{selectedRun.task}</p>
                </div>
                <div className="run-detail-meta">
                  <span>{selectedRun.id}</span>
                  <span>{selectedRun.completed_at ? formatDateTime(selectedRun.completed_at) : formatDateTime(selectedRun.created_at)}</span>
                </div>
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
                  {artifactError ? <div className="inline-error">{artifactError}</div> : null}
                  {selectedArtifact ? (
                    <div className="artifact-workspace">
                      <aside className="artifact-side-panel">
                        <div className="artifact-side-section">
                          <div className="panel-header">
                            <h3>{t("run.artifactCollection")}</h3>
                            <span>{artifactCount} / {artifactTarget}</span>
                          </div>
                          <p className="workflow-copy">
                            {t("run.artifactCollectionHint", {
                              available: artifactCount,
                              total: artifactTarget,
                            })}
                          </p>
                          <div className="artifact-nav-list">
                            {artifactDocuments.map((document) => (
                              <button
                                key={document.key}
                                type="button"
                                className={`artifact-nav-card ${selectedArtifact?.key === document.key ? "selected" : ""}`}
                                onClick={() => onSelectArtifact(document.key)}
                              >
                                <strong>{document.title}</strong>
                                <span>{document.available ? t("common.ready") : t("common.waiting")}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="artifact-side-section">
                          <div className="panel-header">
                            <h3>{t("run.artifactOutline")}</h3>
                            <span>{artifactOutline.length}</span>
                          </div>
                          {artifactOutline.length === 0 ? (
                            <div className="empty-state">{t("run.artifactOutlineEmpty")}</div>
                          ) : (
                            <div className="artifact-outline-list">
                              {artifactOutline.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  className="artifact-outline-button"
                                  style={{ paddingLeft: `${12 + Math.max(0, item.depth - 1) * 16}px` }}
                                  onClick={() => {
                                    const node = document.getElementById(item.id);
                                    node?.scrollIntoView({ behavior: "smooth", block: "start" });
                                  }}
                                >
                                  {item.text}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </aside>

                      <div className="artifact-detail-shell">
                        <div className="artifact-detail-header">
                          <div>
                            <span className="meta-label">{selectedArtifact.title}</span>
                            <strong>{selectedArtifact.available ? t("common.ready") : t("common.waiting")}</strong>
                          </div>
                          <div className="artifact-detail-meta">
                            <span className={`step-mode ${selectedArtifact.available ? "completed" : "planned"}`}>
                              {selectedArtifact.available ? t("common.ready") : t("common.waiting")}
                            </span>
                            <span className="artifact-type-chip">{artifactKindLabel}</span>
                          </div>
                        </div>
                        <div className="artifact-reader-toolbar">
                          <span className="workflow-copy">
                            {t("run.artifactPosition", {
                              current: selectedArtifactIndex + 1,
                              total: artifactTarget,
                            })}
                          </span>
                          <div className="button-row">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => previousArtifact && onSelectArtifact(previousArtifact.key)}
                              disabled={!previousArtifact}
                            >
                              {t("run.previousArtifact")}
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => nextArtifact && onSelectArtifact(nextArtifact.key)}
                              disabled={!nextArtifact}
                            >
                              {t("run.nextArtifact")}
                            </button>
                          </div>
                        </div>
                        {selectedArtifact.path ? (
                          <div className="artifact-path-shell">
                            <span className="meta-label">{t("run.artifactPathLabel")}</span>
                            <code className="artifact-path">{selectedArtifact.path}</code>
                          </div>
                        ) : null}
                        <ArtifactDocumentViewer
                          document={selectedArtifact}
                          emptyLabel={t("run.artifactEmpty")}
                          blocks={selectedArtifactBlocks}
                        />
                      </div>
                    </div>
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
                  <div className="chat-room-shell">
                    <p className="workflow-copy">{t("run.chatHint")}</p>
                    <div className="chat-thread chat-scroll-frame">
                    {agentSessionsLoading ? (
                      <div className="empty-state">{t("run.agentSessionsLoading")}</div>
                    ) : chatMessages.length === 0 ? (
                      <div className="empty-state">{t("run.chatEmpty")}</div>
                    ) : (
                      chatMessages.map((message) => {
                        const expanded = isChatExpanded(message);
                        const processItems = buildChatProcessItems(message, t, backendLabel);
                        const finalOutputDocument = buildChatFinalOutputDocument(message, artifactDocumentMap, t);
                        const collapsedMessageCount = processItems.length + 1;
                        return (
                          <article key={message.id} className={`chat-message chat-turn ${message.status} ${expanded ? "expanded" : "collapsed"}`}>
                            <div className="chat-rail">
                              <div className={`chat-avatar ${avatarTone(message.agentRole)}`}>{avatarLabel(message.agentRole)}</div>
                            </div>
                            <div className="chat-turn-main">
                              <div className="chat-bubble">
                                <div className="chat-meta">
                                  <strong>{agentRoleLabel(message.agentRole)}</strong>
                                  <span>{message.timestamp ? formatDateTime(message.timestamp) : t("common.waiting")}</span>
                                </div>
                                <div className="chat-title-row">
                                  <span className="chat-title">{message.title}</span>
                                  <span className={`step-mode ${message.status}`}>{statusLabel(message.status)}</span>
                                </div>
                                {expanded ? (
                                  <div className="chat-preview-block">
                                    <div className="chat-output-header">
                                      <span className="meta-label">{t("run.chatFinalOutput")}</span>
                                      <span>{finalOutputDocument.title}</span>
                                    </div>
                                    <div className="chat-output-viewer">
                                      <ArtifactDocumentViewer document={finalOutputDocument} emptyLabel={t("run.chatPending")} />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="chat-collapsed-summary">
                                    <span className="meta-label">{t("run.chatCollapsedHeading")}</span>
                                    <strong>{t("run.chatCollapsedCount", { count: collapsedMessageCount })}</strong>
                                  </div>
                                )}
                                <div className="chat-submeta">
                                  <span>{backendLabel(message.backend)}</span>
                                  {message.provider ? <span>{message.provider}</span> : null}
                                  <button
                                    type="button"
                                    className="chat-toggle-button"
                                    onClick={() => toggleChatMessage(message.id)}
                                  >
                                    {expanded ? t("run.chatCollapse") : t("run.chatExpand")}
                                  </button>
                                </div>
                              </div>
                              {expanded ? (
                                <div className="chat-expanded-stack">
                                  <div className="chat-process-panel">
                                    <div className="chat-process-section">
                                      <span className="meta-label">{t("run.chatProcessHeading")}</span>
                                      <div className="chat-process-list">
                                        {processItems.map((item) => (
                                          <article key={`${message.id}-${item.label}-${item.value}`} className="chat-process-item">
                                            <span className="meta-label">{item.label}</span>
                                            <strong>{item.value}</strong>
                                            {item.meta ? <span>{item.meta}</span> : null}
                                          </article>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </article>
                        );
                      })
                    )}
                    </div>
                  </div>
                </div>
              ) : null}

              {detailTab === "trace" ? (
                <div className="detail-section">
                  <TraceLogViewer t={t} log={runLog} emptyLabel={t("run.traceEmpty")} formatDateTime={formatDateTime} />
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

function groupRunsByDay(runs: WorkflowRun[]): RunGroup[] {
  const groups = new Map<string, WorkflowRun[]>();
  for (const run of runs) {
    const timestamp = run.started_at ?? run.created_at;
    const date = new Date(timestamp);
    const key = Number.isNaN(date.getTime())
      ? timestamp.slice(0, 10) || "unknown"
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(run);
    } else {
      groups.set(key, [run]);
    }
  }

  return Array.from(groups.entries()).map(([key, groupedRuns]) => ({
    key,
    label: formatRunGroupLabel(key),
    runs: groupedRuns,
  }));
}

function formatRunGroupLabel(key: string): string {
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return key;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function buildChatProcessItems(
  message: ChatMessage,
  t: Translator,
  backendLabel: (backend: WorkflowRun["steps"][number]["backend"]) => string,
): ChatActionItem[] {
  const items: ChatActionItem[] = [];

  if (message.goal) {
    items.push({
      label: t("run.chatGoal"),
      value: message.goal,
    });
  }

  if (message.commandPreviews.length > 0) {
    for (const preview of message.commandPreviews) {
      items.push({
        label: t("run.chatAction"),
        value: preview.label,
        meta: [preview.argv.join(" "), preview.cwd ? `${t("run.commandCwd")}: ${preview.cwd}` : ""].filter(Boolean).join(" · "),
      });
    }
  } else {
    items.push({
      label: t("run.chatAction"),
      value: t("run.chatActionFallback", { stage: backendLabel(message.backend) }),
    });
  }

  if (message.dependsOn.length > 0) {
    items.push({
      label: t("run.chatDependsOn"),
      value: message.dependsOn.join(", "),
    });
  }

  if (message.provider) {
    items.push({
      label: t("run.chatProvider"),
      value: message.provider,
    });
  }

  return items;
}

function buildChatFinalOutputDocument(
  message: ChatMessage,
  documents: Map<WorkflowArtifactDocument["key"], WorkflowArtifactDocument>,
  t: Translator,
): WorkflowArtifactDocument {
  const preferredKeysByRole: Record<string, WorkflowArtifactDocument["key"][]> = {
    planner: ["planning_brief"],
    researcher: ["project_snapshot", "memory_context"],
    coder: ["last_message", "changes"],
    "runner/tester": ["verification_brief", "parallel_branches"],
    reviewer: ["changes"],
    summarizer: ["report", "memory_context"],
  };

  const preferredKeys = preferredKeysByRole[message.agentRole] ?? [];
  for (const key of preferredKeys) {
    const document = documents.get(key);
    if (document?.available && document.content) {
      return document;
    }
  }

  return {
    key: "last_message",
    title: t("run.chatInlineReply"),
    path: null,
    content_type: "text",
    available: true,
    content: message.body,
  };
}
