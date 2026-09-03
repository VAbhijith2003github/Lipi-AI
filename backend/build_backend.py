"""
build_backend.py — Compiles the FastAPI backend into a standalone executable directory using PyInstaller.
"""

import os
import sys
import subprocess

def build():
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    entry_point = os.path.join(backend_dir, "run_server.py")
    dist_dir = os.path.join(backend_dir, "dist")
    build_dir = os.path.join(backend_dir, "build")

    hidden_imports = [
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespans",
        "uvicorn.lifespans.on",
        "fastapi",
        "chromadb",
        "chromadb.telemetry.posthog",
        "chromadb.api.segment",
        "chromadb.db.impl.sqlite",
        "chromadb.migrations",
        "langchain",
        "langchain_community",
        "langchain_ollama",
        "langchain_google_genai",
        "pypdf",
        "fitz",
        "pymupdf",
        "tiktoken_ext.openai_public",
        "tiktoken_ext",
    ]

    excludes = [
        "torch",
        "torchvision",
        "torchaudio",
        "scipy",
        "matplotlib",
        "pandas",
        "sympy",
        "triton",
        "transformers",
        "accelerate",
        "datasets",
        "PIL",
        "cv2",
    ]

    collect_all_packages = [
        "chromadb",
        "tiktoken",
        "langchain_community",
        "langchain_ollama",
    ]

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--onedir",
        "--name", "lipi-backend",
        f"--distpath={dist_dir}",
        f"--workpath={build_dir}",
    ]

    for pkg in collect_all_packages:
        cmd.extend(["--collect-all", pkg])

    for imp in hidden_imports:
        cmd.extend(["--hidden-import", imp])

    for exc in excludes:
        cmd.extend(["--exclude-module", exc])

    cmd.append(entry_point)

    print(f"Executing PyInstaller build: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=backend_dir)
    if result.returncode == 0:
        print(f"\n[SUCCESS] Backend packaged successfully at: {os.path.join(dist_dir, 'lipi-backend')}")
    else:
        print("\n[ERROR] PyInstaller packaging failed.")
        sys.exit(result.returncode)

if __name__ == "__main__":
    build()
