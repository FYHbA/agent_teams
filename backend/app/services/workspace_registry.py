from __future__ import annotations

import json
import re
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException

from app.config import Settings
from app.models.dto import RecentProjectRecord, WorkspaceRecord, WorkspaceUpdateRequest
from app.services.runtime import project_runtime_path, resolve_project_path
from app.services.workflow_run_store import now_iso, write_json

WORKSPACE_REGISTRY_FILENAME = "workspaces.json"
LEGACY_PROJECT_REGISTRY_FILENAME = "projects.json"


def workspace_registry_path(settings: Settings) -> Path:
    return settings.agents_team_home / WORKSPACE_REGISTRY_FILENAME


def _legacy_project_registry_path(settings: Settings) -> Path:
    return settings.agents_team_home / LEGACY_PROJECT_REGISTRY_FILENAME


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "workspace"


def _load_json(path: Path) -> list[dict]:
    if not path.exists():
      return []
    try:
      payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
      return []
    return [row for row in payload if isinstance(row, dict)] if isinstance(payload, list) else []


def _save_workspace_rows(rows: list[WorkspaceRecord], settings: Settings) -> None:
    write_json(workspace_registry_path(settings), [row.model_dump(mode="json") for row in rows])


def _read_workspace_rows(settings: Settings) -> list[WorkspaceRecord]:
    rows = []
    for row in _load_json(workspace_registry_path(settings)):
        try:
            rows.append(WorkspaceRecord.model_validate(row))
        except Exception:  # noqa: BLE001
            continue
    return rows


def _migrate_legacy_projects(settings: Settings) -> None:
    registry = workspace_registry_path(settings)
    if registry.exists():
        return
    legacy_rows = _load_json(_legacy_project_registry_path(settings))
    if not legacy_rows:
        return

    migrated: list[WorkspaceRecord] = []
    seen_aliases: set[str] = set()
    for row in legacy_rows:
        project_path = str(row.get("project_path", ""))
        runtime_path = str(row.get("runtime_path", ""))
        if not project_path or not runtime_path:
            continue
        path_name = Path(project_path).name or "workspace"
        alias = _slugify(path_name)
        original_alias = alias
        counter = 2
        while alias in seen_aliases:
            alias = f"{original_alias}-{counter}"
            counter += 1
        seen_aliases.add(alias)
        migrated.append(
            WorkspaceRecord(
                id=f"ws-{uuid4().hex[:10]}",
                name=path_name,
                alias=alias,
                project_path=project_path,
                runtime_path=runtime_path,
                source="filesystem",
                trusted=True,
                updated_at=str(row.get("updated_at") or now_iso()),
                last_opened_at=str(row.get("updated_at") or now_iso()),
            )
        )
    if migrated:
        _save_workspace_rows(migrated, settings)


def _ensure_registry(settings: Settings) -> list[WorkspaceRecord]:
    _migrate_legacy_projects(settings)
    return _read_workspace_rows(settings)


def _unique_alias(alias: str, existing: list[WorkspaceRecord], *, exclude_workspace_id: str | None = None) -> str:
    candidate = _slugify(alias)
    used = {workspace.alias for workspace in existing if workspace.id != exclude_workspace_id}
    if candidate not in used:
        return candidate
    original = candidate
    counter = 2
    while candidate in used:
        candidate = f"{original}-{counter}"
        counter += 1
    return candidate


def list_workspaces(settings: Settings) -> list[WorkspaceRecord]:
    workspaces = _ensure_registry(settings)
    workspaces.sort(key=lambda workspace: (workspace.last_opened_at or workspace.updated_at, workspace.updated_at), reverse=True)
    return workspaces


def get_workspace(workspace_id: str, settings: Settings) -> WorkspaceRecord:
    for workspace in _ensure_registry(settings):
        if workspace.id == workspace_id:
            return workspace
    raise HTTPException(status_code=404, detail=f"Workspace not found: {workspace_id}")


def workspace_for_path(project_path_str: str, settings: Settings) -> WorkspaceRecord | None:
    project_path = str(resolve_project_path(project_path_str))
    for workspace in _ensure_registry(settings):
        if workspace.project_path == project_path:
            return workspace
    return None


def upsert_workspace(
    project_path_str: str,
    settings: Settings,
    *,
    name: str | None = None,
    alias: str | None = None,
    source: str = "manual",
    trusted: bool = True,
    mark_opened: bool = True,
) -> WorkspaceRecord:
    project_path = resolve_project_path(project_path_str)
    normalized_path = str(project_path)
    runtime_path = str(project_runtime_path(project_path))
    rows = _ensure_registry(settings)
    now = now_iso()

    for index, workspace in enumerate(rows):
        if workspace.project_path != normalized_path:
            continue
        updated = workspace.model_copy(
            update={
                "name": name or workspace.name,
                "alias": _unique_alias(alias or workspace.alias, rows, exclude_workspace_id=workspace.id),
                "runtime_path": runtime_path,
                "source": source,  # type: ignore[arg-type]
                "trusted": trusted,
                "updated_at": now,
                "last_opened_at": now if mark_opened else workspace.last_opened_at,
            }
        )
        rows[index] = updated
        _save_workspace_rows(rows, settings)
        return updated

    base_name = name or project_path.name or "Workspace"
    workspace = WorkspaceRecord(
        id=f"ws-{uuid4().hex[:10]}",
        name=base_name,
        alias=_unique_alias(alias or base_name, rows),
        project_path=normalized_path,
        runtime_path=runtime_path,
        source=source,  # type: ignore[arg-type]
        trusted=trusted,
        updated_at=now,
        last_opened_at=now if mark_opened else None,
    )
    rows.append(workspace)
    _save_workspace_rows(rows, settings)
    return workspace


def update_workspace(workspace_id: str, request: WorkspaceUpdateRequest, settings: Settings) -> WorkspaceRecord:
    rows = _ensure_registry(settings)
    for index, workspace in enumerate(rows):
        if workspace.id != workspace_id:
            continue
        updated = workspace.model_copy(
            update={
                "name": request.name or workspace.name,
                "alias": _unique_alias(request.alias or workspace.alias, rows, exclude_workspace_id=workspace.id),
                "updated_at": now_iso(),
            }
        )
        rows[index] = updated
        _save_workspace_rows(rows, settings)
        return updated
    raise HTTPException(status_code=404, detail=f"Workspace not found: {workspace_id}")


def list_recent_projects(settings: Settings, *, limit: int = 12) -> list[RecentProjectRecord]:
    workspaces = list_workspaces(settings)[:limit]
    return [
        RecentProjectRecord(
            workspace_id=workspace.id,
            name=workspace.name,
            alias=workspace.alias,
            path=workspace.project_path,
            runtime_path=workspace.runtime_path,
            updated_at=workspace.last_opened_at or workspace.updated_at,
        )
        for workspace in workspaces
    ]
