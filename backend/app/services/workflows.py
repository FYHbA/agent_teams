from __future__ import annotations

from pathlib import Path

from app.config import Settings
from app.models.dto import AgentCard, WorkflowMemoryContext, WorkflowPlanRequest, WorkflowPlanResponse, WorkflowStep
from app.services.workflow_backend_registry import backend_for_step
from app.services.runtime import get_project_runtime
from app.services.workflow_memory import build_memory_context, build_role_memory_guidance


def _task_lower(task: str) -> str:
    return task.strip().lower()


def _needs_research(task: str, *, has_memory_context: bool) -> bool:
    keywords = {"investigate", "debug", "analyze", "compare", "research", "design", "plan"}
    return has_memory_context or any(keyword in task for keyword in keywords)


def _needs_parallel_checks(task: str) -> bool:
    keywords = {"test", "benchmark", "compare", "regression", "multi", "matrix"}
    return any(keyword in task for keyword in keywords)


def _build_agents(task: str, *, has_memory_context: bool) -> list[AgentCard]:
    agents = [
        AgentCard(
            name="Planner",
            role="planner",
            reason="Translates the task into a strict workflow and chooses serial or parallel paths.",
        ),
    ]
    if _needs_research(task, has_memory_context=has_memory_context):
        agents.append(
            AgentCard(
                name="Researcher",
                role="researcher",
                reason="Inspects code, docs, and local context before implementation begins.",
            )
        )
    agents.extend(
        [
            AgentCard(
                name="Coder",
                role="coder",
                reason="Edits files directly and produces the primary implementation.",
            ),
            AgentCard(
                name="Runner",
                role="runner/tester",
                reason="Runs tests, experiments, installs, and command-line checks under policy control.",
            ),
            AgentCard(
                name="Reviewer",
                role="reviewer",
                reason="Checks for regressions, missing edge cases, and workflow completeness.",
            ),
            AgentCard(
                name="Summarizer",
                role="summarizer",
                reason="Produces the final report, artifact summary, and reproducibility notes.",
            ),
        ]
    )
    return agents


def _build_steps(task: str, confirm_dangerous: bool, *, has_memory_context: bool) -> list[WorkflowStep]:
    parallel_checks = _needs_parallel_checks(task)
    steps = [
        WorkflowStep(
            id="plan",
            title="Plan the run",
            agent_role="planner",
            backend=backend_for_step("plan"),
            execution="serial",
            goal=(
                "Break the request into explicit stages, approvals, artifact expectations, and continuity notes from memory."
                if has_memory_context
                else "Break the request into explicit stages, approvals, and artifact expectations."
            ),
            depends_on=[],
        )
    ]
    implementation_dependency = "plan"
    if _needs_research(task, has_memory_context=has_memory_context):
        steps.append(
            WorkflowStep(
                id="research",
                title="Inspect code and context",
                agent_role="researcher",
                backend=backend_for_step("research"),
                execution="serial",
                goal=(
                    "Collect enough context to avoid blind edits, validate recalled memory, and identify the likely execution path."
                    if has_memory_context
                    else "Collect enough context to avoid blind edits and identify the likely execution path."
                ),
                depends_on=["plan"],
            )
        )
        implementation_dependency = "research"
    steps.append(
        WorkflowStep(
            id="implement",
            title="Edit files directly",
            agent_role="coder",
            backend=backend_for_step("implement"),
            execution="serial",
            goal="Make the requested code changes in the target project.",
            depends_on=[implementation_dependency],
        )
    )
    review_dependencies: list[str]
    if parallel_checks:
        verify_steps = [
            WorkflowStep(
                id="verify_tests",
                title="Run regression tests",
                agent_role="runner/tester",
                backend=backend_for_step("verify_tests"),
                execution="parallel",
                goal="Run automated tests and regression-focused checks for the task.",
                depends_on=["implement"],
                allow_failed_dependencies=False,
                requires_confirmation=confirm_dangerous,
            ),
            WorkflowStep(
                id="verify_build",
                title="Run build and matrix checks",
                agent_role="runner/tester",
                backend=backend_for_step("verify_build"),
                execution="parallel",
                goal="Run build, benchmark, compare, or matrix-style checks when available.",
                depends_on=["implement"],
                allow_failed_dependencies=False,
                requires_confirmation=confirm_dangerous,
            ),
        ]
        steps.extend(verify_steps)
        review_dependencies = [step.id for step in verify_steps]
    else:
        steps.append(
            WorkflowStep(
                id="verify",
                title="Run checks and experiments",
                agent_role="runner/tester",
                backend=backend_for_step("verify"),
                execution="serial",
                goal="Run the appropriate tests, scripts, or experiment commands for the task.",
                depends_on=["implement"],
                allow_failed_dependencies=False,
                requires_confirmation=confirm_dangerous,
            )
        )
        review_dependencies = ["verify"]
    steps.append(
        WorkflowStep(
            id="review",
            title="Review the result",
            agent_role="reviewer",
            backend=backend_for_step("review"),
            execution="serial",
            goal=(
                "Inspect output quality, regressions, recalled-memory commitments, and missing edge cases before final handoff."
                if has_memory_context
                else "Inspect output quality, regressions, and missing edge cases before final handoff."
            ),
            depends_on=review_dependencies,
            allow_failed_dependencies=True,
        )
    )
    steps.append(
        WorkflowStep(
            id="report",
            title="Produce handoff report",
            agent_role="summarizer",
            backend=backend_for_step("report"),
            execution="serial",
            goal=(
                "Summarize changes, results, follow-ups, recalled memory updates, and reproducible commands without auto-committing Git."
                if has_memory_context
                else "Summarize changes, results, follow-ups, and reproducible commands without auto-committing Git."
            ),
            depends_on=["review"],
            allow_failed_dependencies=False,
        )
    )
    return steps


def _resolve_memory_context(request: WorkflowPlanRequest, settings: Settings, memory_context: WorkflowMemoryContext | None) -> WorkflowMemoryContext | None:
    if memory_context is not None:
        return memory_context
    if not request.project_path:
        return None

    runtime = get_project_runtime(request.project_path, settings)
    return build_memory_context(
        request.project_path,
        request.task,
        settings,
        global_enabled=runtime.policy.global_memory_enabled,
    )


def build_workflow_plan(
    request: WorkflowPlanRequest,
    settings: Settings,
    *,
    memory_context: WorkflowMemoryContext | None = None,
) -> WorkflowPlanResponse:
    task = _task_lower(request.task)
    project_name = Path(request.project_path).name if request.project_path else "workspace"
    allow_network = settings.default_allow_network if request.allow_network is None else request.allow_network
    allow_installs = settings.default_allow_installs if request.allow_installs is None else request.allow_installs
    resolved_memory_context = _resolve_memory_context(request, settings, memory_context)
    has_memory_context = bool(
        resolved_memory_context
        and (resolved_memory_context.recalled_project or resolved_memory_context.recalled_global)
    )
    memory_guidance = build_role_memory_guidance(resolved_memory_context) if resolved_memory_context else build_role_memory_guidance(
        WorkflowMemoryContext(project_memory_path="", global_memory_path=None)
    )
    team_name = f"{project_name}-task-force"
    warnings = [
        "Codex session continuation is still treated as an adapter-level capability and may depend on CLI behavior.",
        "Dangerous commands should require explicit confirmation before execution.",
        "Workflow output should stop at file changes and reports. Git commit and push stay manual in V1.",
    ]

    if not allow_network:
        warnings.append("Network access is disabled for this draft, so remote search and package fetches should be skipped.")
    if not allow_installs:
        warnings.append("Package installation is disabled for this draft, so dependency fixes must avoid install steps.")
    if has_memory_context:
        warnings.append("Planner memory recall is active for this run, so reviewer/reporter continuity checks should stay in scope.")

    return WorkflowPlanResponse(
        team_name=team_name,
        summary=(
            "A strict multi-agent workflow optimized for code tasks. "
            "The planner owns sequencing, the coder edits files, the runner verifies, "
            "the reviewer checks risk, and the summarizer closes the loop."
            + (
                f" The plan is carrying forward {len(memory_guidance.planner)} structured memory cue(s)."
                if has_memory_context
                else ""
            )
        ),
        project_path=request.project_path,
        allow_network=allow_network,
        allow_installs=allow_installs,
        command_policy="dangerous-commands-confirmed",
        agents=_build_agents(task, has_memory_context=has_memory_context),
        steps=_build_steps(task, confirm_dangerous=settings.default_confirm_dangerous_commands, has_memory_context=has_memory_context),
        memory_guidance=memory_guidance,
        outputs=[
            "direct file changes",
            "verification logs",
            "task report",
            "conversation notes",
            "reproducible command list",
            "memory handoff entry",
        ],
        warnings=warnings,
    )
