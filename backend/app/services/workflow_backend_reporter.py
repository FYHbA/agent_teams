from __future__ import annotations

import subprocess
from collections.abc import Callable
from pathlib import Path

from app.config import Settings
from app.models.dto import WorkflowRunRecord
from app.services.workflow_backend_codex_delegate import execute_delegated_codex_backend


def _step_summary_lines(record: WorkflowRunRecord) -> list[str]:
    lines: list[str] = []
    for step_run in record.step_runs:
        line = f"- `{step_run.step_id}` `{step_run.status}` via `{step_run.backend}`"
        if step_run.summary:
            line = f"{line}: {step_run.summary}"
        lines.append(line)
    return lines


def _local_report(record: WorkflowRunRecord) -> str:
    last_message = ""
    if record.last_message_path:
        last_message_path = Path(record.last_message_path)
        if last_message_path.exists():
            last_message = last_message_path.read_text(encoding="utf-8").strip()

    changes_text = Path(record.changes_path).read_text(encoding="utf-8") if Path(record.changes_path).exists() else ""
    report_lines = [
        f"# Workflow Run {record.id}",
        "",
        f"Project: `{record.project_path}`",
        f"Status: `{record.status}`",
        f"Attempt count: `{record.attempt_count}`",
        f"Created at: `{record.created_at}`",
    ]
    if record.started_at:
        report_lines.append(f"Started at: `{record.started_at}`")
    if record.completed_at:
        report_lines.append(f"Completed at: `{record.completed_at}`")
    if record.cancel_requested_at:
        report_lines.append(f"Cancel requested at: `{record.cancel_requested_at}`")
    if record.cancelled_at:
        report_lines.append(f"Cancelled at: `{record.cancelled_at}`")
    report_lines.extend(
        [
            "",
            "## Task",
            "",
            record.task,
            "",
            "## Step Outcomes",
            "",
            *_step_summary_lines(record),
            "",
            "## Memory Recall",
            "",
            *(
                [f"- project: {entry.title} -> {entry.summary}" for entry in record.memory_context.recalled_project]
                or ["- No project memory recalled."]
            ),
            *(
                [f"- global: {entry.title} -> {entry.summary}" for entry in record.memory_context.recalled_global]
                or ["- No global memory recalled."]
            ),
            "",
            "## Planner Memory Guidance",
            "",
            *([f"- {item}" for item in record.memory_guidance.planner] or ["- No planner memory guidance was generated."]),
            "",
            "## Codex Final Message",
            "",
            last_message or "_No final Codex message was captured._",
            "",
            "## Change Summary",
            "",
            changes_text or "_No change summary available._",
            "",
            "## Reviewer Memory Checklist",
            "",
            *([f"- {item}" for item in record.memory_guidance.reviewer] or ["- No reviewer checklist was generated."]),
            "",
            "## Reporter Handoff Priorities",
            "",
            *([f"- {item}" for item in record.memory_guidance.reporter] or ["- No reporter priorities were generated."]),
            "",
            "## Memory Writes",
            "",
            *(
                [f"- project: {entry.title} -> {entry.summary}" for entry in record.memory_context.written_project]
                or ["- No project memory written yet."]
            ),
            *(
                [f"- global: {entry.title} -> {entry.summary}" for entry in record.memory_context.written_global]
                or ["- No global memory written yet."]
            ),
            "",
            "## Promoted Global Rules",
            "",
            *(
                [f"- {entry.title} -> {entry.summary}" for entry in record.memory_context.written_global if entry.entry_kind == "global_rule"]
                or ["- No reusable global rule was promoted from this run."]
            ),
            "",
            "## Warnings",
            "",
            *[f"- {warning}" for warning in record.warnings],
            "",
        ]
    )
    if record.error:
        report_lines.extend(["## Error", "", record.error, ""])

    Path(record.report_path).write_text("\n".join(report_lines), encoding="utf-8")
    return "Reporter backend updated the final handoff report with role-specific guidance, changes, and memory outcomes using the local fallback."


def _reporter_prompt(record: WorkflowRunRecord) -> str:
    return "\n".join(
        [
            "You are the reporter backend for an Agents Team workflow.",
            "Produce the final markdown handoff report for the run. Do not edit project files.",
            "Use the existing run artifacts, memory guidance, step outcomes, and recalled/written memory as your source material.",
            "",
            f"Run id: {record.id}",
            f"Task: {record.task}",
            "",
            "Planner guidance:",
            *([f"- {item}" for item in record.memory_guidance.planner] or ["- No planner guidance was generated."]),
            "",
            "Reviewer checklist:",
            *([f"- {item}" for item in record.memory_guidance.reviewer] or ["- No reviewer checklist was generated."]),
            "",
            "Reporter priorities:",
            *([f"- {item}" for item in record.memory_guidance.reporter] or ["- No reporter priorities were generated."]),
            "",
            "Output sections:",
            "- Task",
            "- Step Outcomes",
            "- Memory Recall",
            "- Codex Final Message",
            "- Change Summary",
            "- Memory Writes",
            "- Promoted Global Rules",
            "- Warnings",
        ]
    )


def execute_reporter_backend(
    record: WorkflowRunRecord,
    settings: Settings,
    should_cancel: Callable[[], bool],
    set_active_process: Callable[[subprocess.Popen[str] | None], None],
) -> str:
    return execute_delegated_codex_backend(
        record=record,
        settings=settings,
        backend_label="Reporter backend",
        artifact_path=Path(record.report_path),
        prompt=_reporter_prompt(record),
        should_cancel=should_cancel,
        set_active_process=set_active_process,
        fallback=lambda: _local_report(record),
    )
