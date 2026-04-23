from __future__ import annotations

import subprocess
import time
from collections.abc import Callable
from pathlib import Path

from app.config import Settings
from app.models.dto import WorkflowRunRecord
from app.services.workflow_agent_sessions import set_agent_runtime_metadata
from app.services.workflow_backend_exceptions import WorkflowCancellationRequested, WorkflowExecutionError
from app.services.codex import get_codex_capabilities
from app.services.workflow_run_store import append_log, trim_summary

DELEGATED_BACKEND_TIMEOUT_SECONDS = 60 * 12
POLL_INTERVAL_SECONDS = 0.25


def _run_delegated_command(
    argv: list[str],
    *,
    cwd: str,
    timeout: int,
    log_prefix: str,
    record: WorkflowRunRecord,
    should_cancel: Callable[[], bool],
    set_active_process: Callable[[subprocess.Popen[str] | None], None],
) -> subprocess.CompletedProcess[str]:
    append_log(record, f"{log_prefix}: {' '.join(argv)}")
    try:
        process = subprocess.Popen(
            argv,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError as exc:
        raise WorkflowExecutionError(f"Command not found: {argv[0]}") from exc

    set_active_process(process)
    stdout = ""
    stderr = ""
    deadline = time.monotonic() + timeout

    try:
        while True:
            if should_cancel():
                process.terminate()
                try:
                    stdout, stderr = process.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    stdout, stderr = process.communicate()
                raise WorkflowCancellationRequested(f"Delegated backend execution was cancelled while running `{log_prefix}`.")

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                process.kill()
                stdout, stderr = process.communicate()
                raise WorkflowExecutionError(f"Delegated backend command timed out after {timeout} seconds: {log_prefix}")

            try:
                stdout, stderr = process.communicate(timeout=min(POLL_INTERVAL_SECONDS, remaining))
                break
            except subprocess.TimeoutExpired:
                continue
    finally:
        set_active_process(None)
        if stdout.strip():
            append_log(record, f"{log_prefix} stdout:\n{stdout.rstrip()}")
        if stderr.strip():
            append_log(record, f"{log_prefix} stderr:\n{stderr.rstrip()}")

    return subprocess.CompletedProcess(argv, process.returncode, stdout, stderr)


def execute_delegated_codex_backend(
    *,
    record: WorkflowRunRecord,
    settings: Settings,
    backend_label: str,
    artifact_path: Path,
    prompt: str,
    should_cancel: Callable[[], bool],
    set_active_process: Callable[[subprocess.Popen[str] | None], None],
    fallback: Callable[[], str],
) -> str:
    capabilities = get_codex_capabilities(settings)
    if not capabilities.codex_cli_available:
        append_log(record, f"{backend_label} delegated backend falling back to local execution because Codex CLI is unavailable.")
        set_agent_runtime_metadata(provider=f"{backend_label.lower().replace(' ', '_')}_local_fallback")
        return fallback()

    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    argv = [
        "codex",
        "exec",
        "-C",
        record.project_path,
        "-s",
        "read-only",
        "--skip-git-repo-check",
        "--json",
        "-o",
        str(artifact_path),
        prompt,
    ]

    try:
        completed = _run_delegated_command(
            argv,
            cwd=record.project_path,
            timeout=DELEGATED_BACKEND_TIMEOUT_SECONDS,
            log_prefix=f"{backend_label}-delegated",
            record=record,
            should_cancel=should_cancel,
            set_active_process=set_active_process,
        )
    except WorkflowCancellationRequested:
        raise
    except Exception as exc:  # noqa: BLE001
        append_log(record, f"{backend_label} delegated backend failed and is falling back to local execution: {exc}")
        set_agent_runtime_metadata(provider=f"{backend_label.lower().replace(' ', '_')}_local_fallback")
        return fallback()

    if completed.returncode != 0 or not artifact_path.exists():
        append_log(
            record,
            f"{backend_label} delegated backend returned exit code {completed.returncode}; falling back to local execution.",
        )
        set_agent_runtime_metadata(provider=f"{backend_label.lower().replace(' ', '_')}_local_fallback")
        return fallback()

    set_agent_runtime_metadata(
        provider=f"{backend_label.lower().replace(' ', '_')}_delegated_codex",
        session_ref=str(artifact_path),
    )
    artifact_excerpt = trim_summary(artifact_path.read_text(encoding="utf-8").strip(), limit=180) or artifact_path.name
    return f"{backend_label} delegated to Codex and produced `{artifact_path.name}`. {artifact_excerpt}"
