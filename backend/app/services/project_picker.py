from __future__ import annotations

from fastapi import HTTPException

from app.models.dto import ProjectPickResponse


def project_picker_available() -> bool:
    try:
        import tkinter  # noqa: F401
    except Exception:  # noqa: BLE001
        return False
    return True


def pick_project_directory() -> ProjectPickResponse:
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="Native folder picker is unavailable in this environment.") from exc

    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askdirectory(title="Select a project folder")
        root.destroy()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="Failed to open the native folder picker.") from exc

    return ProjectPickResponse(path=selected or None)
