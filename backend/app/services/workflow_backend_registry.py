from __future__ import annotations

from typing import Literal

WorkflowBackendId = Literal[
    "planner_backend",
    "research_backend",
    "codex_backend",
    "verify_backend",
    "reviewer_backend",
    "reporter_backend",
]

STEP_BACKEND_BY_ID: dict[str, WorkflowBackendId] = {
    "plan": "planner_backend",
    "research": "research_backend",
    "implement": "codex_backend",
    "verify": "verify_backend",
    "review": "reviewer_backend",
    "report": "reporter_backend",
}


def step_family(step_id: str) -> str:
    family = step_id.split("_", 1)[0]
    if family in STEP_BACKEND_BY_ID:
        return family
    return step_id


def backend_for_step(step_id: str) -> WorkflowBackendId:
    return STEP_BACKEND_BY_ID.get(step_family(step_id), "planner_backend")
