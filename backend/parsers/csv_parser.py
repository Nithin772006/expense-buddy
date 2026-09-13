"""
CSV Parser — reads a CSV file (bytes) and returns:
  - detected column mapping
  - list of raw row dicts
  - list of column names
"""

import io
import chardet
import csv
from typing import BinaryIO


def _detect_encoding(raw: bytes) -> str:
    result = chardet.detect(raw)
    return result.get("encoding") or "utf-8"


def _find_header_row(rows: list[list[str]]) -> int:
    """
    Some bank CSVs have a few lines of metadata before the actual table.
    Heuristic: the header row has more than 3 non-empty cells.
    """
    for i, row in enumerate(rows[:20]):
        non_empty = [c for c in row if c.strip()]
        if len(non_empty) >= 3:
            return i
    return 0


def parse_csv(file_bytes: bytes) -> dict:
    """
    Parse CSV bytes.
    Returns:
      {
        "columns": [...],
        "rows": [...],          # list of dicts
        "total_rows": int,
        "encoding": str,
        "delimiter": str,
      }
    Raises ValueError on parse failure.
    """
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

    header_idx = _find_header_row(reader_list)
    header = [col.strip() for col in reader_list[header_idx]]

    # Remove empty trailing columns
    while header and not header[-1]:
        header.pop()

    col_count = len(header)
    rows = []
    for raw_row in reader_list[header_idx + 1:]:
        if not any(c.strip() for c in raw_row):
            continue  # skip blank rows
        # Pad / trim to header width
        padded = (raw_row + [""] * col_count)[:col_count]
        row_dict = {header[i]: padded[i].strip() for i in range(col_count)}
        rows.append(row_dict)

    return {
        "columns": header,
        "rows": rows,
        "total_rows": len(rows),
        "encoding": encoding,
        "delimiter": delimiter,
    }
