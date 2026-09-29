"""
Duplicate detector: checks the Supabase transactions table for likely
duplicates before inserting new rows.

Strategy: a row is a duplicate if for the same user there already exists
a transaction with the same (transaction_date, amount, transaction_type)
AND a very similar description (first 40 chars, lowercased).
"""

from typing import Optional
from services.supabase_client import get_supabase_client


def _desc_key(description: str) -> str:
    """First 40 chars, lowercased, stripped — used as fuzzy match key."""
    return description.lower().strip()[:40]


def _tx_fingerprint(row: dict) -> tuple:
    """Build a composite fingerprint including reference and balance when available."""
    date_str = str(row.get("transaction_date", ""))
    try:
        amt = float(row.get("amount", 0.0))
    except (ValueError, TypeError):
        amt = 0.0
    tx_type = row.get("transaction_type", "debit")
    desc = _desc_key(row.get("description", ""))
    ref = str(row.get("reference") or "").strip().lower()
    bal = row.get("account_balance")
    bal_str = f"{float(bal):.2f}" if bal is not None else ""

    # If reference or balance is available, use the high-precision fingerprint
    if ref or bal_str:
        return (date_str, amt, tx_type, desc, ref, bal_str)
    # Otherwise fallback to standard 4-tuple
    return (date_str, amt, tx_type, desc)


def build_duplicate_set(user_id: str, token: Optional[str] = None) -> set[tuple]:
    """
    Fetch all existing transactions for this user and return a set of
    fingerprint tuples for O(1) lookup.
    """
    client = get_supabase_client(token)
    try:
        response = (
            client
            .from_("transactions")
            .select("transaction_date, amount, transaction_type, description, reference, account_balance")
            .eq("user_id", user_id)
            .execute()
        )
    except Exception:
        # Fallback if reference or account_balance columns query fails
        response = (
            client
            .from_("transactions")
            .select("transaction_date, amount, transaction_type, description")
            .eq("user_id", user_id)
            .execute()
        )

    existing = set()
    for row in (response.data or []):
        existing.add(_tx_fingerprint(row))
    return existing


def is_duplicate(tx: dict, existing: set[tuple]) -> bool:
    """Return True if tx is likely a duplicate against the existing set."""
    fp = _tx_fingerprint(tx)
    if fp in existing:
        return True
    # If tx had reference/balance, also check standard 4-tuple fallback only if identical
    if len(fp) > 4 and not fp[4]:  # no reference
        base_fp = fp[:4]
        return base_fp in existing
    return False


def mark_as_inserted(tx: dict, existing: set[tuple]) -> None:
    """Add a newly inserted tx key to the in-memory set to prevent
    intra-batch duplicates in the same import run."""
    existing.add(_tx_fingerprint(tx))
