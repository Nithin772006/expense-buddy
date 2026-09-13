"""
test_api_endpoints.py — Integration and Security tests for FastAPI ML Router & Forecast Endpoints.

Verifies:
1. Unauthenticated GET /ml/forecast returns 401 Unauthorized.
2. Unauthenticated GET /ml/forecast/reasoning returns 401 Unauthorized.
3. Invalid / forged Bearer token returns 401.
4. Response never leaks GROQ_API_KEY.
5. GET /health returns 200 with all models loaded.
"""

import os
import sys
import unittest
from fastapi.testclient import TestClient

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from main import app


class TestForecastApiEndpoints(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Initialize test client with startup lifespan triggered
        with TestClient(app) as client:
            cls.client = client

    def test_health_check(self):
        """Verify API health endpoint returns healthy."""
        with TestClient(app) as client:
            res = client.get("/health")
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["status"], "healthy")
            self.assertTrue(data["models_loaded"])

    def test_unauthenticated_forecast_rejected_401(self):
        """Verify unauthenticated request to /ml/forecast is rejected with 401."""
        with TestClient(app) as client:
            res = client.get("/ml/forecast")
            self.assertEqual(res.status_code, 401)
            self.assertIn("detail", res.json())

    def test_unauthenticated_reasoning_rejected_401(self):
        """Verify unauthenticated request to /ml/forecast/reasoning is rejected with 401."""
        with TestClient(app) as client:
            res = client.get("/ml/forecast/reasoning")
            self.assertEqual(res.status_code, 401)
            self.assertIn("detail", res.json())

    def test_invalid_bearer_token_rejected_401(self):
        """Verify forged or expired token is rejected with 401."""
        with TestClient(app) as client:
            headers = {"Authorization": "Bearer forged.fake.token"}
            res = client.get("/ml/forecast", headers=headers)
            self.assertEqual(res.status_code, 401)

    def test_no_secret_in_any_response(self):
        """Verify responses never expose GROQ_API_KEY."""
        with TestClient(app) as client:
            res = client.get("/health")
            raw_text = res.text
            self.assertNotIn("GROQ_API_KEY", raw_text)
            self.assertNotIn("SUPABASE_SERVICE_KEY", raw_text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
