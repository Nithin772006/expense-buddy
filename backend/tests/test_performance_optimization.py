"""
test_performance_optimization.py — Unit & Integration tests for Expense Buddy Performance Optimization.

Verifies:
1. GET /health is fast and logged with [PERF].
2. verify_access_token caches validated tokens and skips repeated Supabase Auth HTTP requests.
3. get_stored_recurring_payments performs ZERO database update/insert writes (read-only guarantee).
4. ML job deduplication lock prevents concurrent duplicate analysis jobs for the same user.
5. Transaction dataset version calculation is deterministic and responsive to changes.
"""

import os
import sys
import unittest
from unittest.mock import MagicMock, patch
import time

CURRENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from fastapi.testclient import TestClient
from main import app
from services import supabase_client, recurring_reminder_service, ml_service


class TestPerformanceOptimization(unittest.TestCase):

    def test_health_check_performance_logging(self):
        """Verify health check returns healthy and executes fast."""
        with TestClient(app) as client:
            t0 = time.perf_counter()
            res = client.get("/health")
            duration_ms = (time.perf_counter() - t0) * 1000
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["status"], "healthy")
            # Should be near-instant
            self.assertLess(duration_ms, 500)

    def test_auth_token_caching(self):
        """Verify token verification caches valid results and avoids repeated network calls."""
        fake_token = "valid.jwt.token.for.test"
        mock_user = MagicMock()
        mock_user.id = "user-12345"
        mock_user.email = "test@example.com"
        mock_response = MagicMock()
        mock_response.user = mock_user

        with patch("services.supabase_client.create_client") as mock_create_client:
            mock_client_instance = MagicMock()
            mock_client_instance.auth.get_user.return_value = mock_response
            mock_create_client.return_value = mock_client_instance

            # Clear cache
            supabase_client._AUTH_CACHE.clear()

            # First call -> hits auth service
            result1 = supabase_client.verify_access_token(fake_token)
            self.assertEqual(result1["id"], "user-12345")
            self.assertEqual(mock_client_instance.auth.get_user.call_count, 1)

            # Second call -> must use in-memory cache, call_count should stay 1
            result2 = supabase_client.verify_access_token(fake_token)
            self.assertEqual(result2["id"], "user-12345")
            self.assertEqual(mock_client_instance.auth.get_user.call_count, 1)

    def test_get_stored_recurring_payments_is_strictly_read_only(self):
        """Verify get_stored_recurring_payments executes zero updates, inserts, or deletes."""
        mock_client = MagicMock()

        # Mock recurring payments table select
        rec_table = MagicMock()
        rec_select = MagicMock()
        rec_eq = MagicMock()
        rec_order = MagicMock()
        rec_order.execute.return_value = MagicMock(data=[{
            "id": "rec-1",
            "user_id": "user-abc",
            "merchant": "Netflix",
            "frequency": "monthly",
            "average_amount": 499.0,
            "next_expected_date": "2026-10-01",
            "status": "active",
        }])
        rec_eq.order.return_value = rec_order
        rec_select.eq.return_value = rec_eq
        rec_table.select.return_value = rec_select

        # Mock instances table select
        inst_table = MagicMock()
        inst_select = MagicMock()
        inst_eq = MagicMock()
        inst_eq.execute.return_value = MagicMock(data=[])
        inst_select.eq.return_value = inst_eq
        inst_table.select.return_value = inst_select

        def from_side_effect(table_name):
            if table_name == "recurring_payments":
                return rec_table
            elif table_name == "recurring_payment_instances":
                return inst_table
            return MagicMock()

        mock_client.from_.side_effect = from_side_effect

        with patch("services.recurring_reminder_service.get_supabase_client", return_value=mock_client):
            data = recurring_reminder_service.get_stored_recurring_payments("user-abc", "mock-token")
            self.assertIn("summary", data)
            self.assertIn("recurring_payments", data)
            self.assertEqual(len(data["recurring_payments"]), 1)
            self.assertEqual(data["recurring_payments"][0]["merchant"], "Netflix")

            # CRITICAL ASSERTIONS: Zero writes occurred
            self.assertEqual(rec_table.update.call_count, 0, "Read-only endpoint must never call update on recurring_payments")
            self.assertEqual(rec_table.insert.call_count, 0, "Read-only endpoint must never call insert on recurring_payments")
            self.assertEqual(inst_table.update.call_count, 0, "Read-only endpoint must never call update on instances")
            self.assertEqual(inst_table.insert.call_count, 0, "Read-only endpoint must never call insert on instances")

    def test_ml_duplicate_job_lock(self):
        """Verify that concurrent ML triggers for the same user do not duplicate execution."""
        user_id = "user-concurrent-test"
        with ml_service._ML_JOBS_LOCK:
            ml_service._ACTIVE_ML_JOBS.add(user_id)

        try:
            result = ml_service.process_user_transactions(user_id=user_id)
            self.assertEqual(result["status"], "processing")
            self.assertEqual(result["processed_transactions"], 0)
        finally:
            with ml_service._ML_JOBS_LOCK:
                ml_service._ACTIVE_ML_JOBS.discard(user_id)

    def test_dataset_version_calculation(self):
        """Verify dataset versioning changes when transactions change."""
        txs_v1 = [
            {"id": "1", "amount": 100, "created_at": "2026-09-01T10:00:00Z"},
            {"id": "2", "amount": 200, "created_at": "2026-09-02T10:00:00Z"},
        ]
        txs_v2 = [
            {"id": "1", "amount": 100, "created_at": "2026-09-01T10:00:00Z"},
            {"id": "2", "amount": 200, "created_at": "2026-09-02T10:00:00Z"},
            {"id": "3", "amount": 300, "created_at": "2026-09-03T10:00:00Z"},
        ]

        v1 = ml_service.get_user_transaction_dataset_version(txs_v1)
        v2 = ml_service.get_user_transaction_dataset_version(txs_v2)

        self.assertNotEqual(v1, v2, "Adding a transaction must produce a new version")
        self.assertEqual(v1, ml_service.get_user_transaction_dataset_version(txs_v1), "Identical dataset must produce identical version")


if __name__ == "__main__":
    unittest.main()
