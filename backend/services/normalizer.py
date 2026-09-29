"""
Normalizer: converts raw parsed rows (from CSV / Excel / PDF) into a
uniform NormalizedTransaction dict that maps to the Supabase `transactions` table.

Key fixes (2026-09-27):
  - Robust Debit/Credit normalization: blank/dash cells treated as empty (not zero)
  - parse_amount_nonzero() returns None for empty/dash/zero values - never 0.0
  - Correct Debit -> amount / Credit -> amount resolution without data loss
  - Expanded column-name aliases for Indian bank statement variants
  - Balance-validation flag to detect column-shift extraction errors
  - transaction_type correctly set to "debit" or "credit"
  - Raw debit/credit values preserved alongside normalized amount
  - INR prefix and all common currency symbols stripped correctly
"""

import re
import logging
from datetime import date, datetime
from typing import Optional

from dateutil import parser as dateutil_parser

logger = logging.getLogger("expense_buddy.normalizer")


# -- Empty-value sentinel strings ---------------------------------------------

# These raw string values (case-insensitive, stripped) represent "no value".
# CRITICAL: Do NOT treat these as 0.0 - they mean the column is absent.
_EMPTY_SENTINELS = {
    "", "-", "\u2014", "\u2013",
    "null", "none", "n/a", "na",
    "0.00", "0",
}

# Regex: strip common currency prefixes and formatting characters
# Handles: rupee, dollar, euro, pound, yen, INR, Rs, Rs., commas, spaces
_CURRENCY_STRIP_RE = re.compile(r"(?:INR|Rs\.?|\u20b9|\$|\u20ac|\xa3|\xa5)\s*", re.IGNORECASE)
_FORMAT_STRIP_RE   = re.compile(r"[,\s]")


def _is_empty_amount(raw) -> bool:
    """
    Return True if the raw value represents an absent/zero monetary field.
    A blank debit column means 'no debit occurred', not 'debit of zero'.
    """
    if raw is None:
        return True
    if isinstance(raw, (int, float)):
        return raw == 0.0
    s = str(raw).strip().lower()
    return s in _EMPTY_SENTINELS


def parse_amount(raw) -> Optional[float]:
    """
    Convert any monetary string/number to a Python float.
    Returns None for:
      - None
      - Empty / whitespace-only strings
      - Dash variants: "-", em-dash, en-dash
      - "null", "None", "N/A"
      - Literally "0" or "0.00" (treated as 'column absent' for Debit/Credit)

    Supports:
      "1,499.00"    -> 1499.0
      "rupee 1,499" -> 1499.0
      "INR 1,499"   -> 1499.0
      "Rs. 1,499"   -> 1499.0
      "(1,499.00)"  -> -1499.0  (parenthetical negative)
      "-1499.00"    -> -1499.0
    """
    if raw is None:
        return None

    if isinstance(raw, (int, float)):
        return float(raw) if raw != 0 else None

    s = str(raw).strip()
    if not s or s.lower() in _EMPTY_SENTINELS:
        return None

    # Strip currency prefixes (INR, Rs, etc.)
    s = _CURRENCY_STRIP_RE.sub("", s).strip()

    # Handle parenthetical negatives: (1,499.00) -> -1499.00
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]

    # Remove formatting: commas and spaces
    s = _FORMAT_STRIP_RE.sub("", s)

    if not s:
        return None

    try:
        return float(s)
    except ValueError:
        return None


def parse_amount_nonzero(raw) -> Optional[float]:
    """
    Like parse_amount but returns None if result is zero.
    Zero in a Debit or Credit column means 'this side did not apply'.
    """
    v = parse_amount(raw)
    if v is None or v == 0.0:
        return None
    return v


def parse_date(raw) -> Optional[date]:
    """
    Parse a date from many formats: '13/09/2026', '2026-09-13', '13 Sep 2026', etc.
    Returns a Python date or None.
    """
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    raw_str = str(raw).strip()
    if not raw_str or raw_str.lower() in ("nan", "none", "null", "date", "transaction date"):
        return None
    try:
        return dateutil_parser.parse(raw_str, dayfirst=True).date()
    except Exception:
        return None


def clean_text(val) -> Optional[str]:
    """Strip whitespace, collapse internal spaces, return None for blank."""
    if val is None:
        return None
    s = re.sub(r"\s+", " ", str(val)).strip()
    return s if s and s.lower() not in ("nan", "none", "null", "") else None


def infer_type(amount: Optional[float], raw_type: Optional[str]) -> str:
    """Return 'debit' or 'credit' based on explicit type column or sign."""
    if raw_type:
        rt = raw_type.lower().strip()
        if rt in ("credit", "cr", "c", "deposit", "deposits"):
            return "credit"
        if rt in ("debit", "dr", "d", "withdrawal", "withdrawals"):
            return "debit"
    # Fall back to sign
    if amount is not None and amount < 0:
        return "debit"
    return "debit"   # default for expenses


# -- Column name aliases ------------------------------------------------------

DATE_ALIASES = [
    "transaction date", "txn date", "date", "value date",
    "posting date", "trans date", "trans. date", "transaction_date",
    "tran date", "booking date",
]
DESCRIPTION_ALIASES = [
    "description", "narration", "particulars", "transaction details",
    "transaction description", "details", "remarks", "transaction particulars",
    "trans description", "trans. description", "transaction narration",
    "memo", "reference description", "chq/ref number",
]
# Pure amount column (single amount, no debit/credit split)
AMOUNT_ALIASES = [
    "amount", "transaction amount", "txn amount", "trans amount",
    "amount (inr)", "amount(inr)", "net amount",
]
DEBIT_ALIASES = [
    "debit", "dr", "dr.", "withdrawal", "withdrawals",
    "withdrawal amount", "debit amount", "amount debited",
    "dr amount", "debit (inr)", "debits",
]
CREDIT_ALIASES = [
    "credit", "cr", "cr.", "deposit", "deposits",
    "deposit amount", "credit amount", "amount credited",
    "cr amount", "credit (inr)", "credits",
]
BALANCE_ALIASES = [
    "balance", "account balance", "closing balance", "available balance",
    "running balance", "bal", "balance (inr)", "closing bal",
    "balance amount", "bal. amount",
]
TYPE_ALIASES = [
    "type", "transaction type", "txn type", "dr/cr", "cr/dr",
    "debit/credit", "d/c", "tran type",
]
REFERENCE_ALIASES = [
    "ref no", "ref no.", "reference", "ref no./cheque no.",
    "cheque no", "cheque no.", "chq no", "chq no.",
    "reference no", "reference number", "transaction id", "txn id",
    "transaction ref", "utr", "utr no",
]
VALUE_DATE_ALIASES = [
    "value date", "val date", "effective date", "v date",
]
MERCHANT_ALIASES = [
    "merchant", "merchant name", "payee", "beneficiary", "vendor",
    "store", "merchant/payee",
]
PAYMENT_ALIASES = [
    "payment method", "mode", "channel", "transaction mode",
    "payment mode", "payment channel", "instrument",
]


def _normalize_col_name(name: str) -> str:
    """Lowercase, strip, collapse whitespace for alias comparison."""
    s = re.sub(r"\s+", " ", name.lower().strip())
    return s.rstrip(".:")


def _find_col(columns: list[str], aliases: list[str]) -> Optional[str]:
    """Return the first column name that matches any alias (case-insensitive, normalized)."""
    lower_map = {_normalize_col_name(c): c for c in columns}
    norm_aliases = [_normalize_col_name(a) for a in aliases]
    for alias in norm_aliases:
        if alias in lower_map:
            return lower_map[alias]
    return None


def detect_column_mapping(columns: list[str]) -> dict:
    """
    Auto-detect which CSV/Excel/PDF columns map to our normalized fields.
    Returns a dict of {field: detected_column_name | None}.
    """
    return {
        "date":           _find_col(columns, DATE_ALIASES),
        "value_date":     _find_col(columns, VALUE_DATE_ALIASES),
        "description":    _find_col(columns, DESCRIPTION_ALIASES),
        "amount":         _find_col(columns, AMOUNT_ALIASES),
        "debit":          _find_col(columns, DEBIT_ALIASES),
        "credit":         _find_col(columns, CREDIT_ALIASES),
        "balance":        _find_col(columns, BALANCE_ALIASES),
        "type":           _find_col(columns, TYPE_ALIASES),
        "reference":      _find_col(columns, REFERENCE_ALIASES),
        "merchant":       _find_col(columns, MERCHANT_ALIASES),
        "payment_method": _find_col(columns, PAYMENT_ALIASES),
    }


# -- Balance validation helper ------------------------------------------------

BALANCE_TOLERANCE = 0.10  # +/- 10 paise tolerance for floating-point drift


def validate_balance(
    prev_balance: Optional[float],
    debit: Optional[float],
    credit: Optional[float],
    reported_balance: Optional[float],
) -> Optional[bool]:
    """
    Validate whether the running balance is consistent.
    Returns True if valid, False if mismatch (possible column-shift error), None if can't verify.
    """
    if prev_balance is None or reported_balance is None:
        return None
    d = debit  or 0.0
    c = credit or 0.0
    expected = prev_balance - d + c
    return abs(expected - reported_balance) <= BALANCE_TOLERANCE


# -- Main normalizer ----------------------------------------------------------

def normalize_row(
    row: dict,
    mapping: dict,
    source: str = "csv",
    prev_balance: Optional[float] = None,
    debug: bool = False,
) -> dict:
    """
    Convert a raw dict row + column mapping into a normalized transaction dict.

    Debit/Credit logic (CRITICAL FIX):
      - parse_amount_nonzero() is used: "0.00" -> None (not a real value)
      - "-" / blank / "N/A" -> None (empty, not zero)
      - Priority: explicit amount column > debit column > credit column
      - NEVER discards Credit simply because Debit is blank/zero

    Returns dict matching the Supabase transactions schema.
    Raises ValueError if required fields (date, amount/debit/credit, description) are missing.
    """

    def get(field: str):
        col = mapping.get(field)
        return row.get(col) if col else None

    # -- Date -----------------------------------------------------------------
    raw_date = get("date")
    tx_date = parse_date(raw_date)
    if tx_date is None:
        raise ValueError(f"Cannot parse date: {repr(raw_date)}")

    # -- Value Date (optional) ------------------------------------------------
    raw_val_date = get("value_date")
    val_date = parse_date(raw_val_date) if raw_val_date else None

    # -- Description ----------------------------------------------------------
    description = clean_text(get("description"))
    if not description:
        raise ValueError("Missing transaction description")

    # -- Reference (optional) -------------------------------------------------
    reference = clean_text(get("reference"))

    # -- Amount resolution ----------------------------------------------------
    # Strategy:
    #  1. Check for a pure "amount" column (already normalized, single value).
    #  2. If not present / empty, check Debit column.
    #  3. If Debit is empty/zero, check Credit column.
    #  4. If BOTH are non-zero -> flag for review, prefer Debit as primary.
    #  5. If NEITHER -> raise ValueError.

    raw_amount_col = get("amount")
    raw_debit_col  = get("debit")
    raw_credit_col = get("credit")

    # Diagnostic log (development only - no sensitive values)
    if debug:
        logger.debug(
            "[normalizer debug] debit_raw=%r credit_raw=%r balance_raw=%r amount_raw=%r",
            raw_debit_col,
            raw_credit_col,
            get("balance"),
            raw_amount_col,
        )

    amount_from_col = parse_amount(raw_amount_col)        # may include zero
    debit_val       = parse_amount_nonzero(raw_debit_col)  # None if empty/zero
    credit_val      = parse_amount_nonzero(raw_credit_col) # None if empty/zero

    tx_type: str = "debit"
    amount:  float

    if amount_from_col is not None and amount_from_col != 0:
        # Path A: Pure "Amount" column present
        amount   = abs(amount_from_col)
        raw_type = clean_text(get("type"))
        tx_type  = infer_type(amount_from_col, raw_type)
    elif debit_val is not None and credit_val is not None:
        # Path B: BOTH Debit and Credit are populated - flag for review
        logger.warning(
            "[normalizer] Row has both Debit=%s and Credit=%s - using Debit. desc=%r",
            debit_val, credit_val, description
        )
        amount  = abs(debit_val)
        tx_type = "debit"
    elif debit_val is not None:
        # Path C: Only Debit populated
        amount  = abs(debit_val)
        tx_type = "debit"
    elif credit_val is not None:
        # Path D: Only Credit populated  <-- THE KEY FIX
        amount  = abs(credit_val)
        tx_type = "credit"
    else:
        raise ValueError(
            f"Cannot determine transaction amount for row: "
            f"amount={repr(raw_amount_col)}, debit={repr(raw_debit_col)}, credit={repr(raw_credit_col)}"
        )

    if amount <= 0:
        raise ValueError(f"Zero or negative amount after parsing: {amount}")

    # -- Balance --------------------------------------------------------------
    balance_val = parse_amount(get("balance"))

    # -- Running-balance validation (non-fatal - logs warning) ----------------
    balance_valid = validate_balance(prev_balance, debit_val, credit_val, balance_val)
    if balance_valid is False:
        logger.warning(
            "[normalizer] Balance mismatch - possible column-shift error. "
            "desc=%r debit=%s credit=%s reported_balance=%s prev_balance=%s",
            description, debit_val, credit_val, balance_val, prev_balance,
        )

    return {
        "transaction_date":          tx_date.isoformat(),
        "value_date":                val_date.isoformat() if val_date else None,
        "description":               description,
        "raw_description":           description,
        "reference":                 reference,
        "merchant":                  clean_text(get("merchant")),
        # Normalized amount & type
        "amount":                    round(amount, 2),
        "transaction_type":          tx_type,
        # Preserve raw debit/credit for auditing (None = absent)
        "debit":                     round(debit_val,  2) if debit_val  is not None else None,
        "credit":                    round(credit_val, 2) if credit_val is not None else None,
        "account_balance":           round(balance_val, 2) if balance_val is not None else None,
        "payment_method":            clean_text(get("payment_method")),
        "source":                    source,
        # ML fields - filled downstream
        "category":                  None,
        "is_anomaly":                False,
        "anomaly_score":             None,
        "classification_confidence": None,
        # Internal validation flag (stripped before DB insert)
        "_balance_valid":            balance_valid,
    }
