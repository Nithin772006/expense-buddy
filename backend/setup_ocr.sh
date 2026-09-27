#!/usr/bin/env bash
set -e

echo "========================================================"
echo " Expense Buddy - Automated OCR & Importer Setup (Unix)  "
echo "========================================================"
echo ""

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing project requirements..."
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "Verifying OCR runtime availability..."
python3 -c "from services.ocr_service import get_ocr_service; svc = get_ocr_service(); print('Active OCR Engine:', svc.engine_name); exit(0 if svc.is_available() else 1)"

if [ $? -eq 0 ]; then
    echo "[SUCCESS] OCR is installed, configured, and ready to process bank statements!"
else
    echo "[WARNING] Fallback OCR mode active."
fi

echo ""
echo "Setup completed. Start backend with: uvicorn main:app --reload --port 8000"
