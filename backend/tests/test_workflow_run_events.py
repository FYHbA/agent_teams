from __future__ import annotations

import pytest

from app.models.dto import WorkflowRunCreateRequest
from app.services.workflow_run_events import (
    build_workflow_run_event_payload,
    encode_sse_message,
    stream_workflow_run_events,
)
from app.services.workflow_runs import create_workflow_run


class _NeverDisconnectRequest:
    async def is_disconnected(self) -> bool:
        return False


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def test_encode_sse_message_formats_event_payload() -> None:
    message = encode_sse_message(event="run_update", data={"status": "running"}, event_id="3")

    assert "id: 3" in message
    assert "event: run_update" in message
    assert 'data: {"status": "running"}' in message
    assert message.endswith("\n\n")


def test_build_workflow_run_event_payload_includes_run_and_log(test_settings, tmp_path) -> None:
    project_path = tmp_path / "repo"
    project_path.mkdir()

    record = create_workflow_run(
        WorkflowRunCreateRequest(
            task="Create an event payload for the current workflow run.",
            project_path=str(project_path),
        ),
        test_settings,
    )

    payload = build_workflow_run_event_payload(record.id, str(project_path), test_settings, tail_lines=200)
    assert payload["run"]["id"] == record.id
    assert payload["log"]["run_id"] == record.id
    assert payload["terminal"] is True


@pytest.mark.anyio
async def test_stream_workflow_run_events_emits_single_terminal_snapshot(test_settings, tmp_path) -> None:
    project_path = tmp_path / "repo"
    project_path.mkdir()

    record = create_workflow_run(
        WorkflowRunCreateRequest(
            task="Emit a terminal stream snapshot for a planned workflow run.",
            project_path=str(project_path),
        ),
        test_settings,
    )

    generator = stream_workflow_run_events(
        record.id,
        str(project_path),
        test_settings,
        _NeverDisconnectRequest(),
        tail_lines=200,
        poll_interval=0,
        keepalive_interval=60,
    )

    first = await anext(generator)
    assert "event: run_update" in first
    assert record.id in first

    with pytest.raises(StopAsyncIteration):
        await anext(generator)
