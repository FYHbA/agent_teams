import type { WorkflowQueueDashboard, WorkflowQueueItem } from "../types";
import type { Translator } from "../i18n";

type DiagnosticsStageProps = {
  t: Translator;
  queueDashboard: WorkflowQueueDashboard | null;
  queueLoading: boolean;
  queueError: string;
  queueItemNote: (item: WorkflowQueueItem) => string;
  queueModeLabel: (mode: WorkflowQueueItem["mode"]) => string;
  embedded?: boolean;
};

export function DiagnosticsStage({
  t,
  queueDashboard,
  queueLoading,
  queueError,
  queueItemNote,
  queueModeLabel,
  embedded = false,
}: DiagnosticsStageProps) {
  const queueItems = queueDashboard?.items ?? [];
  const queueWorkers = queueDashboard?.workers ?? [];
  const runningWorkers = queueWorkers.filter((worker) => worker.status === "running");
  const idleWorkers = queueWorkers.filter((worker) => worker.status === "idle");
  const staleWorkers = queueWorkers.filter((worker) => worker.status === "stale");
  const healthyWorkers = queueWorkers.filter((worker) => worker.status !== "stale");

  const content = (
    <>
      <div className="stage-intro">
        <div>
          <p className="eyebrow">{t("nav.diagnostics")}</p>
          <h2>{t("diagnostics.heading")}</h2>
          {!embedded ? <p>{t("diagnostics.description")}</p> : null}
        </div>
      </div>

      <div className="diagnostics-grid">
        <article className="glass-panel">
          <div className="panel-header">
            <h3>{t("diagnostics.workers")}</h3>
            <span>{queueLoading ? t("common.loading") : queueWorkers.length}</span>
          </div>
          <p className="workflow-copy">
            {t("diagnostics.workerSummary", {
              total: queueWorkers.length,
              running: runningWorkers.length,
              idle: idleWorkers.length,
              stale: staleWorkers.length,
            })}
          </p>
          {queueWorkers.length === 0 ? (
            <div className="empty-state">{t("diagnostics.workersEmpty")}</div>
          ) : staleWorkers.length === 0 ? (
            <article className="status-summary-card">
              <span className="meta-label">{t("diagnostics.workerHealthyCardLabel")}</span>
              <strong>{healthyWorkers.length}</strong>
              <p>{t("diagnostics.workerHealthyCardBody", { count: healthyWorkers.length })}</p>
            </article>
          ) : (
            <div className="step-list compact-list">
              {staleWorkers.map((worker) => {
                const tone = worker.status === "running" ? "running" : worker.status === "stale" ? "failed" : "skipped";
                const statusText =
                  worker.status === "running"
                    ? t("diagnostics.workerRunning")
                    : worker.status === "stale"
                    ? t("diagnostics.workerStale")
                    : t("diagnostics.workerIdle");
                return (
                  <article key={worker.worker_id} className="step-item">
                    <div className="step-header">
                      <strong>{worker.worker_id}</strong>
                      <span className={`step-mode ${tone}`}>{statusText}</span>
                    </div>
                    <div className="meta-grid compact">
                      <div>
                        <span className="meta-label">{t("diagnostics.workerCurrentRun")}</span>
                        <strong>{worker.current_run_id ?? t("common.none")}</strong>
                      </div>
                      <div>
                        <span className="meta-label">{t("diagnostics.workerLastHeartbeat")}</span>
                        <strong>{worker.last_heartbeat_at}</strong>
                      </div>
                      <div>
                        <span className="meta-label">{t("diagnostics.workerStaleReason")}</span>
                        <strong>{worker.stale_reason ?? t("diagnostics.workerHealthy")}</strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </article>

        <article className="glass-panel">
          <div className="panel-header">
            <h3>{t("diagnostics.queue")}</h3>
            <span>{queueLoading ? t("common.loading") : queueItems.length}</span>
          </div>
          <p className="workflow-copy">
            {t("diagnostics.queueSummary", {
              queued: queueDashboard?.queued_count ?? 0,
              running: queueDashboard?.running_count ?? 0,
              terminal: queueDashboard?.terminal_count ?? 0,
            })}
          </p>
          <div className="step-list compact-list">
            {queueItems.length === 0 ? (
              <div className="empty-state">{t("diagnostics.queueEmpty")}</div>
            ) : (
              queueItems.slice(0, 8).map((item) => (
                <article key={item.id} className="step-item">
                  <div className="step-header">
                    <strong>{item.run_id}</strong>
                    <span className={`step-mode ${item.status === "running" ? "running" : item.status === "queued" ? "planned" : item.status}`}>
                      {t(`status.${item.status}`)}
                    </span>
                  </div>
                  <p>{queueItemNote(item)}</p>
                  <div className="meta-grid compact">
                    <div>
                      <span className="meta-label">{t("diagnostics.queueMode")}</span>
                      <strong>{queueModeLabel(item.mode)}</strong>
                    </div>
                    <div>
                      <span className="meta-label">{t("diagnostics.queueWorker")}</span>
                      <strong>{item.worker_id ?? t("common.none")}</strong>
                    </div>
                    <div>
                      <span className="meta-label">{t("diagnostics.queueUpdatedAt")}</span>
                      <strong>{item.updated_at}</strong>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
          {queueError ? <div className="inline-error">{queueError}</div> : null}
        </article>
      </div>
    </>
  );

  if (embedded) {
    return <div className="embedded-stage embedded-diagnostics-stage">{content}</div>;
  }

  return <section className="stage-panel">{content}</section>;
}
