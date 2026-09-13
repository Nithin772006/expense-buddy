"""
Excel Parser — reads .xlsx / .xls files and returns sheet names + rows.
Supports multi-sheet workbooks; caller can select which sheet.
"""

import io
import re
from typing import Optional
import openpyxl
import xlrd


def _is_blank_row(row: list) -> bool:
    return all(v is None or str(v).strip() == "" for v in row)


def _is_header_row(row: list) -> bool:
    """Rows with >= 3 non-empty string-like cells and no all-numeric cells are candidate headers."""
    non_empty = [v for v in row if v is not None and str(v).strip()]
    if len(non_empty) < 3:
        return False
    # If every non-empty cell is a number, it's a data row not header
    all_numeric = all(isinstance(v, (int, float)) for v in non_empty)
    return not all_numeric


def _find_data_start(rows: list[list]) -> int:
    """
    Find the first row index that looks like a header row.
    Scan at most the first 30 rows.
    """
    for i, row in enumerate(rows[:30]):
        if _is_header_row(row):
            return i
    return 0


def _cell_to_str(val) -> str:
    if val is None:
        return ""
    if isinstance(val, float):
        # Avoid '1250.0' when it should be '1250'
        if val == int(val):
            return str(int(val))
        return str(val)
    return str(val).strip()


def _parse_xlsx(file_bytes: bytes, sheet_name: Optional[str] = None) -> dict:
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    sheet_names = wb.sheetnames

    if sheet_name is None:
        sheet_name = sheet_names[0]
    elif sheet_name not in sheet_names:
        raise ValueError(f"Sheet '{sheet_name}' not found. Available: {sheet_names}")

    ws = wb[sheet_name]
    all_rows = []
    for row in ws.iter_rows(values_only=True):
        all_rows.append(list(row))

    return sheet_names, sheet_name, all_rows


def _parse_xls(file_bytes: bytes, sheet_name: Optional[str] = None) -> tuple:
    wb = xlrd.open_workbook(file_contents=file_bytes)
    sheet_names = wb.sheet_names()

    if sheet_name is None:
        sheet_name = sheet_names[0]
    elif sheet_name not in sheet_names:
        raise ValueError(f"Sheet '{sheet_name}' not found. Available: {sheet_names}")

    ws = wb.sheet_by_name(sheet_name)
    all_rows = []
    for i in range(ws.nrows):
        row = []
        for j in range(ws.ncols):
            cell = ws.cell(i, j)
            if cell.ctype == xlrd.XL_CELL_DATE:
                # Convert Excel date serial to datetime
                import datetime
                dt = xlrd.xldate_as_datetime(cell.value, wb.datemode)
                row.append(dt.date())
            else:
                row.append(cell.value)
        all_rows.append(row)

    return sheet_names, sheet_name, all_rows


def parse_excel(file_bytes: bytes, filename: str, sheet_name: Optional[str] = None) -> dict:
    """
    Parse Excel file (xlsx or xls).
    Returns:
      {
        "sheet_names": [...],
        "selected_sheet": str,
        "columns": [...],
        "rows": [...],      # list of dicts
        "total_rows": int,
      }
    """
    ext = filename.rsplit(".", 1)[-1].lower()

    if ext == "xlsx":
        sheet_names, selected_sheet, all_rows = _parse_xlsx(file_bytes, sheet_name)
    elif ext == "xls":
        sheet_names, selected_sheet, all_rows = _parse_xls(file_bytes, sheet_name)
    else:
        raise ValueError(f"Unsupported Excel format: .{ext}")

    if not all_rows:
        raise ValueError("Excel sheet is empty")

    # Find header row
    header_idx = _find_data_start(all_rows)
    header = [_cell_to_str(v) for v in all_rows[header_idx]]

    # Trim trailing empty headers
    while header and not header[-1]:
        header.pop()
    col_count = len(header)

    rows = []
    for raw_row in all_rows[header_idx + 1:]:
        if _is_blank_row(raw_row):
            continue
        padded = (list(raw_row) + [None] * col_count)[:col_count]
        row_dict = {header[i]: _cell_to_str(padded[i]) for i in range(col_count)}
        rows.append(row_dict)

    return {
        "sheet_names": sheet_names,
        "selected_sheet": selected_sheet,
        "columns": header,
        "rows": rows,
        "total_rows": len(rows),
    }
