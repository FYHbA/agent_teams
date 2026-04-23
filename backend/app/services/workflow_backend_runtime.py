from __future__ import annotations

import json
import subprocess
import time
from collections.abc import Callable
from pathlib import Path

from app.models.dto import WorkflowRunRecord
from app.services.workflow_backend_exceptions import WorkflowCancellationRequested, WorkflowExecutionError
from app.services.workflow_run_store import append_log

POLL_INTERVAL_SECONDS = 0.25


def run_command(
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
                raise WorkflowCancellationRequested(f"Workflow execution was cancelled while running `{log_prefix}`.")

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                process.kill()
                stdout, stderr = process.communicate()
                raise WorkflowExecutionError(f"Command timed out after {timeout} seconds: {log_prefix}")

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


def _load_package_scripts(project_path: Path) -> dict[str, str]:
    package_json = project_path / "package.json"
    if not package_json.exists():
        return {}
    try:
        payload = json.loads(package_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    scripts = payload.get("scripts", {})
    if not isinstance(scripts, dict):
        return {}
    cleaned: dict[str, str] = {}
    for key, value in scripts.items():
        if isinstance(key, str) and isinstance(value, str):
            cleaned[key] = value
    return cleaned


def verification_commands(project_path: Path, *, focus: str = "all") -> list[tuple[str, list[str]]]:
    commands: list[tuple[str, list[str]]] = []

    has_python_tests = (project_path / "tests").exists() or (project_path / "pyproject.toml").exists()
    include_tests = focus in {"all", "tests"}
    include_build = focus in {"all", "build"}

    if has_python_tests and include_tests:
        commands.append(("python -m pytest", ["python", "-m", "pytest"]))

    scripts = _load_package_scripts(project_path)
    build_script = scripts.get("build")
    if build_script and include_build:
        commands.append(("npm run build", ["npm", "run", "build"]))

    test_script = scripts.get("test", "")
    lowered_test_script = test_script.lower()
    if include_tests and test_script and "no test specified" not in lowered_test_script and "exit 1" not in lowered_test_script:
        commands.append(("npm run test", ["npm", "run", "test"]))

    return commands
