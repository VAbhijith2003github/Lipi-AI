@echo off
setlocal enabledelayedexpansion

echo ===================================================================
echo               LIPI AI - PACKAGING AND DISTRIBUTION BUILDER
echo ===================================================================
echo.

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%frontend"

:: 1. Build Backend Executable
echo [1/3] Packaging Python FastAPI Backend with PyInstaller...
cd /d "%BACKEND_DIR%"

if not exist "venv\Scripts\python.exe" (
    echo [ERROR] Python virtual environment not found in backend\venv.
    echo Please create one and install requirements first:
    echo   cd backend ^&^& python -m venv venv ^&^& venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

echo Installing pyinstaller if needed...
call "venv\Scripts\python.exe" -m pip install pyinstaller --quiet

echo Running backend build script...
call "venv\Scripts\python.exe" build_backend.py
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Backend build failed!
    pause
    exit /b %ERRORLEVEL%
)

if not exist "%BACKEND_DIR%\dist\lipi-backend\lipi-backend.exe" (
    echo [ERROR] lipi-backend.exe was not created in dist/lipi-backend!
    pause
    exit /b 1
)

echo [SUCCESS] Backend binary verified at:
echo   %BACKEND_DIR%\dist\lipi-backend\lipi-backend.exe
echo.

:: 2. Build Frontend & Electron Package
echo [2/3] Building React ^& Electron Standalone Application...
cd /d "%FRONTEND_DIR%"

echo Installing frontend dependencies if needed...
call npm install --silent

echo Building production React app and Electron package...
call npm run package:electron
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Electron packaging failed!
    pause
    exit /b %ERRORLEVEL%
)

:: 3. Build Windows Installer (Setup.exe) using Inno Setup
echo.
echo [3/3] Compiling Windows Installer (Lipi-AI-Setup.exe)...
set "ISCC_EXE="

where iscc >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "ISCC_EXE=iscc"
) else (
    if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
        set "ISCC_EXE=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    ) else if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
        set "ISCC_EXE=C:\Program Files\Inno Setup 6\ISCC.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" (
        set "ISCC_EXE=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
    )
)

if not "!ISCC_EXE!"=="" (
    echo Found Inno Setup Compiler at: !ISCC_EXE!
    "!ISCC_EXE!" "%ROOT_DIR%installer\installer.iss"
    if !ERRORLEVEL! EQU 0 (
        echo.
        echo ===================================================================
        echo [SUCCESS] Windows Installer created successfully!
        echo Installer File: %ROOT_DIR%dist_installer\Lipi-AI-Setup-1.0.1.exe
        echo ===================================================================
    ) else (
        echo [WARNING] Inno Setup compilation had issues.
    )
) else (
    echo [INFO] Inno Setup is not installed on this machine.
    echo To generate the Setup.exe wizard automatically:
    echo   1. Run: winget install JRSoftware.InnoSetup
    echo   2. Or right-click "installer\installer.iss" and select "Compile" in Inno Setup.
)

echo.
echo ===================================================================
echo BUILD PROCESS COMPLETE!
echo ===================================================================
echo.
echo Your distributable files:
echo   - Standalone Installer (.exe): %ROOT_DIR%dist_installer\Lipi-AI-Setup-1.0.1.exe (if Inno Setup installed)
echo   - Portable App Folder:        %FRONTEND_DIR%\dist-electron\win-unpacked\
echo.
echo Features in the Installer:
echo   1. Prompts for custom installation location
echo   2. Checks if Ollama is installed (downloads & installs if missing)
echo   3. Checks if required models (gemma2:2b, nomic-embed-text) exist and downloads them
echo   4. Creates Desktop and Start Menu shortcuts
echo ===================================================================
echo.
pause
