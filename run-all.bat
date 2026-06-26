@echo off
setlocal

echo ==================================================
echo  QueueStorm Investigator - Full Stack Runner
echo ==================================================

echo.
echo Starting backend and frontend servers in new windows...
echo Each script will handle its own dependencies.

echo.
start "QueueStorm Backend" cmd /k run.bat
start "QueueStorm Frontend" cmd /k run-frontend.bat

echo Servers are starting. Please check the new command prompt windows.

endlocal