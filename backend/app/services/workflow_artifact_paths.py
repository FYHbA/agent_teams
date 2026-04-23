from __future__ import annotations

from pathlib import Path

from app.models.dto import WorkflowRunRecord


def planning_brief_path(record: WorkflowRunRecord) -> Path:
    return Path(record.run_path) / "planning-brief.md"


def project_snapshot_path(record: WorkflowRunRecord) -> Path:
    return Path(record.run_path) / "project-snapshot.md"


def verification_brief_path(record: WorkflowRunRecord) -> Path:
    return Path(record.run_path) / "verification-brief.md"
