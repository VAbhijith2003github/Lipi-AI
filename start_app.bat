@echo off
title WikiBuddy Launcher

echo ===================================================
echo               WIKIBUDDY LAUNCHER
echo ===================================================

:: Start the FastAPI backend in a new command prompt window
echo Starting FastAPI Backend...
start cmd /k "cd /d "%~dp0backend" && venv\Scripts\python -m uvicorn app.main:app --reload"

:: Start the Electron frontend in a new command prompt window
echo Starting Electron Frontend...
start cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Both services have been launched in separate windows!
echo You can close this launcher window now.
echo.
timeout /t 5
