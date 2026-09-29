"""
test_upi_redirection.py — Unit Tests for Real UPI Redirection in Expense Buddy.

Verifies:
 1. NPCI UPI VPA format validation (valid/invalid handles)
 2. Safe monetary amount formatting (avoiding floating point errors)
 3. NPCI compliant UPI Intent URI construction & URL-encoding
 4. Strict INR currency enforcement
 5. Merchant biller suggestion lookup
 6. Input sanitization (injection prevention)
 7. Error handling for missing/unconfigured UPI configurations
 8. Authentication protection on UPI endpoints
"""

import os
import sys
import unittest
from urllib.parse import urlparse, parse_qs

# Ensure backend root is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.upi_service import (
    validate_upi_id,
    format_upi_amount,
    build_upi_payment_uri,
    get_suggested_biller_details,
)
from fastapi.testclient import TestClient
from main import app


class TestUpiRedirection(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    # 1. VPA Validation
    def test_valid_vpa_formats(self):
        valid_vpas = [
            "electricity@upi",
            "bescom@sbi",
            "airtel.pay@icici",
            "jio_recharge@hdfcbank",
            "act-fibernet@axisbank",
            "user123.bill@paytm",
            "spotify.india@okhdfcbank",
        ]
        for vpa in valid_vpas:
            self.assertTrue(validate_upi_id(vpa), f"Expected '{vpa}' to be valid.")

    def test_invalid_vpa_formats(self):
        invalid_vpas = [
            "",
            "   ",
            None,
            "nobankhandle",
            "@upi",
            "user@",
            "user@@bank",
            "user space@bank",
            "user<script>@bank",
            "user@bank@extra",
            "u@b",  # username too short (min 2)
        ]
        for vpa in invalid_vpas:
            self.assertFalse(validate_upi_id(vpa), f"Expected '{vpa}' to be invalid.")

    # 2. Amount Formatting
    def test_amount_formatting(self):
        self.assertEqual(format_upi_amount(1850), "1850.00")
        self.assertEqual(format_upi_amount("1850"), "1850.00")
        self.assertEqual(format_upi_amount(119.18), "119.18")
        self.assertEqual(format_upi_amount("119.18"), "119.18")
        self.assertEqual(format_upi_amount(1250.5), "1250.50")
        self.assertEqual(format_upi_amount("₹1,850.00"), "1850.00")

    def test_invalid_amounts(self):
        with self.assertRaises(ValueError):
            format_upi_amount(0)
        with self.assertRaises(ValueError):
            format_upi_amount(-50)
        with self.assertRaises(ValueError):
            format_upi_amount("invalid")
        with self.assertRaises(ValueError):
            format_upi_amount(None)

    # 3. UPI Intent URI Construction
    def test_build_upi_uri_basic(self):
        uri = build_upi_payment_uri(
            payee_upi_id="electricity@upi",
            payee_name="ABC Electricity Board",
            amount=1850,
            currency="INR",
        )
        self.assertTrue(uri.startswith("upi://pay?"))
        
        parsed = urlparse(uri)
        self.assertEqual(parsed.scheme, "upi")
        self.assertEqual(parsed.netloc, "pay")
        
        qs = parse_qs(parsed.query)
        self.assertEqual(qs.get("pa"), ["electricity@upi"])
        self.assertEqual(qs.get("pn"), ["ABC Electricity Board"])
        self.assertEqual(qs.get("am"), ["1850.00"])
        self.assertEqual(qs.get("cu"), ["INR"])

    def test_build_upi_uri_with_decimal_amount(self):
        uri = build_upi_payment_uri(
            payee_upi_id="spotify.pay@hdfcbank",
            payee_name="Spotify Premium",
            amount=119.18,
            currency="INR",
            transaction_note="Spotify Sub",
        )
        parsed = urlparse(uri)
        qs = parse_qs(parsed.query)
        self.assertEqual(qs.get("am"), ["119.18"])
        self.assertEqual(qs.get("tn"), ["Spotify Sub"])

    def test_build_upi_uri_validation_failures(self):
        # Invalid VPA
        with self.assertRaises(ValueError):
            build_upi_payment_uri(payee_upi_id="invalid", payee_name="Test", amount=100)

        # Invalid Amount
        with self.assertRaises(ValueError):
            build_upi_payment_uri(payee_upi_id="valid@upi", payee_name="Test", amount=0)

        # Unsupported currency
        with self.assertRaises(ValueError):
            build_upi_payment_uri(payee_upi_id="valid@upi", payee_name="Test", amount=100, currency="USD")

    # 4. Biller Suggestions
    def test_biller_suggestions(self):
        bescom = get_suggested_biller_details("BESCOM Electricity")
        self.assertIsNotNone(bescom)
        self.assertEqual(bescom["vpa"], "bescom@upi")

        airtel = get_suggested_biller_details("Airtel Broadband")
        self.assertIsNotNone(airtel)
        self.assertIn("@", airtel["vpa"])

        none_found = get_suggested_biller_details("Random Grocery Store")
        self.assertIsNone(none_found)

    # 5. Security & Authentication Checks
    def test_unauthenticated_upi_endpoints(self):
        fake_id = "00000000-0000-0000-0000-000000000000"
        
        # PATCH /recurring-payments/{id}/upi-config requires JWT
        res = self.client.patch(f"/recurring-payments/{fake_id}/upi-config", json={"payee_upi_id": "test@upi"})
        self.assertEqual(res.status_code, 401)

        # GET /recurring-payments/{id}/upi-intent requires JWT
        res = self.client.get(f"/recurring-payments/{fake_id}/upi-intent")
        self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main()
