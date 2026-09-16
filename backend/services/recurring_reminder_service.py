"""
recurring_reminder_service.py — Smart Recurring Payment Reminder & Payment Matching Engine.

100% Deterministic, Explainable, and Secure.
Provides:
1. Billing cycle tracking and duplicate payment prevention.
2. Multi-signal payment matching (merchant + date window + amount tolerance).
3. Status engine: UPCOMING, DUE_SOON, DUE_TODAY, OVERDUE, PAID, MISSED.
4. Auto-detected vs User-marked paid distinction without modifying raw transactions.
5. User isolation and RLS-compliant database operations.
"""

from datetime import date, datetime, timedelta
import logging
import time
from typing import Any, Optional
from dateutil.relativedelta import relativedelta

from services.supabase_client import get_supabase_client
from services.recurring_payment_service import (
    detect_recurring_commitments,
    normalize_merchant_name,
    calculate_next_expected_date,
    parse_tx_date,
)

logger = logging.getLogger("expense_buddy.recurring")



REMINDER_WINDOW_DAYS = 7     # Expected within 7 days -> DUE_SOON
OVERDUE_GRACE_DAYS = 14      # Expected passed <= 14 days -> OVERDUE, > 14 days -> MISSED


def get_billing_cycle_key(expected_date: date, frequency: str) -> str:
    """
    Generate unique billing cycle key to prevent duplicate payment credit.
    Monthly: '2026-09'
    Weekly: '2026-W37'
    Bi-weekly: '2026-BW18'
    Quarterly: '2026-Q3'
    Yearly: '2026'
    """
    freq = (frequency or "monthly").lower()
    if freq == "weekly":
        return expected_date.strftime("%Y-W%U")
    elif freq == "bi-weekly":
        week_num = int(expected_date.strftime("%U"))
        return f"{expected_date.year}-BW{week_num // 2}"
    elif freq == "quarterly":
        quarter = (expected_date.month - 1) // 3 + 1
        return f"{expected_date.year}-Q{quarter}"
    elif freq == "yearly":
        return f"{expected_date.year}"
    else:
        # Default monthly
        return expected_date.strftime("%Y-%m")


def evaluate_reminder_status(
    expected_date: date,
    is_paid: bool = False,
    today: Optional[date] = None,
    reminder_window_days: int = REMINDER_WINDOW_DAYS,
) -> str:
    """
    Evaluate the reminder status of a payment cycle.
    
    Statuses:
    - PAID: Already marked or matched as paid.
    - DUE_TODAY: Expected date is today.
    - DUE_SOON: Expected date is within the next reminder_window_days (1 to 7 days).
    - UPCOMING: Expected date is > reminder_window_days in the future.
    - OVERDUE: Expected date is 1 to 14 days in the past and unpaid.
    - MISSED: Expected date is > 14 days in the past and unpaid.
    """
    if is_paid:
        return "paid"

    if today is None:
        today = date.today()

    diff_days = (expected_date - today).days

    if diff_days == 0:
        return "due_today"
    elif 0 < diff_days <= reminder_window_days:
        return "due_soon"
    elif diff_days > reminder_window_days:
        return "upcoming"
    elif -OVERDUE_GRACE_DAYS <= diff_days < 0:
        return "overdue"
    else:
        return "missed"


def is_merchant_match(tx_merchant: str, rec_merchant: str) -> bool:
    """
    Strict multi-signal merchant match to prevent false positives.
    Ensures Netflix never matches Restaurant, Electricity never matches Amazon.
    """
    tx_clean = normalize_merchant_name(tx_merchant).lower()
    rec_clean = normalize_merchant_name(rec_merchant).lower()

    if tx_clean == rec_clean:
        return True

    # Check key root tokens (ignoring generic words like 'bill', 'vendor', 'premium')
    noise = {"bill", "vendor", "premium", "service", "recharge", "subscription", "unknown", "merchant"}
    rec_tokens = set(rec_clean.split()) - noise
    tx_tokens = set(tx_clean.split()) - noise

    if rec_tokens and tx_tokens and (rec_tokens.issubset(tx_tokens) or tx_tokens.issubset(rec_tokens)):
        return True

    return False


def is_amount_within_tolerance(
    tx_amount: float,
    expected_amount: float,
    stability: str,
    min_amount: float,
    max_amount: float,
) -> bool:
    """
    Check if transaction amount matches recurring commitment within stability tolerance.
    """
    if expected_amount <= 0 or tx_amount <= 0:
        return False

    abs_diff = abs(tx_amount - expected_amount)
    pct_diff = abs_diff / expected_amount

    if stability == "fixed_amount":
        # Fixed amount: within 5% or diff <= 1.0 INR
        return pct_diff <= 0.05 or abs_diff <= 1.0
    elif stability == "mostly_stable":
        # Mostly stable: within 15%
        return pct_diff <= 0.15
    elif stability == "variable_but_periodic":
        # Variable periodic bills (e.g. Electricity, Water):
        # Either within 30% of average, OR within min-max bounds (+/- 20%)
        if pct_diff <= 0.30:
            return True
        if min_amount * 0.80 <= tx_amount <= max_amount * 1.20:
            return True
        return False
    else:
        # Highly variable: within 40%
        return pct_diff <= 0.40


def match_transaction_to_cycle(
    tx: dict,
    rec_payment: dict,
    cycle_expected_date: date,
) -> bool:
    """
    Evaluate if an imported/manual transaction matches a specific recurring payment cycle.
    Requires:
    1. Strict merchant match (no false merchant matches).
    2. Date within window around expected date (+/- 7 days for weekly/monthly, +/- 10 days for bills).
    3. Amount within stability tolerance.
    """
    raw_desc = tx.get("merchant") or tx.get("description") or ""
    rec_name = rec_payment.get("normalized_merchant") or rec_payment.get("merchant") or ""

    if not is_merchant_match(raw_desc, rec_name):
        return False

    tx_date = parse_tx_date(tx)
    date_diff = abs((tx_date - cycle_expected_date).days)
    freq = (rec_payment.get("frequency") or "monthly").lower()

    # Window tolerance based on frequency
    if freq == "weekly":
        window_days = 4
    elif freq == "bi-weekly":
        window_days = 6
    else:
        # Monthly or longer
        window_days = 10

    if date_diff > window_days:
        return False

    tx_amount = float(tx.get("amount") or 0)
    expected_amount = float(rec_payment.get("average_amount") or 0)
    stability = str(rec_payment.get("amount_stability") or "mostly_stable")
    min_amt = float(rec_payment.get("min_amount") or expected_amount)
    max_amt = float(rec_payment.get("max_amount") or expected_amount)

    return is_amount_within_tolerance(tx_amount, expected_amount, stability, min_amt, max_amt)


# ── Read-Only Recurring Payments (For Page Navigation) ─────────────────────────

def get_stored_recurring_payments(user_id: str, token: Optional[str] = None) -> dict:
    """
    Read-only retrieval of stored recurring payments and billing cycle statuses.
    Performs ZERO database writes (no PATCH/INSERT/DELETE) for fast page loads.
    Uses efficient batch queries to prevent N+1 overhead.
    """
    t_start = time.perf_counter()
    client = get_supabase_client(token)

    # 1. Fetch recurring payments for authenticated user
    rec_resp = (
        client
        .from_("recurring_payments")
        .select("*")
        .eq("user_id", user_id)
        .order("next_expected_date", desc=False)
        .execute()
    )
    records = rec_resp.data or []

    if not records:
        duration_ms = (time.perf_counter() - t_start) * 1000
        logger.info(f"[PERF] get_stored_recurring_payments: 0 records in {duration_ms:.1f}ms")
        return {
            "summary": {
                "active_count": 0,
                "total_monthly_commitment": 0.0,
                "due_soon_count": 0,
                "due_today_count": 0,
                "overdue_count": 0,
                "paid_count": 0,
            },
            "recurring_payments": [],
            "possible_patterns": [],
        }

    # 2. Batch fetch billing cycle instances for this user in a single roundtrip
    inst_resp = (
        client
        .from_("recurring_payment_instances")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    instances = inst_resp.data or []
    inst_map = {(i["recurring_payment_id"], i["billing_cycle_key"]): i for i in instances}

    today = date.today()
    due_soon_count = 0
    due_today_count = 0
    overdue_count = 0
    paid_count = 0
    enriched = []

    for rec in records:
        freq = rec.get("frequency") or "monthly"
        exp_date_str = rec.get("next_expected_date")
        exp_date = datetime.strptime(exp_date_str, "%Y-%m-%d").date() if exp_date_str else today
        cycle_key = get_billing_cycle_key(exp_date, freq)

        instance = inst_map.get((rec["id"], cycle_key))
        is_paid = (instance.get("status") == "paid") if instance else False

        current_status = evaluate_reminder_status(exp_date, is_paid=is_paid, today=today)

        # Update summary counters
        if current_status == "due_soon":
            due_soon_count += 1
        elif current_status == "due_today":
            due_today_count += 1
        elif current_status in ("overdue", "missed"):
            overdue_count += 1
        elif current_status == "paid":
            paid_count += 1

        rec_copy = dict(rec)
        rec_copy["current_cycle_status"] = current_status
        rec_copy["current_cycle_key"] = cycle_key
        rec_copy["is_paid"] = is_paid
        if instance:
            rec_copy["paid_date"] = instance.get("paid_date")
            rec_copy["actual_amount"] = instance.get("actual_amount")
            rec_copy["payment_source"] = instance.get("payment_source")

        enriched.append(rec_copy)

    total_monthly = sum(float(x.get("average_amount") or 0.0) for x in enriched if x.get("status") == "active")

    duration_ms = (time.perf_counter() - t_start) * 1000
    logger.info(f"[PERF] get_stored_recurring_payments: {len(enriched)} records in {duration_ms:.1f}ms (read-only)")

    return {
        "summary": {
            "active_count": len([x for x in enriched if x.get("status") == "active"]),
            "total_monthly_commitment": round(total_monthly, 2),
            "due_soon_count": due_soon_count,
            "due_today_count": due_today_count,
            "overdue_count": overdue_count,
            "paid_count": paid_count,
        },
        "recurring_payments": enriched,
        "possible_patterns": [],
    }


# ── Full User Synchronization Engine (Event-Driven Pipeline Only) ───────────────

def sync_user_recurring_payments(user_id: str, token: str) -> dict:
    """
    Synchronizes recurring payments for the authenticated user.
    CALLED EXCLUSIVELY ON EVENTS:
    - Post transaction statement import
    - Manual single transaction add/delete
    - User explicitly clicks "Refresh Detection"
    
    Uses batch operations and only updates records if fields have genuinely changed.
    """
    t_start = time.perf_counter()
    client = get_supabase_client(token)

    # 1. Fetch user transactions
    tx_resp = (
        client
        .from_("transactions")
        .select("*")
        .eq("user_id", user_id)
        .order("transaction_date", desc=False)
        .execute()
    )
    transactions = tx_resp.data or []

    # 2. Run deterministic detection
    detected = detect_recurring_commitments(transactions)
    confirmed = detected["confirmed_recurring_payments"]
    possible = detected["possible_recurring_patterns"]

    # 3. Fetch existing recurring payments from DB
    existing_resp = (
        client
        .from_("recurring_payments")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    existing_records = {r["normalized_merchant"]: r for r in (existing_resp.data or [])}

    # 4. Upsert confirmed commitments
    saved_confirmed = []
    for item in confirmed:
        norm_merchant = item["normalized_merchant"]
        existing = existing_records.get(norm_merchant)

        last_paid = item["last_paid_date"]
        next_exp = item["next_expected_date"]
        if existing and existing.get("last_paid_date") and existing["last_paid_date"] > last_paid:
            last_paid = existing["last_paid_date"]
            next_exp = existing.get("next_expected_date") or calculate_next_expected_date(
                datetime.strptime(last_paid, "%Y-%m-%d").date(), item["frequency"]
            ).isoformat()

        row_data = {
            "user_id": user_id,
            "merchant": item["merchant"],
            "normalized_merchant": norm_merchant,
            "category": item["category"],
            "frequency": item["frequency"],
            "status": existing["status"] if (existing and existing.get("status") in ("paused", "cancelled")) else "active",
            "confidence_score": item["confidence_score"],
            "occurrence_count": item["occurrence_count"],
            "first_seen_date": item["first_seen_date"],
            "last_paid_date": last_paid,
            "next_expected_date": next_exp,
            "average_amount": item["average_amount"],
            "median_amount": item["median_amount"],
            "min_amount": item["min_amount"],
            "max_amount": item["max_amount"],
            "amount_stability": item["amount_stability"],
            "average_interval_days": item["average_interval_days"],
            "payment_method": item["payment_method"],
            "is_confirmed": True,
            "detection_evidence": item["detection_evidence"],
            "source_transaction_ids": item["source_transaction_ids"],
            "updated_at": datetime.utcnow().isoformat(),
        }

        if existing:
            rec_id = existing["id"]
            # Only write to DB if relevant fields changed
            needs_update = any(
                str(existing.get(k)) != str(row_data[k])
                for k in ["frequency", "category", "last_paid_date", "next_expected_date", "average_amount", "status"]
                if k in existing
            )
            if needs_update:
                client.from_("recurring_payments").update(row_data).eq("id", rec_id).execute()
            row_data["id"] = rec_id
        else:
            insert_resp = client.from_("recurring_payments").insert(row_data).execute()
            row_data["id"] = insert_resp.data[0]["id"]

        saved_confirmed.append(row_data)

    # 5. Batch-fetch existing instances to eliminate N+1 queries
    existing_inst_resp = (
        client
        .from_("recurring_payment_instances")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    instances_by_key = {
        (i["recurring_payment_id"], i["billing_cycle_key"]): i
        for i in (existing_inst_resp.data or [])
    }

    today = date.today()
    due_soon_count = 0
    due_today_count = 0
    overdue_count = 0
    paid_count = 0
    enriched_confirmed = []

    for rec in saved_confirmed:
        rec_id = rec["id"]
        freq = rec["frequency"]
        exp_date_str = rec.get("next_expected_date")
        exp_date = datetime.strptime(exp_date_str, "%Y-%m-%d").date() if exp_date_str else today
        cycle_key = get_billing_cycle_key(exp_date, freq)

        instance = instances_by_key.get((rec_id, cycle_key))

        # If not paid, attempt matching against transactions
        is_paid = (instance.get("status") == "paid") if instance else False
        matched_tx = None

        if not is_paid:
            for tx in reversed(transactions):
                if match_transaction_to_cycle(tx, rec, exp_date):
                    is_paid = True
                    matched_tx = tx
                    break

        current_status = evaluate_reminder_status(exp_date, is_paid=is_paid, today=today)

        inst_data = {
            "user_id": user_id,
            "recurring_payment_id": rec_id,
            "billing_cycle_key": cycle_key,
            "expected_date": exp_date.isoformat(),
            "due_date": exp_date.isoformat(),
            "expected_amount": rec["average_amount"],
            "status": current_status,
            "updated_at": datetime.utcnow().isoformat(),
        }

        if is_paid and matched_tx:
            inst_data["matched_transaction_id"] = matched_tx.get("id")
            inst_data["paid_date"] = parse_tx_date(matched_tx).isoformat()
            inst_data["actual_amount"] = float(matched_tx.get("amount") or rec["average_amount"])
            inst_data["payment_source"] = "auto_detected"

        if instance:
            # Only update if status or matched details changed
            needs_inst_update = (
                instance.get("status") != current_status
                or instance.get("matched_transaction_id") != inst_data.get("matched_transaction_id")
                or instance.get("paid_date") != inst_data.get("paid_date")
            )
            if needs_inst_update:
                client.from_("recurring_payment_instances").update(inst_data).eq("id", instance["id"]).execute()
        else:
            client.from_("recurring_payment_instances").insert(inst_data).execute()

        # Update summary counts
        if current_status == "due_soon":
            due_soon_count += 1
        elif current_status == "due_today":
            due_today_count += 1
        elif current_status in ("overdue", "missed"):
            overdue_count += 1
        elif current_status == "paid":
            paid_count += 1
            following_cycle_date = calculate_next_expected_date(exp_date, freq)
            rec["next_expected_date"] = following_cycle_date.isoformat()
            if inst_data.get("paid_date"):
                rec["last_paid_date"] = inst_data["paid_date"]
            client.from_("recurring_payments").update({
                "next_expected_date": following_cycle_date.isoformat(),
                "last_paid_date": rec["last_paid_date"],
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("id", rec_id).execute()

        rec["current_cycle_status"] = current_status
        rec["current_cycle_key"] = cycle_key
        rec["is_paid"] = is_paid
        enriched_confirmed.append(rec)

    total_monthly = sum(x["average_amount"] for x in enriched_confirmed if x.get("status") == "active")

    duration_ms = (time.perf_counter() - t_start) * 1000
    logger.info(f"[PERF] sync_user_recurring_payments: synced {len(enriched_confirmed)} commitments in {duration_ms:.1f}ms")

    return {
        "summary": {
            "active_count": len([x for x in enriched_confirmed if x.get("status") == "active"]),
            "total_monthly_commitment": round(total_monthly, 2),
            "due_soon_count": due_soon_count,
            "due_today_count": due_today_count,
            "overdue_count": overdue_count,
            "paid_count": paid_count,
        },
        "recurring_payments": enriched_confirmed,
        "possible_patterns": possible,
    }


def manual_mark_paid(
    user_id: str,
    payment_id: str,
    paid_date: str,
    actual_amount: float,
    notes: Optional[str],
    token: str,
) -> dict:
    """
    Manually mark a recurring payment cycle as PAID.
    Strictly updates the recurring_payment_instances table without altering bank transactions.
    """
    client = get_supabase_client(token)

    # 1. Verify user ownership of the recurring payment
    rec_resp = (
        client
        .from_("recurring_payments")
        .select("*")
        .eq("id", payment_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    rec = rec_resp.data
    if not rec:
        raise ValueError("Recurring payment record not found or access denied.")

    freq = rec.get("frequency") or "monthly"
    p_date = datetime.strptime(paid_date, "%Y-%m-%d").date()
    cycle_key = get_billing_cycle_key(p_date, freq)

    # 2. Check if instance exists
    inst_resp = (
        client
        .from_("recurring_payment_instances")
        .select("*")
        .eq("recurring_payment_id", payment_id)
        .eq("billing_cycle_key", cycle_key)
        .execute()
    )
    instance = inst_resp.data[0] if inst_resp.data else None

    inst_data = {
        "user_id": user_id,
        "recurring_payment_id": payment_id,
        "billing_cycle_key": cycle_key,
        "expected_date": p_date.isoformat(),
        "due_date": p_date.isoformat(),
        "expected_amount": rec.get("average_amount", actual_amount),
        "actual_amount": actual_amount,
        "paid_date": p_date.isoformat(),
        "status": "paid",
        "payment_source": "user_marked",
        "notes": notes,
        "updated_at": datetime.utcnow().isoformat(),
    }

    if instance:
        client.from_("recurring_payment_instances").update(inst_data).eq("id", instance["id"]).execute()
    else:
        client.from_("recurring_payment_instances").insert(inst_data).execute()

    # 3. Advance next expected payment date if marking the latest cycle
    next_expected = calculate_next_expected_date(p_date, freq)
    client.from_("recurring_payments").update({
        "last_paid_date": p_date.isoformat(),
        "next_expected_date": next_expected.isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", payment_id).execute()

    return {
        "success": True,
        "message": f"Marked {rec.get('merchant')} as PAID for cycle {cycle_key}.",
        "cycle_key": cycle_key,
        "next_expected_date": next_expected.isoformat(),
    }
