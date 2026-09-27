"""
OCR Service Abstraction for Expense Buddy.

Provides a unified interface for text extraction from scanned bank statements and images.
Supports:
1. RapidOCR (RapidOCREngine) — bundled local ONNX-based engine, zero system binary install needed.
2. Tesseract (TesseractOCREngine) — via pytesseract with cross-platform auto-discovery and TESSERACT_CMD.
3. FallbackOCRService — graceful fallback when no engine is available.

Future cloud OCR providers (AWS Textract, Google Cloud Vision, Azure Document Intelligence)
can implement BaseOCRService without modifying the rest of the application.
"""

import os
import re
import sys
import shutil
import logging
from abc import ABC, abstractmethod
from typing import Optional, Union, List, Tuple
from PIL import Image, ImageEnhance, ImageFilter
import numpy as np

logger = logging.getLogger("expense_buddy.ocr")

# ── Amount and Date Cleaners for OCR Confusions ──────────────────────────────
# Common OCR digit confusion: 'O' or 'o' -> '0', 'l' or 'I' -> '1', 'B' -> '8', 'S' -> '5'
_OCR_AMOUNT_CLEAN_RE = re.compile(r"[₹$€£,\s]")


def sanitize_ocr_amount_string(raw: str) -> str:
    """
    Correct common OCR character misreadings in financial numbers.
    e.g. '1,85O.00' -> '1850.00', '125o.50' -> '1250.50'
    """
    if not raw:
        return ""
    s = raw.strip()
    # Strip currency symbols and commas
    s = _OCR_AMOUNT_CLEAN_RE.sub("", s)

    # If it looks like a number with O/o inside or before a dot or at end
    s = re.sub(r"(?<=\d)[Oo](?=\.|\d)|(?<=\d)[Oo]$|^[Oo](?=\d|\.)", "0", s)

    # If lowercase 'l' or uppercase 'I' appears inside numbers before a dot or digit
    s = re.sub(r"(?<=\d)[lI](?=\d|\.)|^[lI](?=\d)", "1", s)

    return s


def sanitize_ocr_date_string(raw: str) -> str:
    """
    Normalizes spaced-out dates from OCR like '12 / 03 / 2026' -> '12/03/2026'
    or '12 - 03 - 2026' -> '12-03-2026'.
    """
    if not raw:
        return ""
    s = re.sub(r"\s*([\/\-\.])\s*", r"\1", raw.strip())
    return s


# ── Image Preprocessing for Bank Statement Scans ─────────────────────────────

def preprocess_image_for_ocr(image: Union[Image.Image, np.ndarray]) -> np.ndarray:
    """
    Enhances contrast and sharpness of scanned bank statements before OCR.
    Handles resolution normalization, grayscale conversion, and contrast stretching.
    """
    if isinstance(image, np.ndarray):
        pil_img = Image.fromarray(image)
    else:
        pil_img = image.copy()

    # Convert to grayscale
    if pil_img.mode != "L":
        pil_img = pil_img.convert("L")

    # Ensure sufficient resolution (min width 1600px for full-page A4)
    w, h = pil_img.size
    if w < 1600:
        scale = 1600.0 / w
        new_w = 1600
        new_h = int(h * scale)
        pil_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # Contrast enhancement for sharp table lines and clear font glyphs
    enhancer = ImageEnhance.Contrast(pil_img)
    pil_img = enhancer.enhance(1.6)

    # Slight sharpness enhancement
    sharpness = ImageEnhance.Sharpness(pil_img)
    pil_img = sharpness.enhance(1.4)

    return np.array(pil_img)


# ── Base Abstract OCR Service ───────────────────────────────────────────────

class BaseOCRService(ABC):
    """Abstract Base Class for OCR engines."""

    @abstractmethod
    def is_available(self) -> bool:
        """Return True if this OCR engine is installed and ready to process."""
        pass

    @abstractmethod
    def extract_text(self, image: Union[Image.Image, np.ndarray]) -> Tuple[str, float]:
        """
        Extract full text from an image.
        Returns:
            (full_text, average_confidence)
            where average_confidence is between 0.0 and 1.0.
        """
        pass

    @abstractmethod
    def extract_lines(self, image: Union[Image.Image, np.ndarray]) -> List[dict]:
        """
        Extract structured lines with coordinates and confidence.
        Returns list of dicts: [{"text": str, "confidence": float, "bbox": list}]
        """
        pass

    @property
    @abstractmethod
    def engine_name(self) -> str:
        """Name of the OCR provider."""
        pass


# ── RapidOCR Implementation (Bundled Local Python Engine) ────────────────────

class RapidOCREngine(BaseOCRService):
    """
    RapidOCR engine powered by ONNXRuntime.
    Self-contained, cross-platform (Windows, Linux, macOS), zero external binary setup.
    """

    def __init__(self):
        self._engine = None
        self._init_attempted = False

    def _ensure_initialized(self) -> bool:
        if self._init_attempted:
            return self._engine is not None

        self._init_attempted = True
        try:
            from rapidocr_onnxruntime import RapidOCR
            self._engine = RapidOCR()
            logger.info("RapidOCR initialized successfully.")
            return True
        except Exception as e:
            logger.warning("Failed to initialize RapidOCR: %s", e)
            self._engine = None
            return False

    def is_available(self) -> bool:
        return self._ensure_initialized()

    @property
    def engine_name(self) -> str:
        return "RapidOCR (Local ONNX)"

    def extract_lines(self, image: Union[Image.Image, np.ndarray]) -> List[dict]:
        if not self._ensure_initialized():
            return []

        if isinstance(image, Image.Image):
            np_img = np.array(image.convert("RGB"))
        else:
            np_img = image

        try:
            # RapidOCR accepts numpy ndarray (H, W, 3) or (H, W)
            result, _ = self._engine(np_img)
            if not result:
                return []

            lines = []
            for item in result:
                # item format: [box, text, score]
                bbox = item[0]
                text = item[1].strip()
                score = float(item[2]) if len(item) > 2 else 0.85
                if text:
                    lines.append({
                        "text": text,
                        "confidence": score,
                        "bbox": bbox,
                    })
            return lines
        except Exception as e:
            logger.error("RapidOCR extraction error: %s", e)
            return []

    def extract_text(self, image: Union[Image.Image, np.ndarray]) -> Tuple[str, float]:
        lines = self.extract_lines(image)
        if not lines:
            return "", 0.0

        full_text = "\n".join(item["text"] for item in lines)
        avg_conf = sum(item["confidence"] for item in lines) / len(lines)
        return full_text, avg_conf


# ── Tesseract Implementation (Cross-Platform with Discovery) ────────────────

class TesseractOCREngine(BaseOCRService):
    """
    Tesseract OCR engine via pytesseract.
    Discovers tesseract.exe or tesseract binary via:
    1. TESSERACT_CMD environment variable
    2. PATH environment
    3. Common platform default directories
    """

    def __init__(self):
        self._cmd_path = None
        self._available = False
        self._discover_binary()

    def _discover_binary(self):
        # 1. Check explicit environment variable
        env_cmd = os.environ.get("TESSERACT_CMD")
        if env_cmd and os.path.isfile(env_cmd) and os.access(env_cmd, os.X_OK):
            self._cmd_path = env_cmd
            self._available = True
            return

        # 2. Check system PATH
        path_binary = shutil.which("tesseract")
        if path_binary:
            self._cmd_path = path_binary
            self._available = True
            return

        # 3. Check common platform locations
        candidates = []
        if sys.platform.startswith("win"):
            local_appdata = os.environ.get("LOCALAPPDATA", "")
            program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
            program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
            candidates.extend([
                os.path.join(program_files, "Tesseract-OCR", "tesseract.exe"),
                os.path.join(program_files_x86, "Tesseract-OCR", "tesseract.exe"),
                os.path.join(local_appdata, "Programs", "Tesseract-OCR", "tesseract.exe"),
                r"C:\Tesseract-OCR\tesseract.exe",
            ])
        elif sys.platform.startswith("darwin"):
            candidates.extend([
                "/opt/homebrew/bin/tesseract",
                "/usr/local/bin/tesseract",
                "/usr/bin/tesseract",
            ])
        else:  # Linux / Unix
            candidates.extend([
                "/usr/bin/tesseract",
                "/usr/local/bin/tesseract",
                "/usr/bin/tesseract-ocr",
            ])

        for path in candidates:
            if path and os.path.isfile(path):
                self._cmd_path = path
                self._available = True
                break

    def is_available(self) -> bool:
        if not self._available or not self._cmd_path:
            return False
        try:
            import pytesseract
            pytesseract.pytesseract.tesseract_cmd = self._cmd_path
            return True
        except ImportError:
            return False

    @property
    def engine_name(self) -> str:
        return f"Tesseract OCR ({self._cmd_path})"

    def extract_lines(self, image: Union[Image.Image, np.ndarray]) -> List[dict]:
        if not self.is_available():
            return []

        import pytesseract

        if isinstance(image, np.ndarray):
            pil_img = Image.fromarray(image)
        else:
            pil_img = image

        try:
            # PSM 6 is uniform block of text / tables
            data = pytesseract.image_to_data(
                pil_img,
                output_type=pytesseract.Output.DICT,
                config="--psm 6",
            )
            n_boxes = len(data["text"])
            lines_map = {}
            for i in range(n_boxes):
                text = data["text"][i].strip()
                conf = float(data["conf"][i]) if data["conf"][i] != "-1" else 0.0
                line_num = data["line_num"][i]
                block_num = data["block_num"][i]
                key = (block_num, line_num)

                if text:
                    if key not in lines_map:
                        lines_map[key] = {"words": [], "confidences": []}
                    lines_map[key]["words"].append(text)
                    lines_map[key]["confidences"].append(conf / 100.0)

            results = []
            for key in sorted(lines_map.keys()):
                words = lines_map[key]["words"]
                confs = lines_map[key]["confidences"]
                line_text = " ".join(words).strip()
                avg_c = sum(confs) / len(confs) if confs else 0.7
                if line_text:
                    results.append({
                        "text": line_text,
                        "confidence": avg_c,
                        "bbox": [],
                    })
            return results
        except Exception as e:
            logger.error("Tesseract extraction error: %s", e)
            return []

    def extract_text(self, image: Union[Image.Image, np.ndarray]) -> Tuple[str, float]:
        lines = self.extract_lines(image)
        if not lines:
            return "", 0.0
        full_text = "\n".join(l["text"] for l in lines)
        avg_conf = sum(l["confidence"] for l in lines) / len(lines)
        return full_text, avg_conf


# ── Fallback Graceful Service ───────────────────────────────────────────────

class FallbackOCRService(BaseOCRService):
    """Graceful fallback when no OCR backend is operational."""

    def is_available(self) -> bool:
        return False

    @property
    def engine_name(self) -> str:
        return "None (OCR Unavailable)"

    def extract_lines(self, image: Union[Image.Image, np.ndarray]) -> List[dict]:
        return []

    def extract_text(self, image: Union[Image.Image, np.ndarray]) -> Tuple[str, float]:
        raise RuntimeError(
            "Automatic OCR is currently unavailable. Please try again or upload a text-based PDF."
        )


# ── Factory Singleton ────────────────────────────────────────────────────────

_ACTIVE_OCR_SERVICE: Optional[BaseOCRService] = None


def get_ocr_service() -> BaseOCRService:
    """
    Returns the preferred active OCR service.
    Priority:
    1. RapidOCR (bundled local engine, works out-of-the-box in python)
    2. TesseractOCR (if configured or discovered)
    3. FallbackOCRService
    """
    global _ACTIVE_OCR_SERVICE
    if _ACTIVE_OCR_SERVICE is not None:
        return _ACTIVE_OCR_SERVICE

    # Try RapidOCR first
    rapid = RapidOCREngine()
    if rapid.is_available():
        logger.info("Using OCR engine: %s", rapid.engine_name)
        _ACTIVE_OCR_SERVICE = rapid
        return _ACTIVE_OCR_SERVICE

    # Try Tesseract
    tess = TesseractOCREngine()
    if tess.is_available():
        logger.info("Using OCR engine: %s", tess.engine_name)
        _ACTIVE_OCR_SERVICE = tess
        return _ACTIVE_OCR_SERVICE

    logger.warning("No OCR engine available. Scanned PDFs will fail gracefully.")
    _ACTIVE_OCR_SERVICE = FallbackOCRService()
    return _ACTIVE_OCR_SERVICE
