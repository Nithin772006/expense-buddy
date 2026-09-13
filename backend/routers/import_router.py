"""
Import Router — FastAPI endpoints for the Transaction Import System.

Endpoints:
  POST /import/parse        → Parse file, return columns + preview rows + auto-mapping
  POST /import/parse-sheet  → Re-parse Excel with a selected sheet
  POST /import/confirm      → Normalize, deduplicate, ML, save to Supabase
  GET  /import/history      → List past imports for a user
"""

import json
import os
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

from services import import_service
from services.supabase_client import get_supabase_client, verify_access_token

router = APIRouter(prefix="/import", tags=["Import"])

# Max file size: 20 MB
MAX_FILE_SIZE = 20 * 1024 * 1024

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".pdf"}
ALLOWED_MIME_TYPES = {
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/pdf",
    "text/plain",          # some CSVs arrive as text/plain
    "application/octet-stream",  # generic binary fallback
}


def _validate_file(file: UploadFile, file_bytes: bytes):
    # Size check
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds the 20 MB limit.")
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    # Extension check
    name = file.filename or ""
    ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{ext}'. Please upload CSV, Excel (.xlsx/.xls), or PDF.",
        )


def get_current_auth(authorization: Optional[str] = Header(None)) -> tuple[str, str]:
    """
    Extract Bearer token from Authorization header and verify with Supabase Auth.
    Returns (user_id, token).
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header. Access token required."
        )
    token = authorization.split("Bearer ")[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty access token.")
    
    try:
        user_info = verify_access_token(token)
        return user_info["id"], token
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication error: {str(e)}")


def get_current_user_id(auth: tuple[str, str] = Depends(get_current_auth)) -> str:
    return auth[0]


# ── Schemas ──────────────────────────────────────────────────────────────────

class ConfirmImportRequest(BaseModel):
    user_id: Optional[str] = None  # Optional/ignored — server will enforce authenticated user's ID
    rows: list[dict]
    mapping: dict
    source: str
    filename: str
    file_type: str


class ImportHistoryRequest(BaseModel):
    user_id: Optional[str] = None


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/parse")
async def parse_file(
    file: UploadFile = File(...),
    file_type: str = Form("auto"),
):
    """
    Upload a file and get back:
    - columns (list of column names)
    - rows (first 50 for preview)
    - total_rows
    - auto_mapping (detected column → field mapping)
    - mapping_confident (bool)
    - sheet_names (Excel only)
    """
    file_bytes = await file.read()
    _validate_file(file, file_bytes)

    filename = file.filename or "upload"
    try:
        result = import_service.parse_file(file_bytes, filename, file_type)
        # Return preview_rows for UI and all rows for confirmation
        result["preview_rows"] = result["rows"][:50]
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse file: {str(e)}")


@router.post("/parse-sheet")
async def parse_excel_sheet(
    file: UploadFile = File(...),
    sheet_name: str = Form(...),
    file_type: str = Form("excel"),
):
    """Re-parse an Excel file selecting a specific sheet."""
    file_bytes = await file.read()
    _validate_file(file, file_bytes)
    filename = file.filename or "upload.xlsx"
    try:
        result = import_service.parse_file_with_sheet(
            file_bytes, filename, file_type, sheet_name
        )
        result["preview_rows"] = result["rows"][:50]
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse sheet: {str(e)}")


@router.post("/confirm")
async def confirm_import(
    request: ConfirmImportRequest,
    auth: tuple[str, str] = Depends(get_current_auth)
):
    """
    Confirm an import:
    - Extracts authenticated user_id from verified JWT Bearer token
    - Strictly ignores any client-supplied user_id in the request body
    - Normalizes, deduplicates, runs ML, saves to Supabase for authenticated user
    - Returns import summary
    """
    user_id, token = auth

    if not request.rows:
        raise HTTPException(status_code=400, detail="No rows provided to import.")

    if len(request.rows) > 50_000:
        raise HTTPException(
            status_code=400,
            detail="Too many rows (max 50,000 per import). Please split your file.",
        )

    try:
        # Pass verified user_id and token — request.user_id is completely ignored
        summary = import_service.confirm_import(
            user_id=user_id,
            rows=request.rows,
            mapping=request.mapping,
            source=request.source,
            filename=request.filename,
            file_type=request.file_type,
            token=token,
        )
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")


@router.get("/history")
@router.get("/history/{path_user_id}")
async def get_import_history(
    path_user_id: Optional[str] = None,
    auth: tuple[str, str] = Depends(get_current_auth)
):
    """
    Return list of past imports for the authenticated user.
    Uses Bearer token authentication so user_id cannot be spoofed.
    Blocks BOLA/IDOR if a caller tries to supply another user's ID in the path.
    """
    user_id, token = auth

    # IDOR / BOLA check: If path_user_id was explicitly provided, verify it matches auth user
    if path_user_id and path_user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: You are not authorized to view import history for another user."
        )

    try:
        client = get_supabase_client(token)
        response = (
            client
            .from_("transaction_imports")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return {"imports": response.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

