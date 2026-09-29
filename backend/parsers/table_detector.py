"""
Table Detector Engine — dynamically locates and validates bank statement transaction tables
within raw worksheet rows or CSV rows.

Features:
- Never assumes row 1 is the header.
- Scans candidate header rows using multi-category keyword scoring.
- Requires multiple transaction signals (Date + Description + Amount/Debit/Credit).
- Excludes and penalizes statement metadata (account number, opening balance, totals, etc.).
- Validates data rows underneath candidate headers (date validity, amount/numeric validity).
- Computes an overall confidence score (0.0 - 1.0).
- Normalizes cell values (Excel datetimes, floats, strings, currency symbols).
- Filters metadata, empty rows, and summary/footer rows.
- Selects the best worksheet in multi-sheet Excel workbooks.
"""

import re
import logging
from datetime import datetime, date
from typing import Any, Optional
from dateutil import parser as dateutil_parser

logger = logging.getLogger("expense_buddy.table_detector")

# ── Transaction Column Keywords ───────────────────────────────────────────────
HEADER_KEYWORDS = {
    "date": [
        "date", "txn date", "transaction date", "posting date",
        "trans date", "trans. date", "transaction_date", "tran date",
        "booking date", "entry date",
    ],
    "value_date": [
        "value date", "val date", "effective date", "v date",
    ],
    "description": [
        "description", "narration", "particulars", "details", "remarks",
        "transaction details", "transaction description", "merchant", "payee",
        "memo", "transaction particulars", "trans description", "trans. description",
        "reference description", "chq/ref number", "narrative",
    ],
    "debit": [
        "debit", "withdrawal", "withdrawals", "dr", "dr.", "debit amount",
        "withdrawal amount", "amount debited", "dr amount", "debit (inr)",
        "debits", "debit amt", "withdrawal amt", "dr (inr)",
    ],
    "credit": [
        "credit", "deposit", "deposits", "cr", "cr.", "credit amount",
        "deposit amount", "amount credited", "cr amount", "credit (inr)",
        "credits", "credit amt", "deposit amt", "cr (inr)",
    ],
    "amount": [
        "amount", "transaction amount", "txn amount", "trans amount",
        "amount (inr)", "amount(inr)", "net amount", "value", "amt",
        "txn amt", "amount debited/credited",
    ],
    "balance": [
        "balance", "running balance", "closing balance", "available balance",
        "account balance", "closing bal", "bal", "balance (inr)",
        "bal. amount", "balance amount", "clear balance",
    ],
    "reference": [
        "reference", "reference no", "reference no.", "reference number",
        "transaction id", "transaction ref", "utr", "utr no", "cheque no",
        "cheque no.", "check no", "chq no", "chq no.", "ref no", "ref no.",
        "ref/cheque no", "chq/ref no", "txn id", "chq / ref no.",
    ],
    "type": [
        "transaction type", "type", "dr/cr", "credit/debit", "cr/dr",
        "txn type", "tran type", "d/c", "trans type",
    ],
    "merchant": [
        "merchant", "merchant name", "payee", "beneficiary", "vendor",
    ],
    "payment_method": [
        "payment method", "mode", "channel", "transaction mode",
        "payment mode", "payment channel", "instrument",
    ],
}

# ── Summary & Metadata Exclusions ─────────────────────────────────────────────
# Tokens that represent account metadata, summaries, or non-transaction headers.
METADATA_EXCLUSIONS = {
    "account holder", "account name", "customer name", "account number",
    "account no", "a/c no", "statement period", "statement date", "statement from",
    "statement to", "opening balance", "total debit", "total credit",
    "total withdrawal", "total withdrawals", "total deposit", "total deposits",
    "branch", "branch name", "ifsc", "ifsc code", "micr", "cif", "customer id",
    "synthetic test data", "fictional", "not a real bank statement",
    "closing balance",  # when appearing without date/description in metadata section
}

# Regex to strip common currency symbols and commas
_CURRENCY_RE = re.compile(r"(?:INR|Rs\.?|\u20b9|\$|\u20ac|\xa3|\xa5)\s*", re.IGNORECASE)
_CLEAN_TEXT_RE = re.compile(r"[,\s]+")


def _normalize_token(val: Any) -> str:
    """Normalize a cell value for header matching."""
    if val is None:
        return ""
    s = str(val).strip().lower()
    # Normalize internal spaces and remove punctuation that varies (e.g. ., /, -)
    s = re.sub(r"[\s_\.\/\-]+", " ", s).strip()
    return s


def format_cell_value(val: Any) -> str:
    """
    Format a raw cell value safely for output dicts and display.
    Preserves Excel datetime objects into clean 'DD/MM/YYYY' strings.
    """
    if val is None:
        return ""
    if isinstance(val, (datetime, date)):
        if isinstance(val, datetime) and (val.hour != 0 or val.minute != 0 or val.second != 0):
            return val.strftime("%d/%m/%Y %H:%M")
        return val.strftime("%d/%m/%Y")
    if isinstance(val, float):
        if val == int(val):
            return str(int(val))
        return f"{val:.2f}" if abs(val * 100 - round(val * 100)) < 0.001 else str(val)
    return str(val).strip()


def is_valid_date_cell(val: Any) -> bool:
    """Check if a cell value contains a valid date."""
    if val is None:
        return False
    if isinstance(val, (datetime, date)):
        return True
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "null", "date", "txn date", "closing balance", "opening balance"):
        return False
    # Avoid numeric strings (like amounts) being parsed as year
    if s.replace(".", "").replace(",", "").replace("-", "").isdigit() and len(s) < 6:
        return False
    try:
        dt = dateutil_parser.parse(s, dayfirst=True)
        # Year must be reasonable for a bank statement
        return 1990 <= dt.year <= 2100
    except Exception:
        return False


def is_valid_amount_cell(val: Any) -> bool:
    """Check if a cell value represents a numeric monetary amount."""
    if val is None:
        return False
    if isinstance(val, (int, float)):
        return True
    s = str(val).strip()
    if not s or s.lower() in ("", "-", "\u2014", "\u2013", "null", "none", "n/a", "na"):
        return False
    # Strip currency symbols and formatting
    cleaned = _CURRENCY_RE.sub("", s)
    cleaned = cleaned.replace(",", "").replace(" ", "")
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]
    try:
        float(cleaned)
        return True
    except ValueError:
        return False


def score_header_row(row: list[Any]) -> tuple[float, dict[str, tuple[int, str]], bool]:
    """
    Score a single candidate row based on transaction header keywords.

    Returns:
      (score, matched_columns, has_metadata_conflict)
      where matched_columns is: { category: (column_index, original_name) }
    """
    non_empty = [(i, c) for i, c in enumerate(row) if c is not None and str(c).strip()]
    if len(non_empty) < 2:
        return 0.0, {}, False

    matched_categories: dict[str, tuple[int, str]] = {}
    used_col_indices: set[int] = set()
    metadata_count = 0

    for col_idx, cell in non_empty:
        norm = _normalize_token(cell)
        if not norm:
            continue

        # Check for metadata indicators
        if norm in METADATA_EXCLUSIONS or any(meta in norm for meta in ("account holder", "account number", "total debit", "total credit", "opening balance", "synthetic test")):
            metadata_count += 1
            # "Total Debit" / "Total Credit" must never match "debit" or "credit" columns
            continue

        # Try to match categories
        matched_for_cell = False
        for category, aliases in HEADER_KEYWORDS.items():
            if category in matched_categories:
                continue
            for alias in aliases:
                norm_alias = _normalize_token(alias)
                # Exact match or normalized token match
                if norm == norm_alias:
                    matched_categories[category] = (col_idx, str(cell).strip())
                    used_col_indices.add(col_idx)
                    matched_for_cell = True
                    break
            if matched_for_cell:
                break

    # If row is dominated by metadata, disqualify it
    has_metadata = metadata_count > 0

    # Gate: To be a transaction header, row MUST have:
    # 1. Date
    # 2. Description
    # 3. At least one of Amount, Debit, Credit, or Balance
    has_date = "date" in matched_categories
    has_desc = "description" in matched_categories
    has_amt_or_debit_credit = bool({"debit", "credit", "amount"} & set(matched_categories.keys()))
    has_bal = "balance" in matched_categories

    if not (has_date and has_desc and (has_amt_or_debit_credit or has_bal)):
        return 0.0, matched_categories, has_metadata

    # Calculate base score
    score = 0.0
    if "date" in matched_categories:
        score += 25.0
    if "description" in matched_categories:
        score += 25.0
    if "debit" in matched_categories and "credit" in matched_categories:
        score += 30.0
    elif "debit" in matched_categories or "credit" in matched_categories:
        score += 15.0
    elif "amount" in matched_categories:
        score += 20.0
    if "balance" in matched_categories:
        score += 10.0
    if "reference" in matched_categories:
        score += 10.0
    if "type" in matched_categories:
        score += 10.0
    if "value_date" in matched_categories:
        score += 5.0

    if has_metadata:
        score = max(0.0, score - 40.0)

    return score, matched_categories, has_metadata


def validate_subsequent_rows(
    rows: list[list[Any]],
    header_idx: int,
    matched_cols: dict[str, tuple[int, str]],
    max_check: int = 12,
) -> tuple[float, int, int]:
    """
    Inspect rows immediately following the candidate header.
    Validates that:
    - Date column cells contain valid dates
    - Description column cells contain non-empty text strings
    - Debit/Credit/Amount column cells contain numeric or empty amounts

    Returns:
      (validation_confidence: float 0.0-1.0, valid_rows_count: int, total_checked: int)
    """
    date_col = matched_cols.get("date", (None, ""))[0]
    desc_col = matched_cols.get("description", (None, ""))[0]
    debit_col = matched_cols.get("debit", (None, ""))[0]
    credit_col = matched_cols.get("credit", (None, ""))[0]
    amount_col = matched_cols.get("amount", (None, ""))[0]
    balance_col = matched_cols.get("balance", (None, ""))[0]

    valid_count = 0
    checked_count = 0

    for r in rows[header_idx + 1: header_idx + 1 + max_check * 2]:
        # Skip completely blank rows
        if not any(c is not None and str(c).strip() for c in r):
            continue

        checked_count += 1
        is_row_valid = True

        # Check date
        if date_col is not None:
            val = r[date_col] if date_col < len(r) else None
            if not is_valid_date_cell(val):
                is_row_valid = False

        # Check description
        if desc_col is not None and is_row_valid:
            val = r[desc_col] if desc_col < len(r) else None
            s = str(val).strip() if val is not None else ""
            if len(s) < 2 or is_valid_date_cell(val):
                is_row_valid = False

        # Check amount / debit / credit
        if is_row_valid:
            has_money_signal = False
            if debit_col is not None:
                val = r[debit_col] if debit_col < len(r) else None
                if is_valid_amount_cell(val):
                    has_money_signal = True
            if credit_col is not None:
                val = r[credit_col] if credit_col < len(r) else None
                if is_valid_amount_cell(val):
                    has_money_signal = True
            if amount_col is not None:
                val = r[amount_col] if amount_col < len(r) else None
                if is_valid_amount_cell(val):
                    has_money_signal = True

            # If debit and credit are both empty on this row, check balance as fallback
            if not has_money_signal and balance_col is not None:
                val = r[balance_col] if balance_col < len(r) else None
                if is_valid_amount_cell(val):
                    has_money_signal = True

            if not has_money_signal:
                is_row_valid = False

        if is_row_valid:
            valid_count += 1

        if checked_count >= max_check:
            break

    if checked_count == 0:
        return 0.0, 0, 0

    ratio = valid_count / checked_count
    return ratio, valid_count, checked_count


def is_summary_or_footer_row(row_dict: dict[str, str], date_col: Optional[str]) -> bool:
    """
    Detect whether a row is a summary or footer row (e.g. 'Total', 'Page 1 of 1')
    rather than a real transaction.
    """
    # If the date column contains a valid date, it's almost certainly a transaction
    if date_col and is_valid_date_cell(row_dict.get(date_col)):
        return False

    # Check for summary phrases in any text cell
    footer_phrases = (
        "total", "grand total", "opening balance", "closing balance",
        "end of statement", "page ", "computer generated", "disclaimer",
        "statement summary",
    )
    for v in row_dict.values():
        if v:
            norm = _normalize_token(v)
            if any(norm.startswith(phrase) or norm == phrase for phrase in footer_phrases):
                return True
    return False


def detect_transaction_table(
    rows: list[list[Any]],
    sheet_name: str = "",
    max_header_scan: int = 60,
) -> dict:
    """
    Analyze raw worksheet rows and automatically extract the transaction table.

    Returns:
      {
        "detected": bool,
        "sheet": str,
        "header_row": int (1-indexed),
        "header_index": int (0-indexed),
        "confidence": float (0.0 - 1.0),
        "columns": list[str],
        "detected_columns": dict[str, str],
        "rows": list[dict[str, str]],
        "total_rows": int,
      }
    """
    if not rows:
        return {
            "detected": False,
            "sheet": sheet_name,
            "header_row": 0,
            "header_index": -1,
            "confidence": 0.0,
            "columns": [],
            "detected_columns": {},
            "rows": [],
            "total_rows": 0,
            "message": "Sheet is empty",
        }

    best_candidate = None
    best_overall_score = -1.0

    # Scan rows up to max_header_scan for candidate headers
    for idx, row in enumerate(rows[:max_header_scan]):
        header_score, matched_cols, has_meta = score_header_row(row)
        if header_score <= 0:
            continue

        # Validate subsequent data rows
        data_ratio, valid_cnt, checked_cnt = validate_subsequent_rows(
            rows, idx, matched_cols, max_check=10
        )

        # Combined score: header keywords + verified data rows underneath
        overall_score = (header_score * 0.4) + (data_ratio * 60.0)
        if data_ratio >= 0.7:
            overall_score += 20.0  # Big bonus for consistent data rows

        if overall_score > best_overall_score:
            best_overall_score = overall_score
            best_candidate = {
                "header_index": idx,
                "header_score": header_score,
                "data_ratio": data_ratio,
                "valid_cnt": valid_cnt,
                "checked_cnt": checked_cnt,
                "matched_cols": matched_cols,
                "raw_header_row": row,
            }

    # If no candidate satisfied the multi-signal gate, return failure
    if not best_candidate or best_candidate["data_ratio"] < 0.2:
        logger.warning(
            "[table_detector] No confident transaction table found in sheet '%s'",
            sheet_name,
        )
        return {
            "detected": False,
            "sheet": sheet_name,
            "header_row": 0,
            "header_index": -1,
            "confidence": 0.0,
            "columns": [],
            "detected_columns": {},
            "rows": [],
            "total_rows": 0,
            "message": (
                "Could not automatically detect a transaction table. "
                "Ensure the statement contains Date, Description, and Debit/Credit columns."
            ),
        }

    h_idx = best_candidate["header_index"]
    raw_header = best_candidate["raw_header_row"]
    matched_cols = best_candidate["matched_cols"]

    # Build clean, unique column names from the header row
    columns: list[str] = []
    seen_names: dict[str, int] = {}
    for i, cell in enumerate(raw_header):
        name = str(cell).strip() if cell is not None else ""
        if not name:
            name = f"Column_{i+1}"
        if name in seen_names:
            seen_names[name] += 1
            name = f"{name}_{seen_names[name]}"
        else:
            seen_names[name] = 1
        columns.append(name)

    # Trim trailing empty/generated columns if they have no matches
    while columns and columns[-1].startswith("Column_") and len(columns) - 1 not in [c[0] for c in matched_cols.values()]:
        columns.pop()

    col_count = len(columns)

    # Build detected_columns map: { category: column_name }
    detected_columns: dict[str, str] = {}
    for cat, (c_idx, _) in matched_cols.items():
        if c_idx < len(columns):
            detected_columns[cat] = columns[c_idx]

    # Calculate confidence score (normalized 0.0 to 1.0)
    # 85-100% confidence for strong header + validated data rows
    base_conf = min(best_candidate["header_score"] / 100.0, 1.0) * 0.4
    data_conf = best_candidate["data_ratio"] * 0.5
    columns_conf = (min(len(matched_cols), 7) / 7.0) * 0.1
    confidence = round(min(base_conf + data_conf + columns_conf, 1.0), 2)

    # Extract data rows starting strictly after header row
    data_rows: list[dict[str, str]] = []
    date_col_name = detected_columns.get("date")

    # Header values as strings to avoid repeated header rows
    raw_header_str_set = {str(c).strip().lower() for c in raw_header if c is not None}

    consecutive_blank = 0
    for raw_row in rows[h_idx + 1:]:
        # Blank row check
        if not any(c is not None and str(c).strip() for c in raw_row):
            consecutive_blank += 1
            if consecutive_blank > 15:
                # Stop if 15 consecutive blank rows
                break
            continue
        consecutive_blank = 0

        # Check if row is a repeated header row (common in multi-page statement exports)
        non_empty_cells = [str(c).strip().lower() for c in raw_row if c is not None and str(c).strip()]
        if len(non_empty_cells) >= 3 and all(c in raw_header_str_set for c in non_empty_cells):
            continue

        # Format and pad row to column count
        padded = (list(raw_row) + [None] * col_count)[:col_count]
        row_dict = {
            columns[i]: format_cell_value(padded[i])
            for i in range(col_count)
        }

        # Check if row is a footer / summary row
        if is_summary_or_footer_row(row_dict, date_col_name):
            continue

        # Valid data row must have at least date or description or amount
        has_any_data = any(
            row_dict.get(detected_columns.get(cat, ""))
            for cat in ("date", "description", "debit", "credit", "amount")
        )
        if not has_any_data:
            continue

        data_rows.append(row_dict)

    logger.info(
        "[table_detector] Table detected in '%s': header_row=%d, confidence=%.2f, transactions=%d",
        sheet_name,
        h_idx + 1,
        confidence,
        len(data_rows),
    )

    return {
        "detected": True,
        "sheet": sheet_name,
        "header_row": h_idx + 1,  # 1-indexed for human readability
        "header_index": h_idx,     # 0-indexed
        "confidence": confidence,
        "columns": columns,
        "detected_columns": detected_columns,
        "rows": data_rows,
        "total_rows": len(data_rows),
    }


def select_best_sheet(sheet_results: list[dict]) -> dict:
    """
    Select the sheet with the highest transaction table confidence and density.
    Prefers sheets with transaction table detected and high transaction counts.
    """
    if not sheet_results:
        raise ValueError("No worksheets found in workbook")

    def sheet_score(res: dict) -> float:
        if not res.get("detected"):
            return -1.0
        conf = res.get("confidence", 0.0)
        cnt = res.get("total_rows", 0)
        name = res.get("sheet", "").lower()

        # Score based on confidence + row count
        score = conf * 100.0 + min(cnt, 500) * 0.1
        # Bonus for names like 'transactions', 'statement', 'account'
        if any(kw in name for kw in ("transaction", "txn", "statement", "stmt", "ledger")):
            score += 15.0
        elif any(kw in name for kw in ("summary", "metadata", "notes", "instruction")):
            score -= 25.0
        return score

    sorted_sheets = sorted(sheet_results, key=sheet_score, reverse=True)
    return sorted_sheets[0]
