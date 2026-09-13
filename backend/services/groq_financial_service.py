"""
groq_financial_service.py — Stage B Groq AI Financial Reasoning for Expense Buddy.

Provides high-level, human-friendly financial reasoning and explanations
over Stage A deterministic metrics and ML outputs.

Key Principles:
1. Groq is an EXPLANATION layer, NOT the numerical forecast engine.
2. Groq NEVER invents, recalculates, or overrides numerical forecasts.
3. Strict data privacy: Only aggregated metrics are sent; zero PII or raw transactions.
4. Robust failure handling: If Groq is unconfigured or fails, deterministic fallback reasoning is returned.
5. In-memory caching prevents duplicate LLM invocations.
"""

import hashlib
import json
import logging
import os
import time
from typing import Optional

logger = logging.getLogger("expense_buddy.groq_reasoning")

DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"
FALLBACK_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]

# In-memory reasoning cache: {cache_key: (timestamp, reasoning_dict)}
_REASONING_CACHE: dict[str, tuple[float, dict]] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes


def _compute_metrics_fingerprint(metrics: dict) -> str:
    """Create a hash fingerprint of the forecast metrics for caching."""
    key_fields = [
        str(metrics.get("total_transactions", 0)),
        str(metrics.get("total_historical_spending", 0.0)),
        str(metrics.get("ml_prediction", 0.0)),
        str(metrics.get("statistical_baseline", 0.0)),
        str(metrics.get("trend", "")),
        str(metrics.get("reliability", "")),
        str(metrics.get("confirmed_recurring_total", 0.0)),
    ]
    raw = "|".join(key_fields)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def sanitize_metrics_for_groq(forecast_data: dict) -> dict:
    """
    CRITICAL PRIVACY FILTER:
    Strictly extracts ONLY aggregated numerical and derived statistical metrics.
    NEVER includes:
    - user IDs
    - account numbers
    - raw transaction lists / descriptions / bank memo lines
    - raw dates or timestamps of individual purchases
    - personal identifiers / emails / tokens
    """
    # Safe confirmed recurring signals (only category/type + aggregate amounts)
    # Strict safety invariant: An irregular transaction MUST NEVER appear in confirmed_recurring_commitments
    confirmed_recs = []
    for r in forecast_data.get("confirmed_recurring_commitments", []):
        freq = str(r.get("frequency") or "").lower()
        if freq == "irregular":
            continue
        confirmed_recs.append({
            "category": r.get("merchant", "Fixed Expense"),
            "monthly_amount": round(float(r.get("monthly_equivalent", 0.0)), 2),
            "frequency": r.get("frequency", "monthly"),
        })

    possible_patterns_summary = []
    patterns_list = (
        forecast_data.get("possible_discretionary_patterns") or
        forecast_data.get("possible_recurring_patterns") or
        []
    )
    for r in patterns_list:
        possible_patterns_summary.append({
            "category": r.get("merchant", "Discretionary"),
            "estimated_amount": round(float(r.get("monthly_equivalent", 0.0)), 2),
            "frequency": r.get("frequency", "irregular"),
        })

    possible_patterns_total = (
        forecast_data.get("possible_discretionary_patterns_total") or
        forecast_data.get("possible_recurring_total") or
        0.0
    )

    sanitized = {
        "forecast_unit": forecast_data.get("forecast_unit", "next_transaction_amount"),
        "ml_prediction": forecast_data.get("ml_prediction"),
        "raw_model_output_log_scale": forecast_data.get("raw_model_output"),
        "statistical_baseline": forecast_data.get("statistical_baseline"),
        "fallback_prediction": forecast_data.get("fallback_prediction"),
        "historical_average_transaction": forecast_data.get("historical_average"),
        "historical_monthly_average": forecast_data.get("historical_monthly_average"),
        "total_historical_spending": forecast_data.get("total_historical_spending"),
        "total_transactions_analyzed": forecast_data.get("total_transactions"),
        "recent_30_day_spending": forecast_data.get("recent_30_days"),
        "recent_60_day_spending": forecast_data.get("recent_60_days"),
        "average_daily_spending": forecast_data.get("average_daily_spending"),
        "spending_trend": forecast_data.get("trend"),
        "trend_percentage": forecast_data.get("trend_percentage"),
        "reliability_rating": forecast_data.get("reliability"),
        "reliability_reasons": forecast_data.get("reliability_reasons", []),
        "confidence_score": forecast_data.get("confidence"),
        "confirmed_recurring_total": forecast_data.get("confirmed_recurring_total", 0.0),
        "confirmed_recurring_commitments": confirmed_recs,
        "possible_discretionary_patterns_total": round(float(possible_patterns_total), 2),
        "possible_discretionary_patterns": possible_patterns_summary,
    }
    return sanitized


def generate_deterministic_fallback_reasoning(
    forecast_data: dict,
    reason_note: str = "AI reasoning temporarily unavailable. Showing deterministic financial analysis.",
) -> dict:
    """
    Deterministic rule-based fallback response if Groq is unavailable, unconfigured, or fails validation.
    Guarantees that the frontend always receives the exact 8 required structured keys.
    """
    ml_pred = forecast_data.get("ml_prediction")
    baseline = forecast_data.get("statistical_baseline", 0.0)
    fallback = forecast_data.get("fallback_prediction", baseline)
    rel = forecast_data.get("reliability", "insufficient_data")
    trend = forecast_data.get("trend", "stable")
    conf = forecast_data.get("confidence", 0)
    trend_pct = forecast_data.get("trend_percentage", 0.0)
    confirmed_rec = forecast_data.get("confirmed_recurring_total", 0.0)

    # Risk level derivation
    if rel == "low_reliability" or trend == "increasing":
        risk_level = "medium" if conf > 50 else "high"
    elif rel == "high_reliability" and trend == "decreasing":
        risk_level = "low"
    else:
        risk_level = "medium"

    summary = (
        f"Forecast analysis completed with a {conf}/100 confidence score. "
        f"Spending trend is currently {trend.replace('_', ' ')}."
    )

    if rel == "low_reliability":
        rel_expl = (
            f"The machine-learning forecast differs substantially from your statistical baseline "
            f"(INR {baseline:.2f}). To protect your financial planning from regression variance, "
            f"the system recommends the statistical fallback of INR {fallback:.2f}."
        )
    elif rel == "high_reliability":
        rel_expl = (
            f"The machine-learning forecast aligns closely with your historical average spending cadence, "
            f"indicating consistent purchasing patterns."
        )
    else:
        rel_expl = (
            f"Spending history shows moderate variation. Historical average is INR {baseline:.2f} per transaction."
        )

    forecast_expl = (
        f"Your next transaction baseline is estimated at INR {fallback:.2f} based on verified debit history. "
        f"The raw ML model estimated INR {ml_pred:.2f}." if ml_pred else
        f"Your next transaction baseline is estimated at INR {fallback:.2f} based on verified debit history."
    )

    trend_expl = (
        f"Recent 30-day spending indicates an {trend} trajectory ({trend_pct:+.1f}% compared to previous period)."
        if trend_pct else f"Spending pace is currently classified as {trend.replace('_', ' ')}."
    )

    insights = [
        f"Statistical transaction baseline stands at INR {baseline:.2f}.",
        f"Spending pace is {trend} with {conf}% model confidence.",
    ]
    if confirmed_rec > 0:
        insights.append(f"Confirmed recurring commitments total INR {confirmed_rec:.2f}/month.")

    recommendations = [
        f"Use the verified statistical baseline of INR {fallback:.2f} as your conservative transaction buffer.",
        "Monitor recurring commitments to prevent avoidable expenditure creep.",
    ]

    return {
        "summary": summary,
        "forecast_explanation": forecast_expl,
        "reliability_explanation": rel_expl,
        "trend_explanation": trend_expl,
        "key_insights": insights,
        "recommendations": recommendations,
        "risk_level": risk_level,
        "disclaimer": reason_note,
    }


def validate_groq_reasoning_output(parsed: dict) -> bool:
    """
    Validates that the Groq LLM response strictly contains the 8 expected fields
    and does NOT attempt to overwrite or inject a new numerical forecast.
    """
    required_keys = [
        "summary",
        "forecast_explanation",
        "reliability_explanation",
        "trend_explanation",
        "key_insights",
        "recommendations",
        "risk_level",
        "disclaimer",
    ]

    for k in required_keys:
        if k not in parsed or not parsed[k]:
            logger.warning(f"[GroqValidation] Missing or empty required key: {k}")
            return False

    if not isinstance(parsed["key_insights"], list) or not isinstance(parsed["recommendations"], list):
        logger.warning("[GroqValidation] 'key_insights' or 'recommendations' is not a list.")
        return False

    valid_risk_levels = {"low", "medium", "high"}
    risk = str(parsed["risk_level"]).strip().lower()
    if risk not in valid_risk_levels:
        parsed["risk_level"] = "medium"

    # Anti-hallucination check: Reject if Groq tried to supply unauthorized numeric forecast keys
    forbidden_keys = {"new_forecast", "forecasted_amount", "predicted_amount", "override_prediction"}
    if any(k in parsed for k in forbidden_keys):
        logger.warning("[GroqValidation] Groq response contained forbidden prediction override keys.")
        return False

    return True


class GroqFinancialService:
    """
    Manages interactions with Groq API for financial reasoning.
    Gracefully handles missing keys, rate limits, network timeouts, and model errors.
    """

    def __init__(self):
        self.api_key = os.environ.get("GROQ_API_KEY", "").strip()
        self.configured_model = os.environ.get("GROQ_MODEL", DEFAULT_GROQ_MODEL).strip() or DEFAULT_GROQ_MODEL
        self._client = None

    def _get_client(self):
        # Refresh key in case .env was updated
        self.api_key = os.environ.get("GROQ_API_KEY", "").strip()
        if not self.api_key:
            return None
        if self._client is None:
            try:
                from groq import Groq
                self._client = Groq(api_key=self.api_key, timeout=12.0)
            except Exception as e:
                logger.error(f"[GroqClient] Failed to initialize Groq client: {e}")
                self._client = None
        return self._client

    def generate_reasoning(self, forecast_data: dict, user_id: Optional[str] = None) -> dict:
        """
        Generate structured financial reasoning for the provided forecast data.
        Returns validated structured JSON matching the 8 required keys.
        """
        fingerprint = _compute_metrics_fingerprint(forecast_data)
        cache_key = f"{user_id or 'anon'}:{fingerprint}"

        # 1. Check in-memory cache
        now = time.time()
        if cache_key in _REASONING_CACHE:
            ts, cached_res = _REASONING_CACHE[cache_key]
            if now - ts < CACHE_TTL_SECONDS:
                logger.info("[GroqCache] Returning cached financial reasoning.")
                return cached_res

        # 2. Check API key presence
        client = self._get_client()
        if not client:
            fallback = generate_deterministic_fallback_reasoning(
                forecast_data,
                reason_note="AI reasoning temporarily unavailable (Groq API key unconfigured). Showing deterministic analysis."
            )
            _REASONING_CACHE[cache_key] = (now, fallback)
            return fallback

        # 3. Privacy-sanitized metrics payload
        sanitized_metrics = sanitize_metrics_for_groq(forecast_data)

        # 4. Construct prompt
        system_prompt = (
            "You are the financial reasoning layer of Expense Buddy.\n\n"
            "You do NOT calculate, predict, or invent financial predictions.\n"
            "All numerical values supplied to you have already been calculated by deterministic statistical methods or validated ML models.\n\n"
            "Your job is to:\n"
            "1. Explain the forecast.\n"
            "2. Explain reliability.\n"
            "3. Explain spending trends.\n"
            "4. Identify useful financial patterns.\n"
            "5. Provide concise practical advice.\n"
            "6. Clearly distinguish facts from suggestions.\n"
            "7. Never invent numerical values.\n"
            "8. Never modify supplied numerical values.\n"
            "9. Never claim certainty about future spending.\n"
            "10. Never treat irregular transactions as confirmed recurring expenses.\n"
            "11. Never reveal or request sensitive personal information.\n\n"
            "Use only the supplied metrics.\n"
            "You MUST respond ONLY with valid JSON matching this exact structure:\n"
            "{\n"
            '  "summary": "Brief 1-2 sentence executive overview.",\n'
            '  "forecast_explanation": "Explanation of the calculated next transaction forecast and baselines.",\n'
            '  "reliability_explanation": "Detailed rationale of model reliability vs statistical baseline.",\n'
            '  "trend_explanation": "Explanation of recent spending velocity and trajectory.",\n'
            '  "key_insights": ["Insight 1", "Insight 2", "Insight 3"],\n'
            '  "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"],\n'
            '  "risk_level": "low|medium|high",\n'
            '  "disclaimer": "Informational guidance disclaimer."\n'
            "}"
        )

        user_content = (
            f"Here are the deterministic and ML forecast metrics for the user's spending profile:\n"
            f"```json\n{json.dumps(sanitized_metrics, indent=2)}\n```\n\n"
            f"Please generate the structured financial reasoning and guidance in valid JSON."
        )

        # 5. Call Groq API with failover model handling
        models_to_try = [self.configured_model] + [m for m in FALLBACK_MODELS if m != self.configured_model]

        for model_name in models_to_try:
            try:
                logger.info(f"[GroqAPI] Requesting reasoning from model: {model_name}")
                completion = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_content},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=1000,
                )

                raw_text = completion.choices[0].message.content or "{}"
                parsed = json.loads(raw_text)

                if validate_groq_reasoning_output(parsed):
                    logger.info("[GroqAPI] Successfully generated and validated financial reasoning.")
                    _REASONING_CACHE[cache_key] = (now, parsed)
                    return parsed
                else:
                    logger.warning(f"[GroqAPI] Output from {model_name} failed schema validation.")

            except Exception as e:
                err_msg = str(e)
                # Catch auth, rate limit, connection, or model not found errors
                logger.warning(f"[GroqAPI] Call to {model_name} failed: {err_msg[:200]}")
                continue

        # 6. Fallback if all model attempts failed
        logger.warning("[GroqAPI] All Groq model attempts failed. Using deterministic fallback reasoning.")
        fallback = generate_deterministic_fallback_reasoning(
            forecast_data,
            reason_note="AI reasoning temporarily unavailable. Showing deterministic financial analysis."
        )
        _REASONING_CACHE[cache_key] = (now, fallback)
        return fallback


# Singleton instance
_groq_service_instance = None


def get_groq_financial_service() -> GroqFinancialService:
    global _groq_service_instance
    if _groq_service_instance is None:
        _groq_service_instance = GroqFinancialService()
    return _groq_service_instance
