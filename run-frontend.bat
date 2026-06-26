@echo off
setlocal

REM Change to the script's directory to ensure relative paths work correctly
cd /d "%~dp0"

echo ==================================================
echo  QueueStorm Investigator UI - Local Runner
echo ==================================================

REM Navigate to the Frontend directory
cd Frontend

echo.
echo Installing frontend dependencies (if needed)...
call npm install

echo.
echo Starting frontend development server...
echo (Press Ctrl+C to stop)
echo.

call npm run dev

endlocal