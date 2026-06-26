@echo off
setlocal

REM Change to the script's directory to ensure relative paths work correctly
cd /d "%~dp0"

echo ==================================================
echo  QueueStorm Investigator API - Local Runner
echo ==================================================

REM Create virtual environment if it doesn't exist
if not exist .venv (
    echo.
    echo Creating Python virtual environment in .venv...
    python -m venv .venv
)

echo.
echo Activating virtual environment and installing dependencies...
call .\.venv\Scripts\activate.bat
pip install --quiet -r requirements.txt

echo.
echo Starting FastAPI server on http://localhost:8000
echo (Press Ctrl+C to stop)
echo.

set USE_LLM=false

if not defined PORT (
    set PORT=8000
)
uvicorn app.main:app --host 0.0.0.0 --port %PORT%

endlocal