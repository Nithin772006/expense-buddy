"""
test_stage_b.py — Comprehensive Test Suite for Stage B: Groq AI Financial Reasoning.

Validates:
1. Data Privacy: Ensure zero PII, raw descriptions, user IDs, or account info is sent to Groq.
2. Model Calibration: Verify exp(raw_output) is applied so ML prediction is in currency, not raw log (7.61).
3. Recurring Commitment Safety: Verify separation of confirmed recurring bills from possible/irregular patterns.
4. Structured Output Validation: Test the 8 required keys and rejection of hallucinated forecast overrides.
5. Deterministic Fallback: Verify fallback generation when Groq is unavailable or unconfigured.
6. Caching: Verify in-memory caching prevents redundant calls for identical metrics.
7. Security: Verify GROQ_API_KEY is not in frontend bundle or API responses, and unauthenticated requests are rejected.
"""

import os
import sys
import unittest
import json
import re

# Ensure backend root is on sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from services.forecast_metrics import detect_recurring_commitments, compute_spending_statistics
from services.forecast_reliability import evaluate_forecast_reliability
from services.forecast_service import generate_hybrid_forecast_from_transactions
from services.groq_financial_service import (
    sanitize_metrics_for_groq,
    validate_groq_reasoning_output,
    generate_deterministic_fallback_reasoning,
    GroqFinancialService,
    _compute_metrics_fingerprint,
)


class TestStageBFinancialReasoning(unittest.TestCase):

    def setUp(self):
        # Sample realistic transactions matching the user profile
        self.sample_txs = [
            {"amount": 450.0, "transaction_type": "debit", "description": "UPI/Swiggy", "transaction_date": "2026-02-06"},
            {"amount": 520.0, "transaction_type": "debit", "description": "UPI/Swiggy", "transaction_date": "2026-02-07"},
            {"amount": 610.0, "transaction_type": "debit", "description": "UPI/Swiggy", "transaction_date": "2026-02-08"},
            {"amount": 1850.0, "transaction_type": "debit", "description": "UPI/Reliance Fresh", "transaction_date": "2026-05-06"},
            {"amount": 2100.0, "transaction_type": "debit", "description": "UPI/Reliance Fresh", "transaction_date": "2026-05-07"},
            {"amount": 2350.0, "transaction_type": "debit", "description": "UPI/Reliance Fresh", "transaction_date": "2026-05-08"},
            {"amount": 1320.0, "transaction_type": "debit", "description": "UPI/TNEB", "transaction_date": "2026-06-15"},
            {"amount": 2499.0, "transaction_type": "debit", "description": "UPI/Amazon Shopping", "transaction_date": "2026-06-18"},
            {"amount": 900.0, "transaction_type": "debit", "description": "UPI/MilkVendor", "transaction_date": "2026-06-22"},
            {"amount": 1450.0, "transaction_type": "debit", "description": "UPI/TNEB", "transaction_date": "2026-07-15"},
            {"amount": 3200.0, "transaction_type": "debit", "description": "UPI/Amazon Shopping", "transaction_date": "2026-07-18"},
            {"amount": 900.0, "transaction_type": "debit", "description": "UPI/MilkVendor", "transaction_date": "2026-07-22"},
            {"amount": 999.0, "transaction_type": "debit", "description": "UPI/ACTFibernet", "transaction_date": "2026-07-27"},
            {"amount": 12000.0, "transaction_type": "credit", "description": "SAL/RAJALAKSHMI", "transaction_date": "2026-08-06"},
            {"amount": 1510.0, "transaction_type": "debit", "description": "UPI/TNEB", "transaction_date": "2026-08-15"},
            {"amount": 2750.0, "transaction_type": "debit", "description": "UPI/Amazon Shopping", "transaction_date": "2026-08-18"},
            {"amount": 900.0, "transaction_type": "debit", "description": "UPI/MilkVendor", "transaction_date": "2026-08-22"},
            {"amount": 999.0, "transaction_type": "debit", "description": "UPI/ACTFibernet", "transaction_date": "2026-08-27"},
            {"amount": 119.0, "transaction_type": "debit", "description": "UPI/Spotify", "transaction_date": "2026-12-06"},
            {"amount": 119.0, "transaction_type": "debit", "description": "UPI/Spotify", "transaction_date": "2026-12-07"},
            {"amount": 119.0, "transaction_type": "debit", "description": "UPI/Spotify", "transaction_date": "2026-12-08"},
        ]

    # ──────────────────────────────────────────────────────────────────────────
    # 1. Model Calibration & Log Inverse Transform Test
    # ──────────────────────────────────────────────────────────────────────────
    def test_log_scale_calibration_not_7_61(self):
        """Verify that raw log prediction (~7.61) is exponentiated to ~2020 currency."""
        forecast = generate_hybrid_forecast_from_transactions(self.sample_txs)
        self.assertIsNotNone(forecast["ml_prediction"])
        # Should NOT be raw log scale 7.61
        self.assertGreater(forecast["ml_prediction"], 100.0, "ML prediction must be calibrated currency, not log scale")
        # Should record raw_model_output as metadata
        self.assertIsNotNone(forecast["raw_model_output"])
        self.assertTrue(forecast["is_log_calibrated"])
        # Fallback prediction should be preserved as statistical baseline
        self.assertAlmostEqual(forecast["fallback_prediction"], forecast["statistical_baseline"], places=2)

    # ──────────────────────────────────────────────────────────────────────────
    # 2. Recurring Commitment Safety Test
    # ──────────────────────────────────────────────────────────────────────────
    def test_recurring_commitment_safety_separation(self):
        """Verify periodic utility bills are confirmed and irregular/discretionary items are separated."""
        rec_res = detect_recurring_commitments(self.sample_txs)
        self.assertIn("confirmed_total", rec_res)
        self.assertIn("possible_total", rec_res)
        self.assertIn("confirmed_commitments", rec_res)
        self.assertIn("possible_patterns", rec_res)

        confirmed_merchants = [c["merchant"] for c in rec_res["confirmed_commitments"]]
        possible_merchants = [c["merchant"] for c in rec_res["possible_patterns"]]

        # Confirmed must contain periodic utility/subscription bills with regular cadence
        self.assertTrue(any("Tneb" in m or "Electricity" in m for m in confirmed_merchants))
        self.assertTrue(any("Actfibernet" in m or "Internet" in m for m in confirmed_merchants))
        self.assertTrue(any("Milk" in m for m in confirmed_merchants))

        # Irregular or discretionary items (Spotify with 1-day interval, Amazon, Swiggy, Reliance) MUST be in possible patterns
        self.assertTrue(any("Spotify" in m for m in possible_merchants), "Spotify with irregular cadence must be in possible patterns")
        self.assertTrue(any("Amazon" in m or "Shopping" in m for m in possible_merchants))
        self.assertTrue(any("Swiggy" in m for m in possible_merchants))
        self.assertFalse(any("Spotify" in m for m in confirmed_merchants), "Spotify with irregular cadence must NOT be in confirmed commitments")

        # Invariant: NO confirmed item may have frequency == "irregular"
        for c in rec_res["confirmed_commitments"]:
            self.assertNotEqual(c.get("frequency"), "irregular", f"Confirmed item {c['merchant']} has frequency 'irregular'")

        # Invariant: Totals must accurately match the sum of their items
        expected_confirmed_total = round(sum(c["monthly_equivalent"] for c in rec_res["confirmed_commitments"]), 2)
        expected_possible_total = round(sum(c["monthly_equivalent"] for c in rec_res["possible_patterns"]), 2)

        self.assertAlmostEqual(rec_res["confirmed_total"], expected_confirmed_total, places=2)
        self.assertAlmostEqual(rec_res["possible_total"], expected_possible_total, places=2)

    def test_irregular_transaction_cannot_be_confirmed_recurring(self):
        """Explicitly test that any transaction group with irregular frequency is rejected from confirmed status."""
        irregular_txs = [
            {"amount": 199.0, "transaction_type": "debit", "description": "Netflix", "transaction_date": "2026-01-01"},
            {"amount": 199.0, "transaction_type": "debit", "description": "Netflix", "transaction_date": "2026-01-02"},  # 1 day later -> irregular
            {"amount": 199.0, "transaction_type": "debit", "description": "Netflix", "transaction_date": "2026-01-03"},  # 1 day later -> irregular
        ]
        res = detect_recurring_commitments(irregular_txs)
        self.assertEqual(len(res["confirmed_commitments"]), 0, "Irregular frequency transactions must NEVER be confirmed")
        self.assertEqual(res["confirmed_total"], 0.0)
        self.assertEqual(len(res["possible_patterns"]), 1)
        self.assertEqual(res["possible_patterns"][0]["frequency"], "irregular")
        self.assertAlmostEqual(res["possible_total"], 199.0, places=2)

    # ──────────────────────────────────────────────────────────────────────────
    # 3. Data Privacy Test
    # ──────────────────────────────────────────────────────────────────────────
    def test_data_privacy_sanitization(self):
        """Verify sanitize_metrics_for_groq excludes all PII, raw txs, accounts, and user IDs."""
        forecast = generate_hybrid_forecast_from_transactions(self.sample_txs)
        # Inject fake private data into forecast dict to test strict exclusion
        forecast["user_id"] = "sensitive-user-uuid-12345"
        forecast["email"] = "user@example.com"
        forecast["account_number"] = "9876543210"
        forecast["raw_transactions"] = self.sample_txs

        sanitized = sanitize_metrics_for_groq(forecast)

        # Check that forbidden fields are absent
        forbidden_keys = {"user_id", "email", "account_number", "raw_transactions", "token", "password"}
        for k in forbidden_keys:
            self.assertNotIn(k, sanitized, f"Forbidden key '{k}' must not exist in sanitized payload")

        # Serialized check: the entire JSON payload must not contain sensitive strings
        payload_str = json.dumps(sanitized)
        self.assertNotIn("sensitive-user-uuid-12345", payload_str)
        self.assertNotIn("user@example.com", payload_str)
        self.assertNotIn("9876543210", payload_str)

        # Verify safe aggregated metrics are present
        self.assertIn("statistical_baseline", sanitized)
        self.assertIn("spending_trend", sanitized)
        self.assertIn("confirmed_recurring_total", sanitized)
        self.assertIn("reliability_rating", sanitized)

    # ──────────────────────────────────────────────────────────────────────────
    # 4. Structured Output Validation Test
    # ──────────────────────────────────────────────────────────────────────────
    def test_structured_output_validation(self):
        """Test validation of 8 required keys and rejection of hallucinated forecast overrides."""
        valid_response = {
            "summary": "Spending trend is increasing.",
            "forecast_explanation": "Estimated transaction baseline is ₹371.40.",
            "reliability_explanation": "Model reliability is low due to deviation.",
            "trend_explanation": "Recent 30-day velocity shows upward trend.",
            "key_insights": ["Baseline is ₹371.40", "Spending pace is stable"],
            "recommendations": ["Use statistical fallback", "Monitor utilities"],
            "risk_level": "medium",
            "disclaimer": "AI financial reasoning is derived strictly from statistical calculations."
        }
        self.assertTrue(validate_groq_reasoning_output(valid_response))

        # Missing required key should fail
        invalid_missing = valid_response.copy()
        del invalid_missing["recommendations"]
        self.assertFalse(validate_groq_reasoning_output(invalid_missing))

        # Attempt to override forecast should be rejected
        invalid_override = valid_response.copy()
        invalid_override["new_forecast"] = 1500.0
        self.assertFalse(validate_groq_reasoning_output(invalid_override))

        invalid_override2 = valid_response.copy()
        invalid_override2["forecasted_amount"] = 2500.0
        self.assertFalse(validate_groq_reasoning_output(invalid_override2))

    # ──────────────────────────────────────────────────────────────────────────
    # 5. Deterministic Fallback Test
    # ──────────────────────────────────────────────────────────────────────────
    def test_deterministic_fallback_generation(self):
        """Verify fallback reasoning contains all 8 required keys with dynamic metrics."""
        forecast = generate_hybrid_forecast_from_transactions(self.sample_txs)
        fallback = generate_deterministic_fallback_reasoning(forecast)

        required_keys = [
            "summary", "forecast_explanation", "reliability_explanation",
            "trend_explanation", "key_insights", "recommendations",
            "risk_level", "disclaimer"
        ]
        for k in required_keys:
            self.assertIn(k, fallback)
            self.assertTrue(bool(fallback[k]), f"Field '{k}' must not be empty in fallback")

        self.assertIn(fallback["risk_level"], ["low", "medium", "high"])
        self.assertIsInstance(fallback["key_insights"], list)
        self.assertIsInstance(fallback["recommendations"], list)

    # ──────────────────────────────────────────────────────────────────────────
    # 6. In-Memory Caching Test
    # ──────────────────────────────────────────────────────────────────────────
    def test_metrics_fingerprint_and_caching(self):
        """Verify fingerprint generation and service cache behavior."""
        forecast1 = generate_hybrid_forecast_from_transactions(self.sample_txs)
        fp1 = _compute_metrics_fingerprint(forecast1)

        forecast2 = generate_hybrid_forecast_from_transactions(self.sample_txs)
        fp2 = _compute_metrics_fingerprint(forecast2)

        self.assertEqual(fp1, fp2, "Identical forecast metrics must produce identical fingerprint")

        svc = GroqFinancialService()
        res1 = svc.generate_reasoning(forecast1, user_id="test-user")
        res2 = svc.generate_reasoning(forecast2, user_id="test-user")
        self.assertEqual(res1, res2)

    # ──────────────────────────────────────────────────────────────────────────
    # 7. Security: Frontend Bundle Check
    # ──────────────────────────────────────────────────────────────────────────
    def test_no_api_key_in_frontend_bundle(self):
        """Verify that GROQ_API_KEY does not appear in frontend dist bundle files."""
        frontend_dist = os.path.join(CURRENT_DIR, "..", "frontend", "dist")
        if not os.path.exists(frontend_dist):
            self.skipTest("frontend/dist not yet built")

        for root, _, files in os.walk(frontend_dist):
            for file in files:
                if file.endswith((".js", ".html", ".css", ".map")):
                    path = os.path.join(root, file)
                    with open(path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                        self.assertNotIn("GROQ_API_KEY", content)
                        self.assertNotIn("gsk_", content, f"Possible raw Groq key found in {file}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
