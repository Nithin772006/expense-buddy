"""
recurring_payment_service.py — Smart Recurring Payment Detector for Expense Buddy.

100% Deterministic, Explainable, and Privacy-Preserving.
Does NOT use Groq or any LLM.

Responsibilities:
1. Normalizes merchant names and groups expense transactions.
2. Computes interval statistics (mean, median, std) and cadence (weekly, bi-weekly, monthly, quarterly, yearly, irregular).
3. Evaluates amount stability (fixed_amount, mostly_stable, variable_but_periodic, highly_variable).
4. Evaluates domain suitability (distinguishing utility/subscription commitments from discretionary dining/shopping).
5. Computes an explainable 0–100 confidence score.
6. Classifies commitments into confirmed_recurring_payments vs possible_recurring_patterns.
7. Calculates the next expected payment date using calendar-aware date arithmetic (handling leap years and 28/29/30/31-day months).
"""

import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Optional
import numpy as np
from dateutil.relativedelta import relativedelta


# ── Domain Keywords & Rules ──────────────────────────────────────────────────

RECURRING_CATEGORY_KEYWORDS = {
    # Utilities & Telecom
    "electricity", "tneb", "bescom", "power", "electric", "bill",
    "internet", "fibernet", "broadband", "wifi", "act fibernet", "airtel xstream",
    "mobile", "recharge", "prepaid", "postpaid", "airtel", "jio", "vi", "vodafone", "bsnl",
    "water", "water bill", "gas", "lpg", "cylinder", "indane", "hp gas", "bharat gas",
    # Subscriptions & Entertainment
    "subscription", "membership", "netflix", "spotify", "prime", "amazon prime",
    "hotstar", "disney", "youtube", "apple", "google one", "icloud", "chatgpt",
    "gym", "fitness", "cult", "cult.fit", "newspaper",
    # Financial Commitments
    "rent", "house rent", "maintenance", "society", "apartment maintenance",
    "emi", "loan", "hfc", "mortgage", "insurance", "lic", "max life", "hdfc ergo",
    "credit card bill", "education fee", "school fee", "tuition", "college fee",
    # Recurring Household Vendors
    "milk", "milk vendor", "milkman", "country delight"
}

DISCRETIONARY_KEYWORDS = {
    "swiggy", "zomato", "blinkit", "zepto", "instamart", "bigbasket",
    "groceries", "grocery", "supermarket", "mart", "store", "provision",
    "restaurant", "cafe", "coffee", "starbucks", "mcdonald", "kfc", "pizza",
    "burger", "dining", "food order", "food delivery", "bakery",
    "shopping", "myntra", "flipkart", "amazon shopping", "ajio", "zara", "h&m",
    "uber", "ola", "rapido", "cinema", "pvr", "inox", "bookmyshow"
}


# ── Merchant Cleaning & Normalization ────────────────────────────────────────

def normalize_merchant_name(raw_name: Optional[str]) -> str:
    """
    Clean raw transaction merchant or description into a clean normalized key.
    Examples:
        'Electricity Bill - BESCOM' -> 'Electricity Bill'
        'ACT FIBERNET 999MBPS'      -> 'ACT Fibernet'
        'UPI-SWIGGY-12345'          -> 'Swiggy'
        'Spotify Premium'           -> 'Spotify Premium'
    """
    if not raw_name:
        return "Unknown Merchant"

    s = str(raw_name).strip()

    # Remove common UPI / banking prefixes
    s = re.sub(r'^(UPI[-/]|NEFT[-/]|IMPS[-/]|POS\s+|ACH[-/]|BILLDESK[-/]|PAYTM[-/]|RAZORPAY[-/])', '', s, flags=re.IGNORECASE).strip()

    # Specific common merchant aliases
    s_lower = s.lower()
    if "electricity" in s_lower or "tneb" in s_lower or "bescom" in s_lower:
        return "Electricity Bill"
    if "act fibernet" in s_lower or "fibernet" in s_lower or "broadband" in s_lower:
        return "Internet Bill"
    if "netflix" in s_lower:
        return "Netflix"
    if "spotify" in s_lower:
        return "Spotify Premium"
    if "prime" in s_lower:
        return "Amazon Prime"
    if "swiggy" in s_lower:
        return "Swiggy"
    if "zomato" in s_lower:
        return "Zomato"
    if "milk" in s_lower:
        return "Milk Vendor"
    if "airtel" in s_lower:
        return "Airtel Recharge"
    if "jio" in s_lower:
        return "Jio Recharge"
    if "groceries" in s_lower or "grocery" in s_lower:
        return "Groceries"
    if "shopping" in s_lower:
        return "Online Shopping"
    if "food order" in s_lower:
        return "Food Order"

    # Remove trailing digits/reference IDs (e.g. "Vendor 12345" -> "Vendor")
    s = re.sub(r'[\s\-_/]+[0-9]{3,}$', '', s)
    # Collapse multiple whitespace
    s = re.sub(r'\s+', ' ', s).strip()
    return s.title() if s else "Unknown Merchant"


def parse_tx_date(tx: dict) -> date:
    """Extract and parse date from a transaction dictionary."""
    d_raw = tx.get("transaction_date") or tx.get("date") or tx.get("created_at") or "2000-01-01"
    d_str = str(d_raw)[:10]
    try:
        return datetime.strptime(d_str, "%Y-%m-%d").date()
    except ValueError:
        return date(2000, 1, 1)


# ── Cadence Detection ────────────────────────────────────────────────────────

def detect_cadence(intervals: list[int]) -> tuple[str, float]:
    """
    Deterministically detect the payment cadence from a list of day intervals.
    Returns (cadence_name, cadence_consistency_score).
    
    Tolerances:
    - Weekly: avg 5-10 days, std <= 3
    - Bi-weekly: avg 11-18 days, std <= 4
    - Monthly: avg 20-40 days (centered around 28-35 days), std <= 7
    - Quarterly: avg 80-105 days, std <= 12
    - Yearly: avg 350-380 days, std <= 20
    - Irregular: anything else
    """
    if not intervals:
        return "irregular", 0.0

    avg_interval = float(np.mean(intervals))
    std_interval = float(np.std(intervals)) if len(intervals) > 1 else 0.0

    # Monthly check (standard monthly bills vary between 28 and 33 days)
    if 20.0 <= avg_interval <= 40.0:
        if std_interval <= 3.0:
            score = 1.0
        elif std_interval <= 7.0:
            score = 0.85
        elif std_interval <= 12.0:
            score = 0.65
        else:
            score = 0.40
            return "irregular", score
        return "monthly", score

    # Weekly check (typically 7 days)
    if 5.0 <= avg_interval <= 10.0:
        if std_interval <= 1.5:
            score = 1.0
        elif std_interval <= 3.5:
            score = 0.80
        else:
            score = 0.40
            return "irregular", score
        return "weekly", score

    # Bi-weekly check (typically 14 days)
    if 11.0 <= avg_interval <= 18.0:
        if std_interval <= 2.5:
            score = 0.95
        elif std_interval <= 5.0:
            score = 0.75
        else:
            score = 0.40
            return "irregular", score
        return "bi-weekly", score

    # Quarterly check (approx 90 days)
    if 80.0 <= avg_interval <= 105.0:
        score = 0.90 if std_interval <= 8.0 else 0.70
        return "quarterly", score

    # Yearly check (approx 365 days)
    if 350.0 <= avg_interval <= 380.0:
        score = 0.90 if std_interval <= 15.0 else 0.70
        return "yearly", score

    return "irregular", 0.20


# ── Amount Stability ─────────────────────────────────────────────────────────

def evaluate_amount_stability(amounts: list[float], is_utility: bool = False) -> tuple[str, float]:
    """
    Evaluate amount stability.
    Returns (stability_label, stability_score).
    
    Categories:
    - fixed_amount: CV <= 0.05 or std <= 1.0 (Subscriptions, Rent, Internet)
    - mostly_stable: CV <= 0.15 (Slightly fluctuating plans or slight price changes)
    - variable_but_periodic: CV <= 0.35 or is_utility (Electricity, Water, LPG, Milk)
    - highly_variable: CV > 0.35
    """
    if not amounts:
        return "highly_variable", 0.0

    avg_amt = float(np.mean(amounts))
    if avg_amt <= 0:
        return "highly_variable", 0.0

    std_amt = float(np.std(amounts))
    cv = std_amt / avg_amt

    if std_amt <= 1.0 or cv <= 0.05:
        return "fixed_amount", 1.0
    elif cv <= 0.15:
        return "mostly_stable", 0.85
    elif cv <= 0.35 or is_utility:
        return "variable_but_periodic", 0.65
    else:
        return "highly_variable", 0.30


# ── Next Expected Date Calculation ───────────────────────────────────────────

def calculate_next_expected_date(last_date: date, frequency: str) -> date:
    """
    Calculate the next expected payment date using calendar-aware date arithmetic.
    Handles month-ends (e.g. Jan 31 -> Feb 28/29 -> Mar 31) and leap years safely.
    """
    freq = (frequency or "monthly").lower()
    if freq == "weekly":
        return last_date + timedelta(days=7)
    elif freq == "bi-weekly":
        return last_date + timedelta(days=14)
    elif freq == "monthly":
        return last_date + relativedelta(months=1)
    elif freq == "quarterly":
        return last_date + relativedelta(months=3)
    elif freq == "yearly":
        return last_date + relativedelta(years=1)
    else:
        # For irregular or unspecified, estimate standard 30-day cycle
        return last_date + timedelta(days=30)


# ── Explainable Confidence Scoring ───────────────────────────────────────────

def calculate_confidence_score(
    occurrence_count: int,
    cadence: str,
    cadence_score: float,
    amount_stability: str,
    stability_score: float,
    is_recurring_category: bool,
    is_discretionary: bool,
    day_span: int,
) -> tuple[float, list[str]]:
    """
    Explainable confidence score from 0–100 based on weighted financial signals.
    
    Weights:
    1. Occurrence Count: max 25 pts
       - 1 occurrence = 0 pts
       - 2 occurrences = 10 pts
       - 3 occurrences = 18 pts
       - 4+ occurrences = 25 pts
    2. Cadence Consistency: max 30 pts
       - Regular monthly/weekly/biweekly with good std = up to 30 pts
       - Irregular cadence = 5 pts
    3. Amount Stability: max 20 pts
       - fixed_amount = 20 pts
       - mostly_stable = 17 pts
       - variable_but_periodic = 13 pts
       - highly_variable = 5 pts
    4. Category Context: max 15 pts
       - Recurring keyword/category = 15 pts
       - Neutral/General = 6 pts
       - Discretionary = 0 pts
    5. History Duration: max 10 pts
       - >= 60 days = 10 pts
       - >= 30 days = 6 pts
       - < 30 days = 2 pts
    """
    evidence = []

    # 1. Occurrence count
    if occurrence_count >= 4:
        occ_pts = 25.0
        evidence.append(f"{occurrence_count} transaction occurrences (Strong history)")
    elif occurrence_count == 3:
        occ_pts = 18.0
        evidence.append("3 transaction occurrences (Established pattern)")
    elif occurrence_count == 2:
        occ_pts = 10.0
        evidence.append("2 transaction occurrences (Preliminary pattern)")
    else:
        occ_pts = 0.0
        evidence.append("Only 1 transaction occurrence (Insufficient evidence)")

    # 2. Cadence
    if cadence != "irregular":
        cad_pts = 30.0 * cadence_score
        evidence.append(f"Consistent {cadence} payment cadence ({int(cadence_score * 100)}% interval consistency)")
    else:
        cad_pts = 5.0
        evidence.append("Irregular payment intervals (Cadence not predictable)")

    # 3. Amount stability
    amt_pts = 20.0 * stability_score
    if amount_stability == "fixed_amount":
        evidence.append("Fixed payment amount across all occurrences")
    elif amount_stability == "mostly_stable":
        evidence.append("Mostly stable payment amounts with minimal variation")
    elif amount_stability == "variable_but_periodic":
        evidence.append("Variable but periodic amounts (Typical for utility bills)")
    else:
        evidence.append("High amount variance across payments")

    # 4. Category Context
    if is_recurring_category and not is_discretionary:
        cat_pts = 15.0
        evidence.append("Merchant / Category indicates confirmed recurring commitment")
    elif is_discretionary:
        cat_pts = 0.0
        evidence.append("Merchant categorized as discretionary spending (Not a fixed commitment)")
    else:
        cat_pts = 6.0
        evidence.append("Standard recurring candidate")

    # 5. History Duration
    if day_span >= 60:
        span_pts = 10.0
        evidence.append(f"Observed over {day_span} days of history")
    elif day_span >= 30:
        span_pts = 6.0
        evidence.append(f"Observed over {day_span} days of history")
    else:
        span_pts = 2.0
        evidence.append("Short history span (< 30 days)")

    total_score = round(occ_pts + cad_pts + amt_pts + cat_pts + span_pts, 1)
    total_score = min(100.0, max(0.0, total_score))
    return total_score, evidence


# ── Main Detection Pipeline ──────────────────────────────────────────────────

def detect_recurring_commitments(transactions: list[dict]) -> dict:
    """
    Main deterministic recurring payment detector.
    
    Accepts raw or normalized user transactions.
    Returns:
    {
        "confirmed_recurring_payments": [...],
        "possible_recurring_patterns": [...],
        "insufficient_evidence_patterns": [...],
        "summary": {
            "confirmed_count": int,
            "possible_count": int,
            "total_monthly_commitment": float
        }
    }
    """
    if not transactions:
        return {
            "confirmed_recurring_payments": [],
            "possible_recurring_patterns": [],
            "insufficient_evidence_patterns": [],
            "summary": {
                "confirmed_count": 0,
                "possible_count": 0,
                "total_monthly_commitment": 0.0
            }
        }

    # 1. Filter debits with valid amount > 0
    debit_txs = []
    for tx in transactions:
        t_type = str(tx.get("transaction_type") or tx.get("type") or "debit").strip().lower()
        if t_type != "debit":
            continue
        try:
            amt = float(tx.get("amount") or 0)
            if amt > 0:
                debit_txs.append(tx)
        except (ValueError, TypeError):
            continue

    if len(debit_txs) < 2:
        return {
            "confirmed_recurring_payments": [],
            "possible_recurring_patterns": [],
            "insufficient_evidence_patterns": [],
            "summary": {
                "confirmed_count": 0,
                "possible_count": 0,
                "total_monthly_commitment": 0.0
            }
        }

    # 2. Group transactions by normalized merchant
    merchant_groups = defaultdict(list)
    for tx in debit_txs:
        raw_name = tx.get("merchant") or tx.get("description") or ""
        norm_name = normalize_merchant_name(raw_name)
        merchant_groups[norm_name].append(tx)

    confirmed_list = []
    possible_list = []
    insufficient_list = []

    for norm_name, tx_list in merchant_groups.items():
        # Sort chronologically
        sorted_txs = sorted(tx_list, key=parse_tx_date)
        tx_dates = [parse_tx_date(t) for t in sorted_txs]
        amounts = [float(t.get("amount") or 0) for t in sorted_txs]
        categories = [str(t.get("category") or "").strip() for t in sorted_txs if t.get("category")]
        primary_category = categories[0] if categories else "Recurring Expense"
        payment_methods = [str(t.get("payment_method") or "").strip() for t in sorted_txs if t.get("payment_method")]
        primary_payment_method = payment_methods[0] if payment_methods else None
        source_tx_ids = [str(t.get("id") or "") for t in sorted_txs if t.get("id")]

        occurrence_count = len(sorted_txs)
        first_date = tx_dates[0]
        last_date = tx_dates[-1]
        day_span = max(1, (last_date - first_date).days)

        # Calculate intervals
        intervals = [(tx_dates[i] - tx_dates[i - 1]).days for i in range(1, len(tx_dates))]
        avg_interval = float(np.mean(intervals)) if intervals else 0.0
        median_interval = float(np.median(intervals)) if intervals else 0.0
        std_interval = float(np.std(intervals)) if len(intervals) > 1 else 0.0

        # Amount statistics
        avg_amount = float(np.mean(amounts))
        median_amount = float(np.median(amounts))
        min_amount = float(np.min(amounts))
        max_amount = float(np.max(amounts))
        std_amount = float(np.std(amounts))

        # Check domain & keywords
        name_lower = norm_name.lower()
        cat_lower = primary_category.lower()
        is_recurring_merchant = any(kw in name_lower for kw in RECURRING_CATEGORY_KEYWORDS)
        is_recurring_category = is_recurring_merchant or any(kw in cat_lower for kw in RECURRING_CATEGORY_KEYWORDS)

        # If the merchant name itself indicates a recurring utility/bill/subscription, it is NOT discretionary
        if is_recurring_merchant:
            is_discretionary = False
        else:
            is_discretionary = any(kw in name_lower or kw in cat_lower for kw in DISCRETIONARY_KEYWORDS)

        # Cadence & Stability
        cadence, cadence_score = detect_cadence(intervals)
        amount_stability, stability_score = evaluate_amount_stability(amounts, is_utility=is_recurring_category)

        # Confidence Score
        confidence_score, evidence = calculate_confidence_score(
            occurrence_count=occurrence_count,
            cadence=cadence,
            cadence_score=cadence_score,
            amount_stability=amount_stability,
            stability_score=stability_score,
            is_recurring_category=is_recurring_category,
            is_discretionary=is_discretionary,
            day_span=day_span,
        )

        # Next Expected Payment Date
        next_expected = calculate_next_expected_date(last_date, cadence)

        # Monthly Equivalent Calculation
        if cadence == "monthly":
            monthly_equiv = avg_amount
        elif cadence == "weekly":
            monthly_equiv = avg_amount * (52.0 / 12.0)
        elif cadence == "bi-weekly":
            monthly_equiv = avg_amount * (26.0 / 12.0)
        elif cadence == "quarterly":
            monthly_equiv = avg_amount / 3.0
        elif cadence == "yearly":
            monthly_equiv = avg_amount / 12.0
        else:
            monthly_equiv = avg_amount

        # Classification Logic:
        # Confirmed Recurring Payment REQUIRES:
        # 1. Periodic cadence (NEVER irregular)
        # 2. Not discretionary (Swiggy, Groceries, Shopping, Dining are rejected from confirmed)
        # 3. Minimum 3 occurrences (or 2 occurrences if high confidence fixed utility/subscription with score >= 65)
        # 4. Confidence score >= 60
        is_confirmed = False
        rejection_reason = None

        if is_discretionary:
            is_confirmed = False
            rejection_reason = "Classified as discretionary spending (dining, shopping, food delivery)."
        elif cadence == "irregular":
            is_confirmed = False
            rejection_reason = "Irregular payment cadence detected; does not exhibit a periodic schedule."
        elif occurrence_count < 2:
            is_confirmed = False
            rejection_reason = "Insufficient historical occurrences to establish recurrence."
        elif occurrence_count == 2:
            # 2 occurrences can only be confirmed if fixed amount, recurring category, and strong interval match
            if is_recurring_category and amount_stability in ("fixed_amount", "mostly_stable") and confidence_score >= 65.0:
                is_confirmed = True
            else:
                is_confirmed = False
                rejection_reason = "Only 2 occurrences recorded; requires more payment history to confirm."
        elif confidence_score >= 60.0:
            is_confirmed = True
        else:
            is_confirmed = False
            rejection_reason = "Overall confidence score is below the 60% threshold for confirmed commitments."

        payment_record = {
            "merchant": norm_name,
            "normalized_merchant": norm_name,
            "category": primary_category,
            "frequency": cadence,
            "status": "active" if is_confirmed else "insufficient_evidence",
            "confidence_score": confidence_score,
            "confidence": round(confidence_score / 100.0, 2),
            "occurrence_count": occurrence_count,
            "occurrences": occurrence_count,
            "first_seen_date": first_date.isoformat(),
            "last_paid_date": last_date.isoformat(),
            "next_expected_date": next_expected.isoformat(),
            "average_amount": round(avg_amount, 2),
            "amount": round(avg_amount, 2),
            "median_amount": round(median_amount, 2),
            "min_amount": round(min_amount, 2),
            "max_amount": round(max_amount, 2),
            "monthly_equivalent": round(monthly_equiv, 2),
            "amount_stability": amount_stability,
            "average_interval_days": round(avg_interval, 1),
            "payment_method": primary_payment_method,
            "is_confirmed": is_confirmed,
            "rejection_reason": rejection_reason,
            "detection_evidence": {
                "evidence_points": evidence,
                "intervals": intervals,
                "interval_std": round(std_interval, 2),
                "amount_std": round(std_amount, 2),
                "day_span": day_span,
            },
            "source_transaction_ids": source_tx_ids,
        }

        if is_confirmed:
            confirmed_list.append(payment_record)
        elif confidence_score >= 40.0:
            possible_list.append(payment_record)
        else:
            insufficient_list.append(payment_record)

    # Sort descending by monthly equivalent
    confirmed_list.sort(key=lambda x: x["monthly_equivalent"], reverse=True)
    possible_list.sort(key=lambda x: x["monthly_equivalent"], reverse=True)
    insufficient_list.sort(key=lambda x: x["monthly_equivalent"], reverse=True)

    total_monthly = sum(x["monthly_equivalent"] for x in confirmed_list)
    possible_monthly = sum(x["monthly_equivalent"] for x in possible_list)

    return {
        "confirmed_recurring_payments": confirmed_list,
        "confirmed_commitments": confirmed_list,
        "confirmed_recurring_commitments": confirmed_list,
        "confirmed_total": round(total_monthly, 2),
        "confirmed_recurring_total": round(total_monthly, 2),
        "possible_recurring_patterns": possible_list,
        "possible_patterns": possible_list,
        "possible_discretionary_patterns": possible_list,
        "possible_total": round(possible_monthly, 2),
        "possible_recurring_total": round(possible_monthly, 2),
        "possible_discretionary_patterns_total": round(possible_monthly, 2),
        "insufficient_evidence_patterns": insufficient_list,
        "all_commitments": confirmed_list + possible_list,
        "summary": {
            "confirmed_count": len(confirmed_list),
            "possible_count": len(possible_list),
            "insufficient_count": len(insufficient_list),
            "total_monthly_commitment": round(total_monthly, 2),
        }
    }

