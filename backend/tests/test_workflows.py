import json
from pathlib import Path

from app.config import get_settings
from app.models.dto import MemoryEntry, WorkflowPlanRequest
from app.services.workflow_memory import global_memory_path, project_memory_path
from app.services.workflows import build_workflow_plan


def test_workflow_plan_contains_core_roles() -> None:
    request = WorkflowPlanRequest(task="Debug the failing API route and add regression checks.")
    response = build_workflow_plan(request, get_settings())

    roles = {agent.role for agent in response.agents}
    assert "planner" in roles
    assert "coder" in roles
    assert "reviewer" in roles
    assert any(step.backend == "planner_backend" for step in response.steps)
    assert any(step.backend == "reviewer_backend" for step in response.steps)
    assert response.command_policy == "dangerous-commands-confirmed"
    assert response.outputs


def test_workflow_plan_uses_recalled_memory_to_shape_guidance(test_settings, tmp_path: Path) -> None:
    project_path = tmp_path / "repo"
    project_path.mkdir()

    project_memory_path(project_path).write_text(
        json.dumps(
            [
                MemoryEntry(
                    id="mem-project-1",
                    scope="project",
                    created_at="2026-04-22T10:00:00+00:00",
                    source_run_id="run-old-project",
                    attempt_count=1,
                    title="Prior reviewer miss",
                    summary="Regression checks were skipped after a routing refactor.",
                    details="Always verify routing regressions after changing API surfaces.",
                    tags=["review", "routing", "regression"],
                ).model_dump(mode="json")
            ],
            indent=2,
        ),
        encoding="utf-8",
    )
    global_memory_path(test_settings).write_text(
        json.dumps(
            [
                MemoryEntry(
                    id="mem-global-1",
                    scope="global",
                    entry_kind="global_rule",
                    source_step_id="verify",
                    step_status="completed",
                    created_at="2026-04-22T12:00:00+00:00",
                    source_run_id="run-old-global",
                    attempt_count=1,
                    title="Handoffs need continuity",
                    summary="Reporter should say whether current work updates prior decisions.",
                    details="Keep handoff notes explicit about what changed from prior memory.",
                    tags=["handoff", "reporter", "continuity"],
                ).model_dump(mode="json")
            ],
            indent=2,
        ),
        encoding="utf-8",
    )

    response = build_workflow_plan(
        WorkflowPlanRequest(
            task="Review the routing changes and produce a clean handoff.",
            project_path=str(project_path),
        ),
        test_settings,
    )

    assert response.memory_guidance.planner
    assert any("Apply reusable global rule" in item for item in response.memory_guidance.planner)
    assert response.memory_guidance.reviewer
    assert response.memory_guidance.reporter
    assert any(step.id == "research" for step in response.steps)
    assert "structured memory cue" in response.summary


def test_workflow_plan_builds_parallel_verify_wave_for_matrix_tasks() -> None:
    request = WorkflowPlanRequest(task="Compare multi-environment regressions and benchmark the build pipeline.")
    response = build_workflow_plan(request, get_settings())

    verify_steps = [step for step in response.steps if step.id.startswith("verify")]
    assert {step.id for step in verify_steps} == {"verify_tests", "verify_build"}
    assert all(step.execution == "parallel" for step in verify_steps)
    review_step = next(step for step in response.steps if step.id == "review")
    assert set(review_step.depends_on) == {"verify_tests", "verify_build"}


def test_workflow_plan_attaches_command_previews_for_verification_steps(tmp_path: Path, test_settings) -> None:
    project_path = tmp_path / "repo"
    project_path.mkdir()
    (project_path / "tests").mkdir()
    (project_path / "package.json").write_text(
        json.dumps(
            {
                "scripts": {
                    "build": "vite build",
                    "test": "vitest run",
                }
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    response = build_workflow_plan(
        WorkflowPlanRequest(
            task="Run regression tests and benchmark the build output.",
            project_path=str(project_path),
        ),
        test_settings,
    )

    verify_tests = next(step for step in response.steps if step.id == "verify_tests")
    verify_build = next(step for step in response.steps if step.id == "verify_build")
    assert [preview.label for preview in verify_tests.command_previews] == ["python -m pytest", "npm run test"]
    assert [preview.label for preview in verify_build.command_previews] == ["npm run build"]
