"""
Comprehensive Test Suite for Excel / CSV Bank Statement Ingestion & Auto-Detection Pipeline.
Validates all requirements from the Master Prompt:

TEST 1: Current uploaded Excel file (500 transactions, header on row 8, 'Transactions' sheet).
TEST 2: Excel with transaction header starting on Row 1 (Standard table).
TEST 3: Excel with arbitrary metadata lines above header (Row 4, Row 15, blank lines).
TEST 4: Excel with alternative Indian bank column names (Date, Narration, Withdrawal, Deposit, Balance).
TEST 5: Excel with single Amount column (Date, Description, Amount, Balance, Transaction Type).
TEST 6: CSV statement with metadata header rows (Parsed dynamically, normalized cleanly).
TEST 7: Multiple Excel worksheets ('Summary', 'Transactions', 'Notes') — 'Transactions' auto-selected.
TEST 8: Invalid / non-transaction spreadsheet — Graceful fallback, clear reason, no crash.
TEST 9: High-volume 5-year statement (3000 transactions, 100% normalized with 0 errors).
TEST 10: Duplicate protection using reference / balance fingerprints.
"""

import io
import os
import sys
import unittest
from datetime import datetime, date
import openpyxl

# Ensure backend root is on sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from parsers.excel_parser import parse_excel
from parsers.csv_parser import parse_csv
from parsers.table_detector import detect_transaction_table, select_best_sheet
from services.normalizer import detect_column_mapping, normalize_row
from services import import_service
from services.duplicate_detector import _tx_fingerprint, is_duplicate


def _build_excel_bytes(sheet_data: dict[str, list[list]]) -> bytes:
    """Helper to construct an in-memory .xlsx file with specified sheet(s) and rows."""
    wb = openpyxl.Workbook()
    # remove default sheet
    wb.remove(wb.active)

    for s_name, rows in sheet_data.items():
        ws = wb.create_sheet(title=s_name)
        for r in rows:
            ws.append(r)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class TestExcelCsvBankStatementPipeline(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.test_500_path = r"C:\Users\moham\Downloads\Expense_Buddy_Test_500_Transactions_1_Year.xlsx"
        cls.test_3000_path = r"C:\Users\moham\Downloads\Expense_Buddy_Test_3000_Transactions_5_Years.xlsx"

    def test_01_current_excel_file_500_transactions(self):
        """Test 1: Current 500-transaction Excel file with Row 8 header and metadata on Rows 1-5."""
        if not os.path.exists(self.test_500_path):
            self.skipTest(f"Test file not found at {self.test_500_path}")

        with open(self.test_500_path, "rb") as f:
            file_bytes = f.read()

        parsed = import_service.parse_file(file_bytes, "Expense_Buddy_Test_500_Transactions_1_Year.xlsx", "excel")

        # 1. Sheet selection
        self.assertEqual(parsed["sheet"], "Transactions")
        self.assertEqual(parsed["selected_sheet"], "Transactions")

        # 2. Header row identification (must be row 8, NOT row 2 metadata)
        self.assertEqual(parsed["header_row"], 8)
        self.assertGreaterEqual(parsed["confidence"], 0.90)

        # 3. Columns properly extracted
        expected_cols = [
            "Txn Date", "Value Date", "Description", "Reference No.",
            "Debit", "Credit", "Balance", "Transaction Type"
        ]
        self.assertEqual(parsed["columns"], expected_cols)

        # 4. Auto-mapping matches expected target fields
        mapping = parsed["auto_mapping"]
        self.assertEqual(mapping.get("date"), "Txn Date")
        self.assertEqual(mapping.get("value_date"), "Value Date")
        self.assertEqual(mapping.get("description"), "Description")
        self.assertEqual(mapping.get("reference"), "Reference No.")
        self.assertEqual(mapping.get("debit"), "Debit")
        self.assertEqual(mapping.get("credit"), "Credit")
        self.assertEqual(mapping.get("balance"), "Balance")
        self.assertEqual(mapping.get("type"), "Transaction Type")

        # 5. Exactly 500 transaction records detected
        self.assertEqual(parsed["total_rows"], 500)
        self.assertEqual(len(parsed["rows"]), 500)

        # 6. Normalize all 500 rows through the pipeline
        valid_rows, error_rows = import_service.normalize_rows(parsed["rows"], mapping, "excel")
        self.assertEqual(len(valid_rows), 500)
        self.assertEqual(len(error_rows), 0)

        # 7. Verify debit vs credit logic
        first_tx = valid_rows[0]  # NEFT Refund
        self.assertEqual(first_tx["transaction_type"], "credit")
        self.assertEqual(first_tx["amount"], 5000.25)
        self.assertIsNone(first_tx["debit"])
        self.assertEqual(first_tx["credit"], 5000.25)
        self.assertEqual(first_tx["reference"], "NEFT2501000001")
        self.assertEqual(first_tx["transaction_date"], "2025-01-01")

        second_tx = valid_rows[1]  # Online Shopping
        self.assertEqual(second_tx["transaction_type"], "debit")
        self.assertEqual(second_tx["amount"], 2674.36)
        self.assertEqual(second_tx["debit"], 2674.36)
        self.assertIsNone(second_tx["credit"])
        self.assertEqual(second_tx["reference"], "UPI2501000002")
        self.assertEqual(second_tx["transaction_date"], "2025-01-02")

    def test_02_excel_with_header_on_row_1(self):
        """Test 2: Excel with transaction table starting immediately on Row 1 (no metadata)."""
        data = {
            "Statement": [
                ["Date", "Description", "Debit", "Credit", "Balance"],
                [datetime(2025, 3, 1), "Grocery Mart", 1250.50, None, 48749.50],
                [datetime(2025, 3, 2), "Salary Credit", None, 65000.0, 113749.50],
                [datetime(2025, 3, 3), "Electric Bill", 2300.0, None, 111449.50],
            ]
        }
        file_bytes = _build_excel_bytes(data)
        parsed = import_service.parse_file(file_bytes, "clean_statement.xlsx", "excel")

        self.assertEqual(parsed["header_row"], 1)
        self.assertEqual(parsed["total_rows"], 3)
        self.assertTrue(parsed["mapping_confident"])
        self.assertEqual(parsed["auto_mapping"]["date"], "Date")
        self.assertEqual(parsed["auto_mapping"]["description"], "Description")
        self.assertEqual(parsed["auto_mapping"]["debit"], "Debit")
        self.assertEqual(parsed["auto_mapping"]["credit"], "Credit")

    def test_03_excel_with_arbitrary_metadata_above_header(self):
        """Test 3: Excel with 14 rows of branch info, disclaimers, blanks before Row 15 header."""
        rows = [
            ["BANK OF INDIA — STATEMENT OF ACCOUNT", None, None, None],
            ["Branch:", "Connaught Place, New Delhi", "IFSC:", "BKID0000101"],
            ["Customer Name:", "Priya Sharma", "Account No:", "010110100045678"],
            ["Statement Period:", "01-Jan-2025 to 31-Jan-2025", None, None],
            ["Opening Balance:", 45000.00, "Total Debit:", 32000.00],
            ["Closing Balance:", 78000.00, "Total Credit:", 65000.00],
            [None, None, None, None],  # blank row 7
            ["IMPORTANT NOTICE:", "Report discrepancies within 14 days", None, None],
            [None, None, None, None],  # blank row 9
            [None, None, None, None],  # blank row 10
            ["Customer Care:", "1800-11-22-33", "Email:", "support@bank.com"],
            [None, None, None, None],  # blank row 12
            [None, None, None, None],  # blank row 13
            [None, None, None, None],  # blank row 14
            # Row 15: Actual Header
            ["Txn Date", "Particulars", "Dr Amount", "Cr Amount", "Net Balance"],
            # Rows 16+: Actual Data
            ["02/01/2025", "UPI/Swiggy Order", "450.00", "", "44550.00"],
            ["05/01/2025", "NEFT Salary Inward", "", "65000.00", "109550.00"],
            ["10/01/2025", "ATM Cash Withdrawal", "10000.00", "", "99550.00"],
        ]
        file_bytes = _build_excel_bytes({"Statement": rows})
        parsed = import_service.parse_file(file_bytes, "deep_metadata.xlsx", "excel")

        self.assertEqual(parsed["header_row"], 15)
        self.assertEqual(parsed["total_rows"], 3)
        self.assertEqual(parsed["auto_mapping"]["date"], "Txn Date")
        self.assertEqual(parsed["auto_mapping"]["description"], "Particulars")
        self.assertEqual(parsed["auto_mapping"]["debit"], "Dr Amount")
        self.assertEqual(parsed["auto_mapping"]["credit"], "Cr Amount")

        # None of the metadata rows should be in rows
        descriptions = [r["Particulars"] for r in parsed["rows"]]
        self.assertNotIn("Customer Name:", descriptions)
        self.assertNotIn("Opening Balance:", descriptions)
        self.assertIn("UPI/Swiggy Order", descriptions)

    def test_04_excel_with_different_column_names(self):
        """Test 4: Excel with HDFC-style columns: Date, Narration, Withdrawal, Deposit, Balance."""
        rows = [
            ["HDFC BANK STATEMENT", None, None, None, None],
            ["Account Number: 5010023456789", None, None, None, None],
            [None, None, None, None, None],
            ["Date", "Narration", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
            [datetime(2025, 4, 1), "ACH/NETFLIX SUBSCRIPTION", 649.00, None, 35000.00],
            [datetime(2025, 4, 3), "UPI/PHONEPE TRANSFER", 1500.00, None, 33500.00],
            [datetime(2025, 4, 5), "INTEREST CREDIT", None, 340.50, 33840.50],
        ]
        file_bytes = _build_excel_bytes({"Sheet1": rows})
        parsed = import_service.parse_file(file_bytes, "hdfc_style.xlsx", "excel")

        self.assertEqual(parsed["header_row"], 4)
        self.assertEqual(parsed["total_rows"], 3)
        self.assertEqual(parsed["auto_mapping"]["date"], "Date")
        self.assertEqual(parsed["auto_mapping"]["description"], "Narration")
        self.assertEqual(parsed["auto_mapping"]["debit"], "Withdrawal Amt.")
        self.assertEqual(parsed["auto_mapping"]["credit"], "Deposit Amt.")
        self.assertEqual(parsed["auto_mapping"]["balance"], "Closing Balance")

        valid, errors = import_service.normalize_rows(parsed["rows"], parsed["auto_mapping"], "excel")
        self.assertEqual(len(valid), 3)
        self.assertEqual(len(errors), 0)

    def test_05_excel_with_single_amount_column(self):
        """Test 5: Excel with single Amount column and Dr/Cr Type column."""
        rows = [
            ["Statement of Account", None, None, None],
            ["Posting Date", "Transaction Details", "Amount", "Dr/Cr", "Running Balance"],
            [datetime(2025, 5, 1), "Coffee Shop", 240.00, "DR", 15400.00],
            [datetime(2025, 5, 2), "Freelance Payment", 25000.00, "CR", 40400.00],
        ]
        file_bytes = _build_excel_bytes({"Transactions": rows})
        parsed = import_service.parse_file(file_bytes, "single_amount.xlsx", "excel")

        self.assertEqual(parsed["header_row"], 2)
        self.assertEqual(parsed["auto_mapping"]["date"], "Posting Date")
        self.assertEqual(parsed["auto_mapping"]["description"], "Transaction Details")
        self.assertEqual(parsed["auto_mapping"]["amount"], "Amount")
        self.assertEqual(parsed["auto_mapping"]["type"], "Dr/Cr")

        valid, errors = import_service.normalize_rows(parsed["rows"], parsed["auto_mapping"], "excel")
        self.assertEqual(len(valid), 2)
        self.assertEqual(valid[0]["transaction_type"], "debit")
        self.assertEqual(valid[1]["transaction_type"], "credit")

    def test_06_csv_bank_statement_with_metadata(self):
        """Test 6: Bank CSV with top metadata rows, parsed cleanly with dynamic header detection."""
        csv_content = """FICTIONAL TEST DATA - NOT A REAL STATEMENT
Account Holder,Nithin Test User,,Total Debit,50000.00
Account Number,XXXXXX1234,,Total Credit,75000.00
Statement Period,01/01/2025 - 31/01/2025,,Closing Balance,25000.00

Txn Date,Value Date,Description,Ref No.,Debit,Credit,Balance
01/01/2025,01/01/2025,Zomato Food Order,ZOM101,350.00,,24650.00
02/01/2025,02/01/2025,Salary Credit,SAL102,,75000.00,99650.00
03/01/2025,03/01/2025,Uber Ride,UBR103,420.00,,99230.00
"""
        parsed = import_service.parse_file(csv_content.encode("utf-8"), "statement.csv", "csv")

        self.assertEqual(parsed["header_row"], 6)
        self.assertEqual(parsed["total_rows"], 3)
        self.assertEqual(parsed["auto_mapping"]["date"], "Txn Date")
        self.assertEqual(parsed["auto_mapping"]["description"], "Description")
        self.assertEqual(parsed["auto_mapping"]["debit"], "Debit")
        self.assertEqual(parsed["auto_mapping"]["credit"], "Credit")

        valid, errors = import_service.normalize_rows(parsed["rows"], parsed["auto_mapping"], "csv")
        self.assertEqual(len(valid), 3)
        self.assertEqual(len(errors), 0)

    def test_07_multiple_excel_sheets_auto_selects_transactions(self):
        """Test 7: Multi-sheet workbook with Summary, Transactions, and Instructions."""
        data = {
            "Summary": [
                ["Annual Account Summary", None, None],
                ["Opening Balance", 10000.0, None],
                ["Total Inflows", 85000.0, None],
                ["Total Outflows", 62000.0, None],
                ["Closing Balance", 33000.0, None],
            ],
            "Instructions": [
                ["How to use this statement", None],
                ["Please review your transactions carefully", None],
            ],
            "Transactions": [
                ["STATEMENT OF TRANSACTIONS", None, None, None],
                [None, None, None, None],
                ["Date", "Description", "Debit", "Credit", "Balance"],
                [datetime(2025, 6, 1), "Book Store", 850.0, None, 32150.0],
                [datetime(2025, 6, 2), "Gym Membership", 2500.0, None, 29650.0],
                [datetime(2025, 6, 3), "Interest Received", None, 150.0, 29800.0],
            ]
        }
        file_bytes = _build_excel_bytes(data)
        parsed = import_service.parse_file(file_bytes, "multi_sheet.xlsx", "excel")

        # Transactions sheet must be chosen automatically over Summary and Instructions
        self.assertEqual(parsed["selected_sheet"], "Transactions")
        self.assertEqual(parsed["header_row"], 3)
        self.assertEqual(parsed["total_rows"], 3)
        self.assertEqual(set(parsed["sheet_names"]), {"Summary", "Instructions", "Transactions"})

    def test_08_invalid_spreadsheet_graceful_fallback(self):
        """Test 8: Spreadsheet with arbitrary non-financial text has confidence=0 and doesn't crash."""
        data = {
            "Sheet1": [
                ["Inventory Items", "Warehouse Location", "Stock Quantity"],
                ["Hammer", "Aisle 4", 25],
                ["Screwdriver", "Aisle 5", 40],
                ["Wrench", "Aisle 6", 15],
            ]
        }
        file_bytes = _build_excel_bytes(data)
        parsed = import_service.parse_file(file_bytes, "hardware_inventory.xlsx", "excel")

        self.assertFalse(parsed["mapping_confident"])
        self.assertFalse(parsed.get("table_detected", True))
        self.assertEqual(parsed.get("confidence", 0.0), 0.0)
        self.assertIn("columns", parsed)
        self.assertEqual(len(parsed["rows"]), 3)

    def test_09_high_volume_5_year_statement_3000_rows(self):
        """Test 9: 3000-transaction Excel file across 5 years."""
        if not os.path.exists(self.test_3000_path):
            self.skipTest(f"Test file not found at {self.test_3000_path}")

        with open(self.test_3000_path, "rb") as f:
            file_bytes = f.read()

        parsed = import_service.parse_file(file_bytes, "Expense_Buddy_Test_3000_Transactions_5_Years.xlsx", "excel")
        self.assertEqual(parsed["header_row"], 8)
        self.assertEqual(parsed["total_rows"], 3000)

        valid_rows, error_rows = import_service.normalize_rows(parsed["rows"], parsed["auto_mapping"], "excel")
        self.assertEqual(len(valid_rows), 3000)
        self.assertEqual(len(error_rows), 0)

    def test_10_duplicate_protection_fingerprint(self):
        """Test 10: Duplicate protection allows distinct transactions on same day with different reference."""
        tx1 = {
            "transaction_date": "2025-01-02",
            "amount": 200.0,
            "transaction_type": "debit",
            "description": "Metro Rail Smartcard Recharge",
            "reference": "REF10001",
            "account_balance": 15000.0,
        }
        tx2 = {
            "transaction_date": "2025-01-02",
            "amount": 200.0,
            "transaction_type": "debit",
            "description": "Metro Rail Smartcard Recharge",
            "reference": "REF10002",  # Different reference
            "account_balance": 14800.0,
        }
        tx1_dup = dict(tx1)  # Exact duplicate

        existing_set = {_tx_fingerprint(tx1)}

        # tx1_dup must be detected as duplicate
        self.assertTrue(is_duplicate(tx1_dup, existing_set))

        # tx2 has a different reference and balance, must NOT be rejected as duplicate
        self.assertFalse(is_duplicate(tx2, existing_set))


if __name__ == "__main__":
    unittest.main()
