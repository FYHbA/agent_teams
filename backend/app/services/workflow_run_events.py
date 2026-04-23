from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from fastapi import Request

from app.config import Settings
from app.services.workflow_run_store import get_workflow_run, read_workflow_run_log

STREAM_POLL_INTERVAL_SECONDS = 0.75
KEEPALIVE_INTERVAL_SECONDS = 15.0


def encode_sse_message(
    *,
    event: str,
    data: dict[str, Any],
    event_id: str | None = None,
) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    lines: list[str] = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event}")
    for line in payload.splitlines() or ["{}"]:
        lines.append(f"data: {line}")
    return "\n".join(lines) + "\n\n"


def build_workflow_run_event_payload(
    run_id: str,
    project_path_str: str | None,
    settings: Settings,
    *,
    tail_lines: int,
) -> dict[str, Any]:
    run = get_workflow_run(run_id, project_path_str, settings)
    log = read_workflow_run_log(run_id, project_path_str, settings, tail_lines=tail_lines)
    return {
        "run": run.model_dump(mode="json"),
        "log": log.model_dump(mode="json"),
        "terminal": run.status != "running",
    }


async def stream_workflow_run_events(
    run_id: str,
    project_path_str: str | None,
    settings: Settings,
    request: Request,
    *,
    tail_lines: int,
    poll_interval: float = STREAM_POLL_INTERVAL_SECONDS,
    keepalive_interval: float = KEEPALIVE_INTERVAL_SECONDS,
):
    sequence = 0
    last_signature: tuple[str, str, str] | None = None
    last_keepalive_at = time.monotonic()

    while True:
        if await request.is_disconnected():
            return

        payload = build_workflow_run_event_payload(
            run_id,
            project_path_str,
            settings,
            tail_lines=tail_lines,
        )
        run_payload = payload["run"]
        log_payload = payload["log"]
        signature = (
            str(run_payload.get("updated_at", "")),
            str(run_payload.get("status", "")),
            str(log_payload.get("content", "")),
        )

        if signature != last_signature:
            sequence += 1
            yield encode_sse_message(event="run_update", data=payload, event_id=str(sequence))
            last_signature = signature
            last_keepalive_at = time.monotonic()
            if payload["terminal"]:
                return
        elif time.monotonic() - last_keepalive_at >= keepalive_interval:
            sequence += 1
            yield encode_sse_message(
                event="keepalive",
                data={"run_id": run_id, "ts": time.time()},
                event_id=str(sequence),
            )
            last_keepalive_at = time.monotonic()

        await asyncio.sleep(poll_interval)
