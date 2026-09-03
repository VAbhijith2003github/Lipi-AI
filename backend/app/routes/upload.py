"""
upload.py — File Upload Endpoint

PURPOSE:
This route handles the POST /upload endpoint. When the user selects a PDF
or text file in the Electron app, the frontend sends it here.

FLOW:
  1. Receive the file from the frontend.
  2. Validate file type and size.
  3. Save it temporarily to the 'uploads/' directory.
  4. Pass it to the RAG ingestion pipeline (ingest.py) which:
     - Reads the file
     - Splits it into chunks
     - Embeds the chunks using Ollama
     - Stores the vectors in Chroma DB
  5. Return a success message with the number of chunks created.
"""

import gc
import json
import os
import pathlib
import shutil
import asyncio
import urllib.error
import urllib.request

from fastapi import APIRouter, Form, HTTPException, UploadFile, File, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import (
    CHROMA_PERSIST_DIR,
    DATA_DIR,
    OLLAMA_BASE_URL,
    OLLAMA_CHAT_MODEL,
    OLLAMA_EMBED_MODEL,
    UPLOAD_DIR,
)
from app.rag.ingest import ingest_document
from app.rag.ollama_guard import ollama_semaphore
from app.trace import session_tracer

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Maximum allowed upload size (100 MB). Prevents OOM on huge files.
MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB

REQUIRED_MODELS = {OLLAMA_EMBED_MODEL, OLLAMA_CHAT_MODEL}

SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")

# ---------------------------------------------------------------------------

router = APIRouter()

# Global lock to serialize document ingestion processes
ingestion_lock = asyncio.Lock()


# ---------------------------------------------------------------------------
# Upload endpoint
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    extractor: str = Form("pymupdf"),
    mode: str = Form("ollama"),
    api_key: str = Form(None),
):
    """
    Upload a PDF or text document for indexing.

    Args:
        file:      The uploaded file (sent as multipart form data from the frontend).
        extractor: The extraction engine to use ('pymupdf' or 'docling').
        mode:      AI mode ('ollama' or 'gemini').
        api_key:   Optional API key override for Gemini mode.

    Returns:
        JSON with the filename and number of chunks created.
    """

    # ---- Step 1: Validate the file type ----
    allowed_extensions = [".pdf", ".txt", ".md"]
    file_extension = os.path.splitext(file.filename)[1].lower()

    if file_extension not in allowed_extensions:
        print(f"[Upload] Rejected '{file.filename}' — unsupported extension '{file_extension}'.")
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file_extension}. Allowed: {allowed_extensions}",
        )

    # ---- Step 2: Early size check via Content-Length (avoids buffering large files) ----
    # Browsers and most HTTP clients send Content-Length for file uploads.
    # Checking it before file.read() means a 100 MB rejected upload never
    # touches RAM — we refuse it as soon as we see the declared size.
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            declared_size = int(content_length)
            if declared_size > MAX_UPLOAD_BYTES:
                declared_mb = declared_size / (1024 * 1024)
                limit_mb = MAX_UPLOAD_BYTES // (1024 * 1024)
                print(
                    f"[Upload] Rejected '{file.filename}' early — declared size "
                    f"{declared_mb:.1f} MB exceeds limit of {limit_mb} MB."
                )
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large ({declared_mb:.0f} MB). Maximum allowed size is {limit_mb} MB.",
                )
        except ValueError:
            pass  # Malformed Content-Length — fall through to post-read check

    # ---- Step 3: Read and validate file size (post-read safety net) ----
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    print(f"[Upload] Received '{file.filename}' ({size_mb:.2f} MB) via {mode} mode (extractor={extractor}).")

    if len(content) > MAX_UPLOAD_BYTES:
        print(f"[Upload] Rejected '{file.filename}' — file too large ({size_mb:.1f} MB, limit={MAX_UPLOAD_BYTES // (1024*1024)} MB).")
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content) // (1024*1024)} MB). Maximum allowed size is {MAX_UPLOAD_BYTES // (1024*1024)} MB.",
        )


    # ---- Step 3: Save the file to disk ----
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, file.filename)

    with session_tracer.log_event(
        "upload.file_save",
        filename=file.filename,
        size_bytes=len(content),
        extractor=extractor,
        mode=mode,
    ):
        try:
            with open(file_path, "wb") as f:
                f.write(content)
            print(f"[Upload] File saved to disk: {file_path}")
        except Exception as save_err:
            print(f"[Upload] ERROR — could not save '{file.filename}' to disk: {save_err}")
            raise HTTPException(status_code=500, detail=f"Failed to save file: {save_err}")

    # ---- Step 4: Run the ingestion pipeline (queued using locks) ----
    # ingestion_lock serialises concurrent file uploads (one ingest at a time).
    # ollama_semaphore is the shared Ollama gate — only needed for Ollama mode
    # since Gemini embeddings are remote API calls that don't use local VRAM.
    print(f"[Upload] Starting ingestion pipeline for '{file.filename}'...")

    async def _run_ingest():
        num_chunks = await run_in_threadpool(
            ingest_document, file_path, extractor, mode, api_key
        )
        return num_chunks

    async with ingestion_lock:
        with session_tracer.log_event(
            "upload.ingest",
            filename=file.filename,
            extractor=extractor,
            mode=mode,
        ) as ev:
            try:
                if mode == "ollama":
                    # Gate on the semaphore to prevent simultaneous Ollama model loading
                    async with ollama_semaphore:
                        num_chunks = await _run_ingest()
                else:
                    # Gemini: no VRAM conflict, run freely
                    num_chunks = await _run_ingest()
                ev["chunks_created"] = num_chunks
                print(f"[Upload] SUCCESS — '{file.filename}' ingested into {num_chunks} chunks.")
            except Exception as e:
                import traceback
                traceback.print_exc()
                print(f"[Upload] ERROR — ingestion failed for '{file.filename}': {e}")
                raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

    return {
        "message": "Document uploaded and indexed successfully!",
        "filename": file.filename,
        "chunks_created": num_chunks,
    }


# ---------------------------------------------------------------------------
# Status endpoint
# ---------------------------------------------------------------------------

@router.get("/status")
async def get_status():
    """
    Return Ollama availability and model presence status for the frontend.
    Called on startup so the UI can decide which mode to offer.
    """
    print("[Status] Checking Ollama availability...")
    try:
        req = urllib.request.Request(
            f"{OLLAMA_BASE_URL}/api/tags",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=3) as res:
            data = json.loads(res.read())

        available_models = {m["name"].split(":")[0] for m in data.get("models", [])}
        available_models_full = {m["name"] for m in data.get("models", [])}
        required_names = {m.split(":")[0] for m in REQUIRED_MODELS}
        models_present = (
            required_names.issubset(available_models)
            or REQUIRED_MODELS.issubset(available_models_full)
        )
        print(f"[Status] Ollama is reachable. Available models: {available_models_full}. Required present: {models_present}.")
        return {
            "ollama_available": True,
            "ollama_models": list(available_models_full),
            "required_models_present": models_present,
            "required_models": list(REQUIRED_MODELS),
        }
    except Exception as e:
        print(f"[Status] Ollama unreachable: {e}")
        return {
            "ollama_available": False,
            "ollama_models": [],
            "required_models_present": False,
            "required_models": list(REQUIRED_MODELS),
        }


# ---------------------------------------------------------------------------
# PDF serve endpoint
# ---------------------------------------------------------------------------

@router.get("/pdf/{filename}")
async def serve_pdf(filename: str):
    """
    Serve raw PDF bytes from the uploads directory.

    Path traversal is prevented by resolving the requested path and verifying
    it stays inside UPLOAD_DIR before serving.
    """
    print(f"[PDF] Request to serve file: '{filename}'")
    safe_root = pathlib.Path(UPLOAD_DIR).resolve()
    # Reject filenames with path separators before even joining
    if os.sep in filename or "/" in filename or "\\" in filename:
        print(f"[PDF] REJECTED '{filename}' — path traversal attempt detected.")
        raise HTTPException(status_code=400, detail="Invalid filename.")

    file_path = (safe_root / filename).resolve()

    # Ensure the resolved path is still inside the uploads directory
    if not str(file_path).startswith(str(safe_root)):
        print(f"[PDF] REJECTED '{filename}' — resolved path escapes upload dir.")
        raise HTTPException(status_code=400, detail="Invalid filename.")

    if not file_path.exists():
        print(f"[PDF] ERROR — '{filename}' not found at {file_path}.")
        raise HTTPException(status_code=404, detail="File not found.")

    print(f"[PDF] Serving '{filename}' from {file_path}.")
    return FileResponse(str(file_path), media_type="application/pdf")


# ---------------------------------------------------------------------------
# Clear data endpoint
# ---------------------------------------------------------------------------

@router.post("/clear-data")
async def clear_data():
    """
    Clear all uploaded files and all vector database embeddings.
    """
    print("[ClearData] Starting data clear operation...")
    chroma_error = None
    upload_error = None

    # Release cached Chroma clients before deleting their SQLite files. This is
    # essential on Windows, where an open client can keep database files locked.
    # Note: LangChain Chroma client is managed automatically.


    # Force Python GC to release any remaining open file handles before deletion
    gc.collect()

    if os.path.exists(CHROMA_PERSIST_DIR):
        try:
            shutil.rmtree(CHROMA_PERSIST_DIR)
            os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
            print(f"[ClearData] Chroma DB cleared successfully: {CHROMA_PERSIST_DIR}")
        except Exception as initial_err:
            print(f"[ClearData] WARNING — shutil.rmtree failed for Chroma DB, trying file-by-file: {initial_err}")
            # On Windows, sqlite files may still be locked. Walk and delete
            # individual files we have permission to remove, skipping locked ones.
            try:
                for root_dir, dirs, files in os.walk(CHROMA_PERSIST_DIR, topdown=False):
                    for fname in files:
                        fpath = os.path.join(root_dir, fname)
                        try:
                            os.remove(fpath)
                        except Exception as file_err:
                            print(f"[ClearData] Could not remove file '{fpath}': {file_err}")
                    for dname in dirs:
                        dpath = os.path.join(root_dir, dname)
                        try:
                            os.rmdir(dpath)
                        except Exception as dir_err:
                            print(f"[ClearData] Could not remove dir '{dpath}': {dir_err}")
            except Exception as final_err:
                chroma_error = f"{initial_err} -> {final_err}"
                print(f"[ClearData] ERROR — Chroma DB partial clear failed: {chroma_error}")
    else:
        print(f"[ClearData] Chroma DB directory not found, skipping: {CHROMA_PERSIST_DIR}")

    if os.path.exists(UPLOAD_DIR):
        try:
            shutil.rmtree(UPLOAD_DIR)
            os.makedirs(UPLOAD_DIR, exist_ok=True)
            print(f"[ClearData] Upload directory cleared successfully: {UPLOAD_DIR}")
        except Exception as e:
            print(f"[ClearData] WARNING — shutil.rmtree failed for uploads, trying file-by-file: {e}")
            try:
                for root_dir, dirs, files in os.walk(UPLOAD_DIR, topdown=False):
                    for fname in files:
                        fpath = os.path.join(root_dir, fname)
                        try:
                            os.remove(fpath)
                        except Exception as file_err:
                            print(f"[ClearData] Could not remove file '{fpath}': {file_err}")
                    for dname in dirs:
                        dpath = os.path.join(root_dir, dname)
                        try:
                            os.rmdir(dpath)
                        except Exception as dir_err:
                            print(f"[ClearData] Could not remove dir '{dpath}': {dir_err}")
            except Exception as final_err:
                upload_error = f"{e} -> {final_err}"
                print(f"[ClearData] ERROR — uploads partial clear failed: {upload_error}")
    else:
        print(f"[ClearData] Upload directory not found, skipping: {UPLOAD_DIR}")

    if chroma_error or upload_error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear some data. Chroma error: {chroma_error}. Upload error: {upload_error}.",
        )

    print("[ClearData] All data cleared successfully.")
    return {"message": "All database embeddings and uploaded documents cleared successfully."}


# ---------------------------------------------------------------------------
# Settings endpoints
# ---------------------------------------------------------------------------

class AppSettings(BaseModel):
    lipi_ai_onboarded: bool = False
    model_mode: str = "ollama"
    gemini_api_key: str = ""
    extractor_mode: str = "pymupdf"


@router.get("/settings")
async def get_settings():
    if not os.path.exists(SETTINGS_FILE):
        print("[Settings] No settings file found, returning defaults.")
        return {
            "lipi_ai_onboarded": False,
            "model_mode": "ollama",
            "gemini_api_key": "",
            "extractor_mode": "pymupdf",
        }
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"[Settings] Loaded settings from {SETTINGS_FILE}.")
        return data
    except Exception as e:
        print(f"[Settings] ERROR — failed to read settings file: {e}. Returning defaults.")
        return {
            "lipi_ai_onboarded": False,
            "model_mode": "ollama",
            "gemini_api_key": "",
            "extractor_mode": "pymupdf",
        }


@router.post("/settings")
async def save_settings(settings: AppSettings):
    print(f"[Settings] Saving settings to {SETTINGS_FILE}...")
    try:
        os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(
                settings.model_dump() if hasattr(settings, "model_dump") else settings.dict(),
                f,
                indent=4,
            )
        print("[Settings] Settings saved successfully.")
        return {"message": "Settings saved successfully."}
    except Exception as e:
        print(f"[Settings] ERROR — failed to save settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {str(e)}")
