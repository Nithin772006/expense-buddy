"""
Excel Parser — reads .xlsx / .xls files using the intelligent Table Detector.
Supports multi-sheet workbooks, automatic sheet selection, header row detection,
and robust data normalization.
"""

import io
import logging
from typing import Optional
import openpyxl
import xlrd

from parsers.table_detector import detect_transaction_table, select_best_sheet, format_cell_value

logger = logging.getLogger("expense_buddy.excel_parser")


def _read_xlsx_sheet_rows(ws) -> list[list]:
    """Read all rows as raw values from an openpyxl worksheet."""
    all_rows = []
    for row in ws.iter_rows(values_only=True):
        all_rows.append(list(row))
    return all_rows


def _read_xls_sheet_rows(ws, wb) -> list[list]:
    """Read all rows as raw values from an xlrd sheet, converting date serials."""
    all_rows = []
    for i in range(ws.nrows):
        row = []
        for j in range(ws.ncols):
            cell = ws.cell(i, j)
            if cell.ctype == xlrd.XL_CELL_DATE:
                try:
                    dt = xlrd.xldate_as_datetime(cell.value, wb.datemode)
                    row.append(dt.date())
                except Exception:
                    row.append(cell.value)
            else:
                row.append(cell.value)
        all_rows.append(row)
    return all_rows


def parse_excel(file_bytes: bytes, filename: str, sheet_name: Optional[str] = None) -> dict:
    """
    Parse an Excel file (.xlsx or .xls) dynamically using the Table Detector.

    Returns:
      {
        "sheet_names": list[str],
        "selected_sheet": str,
        "header_row": int,
        "header_index": int,
        "confidence": float,
        "columns": list[str],
        "detected_columns": dict[str, str],
        "rows": list[dict],
        "total_rows": int,
        "table_detected": bool,
      }
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("xlsx", "xls"):
        raise ValueError(f"Unsupported Excel format: .{ext}")

    logger.info("[ExcelParser] File received: %s", filename)

    # 1. Load workbook and get sheet names
    sheet_readers = {}
    if ext == "xlsx":
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        sheet_names = wb.sheetnames
        for s in sheet_names:
            sheet_readers[s] = lambda name=s: _read_xlsx_sheet_rows(wb[name])
    else:
        wb = xlrd.open_workbook(file_contents=file_bytes)
        sheet_names = wb.sheet_names()
        for s in sheet_names:
            sheet_readers[s] = lambda name=s: _read_xls_sheet_rows(wb.sheet_by_name(name), wb)

    if not sheet_names:
        raise ValueError("Excel file contains no worksheets.")

    logger.info("[ExcelParser] Sheets detected: %s", ", ".join(sheet_names))

    # 2. Select sheet
    candidates = []
    if sheet_name:
        if sheet_name not in sheet_names:
            raise ValueError(f"Sheet '{sheet_name}' not found. Available sheets: {sheet_names}")
        logger.info("[ExcelParser] Scanning specified sheet: %s", sheet_name)
        rows = sheet_readers[sheet_name]()
        res = detect_transaction_table(rows, sheet_name=sheet_name)
        selected_res = res
    elif len(sheet_names) == 1:
        s = sheet_names[0]
        logger.info("[ExcelParser] Scanning sheet: %s", s)
        rows = sheet_readers[s]()
        selected_res = detect_transaction_table(rows, sheet_name=s)
    else:
        # Multi-sheet workbook: scan all sheets and choose the best match
        for s in sheet_names:
            logger.info("[ExcelParser] Scanning sheet: %s", s)
            rows = sheet_readers[s]()
            res = detect_transaction_table(rows, sheet_name=s)
            candidates.append(res)
        selected_res = select_best_sheet(candidates)

    selected_sheet = selected_res["sheet"] or sheet_names[0]

    # 3. Log structured detection details
    logger.info("[ExcelParser] Selected sheet: %s", selected_sheet)
    if selected_res.get("detected"):
        det_cols = selected_res.get("detected_columns", {})
        conf_pct = int(selected_res.get("confidence", 0.0) * 100)
        logger.info("[ExcelParser] Candidate header row: %d", selected_res["header_row"])
        logger.info("[ExcelParser] Header confidence: %d%%", conf_pct)
        if "date" in det_cols:
            logger.info("[ExcelParser] Date column: %s", det_cols["date"])
        if "value_date" in det_cols:
            logger.info("[ExcelParser] Value Date column: %s", det_cols["value_date"])
        if "description" in det_cols:
            logger.info("[ExcelParser] Description column: %s", det_cols["description"])
        if "debit" in det_cols:
            logger.info("[ExcelParser] Debit column: %s", det_cols["debit"])
        if "credit" in det_cols:
            logger.info("[ExcelParser] Credit column: %s", det_cols["credit"])
        if "amount" in det_cols:
            logger.info("[ExcelParser] Amount column: %s", det_cols["amount"])
        if "balance" in det_cols:
            logger.info("[ExcelParser] Balance column: %s", det_cols["balance"])
        if "type" in det_cols:
            logger.info("[ExcelParser] Transaction Type column: %s", det_cols["type"])
        if "reference" in det_cols:
            logger.info("[ExcelParser] Reference column: %s", det_cols["reference"])
        logger.info("[ExcelParser] Transactions detected: %d", selected_res["total_rows"])
    else:
        logger.warning(
            "[ExcelParser] No transaction table automatically detected in sheet '%s'",
            selected_sheet,
        )

    # 4. Fallback if automatic detection did not find a table
    if not selected_res.get("detected"):
        raw_rows = sheet_readers[selected_sheet]()
        # Fall back to first non-empty row
        first_row_idx = 0
        for i, r in enumerate(raw_rows[:30]):
            if any(c is not None and str(c).strip() for c in r):
                first_row_idx = i
                break
        header = [format_cell_value(c) or f"Column_{i+1}" for i, c in enumerate(raw_rows[first_row_idx])] if raw_rows else []
        col_count = len(header)
        fallback_rows = []
        for r in raw_rows[first_row_idx + 1:]:
            if not any(c is not None and str(c).strip() for c in r):
                continue
            padded = (list(r) + [None] * col_count)[:col_count]
            fallback_rows.append({header[i]: format_cell_value(padded[i]) for i in range(col_count)})

        return {
            "sheet_names": sheet_names,
            "selected_sheet": selected_sheet,
            "header_row": first_row_idx + 1,
            "header_index": first_row_idx,
            "confidence": 0.0,
            "columns": header,
            "detected_columns": {},
            "rows": fallback_rows,
            "total_rows": len(fallback_rows),
            "table_detected": False,
            "message": selected_res.get("message"),
        }

    return {
        "sheet_names": sheet_names,
        "selected_sheet": selected_sheet,
        "header_row": selected_res["header_row"],
        "header_index": selected_res["header_index"],
        "confidence": selected_res["confidence"],
        "columns": selected_res["columns"],
        "detected_columns": selected_res["detected_columns"],
        "rows": selected_res["rows"],
        "total_rows": selected_res["total_rows"],
        "table_detected": True,
    }
