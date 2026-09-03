"""
run_server.py — Standalone Server Entry Point for PyInstaller
"""

import sys
import os
import multiprocessing
import uvicorn

# Ensure the backend directory is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.main import app

def start():
    multiprocessing.freeze_support()
    print("Starting Lipi AI Backend Server on 127.0.0.1:8000...")
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
        access_log=False,
    )

if __name__ == "__main__":
    start()
