from __future__ import annotations


class WorkflowExecutionError(RuntimeError):
    """Raised when a workflow step cannot complete successfully."""


class WorkflowCancellationRequested(RuntimeError):
    """Raised when a workflow run is cancelled while a step is executing."""
