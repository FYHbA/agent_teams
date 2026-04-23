from __future__ import annotations

import json
from pathlib import Path

from fastapi import HTTPException

from app.config import Settings
from app.models.dto import ProjectRuntimeMirrorResponse, WorkflowRunRecord
from app.services.runtime import init_project_runtime, project_runtime_path, resolve_project_path
from app.services.workflow_agent_sessions import list_agent_sessions
from app.services.workflow_control_db import connect_control_db, initialize_control_db
from app.services.workflow_run_execution import recover_workflow_queue
from app.services.workflow_run_queue import read_workflow_queue
from app.services.workflow_run_store import list_workflow_runs, now_iso, save_record, write_json


def _mirror_default_path(project_path: Path) -> Path:
    return project_runtime_path(project_path) / "control-plane-mirror.json"


def _export_default_path(project_path: Path) -> Path:
    stamp = now_iso().replace(":", "").replace("+", "_").replace(".", "_")
    return project_runtime_path(project_path) / "artifacts" / f"control-plane-export-{stamp}.json"


def _resolve_project_local_path(project_path: Path, path_str: str | None, *, default: Path) -> Path:
    if not path_str:
        return default
    candidate = Path(path_str)
    if not candidate.is_absolute():
        candidate = project_path / candidate
    candidate = candidate.resolve()
    try:
        candidate.relative_to(project_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Mirror/export path must stay inside the project: {candidate}") from exc
    return candidate


def _project_payload(project_path: Path, settings: Settings) -> dict:
    runs = list_workflow_runs(str(project_path), settings)
    run_ids = {run.id for run in runs}
    queue_items = [item for item in read_workflow_queue(settings) if item["run_id"] in run_ids]
    agent_sessions = []
    for run in runs:
        agent_sessions.extend(session.model_dump(mode="json") for session in list_agent_sessions(run.id, settings))
    return {
        "version": 1,
        "project_path": str(project_path),
        "generated_at": now_iso(),
        "runs": [run.model_dump(mode="json") for run in runs],
        "queue_items": queue_items,
        "agent_sessions": agent_sessions,
    }


def _write_payload(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write_json(path, payload)


def mirror_project_control_plane(project_path_str: str, settings: Settings) -> ProjectRuntimeMirrorResponse:
    project_path = resolve_project_path(project_path_str)
    init_project_runtime(str(project_path), settings)
    payload = _project_payload(project_path, settings)
    mirror_path = _mirror_default_path(project_path)
    _write_payload(mirror_path, payload)
    return ProjectRuntimeMirrorResponse(
        operation="mirror",
        project_path=str(project_path),
        path=str(mirror_path),
        run_count=len(payload["runs"]),
        queue_item_count=len(payload["queue_items"]),
        agent_session_count=len(payload["agent_sessions"]),
        generated_at=payload["generated_at"],
    )


def export_project_control_plane(
    project_path_str: str,
    settings: Settings,
    *,
    path_str: str | None = None,
) -> ProjectRuntimeMirrorResponse:
    project_path = resolve_project_path(project_path_str)
    init_project_runtime(str(project_path), settings)
    payload = _project_payload(project_path, settings)
    export_path = _resolve_project_local_path(project_path, path_str, default=_export_default_path(project_path))
    _write_payload(export_path, payload)
    return ProjectRuntimeMirrorResponse(
        operation="export",
        project_path=str(project_path),
        path=str(export_path),
        run_count=len(payload["runs"]),
        queue_item_count=len(payload["queue_items"]),
        agent_session_count=len(payload["agent_sessions"]),
        generated_at=payload["generated_at"],
    )


def import_project_control_plane(
    project_path_str: str,
    settings: Settings,
    *,
    path_str: str | None = None,
) -> ProjectRuntimeMirrorResponse:
    project_path = resolve_project_path(project_path_str)
    init_project_runtime(str(project_path), settings)
    source_path = _resolve_project_local_path(project_path, path_str, default=_mirror_default_path(project_path))
    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"Mirror/export payload not found: {source_path}")

    try:
        payload = json.loads(source_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Mirror/export payload is invalid JSON: {source_path}") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail=f"Mirror/export payload is invalid: {source_path}")

    runs = payload.get("runs", [])
    queue_items = payload.get("queue_items", [])
    agent_sessions = payload.get("agent_sessions", [])
    if not isinstance(runs, list) or not isinstance(queue_items, list) or not isinstance(agent_sessions, list):
        raise HTTPException(status_code=400, detail="Mirror/export payload is missing required lists.")

    for raw_run in runs:
        if not isinstance(raw_run, dict):
            continue
        save_record(
            WorkflowRunRecord.model_validate(raw_run),
            settings,
        )

    initialize_control_db(settings)
    connection = connect_control_db(settings)
    try:
        for item in queue_items:
            if not isinstance(item, dict):
                continue
            status = str(item.get("status", "queued"))
            if status == "running":
                status = "queued"
                item["error"] = "Imported from project-local mirror; queue item was reset to queued."
            connection.execute(
                """
                INSERT INTO workflow_run_queue (
                    id,
                    run_id,
                    project_path,
                    mode,
                    item_kind,
                    target_step_id,
                    branch_group_id,
                    status,
                    prepared,
                    enqueued_at,
                    updated_at,
                    started_at,
                    completed_at,
                    error,
                    worker_id,
                    heartbeat_at,
                    lease_expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    run_id = excluded.run_id,
                    project_path = excluded.project_path,
                    mode = excluded.mode,
                    item_kind = excluded.item_kind,
                    target_step_id = excluded.target_step_id,
                    branch_group_id = excluded.branch_group_id,
                    status = excluded.status,
                    prepared = excluded.prepared,
                    enqueued_at = excluded.enqueued_at,
                    updated_at = excluded.updated_at,
                    started_at = excluded.started_at,
                    completed_at = excluded.completed_at,
                    error = excluded.error,
                    worker_id = NULL,
                    heartbeat_at = NULL,
                    lease_expires_at = NULL
                """,
                (
                    str(item["id"]),
                    str(item["run_id"]),
                    str(item["project_path"]) if item.get("project_path") else None,
                    str(item["mode"]),
                    str(item.get("item_kind", "run")),
                    str(item["target_step_id"]) if item.get("target_step_id") else None,
                    str(item["branch_group_id"]) if item.get("branch_group_id") else None,
                    status,
                    1 if bool(item.get("prepared", False)) else 0,
                    str(item["enqueued_at"]),
                    str(item.get("updated_at") or item["enqueued_at"]),
                    str(item["started_at"]) if item.get("started_at") else None,
                    str(item["completed_at"]) if item.get("completed_at") else None,
                    str(item["error"]) if item.get("error") else None,
                    None,
                    None,
                    None,
                ),
            )

        for session in agent_sessions:
            if not isinstance(session, dict):
                continue
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
                ON CONFLICT(id) DO UPDATE SET
                    run_id = excluded.run_id,
                    step_id = excluded.step_id,
                    title = excluded.title,
                    agent_role = excluded.agent_role,
                    backend = excluded.backend,
                    execution = excluded.execution,
                    status = excluded.status,
                    owner_worker_id = excluded.owner_worker_id,
                    provider = excluded.provider,
                    session_ref = excluded.session_ref,
                    started_at = excluded.started_at,
                    completed_at = excluded.completed_at,
                    summary = excluded.summary,
                    error = excluded.error
                """,
                (
                    str(session["id"]),
                    str(session["run_id"]),
                    str(session["step_id"]),
                    str(session["title"]),
                    str(session["agent_role"]),
                    str(session["backend"]),
                    str(session["execution"]),
                    str(session["status"]),
                    str(session["owner_worker_id"]) if session.get("owner_worker_id") else None,
                    str(session["provider"]) if session.get("provider") else None,
                    str(session["session_ref"]) if session.get("session_ref") else None,
                    str(session["started_at"]),
                    str(session["completed_at"]) if session.get("completed_at") else None,
                    str(session["summary"]) if session.get("summary") else None,
                    str(session["error"]) if session.get("error") else None,
                ),
            )
    finally:
        connection.close()

    recover_workflow_queue(settings)
    return ProjectRuntimeMirrorResponse(
        operation="import",
        project_path=str(project_path),
        path=str(source_path),
        run_count=len(runs),
        queue_item_count=len(queue_items),
        agent_session_count=len(agent_sessions),
        generated_at=now_iso(),
    )
