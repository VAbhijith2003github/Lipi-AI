@echo off
setlocal enabledelayedexpansion
title Lipi AI - Ollama & Model Setup

echo ===================================================================
echo               LIPI AI - OLLAMA & MODEL CONFIGURATION
echo ===================================================================
echo.

:: 1. Check if Ollama is installed
echo [1/3] Checking Ollama installation...
set "OLLAMA_EXE="

where ollama >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "OLLAMA_EXE=ollama"
) else (
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
        set "PATH=%LOCALAPPDATA%\Programs\Ollama;!PATH!"
    )
)

if "!OLLAMA_EXE!"=="" (
    echo [!] Ollama was not found on your system.
    echo Downloading Ollama installer from https://ollama.com ...
    set "INSTALLER_PATH=%TEMP%\OllamaSetup.exe"
    
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://ollama.com/download/OllamaSetup.exe', '%TEMP%\OllamaSetup.exe')"
    
    if exist "%TEMP%\OllamaSetup.exe" (
        echo Running Ollama Setup... Please complete the Ollama installation window.
        start /wait "" "%TEMP%\OllamaSetup.exe"
        
        if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
            set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
            set "PATH=%LOCALAPPDATA%\Programs\Ollama;!PATH!"
            echo [OK] Ollama installed successfully!
        ) else (
            echo [WARNING] Ollama setup could not be verified automatically.
        )
    ) else (
        echo [ERROR] Failed to download Ollama. Please install it manually from https://ollama.com
    )
) else (
    echo [OK] Ollama is installed!
)

echo.
:: 2. Ensure Ollama service is running
echo [2/3] Checking if Ollama service is active...
powershell -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:11434' -UseBasicParsing -TimeoutSec 2).StatusCode } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Starting Ollama background service...
    start "" "!OLLAMA_EXE!" serve
    :: Wait up to 10 seconds for Ollama server to wake up
    for /L %%i in (1,1,10) do (
        ping -n 2 127.0.0.1 >nul
        powershell -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:11434' -UseBasicParsing -TimeoutSec 2).StatusCode } catch { exit 1 }" >nul 2>&1
        if !ERRORLEVEL! EQU 0 goto :service_ready
    )
)

:service_ready
echo [OK] Ollama service is online!
echo.

:: 3. Check and pull required models
echo [3/3] Checking required local AI models...

:: Check Chat Model: gemma2:2b
echo Checking 'gemma2:2b'...
ollama list 2>nul | findstr /i "gemma2:2b" >nul
if %ERRORLEVEL% NEQ 0 (
    echo [Downloading] Pulling chat model 'gemma2:2b' (this may take a few minutes)...
    ollama pull gemma2:2b
) else (
    echo [OK] Model 'gemma2:2b' is already installed!
)

:: Check Embed Model: nomic-embed-text
echo Checking 'nomic-embed-text'...
ollama list 2>nul | findstr /i "nomic-embed-text" >nul
if %ERRORLEVEL% NEQ 0 (
    echo [Downloading] Pulling embedding model 'nomic-embed-text'...
    ollama pull nomic-embed-text
) else (
    echo [OK] Model 'nomic-embed-text' is already installed!
)

echo.
echo ===================================================================
echo [SUCCESS] Ollama and all required AI models are ready!
echo ===================================================================
echo.
ping -n 3 127.0.0.1 >nul
exit /b 0
