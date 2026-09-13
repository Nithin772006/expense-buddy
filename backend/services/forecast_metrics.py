"""
forecast_metrics.py — Deterministic statistical metrics and recurring signal calculation for Expense Buddy.

Calculates:
1. Total historical spending (debits only)
2. Number of valid expense transactions
3. Monthly spending breakdown
4. Historical monthly average
5. Recent 30-day and 60-day spending totals
6. Average daily spending
7. Deterministic spending trend
8. Lightweight recurring-like commitments signal
"""

import re
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional
import numpy as np


def extract_expense_debits(transactions: list[dict]) -> list[dict]:
    """
    Filter transactions to only include legitimate debit expenses.
    Excludes credits, salary, income, and refunds.
    """
    debits = []
    for tx in transactions:
        tx_type = str(tx.get("transaction_type") or "debit").strip().lower()
        if tx_type != "debit":
            continue

        amt = tx.get("amount")
        if amt is None:
            continue
        try:
            val = float(amt)
            if val > 0:
                debits.append(tx)
        except (ValueError, TypeError):
            continue

    return debits


def parse_tx_date(tx: dict) -> datetime:
    """Extract and parse date from a transaction dictionary."""
    d_raw = tx.get("transaction_date") or tx.get("created_at") or "2000-01-01"
    d_str = str(d_raw)[:10]
    try:
        return datetime.strptime(d_str, "%Y-%m-%d")
    except ValueError:
        return datetime(2000, 1, 1)


def compute_spending_statistics(transactions: list[dict]) -> dict:
    """
    Compute comprehensive deterministic spending baseline metrics.
    All calculations operate strictly on debit expenses.
    """
    debits = extract_expense_debits(transactions)
    if not debits:
        return {
            "total_historical_spending": 0.0,
            "total_transactions": 0,
            "monthly_totals": {},
            "historical_monthly_average": 0.0,
            "recent_30_day_spending": 0.0,
            "recent_60_day_spending": 0.0,
            "average_daily_spending": 0.0,
            "historical_average_transaction": 0.0,
            "recent_average_transaction": 0.0,
            "trend": "insufficient_data",
            "trend_percentage": 0.0,
            "date_range_days": 0,
            "first_date": None,
            "last_date": None,
        }

    # Chronological sort
    sorted_debits = sorted(debits, key=parse_tx_date)
    dates = [parse_tx_date(t) for t in sorted_debits]
    amounts = [float(t["amount"]) for t in sorted_debits]

    first_date = min(dates)
    last_date = max(dates)
    day_span = max(1, (last_date - first_date).days)

    total_spending = sum(amounts)
    avg_daily = total_spending / day_span if day_span > 0 else total_spending
    hist_avg_tx = total_spending / len(amounts)
    recent_avg_tx = float(np.mean(amounts[-5:])) if len(amounts) >= 5 else hist_avg_tx

    # Monthly aggregates (YYYY-MM)
    monthly_map = defaultdict(float)
    for t, d in zip(sorted_debits, dates):
        month_key = d.strftime("%Y-%m")
        monthly_map[month_key] += float(t["amount"])

    monthly_totals = {k: round(v, 2) for k, v in sorted(monthly_map.items())}
    hist_monthly_avg = (
        float(np.mean(list(monthly_totals.values()))) if monthly_totals else 0.0
    )

    # Recent 30-day and 60-day windows based on latest transaction date
    cutoff_30 = last_date - timedelta(days=30)
    cutoff_60 = last_date - timedelta(days=60)

    recent_30 = sum(
        float(t["amount"]) for t, d in zip(sorted_debits, dates) if d >= cutoff_30
    )
    recent_60 = sum(
        float(t["amount"]) for t, d in zip(sorted_debits, dates) if d >= cutoff_60
    )
    prev_30 = sum(
        float(t["amount"])
        for t, d in zip(sorted_debits, dates)
        if cutoff_60 <= d < cutoff_30
    )

    # Deterministic trend calculation
    if len(debits) < 3 or day_span < 7:
        trend = "insufficient_data"
        trend_pct = 0.0
    elif prev_30 > 0:
        trend_pct = round(((recent_30 - prev_30) / prev_30) * 100.0, 2)
        if trend_pct > 10.0:
            trend = "increasing"
        elif trend_pct < -10.0:
            trend = "decreasing"
        else:
            trend = "stable"
    elif recent_30 > 0:
        trend = "increasing"
        trend_pct = 100.0
    else:
        trend = "stable"
        trend_pct = 0.0

    return {
        "total_historical_spending": round(total_spending, 2),
        "total_transactions": len(sorted_debits),
        "monthly_totals": monthly_totals,
        "historical_monthly_average": round(hist_monthly_avg, 2),
        "recent_30_day_spending": round(recent_30, 2),
        "recent_60_day_spending": round(recent_60, 2),
        "average_daily_spending": round(avg_daily, 2),
        "historical_average_transaction": round(hist_avg_tx, 2),
        "recent_average_transaction": round(recent_avg_tx, 2),
        "trend": trend,
        "trend_percentage": trend_pct,
        "date_range_days": day_span,
        "first_date": first_date.strftime("%Y-%m-%d"),
        "last_date": last_date.strftime("%Y-%m-%d"),
    }


def clean_merchant_name(description: str) -> str:
    """Normalize merchant description to group recurring transactions."""
    desc = description.strip().lower()
    desc = re.sub(r"^upi/|/upi|upi-|pos-|atm-", "", desc)
    desc = re.sub(r"[0-9#*@_/-]", " ", desc)
    desc = re.sub(r"\s+", " ", desc).strip()
    return desc.title() if desc else "Unknown Merchant"


DISCRETIONARY_KEYWORDS = {
    "shopping", "online shopping", "food order", "swiggy", "zomato",
    "restaurant", "cafe", "dine", "e-commerce"
}

UTILITY_SUBSCRIPTION_KEYWORDS = {
    "bill", "electricity", "tneb", "internet", "fibernet", "milk",
    "subscription", "spotify", "netflix", "prime", "recharge", "rent",
    "insurance", "emi", "broadband"
}


def detect_recurring_commitments(transactions: list[dict]) -> dict:
    """
    Deterministic signal for recurring commitments.
    Delegates to the centralized recurring_payment_service to ensure single source of truth.
    Strictly separates confirmed commitments (monthly/weekly bills) from possible discretionary patterns.
    """
    from services.recurring_payment_service import detect_recurring_commitments as detect_recurring
    return detect_recurring(transactions)

