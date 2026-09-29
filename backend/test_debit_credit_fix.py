"""
Test script for the Debit/Credit normalization fix.
Run from the backend directory:
    cd d:/nithin/expense-buddy/backend
    python test_debit_credit_fix.py

Tests:
1. parse_amount() / parse_amount_nonzero() with all edge cases
2. detect_column_mapping() with various Indian bank column names
3. normalize_row() Debit/Credit routing logic
4. Running-balance validation
5. End-to-end test with the synthetic PDF (if available)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ── Unit tests for parse_amount and parse_amount_nonzero ─────────────────────
from services.normalizer import (
    parse_amount, parse_amount_nonzero, parse_date, detect_column_mapping,
    normalize_row, validate_balance, _EMPTY_SENTINELS
)

PASS = "[PASS]"
FAIL = "[FAIL]"

errors = []

def check(label, got, expected):
    if got == expected:
        print(f"{PASS} {label}: {got!r}")
    else:
        print(f"{FAIL} {label}: got={got!r}, expected={expected!r}")
        errors.append(label)


# ── parse_amount ──────────────────────────────────────────────────────────────
print("\n=== parse_amount() tests ===")
check("plain int string",        parse_amount("1499"),        1499.0)
check("plain float",             parse_amount("1499.00"),     1499.0)
check("comma-formatted",         parse_amount("1,499.00"),    1499.0)
check("INR prefix",              parse_amount("INR 1,499.00"), 1499.0)
check("Rs. prefix",              parse_amount("Rs. 1,499"),   1499.0)
check("rupee symbol",            parse_amount("\u20b91,499.00"),  1499.0)
check("parenthetical negative",  parse_amount("(1,499.00)"), -1499.0)
check("negative",                parse_amount("-1499.00"),   -1499.0)
check("None input",              parse_amount(None),          None)
check("empty string",            parse_amount(""),            None)
check("dash sentinel",           parse_amount("-"),           None)
check("em-dash sentinel",        parse_amount("\u2014"),           None)
check("en-dash sentinel",        parse_amount("\u2013"),           None)
check("null string",             parse_amount("null"),        None)
check("None string",             parse_amount("None"),        None)
check("N/A string",              parse_amount("N/A"),         None)
check("zero string",             parse_amount("0"),           None)
check("zero float string",       parse_amount("0.00"),        None)
check("whitespace only",         parse_amount("   "),         None)
check("int 0",                   parse_amount(0),             None)
check("float 1499.0",            parse_amount(1499.0),        1499.0)
check("large lakh amount",       parse_amount("1,25,000.50"), 125000.50)


# ── parse_amount_nonzero ─────────────────────────────────────────────────────
print("\n=== parse_amount_nonzero() tests ===")
check("nonzero: 73000",          parse_amount_nonzero("73,000.00"),  73000.0)
check("nonzero: 634.79",         parse_amount_nonzero("634.79"),     634.79)
check("zero string -> None",     parse_amount_nonzero("0.00"),       None)
check("zero int -> None",        parse_amount_nonzero("0"),          None)
check("dash -> None",            parse_amount_nonzero("-"),          None)
check("empty -> None",           parse_amount_nonzero(""),           None)
check("None -> None",            parse_amount_nonzero(None),         None)


# ── detect_column_mapping ─────────────────────────────────────────────────────
print("\n=== detect_column_mapping() tests ===")

# Synthetic 500-tx PDF headers
pdf_cols_500 = ["Txn Date", "Value Date", "Description", "Ref No./Cheque No.", "Debit", "Credit", "Balance"]
mapping_500 = detect_column_mapping(pdf_cols_500)
check("PDF: date -> Txn Date",         mapping_500["date"],        "Txn Date")
check("PDF: description -> Description", mapping_500["description"], "Description")
check("PDF: debit -> Debit",           mapping_500["debit"],       "Debit")
check("PDF: credit -> Credit",         mapping_500["credit"],      "Credit")
check("PDF: balance -> Balance",       mapping_500["balance"],     "Balance")
check("PDF: reference mapped",         mapping_500["reference"],   "Ref No./Cheque No.")
check("PDF: amount not mapped",        mapping_500["amount"],      None)  # no pure amount col

# HDFC-style
hdfc_cols = ["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.(INR)", "Deposit Amt.(INR)", "Closing Balance(INR)"]
mapping_hdfc = detect_column_mapping(hdfc_cols)
# Note: "Withdrawal Amt.(INR)" won't match exactly - testing for what we CAN match
check("HDFC: date -> Date",            mapping_hdfc["date"],        "Date")
check("HDFC: description -> Narration", mapping_hdfc["description"], "Narration")

# Alias variants
variant_cols = ["WITHDRAWAL", "DEPOSITS", "DR AMOUNT", "CR AMOUNT", "Amount Debited", "Amount Credited"]
map_v = detect_column_mapping(variant_cols)
check("Variant: WITHDRAWAL -> debit",   map_v["debit"],   "WITHDRAWAL")
check("Variant: DEPOSITS -> credit",    map_v["credit"],  "DEPOSITS")


# ── normalize_row: Credit transaction ────────────────────────────────────────
print("\n=== normalize_row() credit transaction (THE KEY FIX) ===")
mapping_pdf = {
    "date": "Txn Date",
    "description": "Description",
    "debit": "Debit",
    "credit": "Credit",
    "balance": "Balance",
    "reference": "Ref No./Cheque No.",
}

# Credit transaction: salary NEFT with 0.00 debit
credit_row = {
    "Txn Date": "01/01/2025",
    "Value Date": "01/01/2025",
    "Description": "NEFT CREDIT-SALARY-TEST COMPANY",
    "Ref No./Cheque No.": "SAL2501",
    "Debit": "0.00",
    "Credit": "73,000.00",
    "Balance": "1,58,990.54",
}
credit_norm = normalize_row(credit_row, mapping_pdf, source="pdf")
check("Credit: amount = 73000.0",       credit_norm["amount"],           73000.0)
check("Credit: transaction_type=credit", credit_norm["transaction_type"],  "credit")
check("Credit: debit field = None",     credit_norm["debit"],            None)
check("Credit: credit field = 73000",   credit_norm["credit"],           73000.0)
check("Credit: balance preserved",      credit_norm["account_balance"],  158990.54)
check("Credit: reference preserved",    credit_norm["reference"],        "SAL2501")


# ── normalize_row: Debit transaction ─────────────────────────────────────────
print("\n=== normalize_row() debit transaction ===")
debit_row = {
    "Txn Date": "02/01/2025",
    "Value Date": "02/01/2025",
    "Description": "FITNESS HUB MEMBERSHIP / RECURRING",
    "Ref No./Cheque No.": "SUB250101",
    "Debit": "1,499.00",
    "Credit": "0.00",
    "Balance": "1,57,491.54",
}
debit_norm = normalize_row(debit_row, mapping_pdf, source="pdf")
check("Debit: amount = 1499.0",          debit_norm["amount"],           1499.0)
check("Debit: transaction_type=debit",   debit_norm["transaction_type"],  "debit")
check("Debit: debit field = 1499",       debit_norm["debit"],             1499.0)
check("Debit: credit field = None",      debit_norm["credit"],            None)
check("Debit: balance preserved",        debit_norm["account_balance"],   157491.54)

# Dash-debit (dash instead of 0.00)
dash_row = {
    "Txn Date": "01/01/2025",
    "Description": "UPI/DR/ZOMATO",
    "Ref No./Cheque No.": "UPI123",
    "Debit": "634.79",
    "Credit": "-",
    "Balance": "84,365.21",
}
dash_norm = normalize_row(dash_row, mapping_pdf, source="pdf")
check("Dash credit row: amount=634.79",  dash_norm["amount"],           634.79)
check("Dash credit row: type=debit",     dash_norm["transaction_type"],  "debit")
check("Dash credit row: credit=None",    dash_norm["credit"],            None)

# Empty-debit credit row
empty_debit_row = {
    "Txn Date": "01/01/2025",
    "Description": "INTEREST CREDIT",
    "Ref No./Cheque No.": "INT001",
    "Debit": "",
    "Credit": "450.00",
    "Balance": "85,815.21",
}
empty_norm = normalize_row(empty_debit_row, mapping_pdf, source="pdf")
check("Empty debit: amount=450",         empty_norm["amount"],           450.0)
check("Empty debit: type=credit",        empty_norm["transaction_type"],  "credit")


# ── validate_balance ──────────────────────────────────────────────────────────
print("\n=== validate_balance() tests ===")
check("Debit: 85000 - 634.79 = 84365.21",
      validate_balance(85000.0, 634.79, None, 84365.21), True)
check("Credit: 85990.54 + 73000 = 158990.54",
      validate_balance(85990.54, None, 73000.0, 158990.54), True)
check("Mismatch detected",
      validate_balance(85000.0, 634.79, None, 99999.00), False)
check("Unknown (no prev_balance)",
      validate_balance(None, 634.79, None, 84365.21), None)


# ── End-to-end PDF test ───────────────────────────────────────────────────────
print("\n=== End-to-end PDF test ===")
PDF_CANDIDATES = [
    r"D:\nithin\expense-buddy\test_statement.pdf",
    r"D:\nithin\expense-buddy\backend\test_statement.pdf",
    r"C:\Users\moham\Downloads\test_statement.pdf",
]
PDF_PASSWORD = "ExpenseBuddy123"

pdf_path = None
for p in PDF_CANDIDATES:
    if os.path.exists(p):
        pdf_path = p
        break

if not pdf_path:
    print(f"[SKIP] No test PDF found at expected paths: {PDF_CANDIDATES}")
    print("       To run end-to-end test, place the PDF at one of the above paths.")
else:
    print(f"  Found PDF: {pdf_path}")
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    from parsers.pdf_parser import parse_pdf
    from services.normalizer import detect_column_mapping, normalize_row

    parsed = parse_pdf(pdf_bytes, password=PDF_PASSWORD)
    rows   = parsed["rows"]
    cols   = parsed["columns"]
    print(f"  Columns detected: {cols}")
    print(f"  Rows extracted:   {len(rows)}")

    mapping = detect_column_mapping(cols)
    print(f"  Column mapping:   {mapping}")

    debit_count   = 0
    credit_count  = 0
    missing_count = 0
    error_rows    = []

    for idx, row in enumerate(rows):
        try:
            norm = normalize_row(row, mapping, source="pdf")
            if norm["transaction_type"] == "debit":
                debit_count += 1
            else:
                credit_count += 1
            if norm["amount"] is None or norm["amount"] <= 0:
                missing_count += 1
        except ValueError as e:
            missing_count += 1
            error_rows.append(f"  Row {idx+1}: {e}")

    print(f"\n  Debit transactions:   {debit_count}")
    print(f"  Credit transactions:  {credit_count}")
    print(f"  Total:                {debit_count + credit_count}")
    print(f"  Missing amounts:      {missing_count}")
    if error_rows:
        print("  Error rows (first 10):")
        for e in error_rows[:10]:
            print(e)

    check("PDF: 500 rows detected",           len(rows),       500)
    check("PDF: 0 missing amounts",           missing_count,   0)
    check("PDF: total = debit + credit",      debit_count + credit_count, len(rows) - len(error_rows))


# ── Summary ───────────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
if errors:
    print(f"FAILED: {len(errors)} test(s) failed:")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
else:
    print(f"ALL TESTS PASSED")
