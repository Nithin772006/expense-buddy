"""
forecast_service.py — Stage A Hybrid Forecast Foundation for Expense Buddy.

Orchestrates the entire Stage A forecasting pipeline:
1. Loads user transactions securely from Supabase using verified auth.
2. Filters to authentic debit expenses.
3. Computes ML feature vectors and calls existing forecasting_service.predict() (unmodified).
4. Computes deterministic statistical metrics & baseline.
5. Computes recurring commitments signals.
6. Evaluates reliability & calculates transparent confidence score (0-100).
7. Assembles complete structured hybrid forecast response.
"""

import logging
from datetime import datetime
from typing import Optional
import numpy as np

from services import forecasting_service
from services.forecast_metrics import (
    extract_expense_debits,
    compute_spending_statistics,
    detect_recurring_commitments,
    parse_tx_date,
)
from services.forecast_reliability import evaluate_forecast_reliability
from services.supabase_client import get_supabase_client

logger = logging.getLogger("expense_buddy.forecast")


def build_forecast_feature_dict(sorted_debits: list[dict]) -> Optional[dict]:
    """
    Construct the 9 features required by the existing trained forecasting model.
    Requires at least 3 transactions.
    """
    if len(sorted_debits) < 3:
        return None

    amounts = [float(t.get("amount") or 0.0) for t in sorted_debits]
    n = len(amounts)

    lag_1 = amounts[-1]
    lag_2 = amounts[-2]
    last_3 = amounts[-3:]
    rolling_3 = float(np.mean(last_3))
    hist_avg = float(np.mean(amounts))
    prev_std = float(np.std(amounts)) if n > 1 else 0.0

    try:
        d1 = parse_tx_date(sorted_debits[-1])
        d2 = parse_tx_date(sorted_debits[-2])
        days_since = max(0, (d1 - d2).days)
    except Exception:
        days_since = 1

    now = datetime.now()
    day_of_week = now.weekday()
    day_of_month = now.day

    return {
        "lag_1": round(lag_1, 2),
        "lag_2": round(lag_2, 2),
        "rolling_3_mean": round(rolling_3, 2),
        "historical_avg_spending": round(hist_avg, 2),
        "previous_transaction_count": int(n - 1),
        "days_since_previous_expense": int(days_since),
        "previous_std": round(prev_std, 2),
        "day_of_week": int(day_of_week),
        "day_of_month": int(day_of_month),
    }


def generate_hybrid_forecast_from_transactions(
    transactions: list[dict],
    user_id: Optional[str] = None,
    include_ai_reasoning: bool = True,
) -> dict:
    """
    Core function to compute the complete Hybrid Forecast and AI Reasoning from a list of transactions.
    """
    # 1. Extract debit transactions
    debits = extract_expense_debits(transactions)
    sorted_debits = sorted(debits, key=parse_tx_date)

    # 2. Compute statistical baseline metrics
    stats = compute_spending_statistics(transactions)

    # 3. Detect recurring commitments signal (confirmed bills vs possible discretionary patterns)
    rec_data = detect_recurring_commitments(transactions)
    confirmed_total = rec_data.get("confirmed_total", 0.0)
    confirmed_commitments = rec_data.get("confirmed_commitments", [])
    possible_total = rec_data.get("possible_total", 0.0)
    possible_patterns = rec_data.get("possible_patterns", [])
    all_commitments = rec_data.get("all_commitments", [])

    # 4. Generate ML prediction with inverse log transformation: exp(raw_output)
    ml_prediction = None
    raw_model_output = None
    ml_features = None
    if len(sorted_debits) >= 3:
        ml_features = build_forecast_feature_dict(sorted_debits)
        if ml_features:
            try:
                res = forecasting_service.predict(ml_features)
                raw_pred = float(res.get("forecasted_amount", 0.0))
                raw_model_output = round(raw_pred, 4)
                # Model was trained on ln(amount); apply exponential calibration
                calibrated_pred = float(np.exp(raw_pred))
                ml_prediction = round(max(0.0, calibrated_pred), 2)
            except Exception as e:
                logger.error(f"[Forecast] ML model prediction failed: {e}")
                ml_prediction = None
                raw_model_output = None

    # 5. Evaluate reliability and confidence
    rel_eval = evaluate_forecast_reliability(
        ml_prediction=ml_prediction,
        stats=stats,
        recurring_commitments=confirmed_commitments,
        raw_model_output=raw_model_output,
    )

    # 6. Build structured response
    insufficient_data = stats["total_transactions"] < 3

    forecast_result = {
        "ml_prediction": ml_prediction,
        "raw_model_output": raw_model_output,
        "is_log_calibrated": raw_model_output is not None,
        "ml_prediction_unit": "next_transaction_amount",
        "statistical_baseline": rel_eval["statistical_baseline"],
        "fallback_prediction": rel_eval["fallback_prediction"],
        "fallback_type": rel_eval["fallback_type"],
        "forecast_unit": "next_transaction_amount",
        "historical_average": stats["historical_average_transaction"],
        "historical_monthly_average": stats["historical_monthly_average"],
        "total_historical_spending": stats["total_historical_spending"],
        "total_transactions": stats["total_transactions"],
        "recent_30_days": stats["recent_30_day_spending"],
        "recent_60_days": stats["recent_60_day_spending"],
        "average_daily_spending": stats["average_daily_spending"],
        "trend": stats["trend"],
        "trend_percentage": stats["trend_percentage"],
        "confirmed_recurring_total": confirmed_total,
        "confirmed_recurring_commitments": confirmed_commitments,
        "possible_recurring_total": possible_total,
        "possible_recurring_patterns": possible_patterns,
        "possible_discretionary_patterns_total": possible_total,
        "possible_discretionary_patterns": possible_patterns,
        # recurring_commitment_estimate strictly exposes CONFIRMED commitments
        "recurring_commitment_estimate": confirmed_total,
        "recurring_commitments": confirmed_commitments,
        "all_recurring_signals": all_commitments,
        "prediction_ratio": rel_eval["prediction_ratio"],
        "reliability": rel_eval["reliability"],
        "reliability_reasons": rel_eval["reliability_reasons"],
        "is_uncalibrated_log": rel_eval["is_uncalibrated_log"],
        "confidence": rel_eval["confidence"],
        "confidence_breakdown": rel_eval["confidence_breakdown"],
        "insufficient_data": insufficient_data,
        "monthly_totals": stats["monthly_totals"],
        "reasoning_inputs": {
            "ml_features": ml_features,
            "date_range_days": stats["date_range_days"],
            "first_date": stats["first_date"],
            "last_date": stats["last_date"],
        },
    }

    # 7. Generate Stage B Groq AI Financial Reasoning
    if include_ai_reasoning and not insufficient_data:
        try:
            from services.groq_financial_service import get_groq_financial_service
            groq_svc = get_groq_financial_service()
            forecast_result["ai_reasoning"] = groq_svc.generate_reasoning(forecast_result, user_id=user_id)
        except Exception as e:
            logger.error(f"[Forecast] AI reasoning generation failed: {e}")
            from services.groq_financial_service import generate_deterministic_fallback_reasoning
            forecast_result["ai_reasoning"] = generate_deterministic_fallback_reasoning(
                forecast_result,
                reason_note="AI reasoning temporarily unavailable. Showing deterministic financial analysis."
            )
    else:
        from services.groq_financial_service import generate_deterministic_fallback_reasoning
        forecast_result["ai_reasoning"] = generate_deterministic_fallback_reasoning(
            forecast_result,
            reason_note="Insufficient transaction history for advanced reasoning." if insufficient_data else "AI reasoning disabled."
        )

    return forecast_result


def get_user_hybrid_forecast(
    user_id: str,
    token: Optional[str] = None,
    include_ai_reasoning: bool = True,
) -> dict:
    """
    Fetch transactions for authenticated user from Supabase and generate Stage A + Stage B forecast.
    """
    client = get_supabase_client(token)
    response = (
        client
        .from_("transactions")
        .select("*")
        .eq("user_id", user_id)
        .order("transaction_date", desc=False)
        .execute()
    )
    transactions = response.data or []
    return generate_hybrid_forecast_from_transactions(
        transactions=transactions,
        user_id=user_id,
        include_ai_reasoning=include_ai_reasoning,
    )
