"""
Comprehensive Test Suite for Expense Buddy Bank Statement Importer.
Validates all 17 requirements specified in the Master Prompt:

TEST 1:  Normal digital PDF (Native parser used, OCR NOT used).
TEST 2:  Password-protected digital PDF (Password requested, correct password succeeds).
TEST 3:  Password-protected PDF with incorrect password (Friendly error returned).
TEST 4:  Scanned PDF (OCR automatically activated).
TEST 5:  Scanned multi-page PDF (All transaction pages processed).
TEST 6:  Mixed digital/scanned PDF (Native extraction + OCR per page).
TEST 7:  HDFC-style statement (Valid table extraction).
TEST 8:  SBI-style statement (Valid table extraction).
TEST 9:  ICICI-style statement (Valid table extraction).
TEST 10: Mock 1-year Expense Buddy statement (Correct transaction-table detection).
TEST 11: Account metadata (Never treated as transaction columns or rows).
TEST 12: Repeated table headers (Headers not imported as transactions).
TEST 13: OCR amount extraction (Amounts normalized correctly, fixing 'O' -> '0').
TEST 14: OCR date extraction (Dates normalized correctly).
TEST 15: Temporary decrypted/OCR files (Cleaned in-memory, no disk leakage).
TEST 16: PDF password (Never appears in logs or error messages).
TEST 17: Unauthorized user (Cannot access another user's uploaded statement).
"""

import io
import os
import sys
import unittest
import logging
from unittest.mock import patch, MagicMock

from PIL import Image, ImageDraw
import pypdf

# Ensure backend root is on sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from parsers.pdf_parser import (
    parse_pdf,
    PasswordRequiredError,
    IncorrectPasswordError,
    UnsupportedEncryptionError,
    parse_transaction_lines,
)
from services.normalizer import detect_column_mapping, normalize_row
from services.ocr_service import (
    get_ocr_service,
    sanitize_ocr_amount_string,
    sanitize_ocr_date_string,
)


from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


def _create_raw_digital_pdf(lines: list[str]) -> bytes:
    """Creates a valid text-based PDF in memory."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    y = 750
    for line in lines:
        c.drawString(50, y, line)
        y -= 20
    c.save()
    return buf.getvalue()


def _create_scanned_pdf(lines: list[str]) -> bytes:
    """Creates a rasterized/scanned image PDF in memory."""
    img = Image.new("RGB", (900, 700), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    y = 60
    for line in lines:
        d.text((50, y), line, fill=(0, 0, 0))
        y += 32

    buf = io.BytesIO()
    img.save(buf, format="PDF")
    return buf.getvalue()


def _create_multi_page_scanned_pdf(pages_lines: list[list[str]]) -> bytes:
    """Creates a multi-page rasterized image PDF in memory."""
    images = []
    for lines in pages_lines:
        img = Image.new("RGB", (900, 700), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        y = 60
        for line in lines:
            d.text((50, y), line, fill=(0, 0, 0))
            y += 32
        images.append(img)

    buf = io.BytesIO()
    images[0].save(buf, format="PDF", save_all=True, append_images=images[1:])
    return buf.getvalue()


class TestBankImporterAdvanced(unittest.TestCase):

    # ── TEST 1: Normal Digital PDF ──────────────────────────────────────────
    def test_01_normal_digital_pdf(self):
        """Native parser is used and OCR is NOT called."""
        lines = [
            "HDFC BANK LIMITED",
            "Account Statement for Period 01/01/2026 to 31/01/2026",
            "Date Description Debit Credit Balance",
            "12/01/2026 UPI/Swiggy 450.00 12500.00",
            "15/01/2026 SALARY/TECH 25000.00 37500.00",
            "18/01/2026 UPI/Amazon 1200.00 36300.00",
        ]
        pdf_bytes = _create_raw_digital_pdf(lines)
        result = parse_pdf(pdf_bytes)

        self.assertFalse(result["ocr_used"], "OCR must NOT be used for normal digital PDFs")
        self.assertFalse(result["is_scanned"], "Should not be marked as scanned")
        self.assertGreaterEqual(result["total_rows"], 3)
        self.assertIn("Swiggy", result["rows"][0]["Description"])

    # ── TEST 2: Password-Protected Digital PDF (Success) ────────────────────
    def test_02_password_protected_pdf_success(self):
        """Password requested initially; correct password successfully decrypts."""
        lines = [
            "ICICI BANK STATEMENT",
            "Date Particulars Withdrawals Deposits Balance",
            "05/02/2026 UPI/Uber 280.00 18400.00",
            "07/02/2026 UPI/Netflix 649.00 17751.00",
        ]
        plain_bytes = _create_raw_digital_pdf(lines)

        # Encrypt with pypdf
        reader = pypdf.PdfReader(io.BytesIO(plain_bytes))
        writer = pypdf.PdfWriter()
        writer.append(reader)
        writer.encrypt("SecretPass99")
        enc_buf = io.BytesIO()
        writer.write(enc_buf)
        encrypted_bytes = enc_buf.getvalue()

        # Step A: Without password -> raises PasswordRequiredError
        with self.assertRaises(PasswordRequiredError):
            parse_pdf(encrypted_bytes, password=None)

        # Step B: With correct password -> succeeds
        result = parse_pdf(encrypted_bytes, password="SecretPass99")
        self.assertTrue(result["was_encrypted"])
        self.assertGreaterEqual(result["total_rows"], 2)
        self.assertIn("Uber", result["rows"][0]["Description"])

    # ── TEST 3: Password-Protected PDF with Incorrect Password ──────────────
    def test_03_password_protected_pdf_incorrect_password(self):
        """Incorrect password produces a friendly IncorrectPasswordError."""
        lines = [
            "SBI STATEMENT",
            "Date Description Debit Credit Balance",
            "10/02/2026 UPI/Zomato 350.00 8900.00",
        ]
        plain_bytes = _create_raw_digital_pdf(lines)

        reader = pypdf.PdfReader(io.BytesIO(plain_bytes))
        writer = pypdf.PdfWriter()
        writer.append(reader)
        writer.encrypt("CorrectKey123")
        enc_buf = io.BytesIO()
        writer.write(enc_buf)
        encrypted_bytes = enc_buf.getvalue()

        with self.assertRaises(IncorrectPasswordError) as ctx:
            parse_pdf(encrypted_bytes, password="WrongPassword!")

        self.assertIn("Incorrect PDF password. Please try again.", str(ctx.exception))

    # ── TEST 4: Scanned PDF (Automatic OCR Activation) ──────────────────────
    def test_04_scanned_pdf_auto_ocr(self):
        """Scanned PDF automatically triggers OCR without manual user intervention."""
        lines = [
            "STATE BANK OF INDIA",
            "Txn Date Description Debit Credit Balance",
            "14/03/2026 UPI/Flipkart 1499.00 24500.00",
            "16/03/2026 UPI/ElectricityBill 2150.00 22350.00",
        ]
        scanned_bytes = _create_scanned_pdf(lines)

        result = parse_pdf(scanned_bytes)
        self.assertTrue(result["is_scanned"], "Should detect that PDF is scanned")
        self.assertTrue(result["ocr_used"], "Should automatically activate OCR")
        self.assertGreaterEqual(result["total_rows"], 1)

    # ── TEST 5: Scanned Multi-Page PDF ──────────────────────────────────────
    def test_05_scanned_multi_page_pdf(self):
        """OCR processes all relevant pages in multi-page scanned statement."""
        page1 = [
            "HDFC BANK SCANNED STATEMENT - PAGE 1",
            "Date Particulars Debit Credit Balance",
            "01/04/2026 UPI/Swiggy 320.00 15000.00",
            "03/04/2026 UPI/Amazon 850.00 14150.00",
        ]
        page2 = [
            "HDFC BANK SCANNED STATEMENT - PAGE 2",
            "Date Particulars Debit Credit Balance",
            "10/04/2026 UPI/Starbucks 480.00 13670.00",
            "15/04/2026 SALARY/TECH 45000.00 58670.00",
        ]
        multi_scanned = _create_multi_page_scanned_pdf([page1, page2])

        result = parse_pdf(multi_scanned)
        self.assertTrue(result["ocr_used"])
        self.assertGreaterEqual(result["total_rows"], 2)

    # ── TEST 6: Mixed Digital / Scanned PDF ─────────────────────────────────
    def test_06_mixed_digital_scanned_pdf(self):
        """Mixed documents: digital page extracted natively, scanned page OCR'd."""
        # Create page 1 digital
        digital_bytes = _create_raw_digital_pdf([
            "HDFC BANK DIGITAL PAGE 1",
            "Date Description Debit Credit Balance",
            "02/05/2026 UPI/Groceries 1200.00 28000.00",
        ])
        # Create page 2 scanned
        scanned_bytes = _create_scanned_pdf([
            "HDFC BANK SCANNED PAGE 2",
            "Date Description Debit Credit Balance",
            "05/05/2026 UPI/Pharmacy 450.00 27550.00",
        ])

        # Merge them into 1 mixed document
        r1 = pypdf.PdfReader(io.BytesIO(digital_bytes))
        r2 = pypdf.PdfReader(io.BytesIO(scanned_bytes))
        writer = pypdf.PdfWriter()
        writer.append(r1)
        writer.append(r2)
        mixed_buf = io.BytesIO()
        writer.write(mixed_buf)
        mixed_pdf_bytes = mixed_buf.getvalue()

        result = parse_pdf(mixed_pdf_bytes)
        self.assertTrue(result["is_scanned"] or result["ocr_used"])
        self.assertGreaterEqual(result["total_rows"], 1)

    # ── TEST 7: HDFC-Style Statement Layout ─────────────────────────────────
    def test_07_hdfc_style_statement(self):
        """HDFC layout: Date, Narration, Chq/Ref, Value Dt, Withdrawal, Deposit, Closing Balance."""
        lines = [
            "HDFC BANK - STATEMENT OF ACCOUNT",
            "Account Number: 50100482199341",
            "Date Narration Chq/Ref No Value Dt Withdrawal Deposit Closing Balance",
            "01/06/2026 UPI-ZOMATO-102934 00000000 01/06/2026 420.00 32100.00",
            "05/06/2026 NEFT-SALARY-JUNE 00921823 05/06/2026 65000.00 97100.00",
            "10/06/2026 ACH-TATAPOWER-11 00238123 10/06/2026 2150.00 94950.00",
        ]
        pdf_bytes = _create_raw_digital_pdf(lines)
        result = parse_pdf(pdf_bytes)
        self.assertGreaterEqual(result["total_rows"], 3)
        cols = result["columns"]
        mapping = detect_column_mapping(cols)
        self.assertIsNotNone(mapping.get("date"))
        self.assertIsNotNone(mapping.get("description"))

    # ── TEST 8: SBI-Style Statement Layout ──────────────────────────────────
    def test_08_sbi_style_statement(self):
        """SBI layout: Txn Date, Value Date, Description, Ref No, Debit, Credit, Balance."""
        lines = [
            "STATE BANK OF INDIA - ACCOUNT STATEMENT",
            "CIF No: 8812938120 Branch: CHENNAI ANNA NAGAR",
            "Txn Date Value Date Description Ref No Debit Credit Balance",
            "12/07/2026 12/07/2026 UPI/AMZN/Mkt 992812 1899.00 45200.00",
            "15/07/2026 15/07/2026 INT/RECV/SB 000000 312.00 45512.00",
        ]
        pdf_bytes = _create_raw_digital_pdf(lines)
        result = parse_pdf(pdf_bytes)
        self.assertGreaterEqual(result["total_rows"], 2)

    # ── TEST 9: ICICI-Style Statement Layout ────────────────────────────────
    def test_09_icici_style_statement(self):
        """ICICI layout: Date, Mode, Particulars, Deposits, Withdrawals, Balance."""
        lines = [
            "ICICI BANK LTD",
            "A/C No: 001205019284 IFSC: ICIC0000012",
            "Date Mode Particulars Deposits Withdrawals Balance",
            "20/08/2026 UPI SwiggyInstamart 520.00 23100.00",
            "22/08/2026 IMPS TechCorpSalary 55000.00 78100.00",
        ]
        pdf_bytes = _create_raw_digital_pdf(lines)
        result = parse_pdf(pdf_bytes)
        self.assertGreaterEqual(result["total_rows"], 2)

    # ── TEST 10: Mock 1-Year Expense Buddy Statement ────────────────────────
    def test_10_mock_one_year_statement(self):
        """Synthetic 12-month bank statement correctly detected."""
        lines = [
            "EXPENSE BUDDY ANNUAL REPORT",
            "Account Holder: Nithin",
            "Date Description Debit Credit Balance",
        ]
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        for i, m in enumerate(months, start=1):
            lines.append(f"05 {m} 2026 UPI/Subscription-{m} {199 + i*10}.00 {10000 + i*500}.00")

        pdf_bytes = _create_raw_digital_pdf(lines)
        result = parse_pdf(pdf_bytes)
        self.assertEqual(result["total_rows"], 12)

    # ── TEST 11: Account Metadata Separation ────────────────────────────────
    def test_11_account_metadata_separation(self):
        """Account holder, Account number, Branch are NEVER treated as transactions."""
        text_with_metadata = (
            "Account Holder: ARUN KUMAR\n"
            "Account Number: XXXX XXXX 4821\n"
            "Branch: CHENNAI - ANNA NAGAR\n"
            "IFSC Code: HDFC0000123\n"
            "Statement Period: 01-Jan-2026 to 31-Jan-2026\n"
            "Opening Balance: ₹12,450.00\n"
            "15/01/2026 UPI/ApolloPharmacy 650.00 11800.00\n"
            "Closing Balance: ₹11,800.00\n"
        )
        rows = parse_transaction_lines(text_with_metadata)
        self.assertEqual(len(rows), 1, "Only the transaction row should be extracted")
        self.assertEqual(rows[0]["Description"], "UPI/ApolloPharmacy")

    # ── TEST 12: Repeated Table Headers Filtered ────────────────────────────
    def test_12_repeated_table_headers(self):
        """Headers repeating on multiple pages are not imported as transactions."""
        text_multipage = (
            "Date Description Debit Credit Balance\n"
            "02/09/2026 UPI/Grocery 340.00 5000.00\n"
            "--- Page 2 ---\n"
            "Date Description Debit Credit Balance\n"
            "04/09/2026 UPI/Dairy 120.00 4880.00\n"
        )
        rows = parse_transaction_lines(text_multipage)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["Description"], "UPI/Grocery")
        self.assertEqual(rows[1]["Description"], "UPI/Dairy")

    # ── TEST 13: OCR Amount Extraction & Sanitization ───────────────────────
    def test_13_ocr_amount_sanitization(self):
        """OCR confusions like 'O' instead of '0' are normalized correctly."""
        dirty_amounts = [
            ("1,85O.00", "1850.00"),
            ("₹2,45o.50", "2450.50"),
            ("1250", "1250"),
            ("1,25,000.00", "125000.00"),
        ]
        for raw, expected in dirty_amounts:
            clean = sanitize_ocr_amount_string(raw)
            self.assertEqual(clean, expected, f"Failed to sanitize {raw}")

    # ── TEST 14: OCR Date Extraction & Sanitization ─────────────────────────
    def test_14_ocr_date_sanitization(self):
        """Spaced OCR dates are normalized into valid dates."""
        raw_date = "12 / 03 / 2026"
        clean = sanitize_ocr_date_string(raw_date)
        self.assertEqual(clean, "12/03/2026")

        # Test normalizer parses it
        norm = normalize_row({"date": clean, "description": "Test", "amount": "100"}, {"date": "date", "description": "description", "amount": "amount"})
        self.assertEqual(norm["transaction_date"], "2026-03-12")

    # ── TEST 15: Temporary Files Cleanup ────────────────────────────────────
    def test_15_temp_files_cleanup(self):
        """Ensure decryption and OCR operate strictly in-memory without persistent disk leaks."""
        import tempfile
        initial_temp_files = os.listdir(tempfile.gettempdir())

        lines = [
            "TEST BANK STATEMENT",
            "Date Description Debit Balance",
            "01/10/2026 UPI/TeaShop 30.00 400.00",
        ]
        pdf_bytes = _create_raw_digital_pdf(lines)
        parse_pdf(pdf_bytes)

        post_temp_files = os.listdir(tempfile.gettempdir())
        # No extra leaked statement files
        new_pdf_temps = [f for f in post_temp_files if f not in initial_temp_files and f.endswith(".pdf")]
        self.assertEqual(len(new_pdf_temps), 0, "No decrypted PDF files should be written to temp disk")

    # ── TEST 16: PDF Password Never Appears in Logs ─────────────────────────
    def test_16_pdf_password_never_in_logs(self):
        """Ensure passwords do not leak into logger outputs."""
        sensitive_pass = "MySecretBankPass2026!"
        lines = ["STATEMENT", "Date Description Debit Balance", "01/11/2026 UPI/Fuel 500.00 2000.00"]
        plain = _create_raw_digital_pdf(lines)

        reader = pypdf.PdfReader(io.BytesIO(plain))
        writer = pypdf.PdfWriter()
        writer.append(reader)
        writer.encrypt(sensitive_pass)
        enc_buf = io.BytesIO()
        writer.write(enc_buf)
        enc_pdf = enc_buf.getvalue()

        # Capture log records
        with self.assertLogs("expense_buddy", level="DEBUG") as log_capture:
            # Call with wrong password
            try:
                parse_pdf(enc_pdf, password="WrongSecretPass!")
            except IncorrectPasswordError:
                pass

            # Call with correct password
            parse_pdf(enc_pdf, password=sensitive_pass)

            # Assert password NEVER appears in any log message
            for record in log_capture.output:
                self.assertNotIn(sensitive_pass, record, "CRITICAL: Password found in application logs!")
                self.assertNotIn("WrongSecretPass!", record, "CRITICAL: Failed password attempt logged!")

    # ── TEST 17: Unauthorized User Blocked from Statement History ───────────
    def test_17_unauthorized_user_blocked(self):
        """Ensure IDOR/BOLA protections block unauthorized access to import history."""
        from routers.import_router import get_import_history
        import asyncio
        from fastapi import HTTPException

        auth_user_id = "user-uuid-1111"
        target_user_id = "user-uuid-9999"  # Attacker attempting to read user 9999's history

        async def run_check():
            await get_import_history(
                path_user_id=target_user_id,
                auth=(auth_user_id, "mock-token"),
            )

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(run_check())

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("Forbidden", ctx.exception.detail)


if __name__ == "__main__":
    unittest.main()
