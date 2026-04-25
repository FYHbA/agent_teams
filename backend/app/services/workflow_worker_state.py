from __future__ import annotations

import os
import socket

from app.config import Settings
from app.models.dto import WorkflowWorkerRecord
from app.services.workflow_control_db import connect_control_db, initialize_control_db
from app.services.workflow_run_store import now_iso


def upsert_workflow_worker(
    *,
    settings: Settings,
    worker_id: str,
    thread_name: str,
    status: str,
    current_item_id: str | None,
    current_run_id: str | None,
    started_at: str | None = None,
) -> None:
    initialize_control_db(settings)
    heartbeat = now_iso()
    connection = connect_control_db(settings)
    try:
        connection.execute(
            """
            INSERT INTO workflow_workers (
                worker_id,
                thread_name,
                process_id,
                host,
                status,
                started_at,
                last_heartbeat_at,
                current_item_id,
                current_run_id,
                stale_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(worker_id) DO UPDATE SET
                thread_name = excluded.thread_name,
                process_id = excluded.process_id,
                host = excluded.host,
                status = excluded.status,
                started_at = COALESCE(workflow_workers.started_at, excluded.started_at),
                last_heartbeat_at = excluded.last_heartbeat_at,
                current_item_id = excluded.current_item_id,
                current_run_id = excluded.current_run_id,
                stale_reason = NULL
            """,
            (
                worker_id,
                thread_name,
                os.getpid(),
                socket.gethostname(),
                status,
                started_at or heartbeat,
                heartbeat,
                current_item_id,
                current_run_id,
                None,
            ),
        )
    finally:
        connection.close()


def list_workflow_workers(settings: Settings) -> list[WorkflowWorkerRecord]:
    initialize_control_db(settings)
    connection = connect_control_db(settings)
    try:
        rows = connection.execute(
            """
            SELECT
                worker_id,
                thread_name,
                process_id,
                host,
                status,
                started_at,
                last_heartbeat_at,
                current_item_id,
                current_run_id,
                stale_reason
            FROM workflow_workers
            ORDER BY last_heartbeat_at DESC, worker_id ASC
            """
        ).fetchall()
        return [WorkflowWorkerRecord.model_validate(dict(row)) for row in rows]
    finally:
        connection.close()
