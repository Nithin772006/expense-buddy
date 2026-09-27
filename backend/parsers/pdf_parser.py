"""
PDF Bank Statement Parser for Expense Buddy.

Supports:
1. Native Digital PDFs (fast text and table extraction using pdfplumber).
2. Password-Protected / Encrypted PDFs (in-memory decryption with zero disk persistence).
3. Automatic Scanned PDF Detection (activates OCR only when needed).
4. Mixed Digital + Scanned PDFs (processes per page and merges seamlessly).
5. Indian Bank Statement Layouts (HDFC, SBI, ICICI, Axis, Kotak, etc.).
6. Account Metadata Separation (avoids treating header info as transaction rows).
7. Repeated Table Header Filtering (across multi-page statements).
8. OCR Confidence Validation & Number Correction.
"""

import io
import re
import logging
from typing import Optional, List, Dict, Tuple, Any

import pypdf
import pypdfium2
import pdfplumber

from services.ocr_service import (
    get_ocr_service,
    preprocess_image_for_ocr,
    sanitize_ocr_amount_string,
    sanitize_ocr_date_string,
)

logger = logging.getLogger("expense_buddy.pdf_parser")


# ── Custom Exceptions for Clean Error Propagation ───────────────────────────

class PasswordRequiredError(Exception):
    """Raised when an encrypted PDF is uploaded without a password."""
    pass


class IncorrectPasswordError(Exception):
    """Raised when an incorrect password is provided for an encrypted PDF."""
    pass


class UnsupportedEncryptionError(Exception):
    """Raised when a PDF uses an unsupported encryption algorithm."""
    pass


# ── Regex Patterns for Indian Bank Statements ───────────────────────────────

# Date patterns: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD MMM YYYY, YYYY-MM-DD
DATE_PATTERN = re.compile(
    r"\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4}|\d{1,2}[\/\-\.](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/\-\.]\d{2,4})\b",
    re.IGNORECASE,
)

# Amount pattern: numbers with commas like 1,25,000.50 and plain decimals like 12500.00 (not date parts)
AMOUNT_PATTERN = re.compile(r"(?<![\/\-\.\d])₹?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{1,2})(?![\/\-\.\d])")

# Account metadata indicators (must NOT be treated as transactions)
METADATA_LINE_PREFIXES = [
    "account holder", "account name", "customer name", "account number", "a/c no",
    "account no", "cust id", "customer id", "cif no", "ifsc", "micr", "branch",
    "nominee", "address", "statement period", "from date", "to date", "opening balance",
    "closing balance", "clear balance", "generated on", "page", "statement of account",
    "summary of accounts", "pan no", "gstin", "email", "mobile no", "phone no",
    "facility", "currency", "scheme", "product", "drawing power",
    "statement for", "account statement", "for period",
]

# Table header patterns to filter out if repeated across multi-page statements
HEADER_KEYWORDS = [
    "particulars", "description", "narration", "transaction details",
    "withdrawal", "deposit", "debit", "credit", "balance", "chq", "ref no",
    "value date", "trans date", "txn date", "post date",
]


def _is_metadata_line(line: str) -> bool:
    """Check if a line contains bank statement account metadata rather than a transaction."""
    line_lower = line.lower().strip()
    # Check prefixes
    for prefix in METADATA_LINE_PREFIXES:
        if line_lower.startswith(prefix) or f"{prefix}:" in line_lower:
            return True
    return False


def _is_repeated_header(line: str) -> bool:
    """Check if a line is a repeated table header row."""
    line_lower = line.lower().strip()
    matches = sum(1 for kw in HEADER_KEYWORDS if kw in line_lower)
    return matches >= 2


# ── Password Decryption & Inspection ────────────────────────────────────────

def decrypt_pdf_in_memory(file_bytes: bytes, password: Optional[str] = None) -> Tuple[bytes, bool]:
    """
    Inspects PDF encryption status and decrypts entirely in memory.
    NEVER writes decrypted data to disk.
    
    Returns:
        (decrypted_or_plain_bytes, was_encrypted)
        
    Raises:
        PasswordRequiredError: if encrypted and no password provided.
        IncorrectPasswordError: if password is wrong.
        UnsupportedEncryptionError: if encryption algorithm is unsupported.
    """
    try:
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    except Exception as e:
        # Check if error message mentions encryption
        err_msg = str(e).lower()
        if "encrypted" in err_msg or "password" in err_msg:
            if not password:
                raise PasswordRequiredError("This PDF is password-protected. Please enter the password to proceed.")
            logger.warning("PDF decryption failed: invalid password attempt.")
            raise IncorrectPasswordError("Incorrect PDF password. Please try again.")
        raise ValueError(f"Could not read PDF file: {str(e)}")

    if not reader.is_encrypted:
        logger.debug("PDF is not encrypted.")
        return file_bytes, False

    # Document is encrypted
    if not password:
        raise PasswordRequiredError("This PDF is password-protected. Please enter the password to proceed.")

    try:
        # reader.decrypt returns:
        # 0: PasswordType.NOT_DECRYPTED (failed)
        # 1: PasswordType.USER_PASSWORD
        # 2: PasswordType.OWNER_PASSWORD
        result = reader.decrypt(password)
        if result == 0:
            logger.warning("PDF decryption failed: invalid password attempt.")
            raise IncorrectPasswordError("Incorrect PDF password. Please try again.")
    except (IncorrectPasswordError, PasswordRequiredError):
        raise
    except Exception as e:
        err_str = str(e).lower()
        if "unsupported" in err_str or "algorithm" in err_str:
            raise UnsupportedEncryptionError(
                "This PDF uses an unsupported encryption format. Please export an unlocked copy of the statement from your bank."
            )
        logger.warning("PDF decryption failed: invalid password attempt.")
        raise IncorrectPasswordError("Incorrect PDF password. Please try again.")

    logger.info("Decrypted password-protected PDF in-memory.")

    # Re-serialize decrypted document to in-memory bytes for downstream parsers
    try:
        writer = pypdf.PdfWriter()
        writer.append(reader)
        out_buf = io.BytesIO()
        writer.write(out_buf)
        decrypted_bytes = out_buf.getvalue()
        return decrypted_bytes, True
    except Exception as e:
        logger.error("Failed to re-serialize decrypted PDF: %s", e)
        # Fall back to passing original bytes with password to pdfplumber
        return file_bytes, True


# ── Page Text & Scanned Page Detection ──────────────────────────────────────

def _is_page_scanned(page: pdfplumber.page.Page) -> Tuple[bool, str]:
    """
    Inspects a single PDF page to determine whether it is digital text or scanned image.
    Returns:
        (is_scanned, extracted_text)
    """
    text = page.extract_text() or ""
    # Strip whitespace to count meaningful characters
    alnum_chars = len(re.sub(r"[^a-zA-Z0-9]", "", text))

    # A typical digital statement page has 200 - 3000+ characters.
    # If a page has fewer than 40 alphanumeric characters, it is virtually always
    # a scanned/rasterized document.
    if alnum_chars < 40:
        return True, text

    return False, text


# ── Digital Table Extraction ────────────────────────────────────────────────

def _extract_tables_from_digital_page(page: pdfplumber.page.Page) -> List[Dict[str, str]]:
    """
    Attempts to extract structured tables from a digital page using pdfplumber.
    """
    results = []
    try:
        tables = page.extract_tables()
    except Exception:
        tables = []

    for table in tables:
        if not table or len(table) < 2:
            continue

        header = None
        data_rows = []

        for row in table:
            cleaned = [str(c).strip() if c else "" for c in row]
            if not any(cleaned):
                continue

            # Skip metadata rows before the table header
            if header is None:
                joined = " ".join(cleaned).lower()
                # Must contain at least two table header markers
                matches = sum(1 for kw in HEADER_KEYWORDS if kw in joined)
                if matches >= 2:
                    header = cleaned
                continue

            # Skip repeated headers
            if _is_repeated_header(" ".join(cleaned)):
                continue

            # Skip metadata lines inside table
            if _is_metadata_line(" ".join(cleaned)):
                continue

            data_rows.append(cleaned)

        if not header or not data_rows:
            continue

        # Clean header keys
        header_keys = [re.sub(r"\s+", " ", h) if h else f"Column_{i+1}" for i, h in enumerate(header)]

        for row in data_rows:
            if len(row) < len(header_keys):
                row = row + [""] * (len(header_keys) - len(row))
            row_dict = {header_keys[i]: row[i] for i in range(len(header_keys))}
            results.append(row_dict)

    return results


# ── Heuristic Line Parser (for both Digital Text & OCR Text) ─────────────────

def parse_transaction_lines(text: str, is_ocr: bool = False) -> List[Dict[str, str]]:
    """
    Scans raw text line-by-line to extract transactions:
    Date, Description, Debit, Credit, Balance.
    Filters out account metadata and repeated headers.
    """
    lines = text.split("\n")
    rows = []

    for line in lines:
        line = line.strip()
        if len(line) < 10:
            continue

        if is_ocr:
            # Normalize OCR artifacts where whitespace was lost between columns
            line = re.sub(r"(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})([A-Za-z])", r"\1 \2", line)
            line = re.sub(r"([A-Za-z\)\/])(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2}))", r"\1 \2", line)
            line = re.sub(r"(\.\d{2})(\d+)", r"\1 \2", line)

        # Skip account metadata lines
        if _is_metadata_line(line):
            continue

        # Skip repeated headers
        if _is_repeated_header(line):
            continue

        # Date matching
        date_match = DATE_PATTERN.search(line)
        if not date_match:
            continue

        date_str = date_match.group(0)
        if is_ocr:
            date_str = sanitize_ocr_date_string(date_str)

        # Amount matching
        date_end = date_match.end()
        remainder = line[date_end:].strip()

        # Handle secondary date like Value Date (common in SBI, HDFC, ICICI)
        sec_date_match = DATE_PATTERN.match(remainder)
        if sec_date_match:
            remainder = remainder[sec_date_match.end():].strip()

        # Find all amounts in remainder
        amounts_raw = AMOUNT_PATTERN.findall(remainder)
        if not amounts_raw:
            continue

        # Sanitize OCR amounts if needed
        if is_ocr:
            amounts = [sanitize_ocr_amount_string(a) for a in amounts_raw]
        else:
            amounts = [a.replace(",", "").strip() for a in amounts_raw]

        # Extract description: text between date and first amount
        first_amt_match = AMOUNT_PATTERN.search(remainder)
        if first_amt_match:
            desc_part = remainder[:first_amt_match.start()].strip()
            description = re.sub(r"\s+", " ", desc_part)
        else:
            description = remainder

        # Filter empty or noisy descriptions
        if not description or len(description) < 2:
            continue

        debit = ""
        credit = ""
        balance = ""

        # Check for explicit Dr / Cr indicators in remainder
        is_dr_explicit = bool(re.search(r"\b(dr|debit)\b", remainder, re.IGNORECASE))
        is_cr_explicit = bool(re.search(r"\b(cr|credit)\b", remainder, re.IGNORECASE))

        if len(amounts) >= 3:
            debit   = amounts[-3]
            credit  = amounts[-2]
            balance = amounts[-1]
        elif len(amounts) == 2:
            if is_cr_explicit:
                credit  = amounts[0]
                balance = amounts[1]
            else:
                debit   = amounts[0]
                balance = amounts[1]
        elif len(amounts) == 1:
            if is_cr_explicit:
                credit = amounts[0]
            else:
                debit = amounts[0]

        rows.append({
            "Date":        date_str,
            "Description": description,
            "Debit":       debit,
            "Credit":      credit,
            "Balance":     balance,
        })

    return rows


# ── Main PDF Parser Class ───────────────────────────────────────────────────

class GenericBankStatementParser:
    """
    Universal bank statement parser supporting digital, scanned, password-protected,
    and multi-page mixed statements.
    """

    def parse(self, file_bytes: bytes, password: Optional[str] = None) -> Dict[str, Any]:
        # 1. Decrypt in memory if encrypted
        working_bytes, was_encrypted = decrypt_pdf_in_memory(file_bytes, password)

        # 2. Inspect document structure with pdfplumber
        try:
            pdf = pdfplumber.open(io.BytesIO(working_bytes))
        except Exception as e:
            # If pdfplumber failed because it still needed password, try passing it
            if password:
                pdf = pdfplumber.open(io.BytesIO(working_bytes), password=password)
            else:
                raise

        total_pages = len(pdf.pages)
        if total_pages == 0:
            pdf.close()
            raise ValueError("The uploaded PDF has no pages.")

        # 3. Analyze each page: digital vs scanned
        page_scanned_flags = []
        page_texts = []

        for p in pdf.pages:
            is_scanned, text = _is_page_scanned(p)
            page_scanned_flags.append(is_scanned)
            page_texts.append(text)

        any_scanned = any(page_scanned_flags)
        all_scanned = all(page_scanned_flags)
        ocr_used = False
        ocr_confidence_warning = False
        all_extracted_rows = []
        method = "table"

        # 4. FIRST: If NOT all scanned, attempt native extraction on digital pages
        if not all_scanned:
            for idx, p in enumerate(pdf.pages):
                if not page_scanned_flags[idx]:
                    # Try table extraction first
                    t_rows = _extract_tables_from_digital_page(p)
                    if t_rows:
                        all_extracted_rows.extend(t_rows)
                    else:
                        # Fallback to line parsing for this page
                        l_rows = parse_transaction_lines(page_texts[idx], is_ocr=False)
                        all_extracted_rows.extend(l_rows)
                        method = "text"

        # 5. SECOND: If any pages are scanned OR if digital extraction yielded zero rows,
        # activate OCR automatically for scanned pages
        if any_scanned or (len(all_extracted_rows) == 0):
            ocr_service = get_ocr_service()
            if not ocr_service.is_available():
                pdf.close()
                raise RuntimeError(
                    "Automatic OCR is currently unavailable. Please try again or upload a text-based PDF."
                )

            # Load document into pypdfium2 for high-resolution in-memory rasterization
            pypdfium_doc = pypdfium2.PdfDocument(working_bytes)
            ocr_used = True
            method = "hybrid" if (all_extracted_rows and any_scanned) else "ocr"

            for page_idx in range(total_pages):
                # If page was digital and already extracted rows, don't re-OCR it
                if not page_scanned_flags[page_idx] and len(all_extracted_rows) > 0:
                    continue

                # Render page to high-DPI image in memory
                pypdfium_page = pypdfium_doc[page_idx]
                pil_image = pypdfium_page.render(scale=2.2).to_pil()

                # Preprocess for contrast and table clarity
                preprocessed = preprocess_image_for_ocr(pil_image)

                # Run OCR
                ocr_text, avg_conf = ocr_service.extract_text(preprocessed)
                if avg_conf > 0 and avg_conf < 0.65:
                    ocr_confidence_warning = True

                # Parse transactions from OCR text
                page_ocr_rows = parse_transaction_lines(ocr_text, is_ocr=True)
                all_extracted_rows.extend(page_ocr_rows)

                # Clean up memory
                del pil_image
                del preprocessed

            pypdfium_doc.close()

        pdf.close()

        if not all_extracted_rows:
            raise ValueError(
                "Could not extract transactions from this PDF. "
                "The statement format may not contain recognizable transaction tables. "
                "Please verify the document or export as CSV from your bank's website."
            )

        # Detect columns
        sample_row = all_extracted_rows[0]
        columns = list(sample_row.keys())

        return {
            "columns": columns,
            "rows": all_extracted_rows,
            "total_rows": len(all_extracted_rows),
            "method": method,
            "is_scanned": any_scanned,
            "ocr_used": ocr_used,
            "was_encrypted": was_encrypted,
            "ocr_confidence_warning": ocr_confidence_warning,
            "ocr_warning_message": (
                "Some information in this scanned statement could not be read confidently. "
                "Please review the highlighted transactions before importing."
                if ocr_confidence_warning else None
            ),
        }


# ── Entry Point ─────────────────────────────────────────────────────────────

def parse_pdf(file_bytes: bytes, password: Optional[str] = None) -> Dict[str, Any]:
    """
    Main entry point for parsing any PDF bank statement.
    Handles encryption, passwords, OCR, and table extraction.
    """
    parser = GenericBankStatementParser()
    return parser.parse(file_bytes, password=password)
