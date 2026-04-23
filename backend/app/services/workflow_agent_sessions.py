from __future__ import annotations

import threading
from uuid import uuid4

from app.config import Settings
from app.models.dto import WorkflowAgentSessionRecord, WorkflowRunRecord, WorkflowStepRun
from app.services.workflow_control_db import connect_control_db, initialize_control_db
from app.services.workflow_run_store import now_iso

_AGENT_RUNTIME = threading.local()


def clear_agent_runtime_metadata() -> None:
    _AGENT_RUNTIME.provider = None
    _AGENT_RUNTIME.session_ref = None


def set_agent_runtime_metadata(*, provider: str, session_ref: str | None = None) -> None:
    _AGENT_RUNTIME.provider = provider
    _AGENT_RUNTIME.session_ref = session_ref


def get_agent_runtime_metadata() -> tuple[str | None, str | None]:
    return (
        getattr(_AGENT_RUNTIME, "provider", None),
        getattr(_AGENT_RUNTIME, "session_ref", None),
    )


def start_agent_session(
    *,
    record: WorkflowRunRecord,
    step_run: WorkflowStepRun,
    settings: Settings,
    worker_id: str | None,
) -> WorkflowAgentSessionRecord:
    initialize_control_db(settings)
    session = WorkflowAgentSessionRecord(
        id=f"agent-{uuid4().hex[:12]}",
        run_id=record.id,
        step_id=step_run.step_id,
        title=step_run.title,
        agent_role=step_run.agent_role,
        backend=step_run.backend,
        execution=step_run.execution,
        status="running",
        owner_worker_id=worker_id,
        provider=None,
        session_ref=None,
        started_at=now_iso(),
        completed_at=None,
        summary=None,
        error=None,
    )
    connection = connect_control_db(settings)
    try:
        connection.execute(
            """
            INSERT INTO workflow_agent_sessions (
                id,
                run_id,
                step_id,
                title,
                agent_role,
                backend,
                execution,
                status,
                owner_worker_id,
                provider,
                session_ref,
                started_at,
                completed_at,
                summary,
                error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session.id,
                session.run_id,
                session.step_id,
                session.title,
                session.agent_role,
                session.backend,
                session.execution,
                session.status,
                session.owner_worker_id,
                session.provider,
                session.session_ref,
                session.started_at,
                session.completed_at,
                session.summary,
                session.error,
            ),
        )
    finally:
        connection.close()
    return session


def finish_agent_session(
    *,
    session_id: str,
    settings: Settings,
    status: str,
    summary: str | None,
    error: str | None = None,
) -> None:
    initialize_control_db(settings)
    provider, session_ref = get_agent_runtime_metadata()
    connection = connect_control_db(settings)
    try:
        connection.execute(
            """
            UPDATE workflow_agent_sessions
            SET status = ?,
                provider = COALESCE(?, provider),
                session_ref = COALESCE(?, session_ref),
                completed_at = ?,
                summary = ?,
                error = ?
            WHERE id = ?
            """,
            (status, provider, session_ref, now_iso(), summary, error, session_id),
        )
    finally:
        connection.close()


def list_agent_sessions(run_id: str, settings: Settings) -> list[WorkflowAgentSessionRecord]:
    initialize_control_db(settings)
    connection = connect_control_db(settings)
    try:
        rows = connection.execute(
            """
            SELECT
                id,
                run_id,
                step_id,
                title,
                agent_role,
                backend,
                execution,
                status,
                owner_worker_id,
                provider,
                session_ref,
                started_at,
                completed_at,
                summary,
                error
            FROM workflow_agent_sessions
            WHERE run_id = ?
            ORDER BY started_at ASC, id ASC
            """,
            (run_id,),
        ).fetchall()
        return [WorkflowAgentSessionRecord.model_validate(dict(row)) for row in rows]
    finally:
        connection.close()
