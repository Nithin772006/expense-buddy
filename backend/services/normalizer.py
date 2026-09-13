"""
Normalizer: converts raw parsed rows (from CSV / Excel / PDF) into a
uniform NormalizedTransaction dict that maps to the Supabase `transactions` table.
"""

import re
from datetime import date, datetime
from typing import Optional

from dateutil import parser as dateutil_parser


# ── Indian number / currency normalizer ─────────────────────────────────────

_CURRENCY_RE = re.compile(r"[₹$€£¥,\s]")


def parse_amount(raw: str | float | int | None) -> Optional[float]:
    """
    Convert any of: '₹1,250.00', '1,250', '1250', 'INR 1250', '-450.5'
    into a Python float. Returns None if unparseable.
    """
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    cleaned = _CURRENCY_RE.sub("", str(raw)).strip()
    # Handle parenthetical negatives like (1250.00)
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_date(raw: str | date | datetime | None) -> Optional[date]:
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
    """Return 'debit' or 'credit'."""
    if raw_type:
        rt = raw_type.lower().strip()
        if rt in ("credit", "cr", "c"):
            return "credit"
        if rt in ("debit", "dr", "d"):
            return "debit"
    # Fall back to sign
    if amount is not None and amount < 0:
        return "debit"
    return "debit"   # default for expenses


# ── Column name mappings ─────────────────────────────────────────────────────

DATE_ALIASES = [
    "transaction date", "txn date", "date", "value date",
    "posting date", "trans date", "trans. date", "transaction_date",
]
DESCRIPTION_ALIASES = [
    "description", "narration", "particulars", "transaction details",
    "transaction description", "details", "remarks", "transaction particulars",
    "trans description", "trans. description", "transaction narration",
]
AMOUNT_ALIASES = [
    "amount", "transaction amount", "txn amount", "trans amount",
    "amount (inr)", "amount(inr)", "debit amount", "credit amount",
]
DEBIT_ALIASES  = ["debit", "dr", "withdrawal", "withdrawal amount", "debit amount"]
CREDIT_ALIASES = ["credit", "cr", "deposit", "deposit amount", "credit amount"]
BALANCE_ALIASES = [
    "balance", "account balance", "closing balance", "available balance",
    "running balance", "bal", "balance (inr)",
]
TYPE_ALIASES = [
    "type", "transaction type", "txn type", "dr/cr", "cr/dr",
    "debit/credit", "d/c",
]
MERCHANT_ALIASES = [
    "merchant", "merchant name", "payee", "beneficiary", "vendor",
    "store", "merchant/payee",
]
PAYMENT_ALIASES = [
    "payment method", "mode", "channel", "transaction mode",
    "payment mode", "payment channel", "instrument",
]


def _find_col(columns: list[str], aliases: list[str]) -> Optional[str]:
    """Return the first column name that matches any alias (case-insensitive)."""
    lower_cols = {c.lower().strip(): c for c in columns}
    for alias in aliases:
        if alias in lower_cols:
            return lower_cols[alias]
    return None


def detect_column_mapping(columns: list[str]) -> dict:
    """
    Auto-detect which CSV/Excel columns map to our normalized fields.
    Returns a dict of {field: detected_column_name | None}.
    Confidence is None when the field wasn't found.
    """
    return {
        "date":           _find_col(columns, DATE_ALIASES),
        "description":    _find_col(columns, DESCRIPTION_ALIASES),
        "amount":         _find_col(columns, AMOUNT_ALIASES),
        "debit":          _find_col(columns, DEBIT_ALIASES),
        "credit":         _find_col(columns, CREDIT_ALIASES),
        "balance":        _find_col(columns, BALANCE_ALIASES),
        "type":           _find_col(columns, TYPE_ALIASES),
        "merchant":       _find_col(columns, MERCHANT_ALIASES),
        "payment_method": _find_col(columns, PAYMENT_ALIASES),
    }


# ── Main normalizer ──────────────────────────────────────────────────────────

def normalize_row(row: dict, mapping: dict, source: str = "csv") -> dict:
    """
    Given a raw dict row and a column mapping, produce a normalized transaction dict.
    Returns a dict with keys matching the Supabase transactions schema.
    Raises ValueError if required fields (date, amount/debit, description) are missing.
    """

    def get(field: str):
        col = mapping.get(field)
        return row.get(col) if col else None

    # ── Date ──
    raw_date = get("date")
    tx_date = parse_date(raw_date)
    if tx_date is None:
        raise ValueError(f"Cannot parse date: {repr(raw_date)}")

    # ── Description ──
    description = clean_text(get("description"))
    if not description:
        raise ValueError("Missing transaction description")

    # ── Amount resolution (Amount | Debit-Credit columns) ──
    raw_amount = get("amount")
    amount = parse_amount(raw_amount)

    if amount is None:
        # Try debit / credit columns
        raw_debit  = parse_amount(get("debit"))
        raw_credit = parse_amount(get("credit"))
        if raw_debit is not None and raw_debit != 0:
            amount = abs(raw_debit)
            tx_type = "debit"
        elif raw_credit is not None and raw_credit != 0:
            amount = abs(raw_credit)
            tx_type = "credit"
        else:
            raise ValueError(f"Cannot parse amount from row: {row}")
    else:
        raw_type = clean_text(get("type"))
        tx_type  = infer_type(amount, raw_type)
        amount   = abs(amount)

    if amount <= 0:
        raise ValueError(f"Zero or negative amount after parsing: {amount}")

    return {
        "transaction_date":  tx_date.isoformat(),
        "description":       description,
        "raw_description":   description,
        "merchant":          clean_text(get("merchant")),
        "amount":            round(amount, 2),
        "transaction_type":  tx_type,
        "payment_method":    clean_text(get("payment_method")),
        "account_balance":   parse_amount(get("balance")),
        "source":            source,
        "category":          None,   # filled by ML after import
        "is_anomaly":        False,
        "anomaly_score":     None,
        "classification_confidence": None,
    }
