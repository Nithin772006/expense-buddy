"""
Import Service — orchestrates the full import pipeline:
  Parse → Normalize → Validate → Deduplicate → Save → ML Processing
"""

import os
import traceback
from datetime import datetime, timezone
from typing import Optional

from supabase import create_client, Client
from dotenv import load_dotenv

from parsers.csv_parser import parse_csv
from parsers.excel_parser import parse_excel
from parsers.pdf_parser import parse_pdf
from services.normalizer import normalize_row, detect_column_mapping
from services.duplicate_detector import (
    build_duplicate_set,
    is_duplicate,
    mark_as_inserted,
)
from services import classification_service, anomaly_service
from services.supabase_client import get_supabase_client


# ── Parse stage (returns preview data without saving) ──────────────────────

def parse_file(file_bytes: bytes, filename: str, file_type: str) -> dict:
    """
    Parse an uploaded file and return raw parsed data + auto-detected mapping.
    Does NOT write to the database.
    """
    filename_lower = filename.lower()

    if file_type == "csv" or filename_lower.endswith(".csv"):
        parsed = parse_csv(file_bytes)
        source = "csv"
    elif file_type in ("excel", "xlsx", "xls") or filename_lower.endswith((".xlsx", ".xls")):
        parsed = parse_excel(file_bytes, filename)
        source = "excel"
    elif file_type == "pdf" or filename_lower.endswith(".pdf"):
        parsed = parse_pdf(file_bytes)
        source = "pdf"
    else:
        raise ValueError(
            f"Unsupported file type: '{filename}'. "
            "Please upload a CSV, Excel (.xlsx/.xls), or PDF file."
        )

    columns = parsed["columns"]
    rows = parsed["rows"]
    auto_mapping = detect_column_mapping(columns)

    # Check if critical fields were detected
    has_date   = auto_mapping.get("date") is not None
    has_amount = (
        auto_mapping.get("amount") is not None
        or auto_mapping.get("debit") is not None
        or auto_mapping.get("credit") is not None
    )
    has_desc = auto_mapping.get("description") is not None
    mapping_confident = has_date and has_amount and has_desc

    return {
        "columns": columns,
        "rows": rows,
        "total_rows": parsed["total_rows"],
        "auto_mapping": auto_mapping,
        "mapping_confident": mapping_confident,
        "source": source,
        # Include extra info for Excel multi-sheet
        "sheet_names": parsed.get("sheet_names"),
        "selected_sheet": parsed.get("selected_sheet"),
    }


def parse_file_with_sheet(
    file_bytes: bytes, filename: str, file_type: str, sheet_name: str
) -> dict:
    """Re-parse an Excel file with a specific sheet selected."""
    parsed = parse_excel(file_bytes, filename, sheet_name)
    columns = parsed["columns"]
    auto_mapping = detect_column_mapping(columns)
    has_date   = auto_mapping.get("date") is not None
    has_amount = (
        auto_mapping.get("amount") is not None
        or auto_mapping.get("debit") is not None
        or auto_mapping.get("credit") is not None
    )
    has_desc = auto_mapping.get("description") is not None
    mapping_confident = has_date and has_amount and has_desc

    return {
        "columns": columns,
        "rows": parsed["rows"],
        "total_rows": parsed["total_rows"],
        "auto_mapping": auto_mapping,
        "mapping_confident": mapping_confident,
        "source": "excel",
        "sheet_names": parsed.get("sheet_names"),
        "selected_sheet": parsed.get("selected_sheet"),
    }


# ── Normalize + Validate stage ──────────────────────────────────────────────

def normalize_rows(rows: list[dict], mapping: dict, source: str) -> tuple[list, list]:
    """
    Attempt to normalize every row.
    Returns (valid_rows, error_rows).
    valid_rows: list of normalized dicts
    error_rows: list of {row_index, raw_row, error}
    """
    valid = []
    errors = []
    for idx, row in enumerate(rows):
        try:
            normalized = normalize_row(row, mapping, source)
            valid.append(normalized)
        except ValueError as e:
            errors.append({
                "row_index": idx + 1,
                "raw": {k: str(v) for k, v in row.items()},
                "error": str(e),
            })
    return valid, errors


# ── ML Processing ────────────────────────────────────────────────────────────

def _run_ml(tx: dict) -> dict:
    """
    Run classification and anomaly detection on a normalized transaction.
    Returns updated dict with category, is_anomaly filled in.
    """
    # Classification with confidence
    try:
        category, confidence = classification_service.predict_with_confidence(tx["description"])
        tx["category"] = category
        tx["classification_confidence"] = confidence
    except Exception:
        tx["category"] = "Uncategorized"
        tx["classification_confidence"] = None


    # Anomaly detection — build required feature dict
    amount = float(tx["amount"])
    balance = float(tx["account_balance"]) if tx.get("account_balance") else amount * 5

    anomaly_features = {
        "transaction_amount": amount,
        "account_balance":    balance,
        "credit_score":       700.0,        # default for imported txs
        "has_loan":           0,
        "emi_amount":         0.0,
        "transaction_hour":   12,
        "amount_balance_ratio": amount / balance if balance > 0 else 0.0,
        "emi_balance_ratio":    0.0,
        "previous_transaction_count": 10,
        "customer_previous_avg_amount": amount,
        "amount_vs_customer_average":  1.0,
        "customer_amount_std":         amount * 0.1,
        "customer_amount_zscore":      0.0,
    }
    try:
        anomaly_result = anomaly_service.predict(anomaly_features)
        tx["is_anomaly"] = anomaly_result.get("is_anomaly", False)
    except Exception:
        tx["is_anomaly"] = False

    return tx


# ── Confirm + Save stage ────────────────────────────────────────────────────

def confirm_import(
    user_id: str,
    rows: list[dict],
    mapping: dict,
    source: str,
    filename: str,
    file_type: str,
    token: Optional[str] = None,
) -> dict:
    """
    Full pipeline: normalize → deduplicate → ML → batch save to Supabase.
    Enforces user_id derived strictly from the authenticated session.
    Returns import summary.
    """
    client = get_supabase_client(token)

    # 1. Create import record
    import_record = (
        client
        .from_("transaction_imports")
        .insert({
            "user_id":   user_id,
            "file_name": filename,
            "file_type": file_type,
            "status":    "processing",
        })
        .execute()
    )
    import_id = import_record.data[0]["id"]

    # 2. Normalize rows
    valid_rows, error_rows = normalize_rows(rows, mapping, source)

    # 3. Build duplicate set from existing data for this authenticated user
    existing_set = build_duplicate_set(user_id, token)

    # 4. Separate duplicates, run ML on non-duplicates, batch insert
    to_insert = []
    duplicate_rows = []
    batch_errors = []

    for tx in valid_rows:
        if is_duplicate(tx, existing_set):
            duplicate_rows.append(tx)
            continue

        # Run ML
        try:
            tx = _run_ml(tx)
        except Exception as e:
            batch_errors.append({"error": f"ML processing failed: {e}", "tx": str(tx)})
            continue

        # Attach metadata
        tx["user_id"]          = user_id
        tx["source_import_id"] = import_id
        to_insert.append(tx)

        # Mark as seen to handle intra-batch duplicates
        mark_as_inserted(tx, existing_set)

    # 5. Batch insert in chunks of 100
    inserted_count = 0
    BATCH_SIZE = 100
    for i in range(0, len(to_insert), BATCH_SIZE):
        batch = to_insert[i : i + BATCH_SIZE]
        try:
            client.from_("transactions").insert(batch).execute()
            inserted_count += len(batch)
        except Exception as e:
            batch_errors.append({
                "error": f"Database insert failed for batch {i//BATCH_SIZE}: {str(e)}",
                "count": len(batch),
            })

    # 6. Update import record with final status
    total_failed = len(error_rows) + len(batch_errors)
    client.from_("transaction_imports").update({
        "status":          "completed",
        "total_rows":      len(rows),
        "successful_rows": inserted_count,
        "failed_rows":     total_failed,
        "duplicate_rows":  len(duplicate_rows),
        "imported_at":     datetime.now(timezone.utc).isoformat(),
        "error_summary": {
            "parse_errors":    error_rows[:20],   # cap for storage
            "process_errors":  batch_errors[:20],
        } if (error_rows or batch_errors) else None,
    }).eq("id", import_id).execute()

    # 7. Refresh user ML profile (cluster & forecast)
    try:
        from services import ml_service
        ml_service.update_user_ml_profile(user_id=user_id, token=token)
    except Exception:
        pass

    return {
        "import_id":       import_id,
        "total_rows":      len(rows),
        "successful_rows": inserted_count,
        "duplicate_rows":  len(duplicate_rows),
        "failed_rows":     total_failed,
        "error_summary":   error_rows[:20] + batch_errors[:20],
        "status":          "completed",
    }

