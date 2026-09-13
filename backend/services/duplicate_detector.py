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


def build_duplicate_set(user_id: str, token: Optional[str] = None) -> set[tuple]:
    """
    Fetch all existing transactions for this user and return a set of
    (date_str, amount, type, desc_key) tuples for O(1) lookup.
    """
    client = get_supabase_client(token)
    response = (
        client
        .from_("transactions")
        .select("transaction_date, amount, transaction_type, description")
        .eq("user_id", user_id)
        .execute()
    )
    existing = set()
    for row in (response.data or []):
        key = (
            str(row["transaction_date"]),
            float(row["amount"]),
            row.get("transaction_type", "debit"),
            _desc_key(row["description"]),
        )
        existing.add(key)
    return existing


def is_duplicate(tx: dict, existing: set[tuple]) -> bool:
    """Return True if tx is likely a duplicate against the existing set."""
    key = (
        str(tx["transaction_date"]),
        float(tx["amount"]),
        tx.get("transaction_type", "debit"),
        _desc_key(tx["description"]),
    )
    return key in existing


def mark_as_inserted(tx: dict, existing: set[tuple]) -> None:
    """Add a newly inserted tx key to the in-memory set to prevent
    intra-batch duplicates in the same import run."""
    key = (
        str(tx["transaction_date"]),
        float(tx["amount"]),
        tx.get("transaction_type", "debit"),
        _desc_key(tx["description"]),
    )
    existing.add(key)
