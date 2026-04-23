# Agents Team

Agents Team is a local-first multi-agent code collaboration workbench.
It is designed to solve a gap in current Codex usage: multiple conversations can exist at once, but they do not naturally coordinate, share workflow state, or operate as an explicit team.

This repository contains the first product skeleton:

- A browser-based frontend for project switching, task drafting, and team-room style collaboration
- A FastAPI backend for orchestration, local filesystem access, and Codex integration scaffolding
- A foundation for project-local runtime state via `.agents-team/`

## Product direction

V1 is focused on code-task collaboration.

- Local-first
- Multi-project switching
- Strict workflow collaboration
- Auto-generated agent teams
- Direct file editing by agents
- Human-controlled Git actions
- Read-only Codex config visibility
- Codex session reuse where possible

## Repository layout

```text
frontend/   React + Vite workspace
backend/    FastAPI service and orchestration skeleton
docs/       Architecture and product notes
```

## Quick start

### Backend

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ./backend
uvicorn app.main:app --reload --app-dir backend
```

Linux/macOS:

```bash
python -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e ./backend
uvicorn app.main:app --reload --app-dir backend
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend uses relative `/api` requests in development.
Vite proxies those requests to the backend dev server.

### Dev Launcher

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev-up.ps1
powershell -ExecutionPolicy Bypass -File scripts/dev-status.ps1
powershell -ExecutionPolicy Bypass -File scripts/dev-down.ps1
```

## Current backend endpoints

- `GET /api/health`
- `GET /api/codex/summary`
- `GET /api/codex/capabilities`
- `GET /api/codex/sessions`
- `POST /api/codex/sessions/{session_id}/bridge`
- `GET /api/projects/discovered`
- `POST /api/projects/pick`
- `GET /api/projects/tree?path=<project-dir>`
- `GET /api/projects/runtime?path=<project-dir>`
- `POST /api/projects/runtime/init`
- `POST /api/projects/runtime/mirror`
- `POST /api/projects/runtime/export`
- `POST /api/projects/runtime/import`
- `POST /api/workflows/plan`
- `POST /api/workflows/runs`
- `GET /api/workflows/runs?project_path=<project-dir>`
- `GET /api/workflows/runs/{run_id}`
- `POST /api/workflows/runs/{run_id}/execute`
- `GET /api/workflows/runs/{run_id}/log`
- `GET /api/workflows/runs/{run_id}/artifacts`
- `GET /api/workflows/runs/{run_id}/events`
- `POST /api/workflows/runs/{run_id}/cancel`
- `POST /api/workflows/runs/{run_id}/approve-dangerous`
- `POST /api/workflows/runs/{run_id}/resume`
- `POST /api/workflows/runs/{run_id}/retry`
- `GET /api/workflows/runs/{run_id}/agent-sessions`
- `GET /api/workflows/queue`
- `POST /api/workflows/queue/{item_id}/cancel`
- `POST /api/workflows/queue/{item_id}/requeue`

## Local runtime state

The product is designed to create a hidden control directory inside managed user projects:

```text
<project>/.agents-team/
```

That directory is meant to hold:

- project-local metadata
- workflow runs
- reports
- artifact indexes
- project memory
- logs

The product itself may also use a global app home directory under the user's home directory.

Workflow runs now persist step-level execution state, attempt counts, cancellation metadata, logs, generated reports, artifact bundles, and a realtime event stream under the project-local runtime and HTTP API surface.
Workflow execution now enters a persistent global SQLite-backed run queue before worker execution, so queued/running items can be claimed safely across backend processes and recovered after a backend restart instead of depending only on the original request thread.
Run metadata, step ledger state, and cross-project run lookup metadata now also live in the same control-plane SQLite store instead of separate `run.json` and `run-index.json` files.
Runs now also recall project/global memory at creation time, inject that context into workflow execution, and write fresh handoff memory back on terminal states.
Queue items now carry worker ownership, heartbeats, and lease expiry so stuck claims can be detected and recovered safely.
Each workflow step now produces its own tracked agent-session record with backend identity, worker ownership, provider path, and lifecycle timestamps.
Workflow planning now includes explicit dependency edges between steps, and matrix-style tasks can execute verification waves in parallel before review and reporting rejoin the graph.
Parallel verification branches can now be emitted as separately claimed queue items so different workers inside the backend process can consume them concurrently instead of relying on one coordinator thread to execute the whole wave.
When a verification branch fails, the workflow can still carry partial success into review and report, with the final run marked failed after handoff artifacts are produced.
Project-local control-plane mirrors and export/import snapshots now let the global SQLite control state be copied into `.agents-team/` and restored later.
The frontend now supports bilingual UI text, a staged project -> build -> run -> diagnostics workflow, and a single-project path-first interaction model.
Project opening and switching are now more browser-friendly: the UI can read recent projects from the backend registry, preserve stage/project/run state in the URL, call a native folder picker on the backend host when available, and fall back to browsing the backend host filesystem when the environment does not support a native picker.
Planner, reviewer, and reporter guidance now derive directly from structured memory so continuity checks and handoff priorities stay visible across the full workflow.
Research and verify steps now write structured findings back into project memory, so later plans can recall concrete context and verification evidence instead of only final handoff summaries.
High-signal research and verify findings can now be promoted into reusable global rules, and future workflow planning will treat those rules as stronger cross-project guidance.
Planner, reviewer, and reporter now execute through distinct backend modules instead of sharing one generic step backend, and the cockpit surfaces those backend identities plus the planner's standalone planning brief artifact.
Those planner, reviewer, and reporter backends now attempt their own delegated non-interactive Codex execution chains first, with local fallback behavior preserved when Codex is unavailable.
Research and verify now follow the same pattern: each has its own delegated backend path, its own role-specific artifact, and a local fallback when Codex delegation is unavailable.
At this point the full strict workflow has explicit role-scoped backends for planner, research, implement, verify, review, and report, with execution coordinated by a persistent SQLite queue-backed worker inside the backend process and each step independently tracked as an agent session.
Runs that include command-backed steps now pause behind an explicit dangerous-command approval gate before execution, resume, or retry can proceed.

## Codex integration stance

The current plan is:

- Prefer Codex CLI and server-style integration where possible
- Reuse resumable sessions when stable enough
- Avoid making Codex internal session files the only source of truth
- Keep Codex config handling read-only in V1

More detail lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
