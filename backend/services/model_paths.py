"""Stable locations for the versioned ML model artifacts."""

from pathlib import Path


MODEL_DIR = Path(__file__).resolve().parents[1] / "models"


def model_path(*parts: str) -> Path:
    """Return an absolute path inside the backend model directory."""
    return MODEL_DIR.joinpath(*parts)
