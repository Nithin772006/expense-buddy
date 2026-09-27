@echo off
echo ========================================================
echo  Expense Buddy - Automated OCR & Importer Setup
echo ========================================================
echo.

if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Installing project requirements including RapidOCR and PDF tools...
pip install -r requirements.txt

echo.
echo Verifying OCR runtime availability...
python -c "from services.ocr_service import get_ocr_service; svc = get_ocr_service(); print('Active OCR Engine:', svc.engine_name); exit(0 if svc.is_available() else 1)"

if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] OCR is installed, configured, and ready to process bank statements!
) else (
    echo [WARNING] Fallback OCR mode active. Install tesseract or run pip install rapidocr-onnxruntime.
)

echo.
echo Setup completed. Start backend with: uvicorn main:app --reload --port 8000
