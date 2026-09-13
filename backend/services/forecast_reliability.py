"""
forecast_reliability.py — Deterministic Reliability Evaluation & Confidence Scoring for Expense Buddy.

Transparently compares the ML model output against statistical transaction baselines
without magic weighting or unvalidated formulas.
"""

from typing import Optional
import numpy as np

# ── Configurable Reliability Thresholds ──────────────────────────────────────
MIN_TRANSACTIONS_FOR_FORECAST = 3
MIN_DATE_SPAN_DAYS = 7

# Ratio of ML prediction to Transaction Baseline considered reasonable [0.10, 5.0]
MIN_REASONABLE_PREDICTION_RATIO = 0.10
MAX_REASONABLE_PREDICTION_RATIO = 5.0

# Log-scale output indicator threshold:
# When model outputs < 15.0 while historical average transaction is > 100.0,
# it indicates the model produced an un-exponentiated log value ln(amount).
LOG_SCALE_THRESHOLD = 15.0


def evaluate_forecast_reliability(
    ml_prediction: Optional[float],
    stats: dict,
    recurring_commitments: list[dict],
    raw_model_output: Optional[float] = None,
) -> dict:
    """
    Deterministically evaluates ML forecast reliability and calculates confidence score (0-100).
    
    Target Unit: Next Transaction Amount (expense transaction level)
    Statistical Baseline: Recent Average Transaction (or Historical Average Transaction)
    """
    tx_count = stats.get("total_transactions", 0)
    day_span = stats.get("date_range_days", 0)
    hist_avg_tx = stats.get("historical_average_transaction", 0.0)
    recent_avg_tx = stats.get("recent_average_transaction", 0.0)

    # Use recent average transaction as primary transaction-level baseline
    statistical_baseline = recent_avg_tx if recent_avg_tx > 0 else hist_avg_tx

    reasons = []
    
    # 1. Check data sufficiency
    if tx_count < MIN_TRANSACTIONS_FOR_FORECAST or statistical_baseline <= 0:
        return {
            "reliability": "insufficient_data",
            "confidence": 0,
            "prediction_ratio": None,
            "statistical_baseline": round(statistical_baseline, 2),
            "fallback_prediction": round(statistical_baseline, 2),
            "fallback_type": "statistical_fallback",
            "is_uncalibrated_log": False,
            "reliability_reasons": [
                f"Insufficient historical transactions ({tx_count} available, minimum {MIN_TRANSACTIONS_FOR_FORECAST} required)."
            ],
            "confidence_breakdown": {
                "data_volume_score": 0,
                "history_span_score": 0,
                "recurring_signal_score": 0,
                "model_agreement_score": 0,
                "total": 0,
            }
        }

    if ml_prediction is None:
        return {
            "reliability": "insufficient_data",
            "confidence": 10,
            "prediction_ratio": None,
            "statistical_baseline": round(statistical_baseline, 2),
            "fallback_prediction": round(statistical_baseline, 2),
            "fallback_type": "statistical_fallback",
            "is_uncalibrated_log": False,
            "reliability_reasons": ["ML prediction is unavailable."],
            "confidence_breakdown": {
                "data_volume_score": 10,
                "history_span_score": 0,
                "recurring_signal_score": 0,
                "model_agreement_score": 0,
                "total": 10,
            }
        }

    # 2. Check for invalid or unreasonable prediction
    is_uncalibrated_log = False
    if ml_prediction <= 0:
        reliability = "low_reliability"
        ratio = 0.0
        reasons.append(f"ML prediction ({ml_prediction}) is non-positive.")
    else:
        ratio = ml_prediction / statistical_baseline if statistical_baseline > 0 else 1.0

        # Detect log-scale output anomaly (e.g. ₹7.61 vs ₹1,170 baseline)
        if ml_prediction <= LOG_SCALE_THRESHOLD and statistical_baseline > 100.0:
            is_uncalibrated_log = True
            reliability = "low_reliability"
            reasons.append(
                f"ML prediction ({ml_prediction:.2f}) appears to be an un-exponentiated log-scale value. "
                f"It represents {ratio * 100:.1f}% of historical average transaction (INR {statistical_baseline:.2f})."
            )
        elif ratio < MIN_REASONABLE_PREDICTION_RATIO:
            reliability = "low_reliability"
            reasons.append(
                f"ML prediction ({ml_prediction:.2f}) is abnormally low compared to historical baseline (INR {statistical_baseline:.2f}, ratio: {ratio:.3f})."
            )
        elif ratio > MAX_REASONABLE_PREDICTION_RATIO:
            reliability = "low_reliability"
            reasons.append(
                f"ML prediction ({ml_prediction:.2f}) is abnormally high compared to historical baseline (INR {statistical_baseline:.2f}, ratio: {ratio:.3f})."
            )
        elif 0.5 <= ratio <= 2.0:
            reliability = "high_reliability"
            reasons.append(
                f"ML prediction ({ml_prediction:.2f}) aligns closely with recent transaction baseline (INR {statistical_baseline:.2f}, ratio: {ratio:.2f})."
            )
        else:
            reliability = "medium_reliability"
            reasons.append(
                f"ML prediction ({ml_prediction:.2f}) deviates moderately from baseline (INR {statistical_baseline:.2f}, ratio: {ratio:.2f})."
            )

    # 3. Transparent Confidence Score Calculation (0 to 100)
    # Component A: Data volume (0 to 30 points)
    if tx_count >= 50:
        vol_score = 30
    elif tx_count >= 20:
        vol_score = 22
    elif tx_count >= 10:
        vol_score = 15
    elif tx_count >= 5:
        vol_score = 10
    else:
        vol_score = 5

    # Component B: History span (0 to 20 points)
    if day_span >= 90:
        span_score = 20
    elif day_span >= 30:
        span_score = 15
    elif day_span >= 14:
        span_score = 10
    elif day_span >= 7:
        span_score = 5
    else:
        span_score = 0

    # Component C: Recurring signal clarity (0 to 20 points)
    rec_count = len(recurring_commitments)
    if rec_count >= 4:
        rec_score = 20
    elif rec_count >= 2:
        rec_score = 14
    elif rec_count >= 1:
        rec_score = 8
    else:
        rec_score = 0

    # Component D: Model to baseline agreement (0 to 30 points)
    if reliability == "high_reliability":
        agree_score = 30
    elif reliability == "medium_reliability":
        agree_score = 18
    else:
        agree_score = 5

    total_confidence = min(100, max(0, vol_score + span_score + rec_score + agree_score))

    # Fallback prediction is always the transparent statistical baseline
    fallback_prediction = round(statistical_baseline, 2)

    return {
        "reliability": reliability,
        "confidence": total_confidence,
        "prediction_ratio": round(ratio, 4) if ratio is not None else None,
        "statistical_baseline": round(statistical_baseline, 2),
        "fallback_prediction": fallback_prediction,
        "fallback_type": "statistical_fallback",
        "raw_model_output": round(raw_model_output, 4) if raw_model_output is not None else None,
        "is_uncalibrated_log": is_uncalibrated_log,
        "is_log_calibrated": raw_model_output is not None,
        "reliability_reasons": reasons,
        "confidence_breakdown": {
            "data_volume_score": vol_score,
            "history_span_score": span_score,
            "recurring_signal_score": rec_score,
            "model_agreement_score": agree_score,
            "total": total_confidence,
        },
    }
