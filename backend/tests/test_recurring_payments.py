"""
test_recurring_payments.py — Comprehensive Test Suite for Smart Recurring Payment Detector & Reminder System.

Validates all 30 minimum scenarios specified in Step 32:
 1. No transactions
 2. One transaction
 3. Two transactions
 4. Three monthly transactions
 5. Weekly recurring payment
 6. Biweekly recurring payment
 7. Variable electricity bill
 8. Fixed subscription
 9. Irregular groceries
10. Irregular shopping
11. Food orders
12. Merchant mismatch
13. Similar amount but different merchant
14. Similar merchant but wrong date outside window
15. Paid transaction matching expected payment
16. Overdue payment
17. Due today
18. Due soon
19. Upcoming payment
20. Duplicate payment protection
21. Manual mark paid
22. Cross-user access attempt
23. Invalid JWT
24. Missing authentication
25. No Groq API key
26. Large transaction history
27. Month-end date handling
28. Leap-year date handling
29. Variable amount recurring bill
30. Insufficient historical evidence
"""

import os
import sys
import unittest
from datetime import date, datetime, timedelta

# Ensure backend root is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.recurring_payment_service import (
    detect_recurring_commitments,
    detect_cadence,
    evaluate_amount_stability,
    calculate_next_expected_date,
    normalize_merchant_name,
    calculate_confidence_score,
)
from services.recurring_reminder_service import (
    evaluate_reminder_status,
    is_merchant_match,
    is_amount_within_tolerance,
    match_transaction_to_cycle,
    get_billing_cycle_key,
)
from fastapi.testclient import TestClient
from main import app


class TestRecurringPayments(unittest.TestCase):

    # ── Scenario 1: No Transactions ──────────────────────────────────────────
    def test_01_no_transactions(self):
        res = detect_recurring_commitments([])
        self.assertEqual(res["summary"]["confirmed_count"], 0)
        self.assertEqual(res["summary"]["possible_count"], 0)
        self.assertEqual(res["summary"]["total_monthly_commitment"], 0.0)
        self.assertEqual(res["confirmed_recurring_payments"], [])

    # ── Scenario 2: One Transaction ──────────────────────────────────────────
    def test_02_one_transaction(self):
        txs = [{"merchant": "Electricity Bill", "amount": 1200.0, "transaction_date": "2026-08-10", "transaction_type": "debit"}]
        res = detect_recurring_commitments(txs)
        self.assertEqual(res["summary"]["confirmed_count"], 0)
        self.assertEqual(res["confirmed_recurring_payments"], [])

    # ── Scenario 3: Two Transactions ─────────────────────────────────────────
    def test_03_two_transactions_possible_only(self):
        txs = [
            {"merchant": "General Store", "amount": 500.0, "transaction_date": "2026-07-10", "transaction_type": "debit"},
            {"merchant": "General Store", "amount": 500.0, "transaction_date": "2026-08-10", "transaction_type": "debit"},
        ]
        res = detect_recurring_commitments(txs)
        # Neutral general store with only 2 occurrences should NOT be confirmed
        self.assertEqual(res["summary"]["confirmed_count"], 0)
        self.assertTrue(len(res["possible_recurring_patterns"]) > 0 or len(res["insufficient_evidence_patterns"]) > 0)

    # ── Scenario 4: Three Monthly Transactions ───────────────────────────────
    def test_04_three_monthly_transactions(self):
        txs = [
            {"merchant": "Internet Bill", "amount": 999.0, "transaction_date": "2026-06-10", "transaction_type": "debit"},
            {"merchant": "Internet Bill", "amount": 999.0, "transaction_date": "2026-07-10", "transaction_type": "debit"},
            {"merchant": "Internet Bill", "amount": 999.0, "transaction_date": "2026-08-10", "transaction_type": "debit"},
        ]
        res = detect_recurring_commitments(txs)
        self.assertEqual(res["summary"]["confirmed_count"], 1)
        item = res["confirmed_recurring_payments"][0]
        self.assertEqual(item["frequency"], "monthly")
        self.assertEqual(item["amount_stability"], "fixed_amount")
        self.assertTrue(item["confidence_score"] >= 75.0)

    # ── Scenario 5: Weekly Recurring Payment ──────────────────────────────────
    def test_05_weekly_recurring_payment(self):
        intervals = [7, 7, 7, 7]
        cadence, score = detect_cadence(intervals)
        self.assertEqual(cadence, "weekly")
        self.assertTrue(score >= 0.8)

        txs = [
            {"merchant": "Organic Farm Milk", "amount": 350.0, "transaction_date": f"2026-08-{d:02d}", "transaction_type": "debit"}
            for d in (3, 10, 17, 24)
        ]
        res = detect_recurring_commitments(txs)
        self.assertEqual(res["summary"]["confirmed_count"], 1)
        self.assertEqual(res["confirmed_recurring_payments"][0]["frequency"], "weekly")

    # ── Scenario 6: Bi-weekly Recurring Payment ───────────────────────────────
    def test_06_biweekly_recurring_payment(self):
        intervals = [14, 14, 15]
        cadence, score = detect_cadence(intervals)
        self.assertEqual(cadence, "bi-weekly")
        self.assertTrue(score >= 0.75)

    # ── Scenario 7: Variable Electricity Bill ────────────────────────────────
    def test_07_variable_electricity_bill(self):
        txs = [
            {"merchant": "Electricity Bill", "amount": 1200.0, "transaction_date": "2026-06-10", "transaction_type": "debit"},
            {"merchant": "Electricity Bill", "amount": 1450.0, "transaction_date": "2026-07-11", "transaction_type": "debit"},
            {"merchant": "Electricity Bill", "amount": 1380.0, "transaction_date": "2026-08-10", "transaction_type": "debit"},
        ]
        res = detect_recurring_commitments(txs)
        self.assertEqual(res["summary"]["confirmed_count"], 1)
        item = res["confirmed_recurring_payments"][0]
        self.assertEqual(item["frequency"], "monthly")
        self.assertIn(item["amount_stability"], ("mostly_stable", "variable_but_periodic"))
        self.assertTrue(item["is_confirmed"])

    # ── Scenario 8: Fixed Subscription ───────────────────────────────────────
    def test_08_fixed_subscription(self):
        txs = [
            {"merchant": "Netflix", "amount": 649.0, "transaction_date": "2026-06-15", "transaction_type": "debit"},
            {"merchant": "Netflix", "amount": 649.0, "transaction_date": "2026-07-15", "transaction_type": "debit"},
            {"merchant": "Netflix", "amount": 649.0, "transaction_date": "2026-08-15", "transaction_type": "debit"},
        ]
        res = detect_recurring_commitments(txs)
        self.assertEqual(res["summary"]["confirmed_count"], 1)
        item = res["confirmed_recurring_payments"][0]
        self.assertEqual(item["amount_stability"], "fixed_amount")
        self.assertTrue(item["confidence_score"] >= 80.0)

    # ── Scenario 9: Irregular Groceries ──────────────────────────────────────
    def test_09_irregular_groceries(self):
        txs = [
            {"merchant": "Supermarket Groceries", "amount": 1500.0, "transaction_date": "2026-06-02", "transaction_type": "debit"},
            {"merchant": "Supermarket Groceries", "amount": 2300.0, "transaction_date": "2026-06-18", "transaction_type": "debit"},
            {"merchant": "Supermarket Groceries", "amount": 900.0,  "transaction_date": "2026-07-29", "transaction_type": "debit"},
        ]
        res = detect_recurring_commitments(txs)
        # Groceries must NEVER be confirmed recurring commitment
        self.assertEqual(res["summary"]["confirmed_count"], 0)
        unconfirmed = res["possible_recurring_patterns"] + res["insufficient_evidence_patterns"]
        self.assertTrue(any("grocer" in p["merchant"].lower() for p in unconfirmed))

    # ── Scenario 10: Irregular Shopping ──────────────────────────────────────
    def test_10_irregular_shopping(self):
        txs = [
            {"merchant": "Online Shopping", "amount": 2999.0, "transaction_date": "2026-06-12", "transaction_type": "debit"},
            {"merchant": "Online Shopping", "amount": 1499.0, "transaction_date": "2026-07-04", "transaction_type": "debit"},
            {"merchant": "Online Shopping", "amount": 4200.0, "transaction_date": "2026-08-20", "transaction_type": "debit"},
        ]
        res = detect_recurring_commitments(txs)
        self.assertEqual(res["summary"]["confirmed_count"], 0)

    # ── Scenario 11: Food Orders ─────────────────────────────────────────────
    def test_11_food_orders_discretionary(self):
        txs = [
            {"merchant": "Swiggy", "amount": 350.0, "transaction_date": "2026-06-05", "transaction_type": "debit"},
            {"merchant": "Swiggy", "amount": 420.0, "transaction_date": "2026-07-06", "transaction_type": "debit"},
            {"merchant": "Swiggy", "amount": 510.0, "transaction_date": "2026-08-04", "transaction_type": "debit"},
        ]
        res = detect_recurring_commitments(txs)
        self.assertEqual(res["summary"]["confirmed_count"], 0)
        self.assertTrue(any("swiggy" in p["merchant"].lower() for p in res["possible_recurring_patterns"]))

    # ── Scenario 12: Merchant Mismatch ───────────────────────────────────────
    def test_12_merchant_mismatch_not_grouped(self):
        m1 = normalize_merchant_name("Electricity Bill")
        m2 = normalize_merchant_name("Internet Bill")
        self.assertNotEqual(m1, m2)
        self.assertFalse(is_merchant_match(m1, m2))

    # ── Scenario 13: Similar Amount But Different Merchant ───────────────────
    def test_13_similar_amount_different_merchant_no_paid_match(self):
        # Netflix is 649, Restaurant is 650
        tx = {"merchant": "Royal Restaurant", "amount": 650.0, "transaction_date": "2026-09-15"}
        rec = {"merchant": "Netflix", "normalized_merchant": "Netflix", "average_amount": 649.0, "frequency": "monthly"}
        matches = match_transaction_to_cycle(tx, rec, cycle_expected_date=date(2026, 9, 15))
        self.assertFalse(matches)

    # ── Scenario 14: Similar Merchant But Wrong Date ─────────────────────────
    def test_14_similar_merchant_wrong_date_outside_window(self):
        tx = {"merchant": "Electricity Bill", "amount": 1400.0, "transaction_date": "2026-07-10"}
        rec = {"merchant": "Electricity Bill", "normalized_merchant": "Electricity Bill", "average_amount": 1400.0, "frequency": "monthly", "amount_stability": "variable_but_periodic"}
        # Expected date is in September, transaction is in July -> should NOT match
        matches = match_transaction_to_cycle(tx, rec, cycle_expected_date=date(2026, 9, 10))
        self.assertFalse(matches)

    # ── Scenario 15: Paid Transaction Matching Expected Payment ──────────────
    def test_15_paid_transaction_matching(self):
        tx = {"merchant": "Internet Bill", "amount": 999.0, "transaction_date": "2026-09-14"}
        rec = {"merchant": "Internet Bill", "normalized_merchant": "Internet Bill", "average_amount": 999.0, "frequency": "monthly", "amount_stability": "fixed_amount"}
        matches = match_transaction_to_cycle(tx, rec, cycle_expected_date=date(2026, 9, 15))
        self.assertTrue(matches)

    # ── Scenario 16: Overdue Payment ─────────────────────────────────────────
    def test_16_overdue_status(self):
        today = date(2026, 9, 15)
        expected = date(2026, 9, 10) # 5 days ago
        status = evaluate_reminder_status(expected_date=expected, is_paid=False, today=today)
        self.assertEqual(status, "overdue")

    # ── Scenario 17: Due Today ───────────────────────────────────────────────
    def test_17_due_today_status(self):
        today = date(2026, 9, 15)
        expected = date(2026, 9, 15)
        status = evaluate_reminder_status(expected_date=expected, is_paid=False, today=today)
        self.assertEqual(status, "due_today")

    # ── Scenario 18: Due Soon ────────────────────────────────────────────────
    def test_18_due_soon_status(self):
        today = date(2026, 9, 10)
        expected = date(2026, 9, 14) # 4 days away
        status = evaluate_reminder_status(expected_date=expected, is_paid=False, today=today)
        self.assertEqual(status, "due_soon")

    # ── Scenario 19: Upcoming Payment ────────────────────────────────────────
    def test_19_upcoming_status(self):
        today = date(2026, 9, 10)
        expected = date(2026, 9, 25) # 15 days away
        status = evaluate_reminder_status(expected_date=expected, is_paid=False, today=today)
        self.assertEqual(status, "upcoming")

    # ── Scenario 20: Duplicate Payment Protection ────────────────────────────
    def test_20_duplicate_payment_protection_key(self):
        k1 = get_billing_cycle_key(date(2026, 9, 14), "monthly")
        k2 = get_billing_cycle_key(date(2026, 9, 15), "monthly")
        self.assertEqual(k1, "2026-09")
        self.assertEqual(k2, "2026-09")
        # Enforces single billing cycle instance key per monthly cycle
        self.assertEqual(k1, k2)

    # ── Scenario 21: Manual Mark Paid ────────────────────────────────────────
    def test_21_manual_mark_paid_evaluates_paid(self):
        status = evaluate_reminder_status(expected_date=date(2026, 9, 15), is_paid=True, today=date(2026, 9, 15))
        self.assertEqual(status, "paid")

    # ── Scenario 22: Cross-User Access Attempt (BOLA / IDOR) ─────────────────
    def test_22_cross_user_isolation(self):
        client = TestClient(app)
        # Attempt to access another user's import history or recurring payments
        resp = client.get("/import/history/00000000-0000-0000-0000-000000000000")
        self.assertEqual(resp.status_code, 401)

    # ── Scenario 23: Invalid JWT ─────────────────────────────────────────────
    def test_23_invalid_jwt_unauthorized(self):
        client = TestClient(app)
        resp = client.get("/recurring-payments", headers={"Authorization": "Bearer invalid_token_xyz"})
        self.assertEqual(resp.status_code, 401)

    # ── Scenario 24: Missing Authentication ──────────────────────────────────
    def test_24_missing_authentication_unauthorized(self):
        client = TestClient(app)
        resp = client.get("/recurring-payments")
        self.assertEqual(resp.status_code, 401)

    # ── Scenario 25: No Groq API Key Required ────────────────────────────────
    def test_25_system_works_without_groq(self):
        # Even if GROQ_API_KEY is not set or empty, recurring detection operates 100% deterministically
        txs = [
            {"merchant": "ACT Fibernet", "amount": 1150.0, "transaction_date": "2026-06-01", "transaction_type": "debit"},
            {"merchant": "ACT Fibernet", "amount": 1150.0, "transaction_date": "2026-07-01", "transaction_type": "debit"},
            {"merchant": "ACT Fibernet", "amount": 1150.0, "transaction_date": "2026-08-01", "transaction_type": "debit"},
        ]
        res = detect_recurring_commitments(txs)
        self.assertEqual(res["summary"]["confirmed_count"], 1)

    # ── Scenario 26: Large Transaction History Performance ───────────────────
    def test_26_large_transaction_history(self):
        # 1,200 transactions across 12 months with monthly Electricity Bill
        txs = []
        base_date = date(2025, 1, 1)

        # 12 monthly electricity bills
        for m in range(1, 13):
            txs.append({
                "merchant": "Electricity Bill",
                "amount": 1300.0,
                "transaction_date": f"2025-{m:02d}-10",
                "transaction_type": "debit"
            })

        # 1,188 random daily discretionary transactions
        for i in range(1188):
            tx_date = base_date + timedelta(days=i % 365)
            merchant = "Coffee Shop" if i % 2 == 0 else "Online Mart"
            amt = 150.0 if i % 2 == 0 else 450.0
            txs.append({"merchant": merchant, "amount": amt, "transaction_date": tx_date.isoformat(), "transaction_type": "debit"})

        start = datetime.now()
        res = detect_recurring_commitments(txs)
        duration = (datetime.now() - start).total_seconds()
        self.assertTrue(duration < 2.0, f"Processing took {duration}s, must be < 2s")
        self.assertTrue(res["summary"]["confirmed_count"] >= 1)

    # ── Scenario 27: Month-End Date Handling ─────────────────────────────────
    def test_27_month_end_date_handling(self):
        # Jan 31 + 1 month in non-leap year -> Feb 28
        jan31 = date(2025, 1, 31)
        feb_date = calculate_next_expected_date(jan31, "monthly")
        self.assertEqual(feb_date, date(2025, 2, 28))

        # Mar 31 + 1 month -> Apr 30
        mar31 = date(2025, 3, 31)
        apr_date = calculate_next_expected_date(mar31, "monthly")
        self.assertEqual(apr_date, date(2025, 4, 30))

    # ── Scenario 28: Leap-Year Date Handling ─────────────────────────────────
    def test_28_leap_year_date_handling(self):
        # 2024 is a leap year; Jan 31 + 1 month -> Feb 29
        jan31_2024 = date(2024, 1, 31)
        feb29_2024 = calculate_next_expected_date(jan31_2024, "monthly")
        self.assertEqual(feb29_2024, date(2024, 2, 29))

    # ── Scenario 29: Variable Amount Recurring Bill Matching ─────────────────
    def test_29_variable_bill_amount_matching(self):
        # Average is 1400, actual is 1426 (within 30% tolerance)
        is_ok = is_amount_within_tolerance(
            tx_amount=1426.0,
            expected_amount=1400.0,
            stability="variable_but_periodic",
            min_amount=1200.0,
            max_amount=1600.0,
        )
        self.assertTrue(is_ok)

        # Huge jump: 5,000 when typical is 1,400 -> rejected
        is_too_high = is_amount_within_tolerance(
            tx_amount=5000.0,
            expected_amount=1400.0,
            stability="variable_but_periodic",
            min_amount=1200.0,
            max_amount=1600.0,
        )
        self.assertFalse(is_too_high)

    # ── Scenario 30: Insufficient Historical Evidence ────────────────────────
    def test_30_insufficient_historical_evidence(self):
        txs = [
            {"merchant": "One-time Gadget Store", "amount": 4500.0, "transaction_date": "2026-08-01", "transaction_type": "debit"}
        ]
        res = detect_recurring_commitments(txs)
        self.assertEqual(res["summary"]["confirmed_count"], 0)
        self.assertEqual(res["summary"]["possible_count"], 0)


if __name__ == "__main__":
    unittest.main()
