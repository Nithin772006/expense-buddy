"""
upi_service.py — UPI Payment Intent Generator & Payee VPA Validator.

Complies strictly with the NPCI UPI Linking Specification:
Structure:
    upi://pay?pa={PAYEE_UPI_ID}&pn={PAYEE_NAME}&am={AMOUNT}&cu=INR[&tn={NOTE}]

Features:
- Validates Payee Virtual Payment Address (VPA) format.
- Validates non-negative numerical amounts.
- Enforces INR currency.
- Safely URL-encodes all parameter values.
- Extracts candidate VPAs from transaction descriptions when available.
"""

import re
import urllib.parse
from typing import Optional


# VPA format: username@bankhandle (e.g. merchant@okhdfcbank, biller@upi, electricity@sbi)
# Username: 2 to 256 alphanumeric characters, dots, hyphens, underscores
# Handle: 2 to 64 alphanumeric characters
UPI_VPA_REGEX = re.compile(r"^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9]{2,64}$")

# Regex to detect potential VPAs embedded in transaction descriptions
VPA_IN_TEXT_REGEX = re.compile(r"\b([a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,32})\b", re.IGNORECASE)


def validate_upi_id(upi_id: Optional[str]) -> bool:
    """Validate that the provided string is a valid UPI Virtual Payment Address (VPA)."""
    if not upi_id or not isinstance(upi_id, str):
        return False
    trimmed = upi_id.strip()
    return bool(UPI_VPA_REGEX.match(trimmed))


def format_upi_amount(amount: float) -> str:
    """
    Format monetary amount for UPI intent.
    Amount must be strictly positive.
    Returns 2-decimal string format (e.g. 119.18 or 1850.00).
    """
    try:
        clean_str = str(amount).replace("₹", "").replace(",", "").strip()
        val = float(clean_str)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid monetary amount: {amount}")

    if val <= 0:
        raise ValueError(f"UPI payment amount must be greater than 0: {val}")

    # Standard 2 decimal places as per NPCI spec
    return f"{val:.2f}"


def build_upi_payment_uri(
    payee_upi_id: str,
    payee_name: str,
    amount: float,
    currency: str = "INR",
    transaction_note: Optional[str] = None,
) -> str:
    """
    Generate a valid, fully URL-encoded UPI payment URI.
    
    Format:
        upi://pay?pa={PAYEE_UPI_ID}&pn={PAYEE_NAME}&am={AMOUNT}&cu=INR

    Raises ValueError if validation fails.
    """
    if not validate_upi_id(payee_upi_id):
        raise ValueError(f"Invalid Payee UPI ID: {repr(payee_upi_id)}")

    clean_currency = str(currency or "INR").strip().upper()
    if clean_currency != "INR":
        raise ValueError(f"Only INR currency is supported for domestic UPI payments: {clean_currency}")

    clean_amount = format_upi_amount(amount)
    clean_name = str(payee_name or "Payee").strip()
    if not clean_name:
        clean_name = "Payee"

    params = {
        "pa": payee_upi_id.strip(),
        "pn": clean_name,
        "am": clean_amount,
        "cu": "INR",
    }

    if transaction_note:
        clean_note = str(transaction_note).strip()[:100]  # NPCI limit ~100 chars
        if clean_note:
            params["tn"] = clean_note

    # URL-encode query string
    encoded_query = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    return f"upi://pay?{encoded_query}"


def extract_vpa_from_text(text: Optional[str]) -> Optional[str]:
    """Extract a candidate VPA from a transaction narration or description if present."""
    if not text:
        return None
    match = VPA_IN_TEXT_REGEX.search(str(text))
    if match:
        candidate = match.group(1).strip().lower()
        if validate_upi_id(candidate):
            return candidate
    return None


def get_suggested_biller_details(merchant_name: Optional[str]) -> Optional[dict]:
    """Provides suggested VPAs for well-known recurring Indian merchants."""
    if not merchant_name:
        return None
    name = str(merchant_name).lower()
    if "bescom" in name:
        return {"vpa": "bescom@upi", "payee_name": "BESCOM Bangalore Electricity"}
    if "tneb" in name:
        return {"vpa": "tneb@upi", "payee_name": "TNEB Tamil Nadu Electricity"}
    if "electricity" in name or "power" in name:
        return {"vpa": "electricity@upi", "payee_name": merchant_name}
    if "airtel" in name:
        return {"vpa": "airtel.pay@icici", "payee_name": "Airtel Telecommunications"}
    if "jio" in name:
        return {"vpa": "jio.recharge@hdfcbank", "payee_name": "Reliance Jio Infocomm"}
    if "act" in name or "fibernet" in name or "broadband" in name:
        return {"vpa": "actfibernet@citi", "payee_name": "ACT Fibernet Broadband"}
    if "netflix" in name:
        return {"vpa": "netflix@upi", "payee_name": "Netflix India"}
    if "spotify" in name:
        return {"vpa": "spotify.pay@hdfcbank", "payee_name": "Spotify India"}
    if "prime" in name or "amazon" in name:
        return {"vpa": "amazonprime@apl", "payee_name": "Amazon Prime India"}
    if "water" in name:
        return {"vpa": "waterboard@upi", "payee_name": merchant_name}
    if "gas" in name or "lpg" in name or "indane" in name:
        return {"vpa": "lpgpay@upi", "payee_name": merchant_name}
    return None

