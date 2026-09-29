"""
CSV Parser — reads a CSV file (bytes) and dynamically detects the transaction table,
ignoring any metadata rows above the header using the Table Detector engine.
"""

import io
import chardet
import csv
import logging
from typing import Optional

from parsers.table_detector import detect_transaction_table, format_cell_value

logger = logging.getLogger("expense_buddy.csv_parser")


def _detect_encoding(raw: bytes) -> str:
    result = chardet.detect(raw)
    return result.get("encoding") or "utf-8"


def parse_csv(file_bytes: bytes) -> dict:
    """
    Parse CSV bytes using the Table Detector.
    Returns:
      {
        "columns": list[str],
        "rows": list[dict],
        "total_rows": int,
        "encoding": str,
        "delimiter": str,
        "header_row": int,
        "header_index": int,
        "confidence": float,
        "detected_columns": dict[str, str],
        "table_detected": bool,
      }
    """
    logger.info("[CSVParser] File received for CSV parsing")
    encoding = _detect_encoding(file_bytes)
    text = file_bytes.decode(encoding, errors="replace")

    # Detect delimiter (comma, semicolon, tab, pipe)
    sample = text[:4096]
    sniffer = csv.Sniffer()
    try:
        dialect = sniffer.sniff(sample, delimiters=",;\t|")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ","

    reader_list = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    if not reader_list:
        raise ValueError("CSV file is empty")

    logger.info("[CSVParser] Delimiter '%s', Encoding '%s', Total raw lines %d", delimiter, encoding, len(reader_list))

    # Detect transaction table dynamically
    res = detect_transaction_table(reader_list, sheet_name="CSV")

    if res.get("detected"):
        det_cols = res.get("detected_columns", {})
        conf_pct = int(res.get("confidence", 0.0) * 100)
        logger.info("[CSVParser] Candidate header row: %d", res["header_row"])
        logger.info("[CSVParser] Header confidence: %d%%", conf_pct)
        if "date" in det_cols:
            logger.info("[CSVParser] Date column: %s", det_cols["date"])
        if "description" in det_cols:
            logger.info("[CSVParser] Description column: %s", det_cols["description"])
        if "debit" in det_cols:
            logger.info("[CSVParser] Debit column: %s", det_cols["debit"])
        if "credit" in det_cols:
            logger.info("[CSVParser] Credit column: %s", det_cols["credit"])
        if "amount" in det_cols:
            logger.info("[CSVParser] Amount column: %s", det_cols["amount"])
        if "balance" in det_cols:
            logger.info("[CSVParser] Balance column: %s", det_cols["balance"])
        logger.info("[CSVParser] Transactions detected: %d", res["total_rows"])

        return {
            "columns": res["columns"],
            "detected_columns": res["detected_columns"],
            "rows": res["rows"],
            "total_rows": res["total_rows"],
            "header_row": res["header_row"],
            "header_index": res["header_index"],
            "confidence": res["confidence"],
            "encoding": encoding,
            "delimiter": delimiter,
            "table_detected": True,
        }

    # Fallback to naive first non-empty row if table detector could not detect confident table
    logger.warning("[CSVParser] Table detector did not find confident header row, falling back to top row")
    first_idx = 0
    for i, r in enumerate(reader_list[:20]):
        if any(c.strip() for c in r):
            first_idx = i
            break

    header = [col.strip() or f"Column_{i+1}" for i, col in enumerate(reader_list[first_idx])]
    while header and header[-1].startswith("Column_"):
        header.pop()
    col_count = len(header)

    rows = []
    for raw_row in reader_list[first_idx + 1:]:
        if not any(c.strip() for c in raw_row):
            continue
        padded = (raw_row + [""] * col_count)[:col_count]
        rows.append({header[i]: padded[i].strip() for i in range(col_count)})

    return {
        "columns": header,
        "detected_columns": {},
        "rows": rows,
        "total_rows": len(rows),
        "header_row": first_idx + 1,
        "header_index": first_idx,
        "confidence": 0.0,
        "encoding": encoding,
        "delimiter": delimiter,
        "table_detected": False,
        "message": res.get("message"),
    }
