from __future__ import annotations

from pathlib import Path

from app.config import Settings
from app.services.workflow_runs import create_workflow_run, list_workflow_runs
from app.models.dto import WorkflowRunCreateRequest
from app.services.workflow_project_mirror import (
    export_project_control_plane,
    import_project_control_plane,
    mirror_project_control_plane,
)
from app.services.runtime import get_project_runtime, init_project_runtime


def test_project_runtime_init_creates_expected_layout(test_settings, tmp_path: Path) -> None:
    project_path = tmp_path / "demo-project"
    project_path.mkdir()

    missing = get_project_runtime(str(project_path), test_settings)
    assert missing.state == "missing"

    created = init_project_runtime(str(project_path), test_settings)
    assert created.state == "initialized"
    assert Path(created.runtime_path).exists()
    assert Path(created.settings_path).exists()

    expected_directories = {
        Path(created.runtime_path) / "runs",
        Path(created.runtime_path) / "reports",
        Path(created.runtime_path) / "artifacts",
        Path(created.runtime_path) / "memory",
        Path(created.runtime_path) / "logs",
    }
    assert all(directory.exists() for directory in expected_directories)

    existing = init_project_runtime(str(project_path), test_settings)
    assert existing.state == "existing"


def test_project_local_mirror_export_and_import_round_trip(test_settings, tmp_path: Path) -> None:
    project_path = tmp_path / "portable-project"
    project_path.mkdir()

    record = create_workflow_run(
        WorkflowRunCreateRequest(
            task="Create a portable project-local mirror of this workflow control plane.",
            project_path=str(project_path),
        ),
        test_settings,
    )

    mirrored = mirror_project_control_plane(str(project_path), test_settings)
    assert Path(mirrored.path).exists()
    exported = export_project_control_plane(str(project_path), test_settings)
    assert Path(exported.path).exists()

    imported_settings = Settings(
        app_name=test_settings.app_name,
        api_prefix=test_settings.api_prefix,
        cors_origins=test_settings.cors_origins,
        codex_home=test_settings.codex_home,
        agents_team_home=tmp_path / ".imported-agents-team-home",
        default_allow_network=test_settings.default_allow_network,
        default_allow_installs=test_settings.default_allow_installs,
        default_confirm_dangerous_commands=test_settings.default_confirm_dangerous_commands,
        workflow_worker_count=test_settings.workflow_worker_count,
    )

    imported = import_project_control_plane(str(project_path), imported_settings, path_str=exported.path)
    assert imported.run_count >= 1
    imported_runs = list_workflow_runs(str(project_path), imported_settings)
    assert any(run.id == record.id for run in imported_runs)
