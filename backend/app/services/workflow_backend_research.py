from __future__ import annotations

import subprocess
from collections.abc import Callable

from app.config import Settings
from app.models.dto import WorkflowRunRecord
from app.services.workflow_artifact_paths import project_snapshot_path
from app.services.workflow_backend_codex_delegate import execute_delegated_codex_backend
from app.services.workflow_run_artifacts import write_project_snapshot


def _research_prompt(record: WorkflowRunRecord) -> str:
    return "\n".join(
        [
            "You are the research backend for an Agents Team workflow.",
            "Inspect the repository in read-only mode and produce a markdown research snapshot.",
            "Do not edit project files. Focus on visible structure, relevant hotspots, and continuity notes from recalled memory.",
            "",
            f"Run id: {record.id}",
            f"Task: {record.task}",
            "",
            "Recalled project memory:",
            *([f"- {entry.title}: {entry.summary}" for entry in record.memory_context.recalled_project] or ["- No project memory recalled."]),
            "",
            "Recalled global memory:",
            *([f"- {entry.title}: {entry.summary}" for entry in record.memory_context.recalled_global] or ["- No global memory recalled."]),
            "",
            "Output sections:",
            "- Project Snapshot",
            "- Relevant Hotspots",
            "- Continuity Notes",
            "- Suggested Next Attention Areas",
        ]
    )


def execute_research_backend(
    record: WorkflowRunRecord,
    settings: Settings,
    should_cancel: Callable[[], bool],
    set_active_process: Callable[[subprocess.Popen[str] | None], None],
) -> str:
    return execute_delegated_codex_backend(
        record=record,
        settings=settings,
        backend_label="Research backend",
        artifact_path=project_snapshot_path(record),
        prompt=_research_prompt(record),
        should_cancel=should_cancel,
        set_active_process=set_active_process,
        fallback=lambda: write_project_snapshot(record),
    )
