import type { CodexSessionBridge, ProjectRuntimeMirrorResult, WorkflowQueueDashboard, WorkflowQueueItem } from "../types";
import type { Translator } from "../i18n";

type DiagnosticsStageProps = {
  t: Translator;
  queueDashboard: WorkflowQueueDashboard | null;
  queueLoading: boolean;
  queueError: string;
  bridge: CodexSessionBridge | null;
  bridgeError: string;
  mirrorResult: ProjectRuntimeMirrorResult | null;
  queueItemNote: (item: WorkflowQueueItem) => string;
  onCancelQueueItem: (itemId: string) => void;
  onRequeueQueueItem: (itemId: string) => void;
};

export function DiagnosticsStage({
  t,
  queueDashboard,
  queueLoading,
  queueError,
  bridge,
  bridgeError,
  mirrorResult,
  queueItemNote,
  onCancelQueueItem,
  onRequeueQueueItem,
}: DiagnosticsStageProps) {
  const queueItems = queueDashboard?.items ?? [];
  const queueWorkers = queueDashboard?.workers ?? [];

  return (
    <section className="stage-panel">
      <div className="stage-intro">
        <div>
          <p className="eyebrow">{t("nav.diagnostics")}</p>
          <h2>{t("diagnostics.heading")}</h2>
          <p>{t("diagnostics.description")}</p>
        </div>
      </div>

      <div className="diagnostics-grid">
        <article className="glass-panel">
          <div className="panel-header">
            <h3>{t("diagnostics.workers")}</h3>
            <span>{queueLoading ? t("common.loading") : queueWorkers.length}</span>
          </div>
          <div className="session-list compact-list">
            {queueWorkers.length === 0 ? (
              <div className="empty-state">{t("diagnostics.workersEmpty")}</div>
            ) : (
              queueWorkers.map((worker) => (
                <article key={worker.worker_id} className="session-item">
                  <strong>{worker.worker_id}</strong>
                  <span>{worker.status}</span>
                  <code>{worker.current_run_id ?? worker.thread_name}</code>
                </article>
              ))
            )}
          </div>
        </article>

        <article className="glass-panel">
          <div className="panel-header">
            <h3>{t("diagnostics.queue")}</h3>
            <span>{queueDashboard?.queued_count ?? 0} / {queueDashboard?.running_count ?? 0}</span>
          </div>
          <div className="command-list compact-list">
            {queueItems.length === 0 ? (
              <div className="empty-state">{t("diagnostics.queueEmpty")}</div>
            ) : (
              queueItems.slice(0, 12).map((item) => (
                <article key={item.id} className="command-item queue-item">
                  <strong>{item.run_id}</strong>
                  <span className="meta-label">
                    {item.item_kind} / {item.mode} / {item.status}
                  </span>
                  <p>{queueItemNote(item)}</p>
                  <div className="button-row">
                    {item.status === "queued" ? (
                      <button type="button" className="secondary-button" onClick={() => onCancelQueueItem(item.id)} disabled={queueLoading}>
                        {t("diagnostics.queueItemCancel")}
                      </button>
                    ) : null}
                    {item.status === "failed" || item.status === "cancelled" ? (
                      <button type="button" className="secondary-button" onClick={() => onRequeueQueueItem(item.id)} disabled={queueLoading}>
                        {t("diagnostics.queueItemRequeue")}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
          {queueError ? <div className="inline-error">{queueError}</div> : null}
        </article>

        <article className="glass-panel">
          <div className="panel-header">
            <h3>{t("diagnostics.bridge")}</h3>
            <span>{bridge?.commands?.length ?? 0}</span>
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
              <div className="empty-state">{t("diagnostics.bridgeEmpty")}</div>
            )}
          </div>
          {bridgeError ? <div className="inline-error">{bridgeError}</div> : null}
        </article>

        <article className="glass-panel">
          <div className="panel-header">
            <h3>{t("diagnostics.mirror")}</h3>
            <span>{mirrorResult?.operation ?? t("common.waiting")}</span>
          </div>
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
