from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.models.dto import (
    CodexSummaryResponse,
)
from app.services.codex import (
    get_codex_summary,
)

router = APIRouter(prefix="/codex", tags=["codex"])


@router.get("/summary", response_model=CodexSummaryResponse)
def read_codex_summary(settings: Settings = Depends(get_settings)) -> CodexSummaryResponse:
    return get_codex_summary(settings)
