from __future__ import annotations

import subprocess
from collections.abc import Callable
from pathlib import Path

from app.config import Settings
from app.models.dto import WorkflowRunRecord
from app.services.workflow_backend_codex_delegate import execute_delegated_codex_backend
from app.services.workflow_run_artifacts import write_changes_summary


def _reviewer_prompt(record: WorkflowRunRecord) -> str:
    return "\n".join(
        [
            "You are the reviewer backend for an Agents Team workflow.",
            "Inspect the current project working tree and produce a markdown change review artifact.",
            "Do not edit project files. Focus on regressions, changed files, risks, and reviewer memory cross-checks.",
            "",
            f"Run id: {record.id}",
            f"Task: {record.task}",
            "",
            "Reviewer memory checklist:",
            *([f"- {item}" for item in record.memory_guidance.reviewer] or ["- No reviewer checklist was generated."]),
            "",
            "Output sections:",
            "- Reviewer Memory Cross-Checks",
            "- Changed Files",
            "- Risk Assessment",
            "- Open Questions",
        ]
    )


def execute_reviewer_backend(
    record: WorkflowRunRecord,
    settings: Settings,
    should_cancel: Callable[[], bool],
    set_active_process: Callable[[subprocess.Popen[str] | None], None],
) -> str:
    return execute_delegated_codex_backend(
        record=record,
        settings=settings,
        backend_label="Reviewer backend",
        artifact_path=Path(record.changes_path),
        prompt=_reviewer_prompt(record),
        should_cancel=should_cancel,
        set_active_process=set_active_process,
        fallback=lambda: write_changes_summary(record),
    )
