"""
PDF Bank Statement Parser
Parses text-based PDFs using pdfplumber.
Extracts transaction table rows from common Indian bank statement formats.

Architecture:
  PDFParser (base)
  └── GenericBankStatementParser   ← default
  (ICICI, HDFC, SBI parsers can be added here later)
"""

import io
import re
from typing import Optional

try:
    import pdfplumber
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False


# ── Regex patterns for Indian bank statement rows ───────────────────────────

# Date patterns: DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY, YYYY-MM-DD
DATE_PATTERN = re.compile(
    r"\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b",
    re.IGNORECASE,
)

# Amount: optional ₹, digits, optional commas, dot, decimals
AMOUNT_PATTERN = re.compile(r"₹?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)")


def _extract_text(file_bytes: bytes) -> tuple[str, bool]:
    """
    Extract all text from a PDF.
    Returns (text, is_text_based).
    is_text_based=False means the PDF is likely scanned.
    """
    if not PDF_AVAILABLE:
        raise RuntimeError("pdfplumber is not installed")

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        pages_text = []
        for page in pdf.pages:
            t = page.extract_text() or ""
            pages_text.append(t)
        full_text = "\n".join(pages_text)

    # If less than 100 chars per page on average, likely scanned
    avg_chars = len(full_text) / max(len(pages_text), 1)
    is_text_based = avg_chars > 80

    return full_text, is_text_based


def _extract_tables_from_pdf(file_bytes: bytes) -> list[dict]:
    """
    Try to extract structured tables from the PDF first (more reliable).
    Returns list of raw dicts if tables found.
    """
    if not PDF_AVAILABLE:
        return []

    results = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table or len(table) < 2:
                    continue
                # First non-empty row is the header
                header = None
                data_rows = []
                for row in table:
                    cleaned = [str(c).strip() if c else "" for c in row]
                    if not any(cleaned):
                        continue
                    if header is None:
                        header = cleaned
                    else:
                        data_rows.append(cleaned)

                if not header or not data_rows:
                    continue

                for row in data_rows:
                    if len(row) < len(header):
                        row = row + [""] * (len(header) - len(row))
                    row_dict = {header[i]: row[i] for i in range(len(header))}
                    results.append(row_dict)

    return results


class GenericBankStatementParser:
    """
    Generic parser for text-based bank statements.
    Attempts to extract transaction rows using table extraction first,
    then falls back to text-line scanning.
    """

    def parse(self, file_bytes: bytes) -> dict:
        # Try structured table extraction first
        table_rows = _extract_tables_from_pdf(file_bytes)
        if table_rows:
            # Detect columns from table rows
            if table_rows:
                columns = list(table_rows[0].keys())
                return {
                    "columns": columns,
                    "rows": table_rows,
                    "total_rows": len(table_rows),
                    "method": "table",
                }

        # Fall back to text-line extraction
        full_text, is_text_based = _extract_text(file_bytes)

        if not is_text_based:
            raise ValueError(
                "This appears to be a scanned/image-based PDF. "
                "Text extraction is not possible. Please convert to a text-based PDF "
                "or export your bank statement in CSV/Excel format instead."
            )

        rows = self._parse_lines(full_text)
        if not rows:
            raise ValueError(
                "Could not extract transactions from this PDF. "
                "The statement format may not be supported. "
                "Please try exporting as CSV from your bank's website."
            )

        columns = ["Date", "Description", "Debit", "Credit", "Balance"]
        return {
            "columns": columns,
            "rows": rows,
            "total_rows": len(rows),
            "method": "text",
        }

    def _parse_lines(self, text: str) -> list[dict]:
        """
        Line-by-line heuristic parser.
        Identifies lines that start with a date and contain amounts.
        """
        lines = text.split("\n")
        rows = []

        for line in lines:
            line = line.strip()
            if len(line) < 10:
                continue

            date_match = DATE_PATTERN.search(line)
            if not date_match:
                continue

            amounts = AMOUNT_PATTERN.findall(line)
            if not amounts:
                continue

            # Extract date
            date_str = date_match.group(0)

            # Description is the text between date and first amount
            date_end = date_match.end()
            first_amt_start = AMOUNT_PATTERN.search(line, date_end)
            if first_amt_start:
                description = line[date_end:first_amt_start.start()].strip()
                description = re.sub(r"\s+", " ", description)
            else:
                description = line[date_end:].strip()

            # Last amount is usually the running balance, second-to-last is the transaction
            debit = ""
            credit = ""
            balance = ""

            if len(amounts) >= 3:
                debit   = amounts[-3].replace(",", "")
                credit  = amounts[-2].replace(",", "")
                balance = amounts[-1].replace(",", "")
            elif len(amounts) == 2:
                debit   = amounts[0].replace(",", "")
                balance = amounts[1].replace(",", "")
            elif len(amounts) == 1:
                debit   = amounts[0].replace(",", "")

            if not description:
                continue

            rows.append({
                "Date":        date_str,
                "Description": description,
                "Debit":       debit,
                "Credit":      credit,
                "Balance":     balance,
            })

        return rows


# ── Parser registry ─────────────────────────────────────────────────────────

PARSERS = {
    "generic": GenericBankStatementParser,
    # Future: "icici": ICICIParser, "hdfc": HDFCParser, "sbi": SBIParser
}


def parse_pdf(file_bytes: bytes, bank: str = "generic") -> dict:
    """
    Main entry point. Selects the appropriate parser and returns rows.
    """
    if not PDF_AVAILABLE:
        raise RuntimeError(
            "PDF parsing is not available. Please install pdfplumber: pip install pdfplumber"
        )

    parser_class = PARSERS.get(bank, GenericBankStatementParser)
    parser = parser_class()
    return parser.parse(file_bytes)
