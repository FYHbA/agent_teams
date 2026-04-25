from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings
from app.models.dto import (
    DiscoveredProject,
    ProjectCapabilitiesResponse,
    ProjectPickResponse,
    ProjectRootsResponse,
    RecentProjectRecord,
    WorkspaceOpenRequest,
    WorkspaceRecord,
    ProjectRuntimeMirrorRequest,
    ProjectRuntimeMirrorResponse,
    ProjectRuntimeRequest,
    ProjectRuntimeResponse,
    ProjectTreeResponse,
)
from app.services.project_picker import pick_project_directory, project_picker_available
from app.services.projects import discover_projects, list_directory, list_project_roots
from app.services.runtime import get_project_runtime, init_project_runtime, list_recent_projects
from app.services.workspace_registry import upsert_workspace
from app.services.workflow_project_mirror import (
    export_project_control_plane,
    import_project_control_plane,
    mirror_project_control_plane,
)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/discovered", response_model=list[DiscoveredProject])
def read_discovered_projects(settings: Settings = Depends(get_settings)) -> list[DiscoveredProject]:
    return discover_projects(settings)


@router.get("/roots", response_model=ProjectRootsResponse)
def read_project_roots() -> ProjectRootsResponse:
    return list_project_roots()


@router.get("/recent", response_model=list[RecentProjectRecord])
def read_recent_projects(settings: Settings = Depends(get_settings)) -> list[RecentProjectRecord]:
    return list_recent_projects(settings)


@router.post("/workspaces/open", response_model=WorkspaceRecord)
def open_workspace(
    request: WorkspaceOpenRequest,
    settings: Settings = Depends(get_settings),
) -> WorkspaceRecord:
    return upsert_workspace(
        request.project_path,
        settings,
        name=request.name,
        alias=request.alias,
        source=request.source,
        trusted=True,
        mark_opened=True,
    )


@router.get("/capabilities", response_model=ProjectCapabilitiesResponse)
def read_project_capabilities() -> ProjectCapabilitiesResponse:
    return ProjectCapabilitiesResponse(native_picker_available=project_picker_available())


@router.get("/tree", response_model=ProjectTreeResponse)
def read_project_tree(
    path: str = Query(..., description="Absolute path to inspect."),
    depth: int = Query(default=1, ge=1, le=3),
) -> ProjectTreeResponse:
    return list_directory(path, depth=depth)


@router.get("/runtime", response_model=ProjectRuntimeResponse)
def read_project_runtime(
    path: str = Query(..., description="Absolute path to the managed project."),
    settings: Settings = Depends(get_settings),
) -> ProjectRuntimeResponse:
    return get_project_runtime(path, settings)


@router.post("/pick", response_model=ProjectPickResponse)
def pick_project() -> ProjectPickResponse:
    return pick_project_directory()


@router.post("/runtime/init", response_model=ProjectRuntimeResponse)
def create_project_runtime(
    request: ProjectRuntimeRequest,
    settings: Settings = Depends(get_settings),
) -> ProjectRuntimeResponse:
    return init_project_runtime(request.project_path, settings)


@router.post("/runtime/mirror", response_model=ProjectRuntimeMirrorResponse)
def mirror_project_runtime_control_plane(
    request: ProjectRuntimeMirrorRequest,
    settings: Settings = Depends(get_settings),
) -> ProjectRuntimeMirrorResponse:
    return mirror_project_control_plane(request.project_path, settings)


@router.post("/runtime/export", response_model=ProjectRuntimeMirrorResponse)
def export_project_runtime_control_plane(
    request: ProjectRuntimeMirrorRequest,
    settings: Settings = Depends(get_settings),
) -> ProjectRuntimeMirrorResponse:
    return export_project_control_plane(request.project_path, settings, path_str=request.path)


@router.post("/runtime/import", response_model=ProjectRuntimeMirrorResponse)
def import_project_runtime_control_plane(
    request: ProjectRuntimeMirrorRequest,
    settings: Settings = Depends(get_settings),
) -> ProjectRuntimeMirrorResponse:
    return import_project_control_plane(request.project_path, settings, path_str=request.path)
