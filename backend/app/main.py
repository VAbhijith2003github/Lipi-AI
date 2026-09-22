"""
main.py — FastAPI Application Entry Point

PURPOSE:
This is the file that starts everything. When you run:
    uvicorn app.main:app --reload
This file:
  1. Creates the FastAPI application instance.
  2. Configures CORS (Cross-Origin Resource Sharing) so the Electron/React
     frontend can communicate with this backend.
  3. Registers all the route modules (upload, chat, quiz).
  4. Creates necessary directories (uploads/).

WHAT IS CORS?
  By default, a web browser blocks requests from one origin (e.g.,
  http://localhost:5173 where React runs) to a different origin (e.g.,
  http://localhost:8000 where FastAPI runs). This is a security feature.

  Since our React frontend and FastAPI backend run on different ports,
  we need to explicitly allow this "cross-origin" communication.
  That's what the CORS middleware does.
"""

import os
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import upload, chat
from app.config import UPLOAD_DIR, OLLAMA_BASE_URL, OLLAMA_CHAT_MODEL, OLLAMA_EMBED_MODEL
from app.trace import session_tracer


# ---- Background Warmup Tasks & Status ----
warmup_status = {
    "is_warming_up": True,
    "chroma": "pending",
    "embed_model": "lazy",
    # NOTE: chat_model (gemma2:2b) is intentionally NOT warmed at startup.
    # Pre-loading it would hold ~1.8 GB of VRAM from boot, leaving no room for
    # Docling CPU models or sudden load spikes. Ollama loads it automatically
    # on the first user chat request (one-time ~3-5 s delay, acceptable UX).
    "chat_model": "lazy",
    "is_complete": False,
}


async def _warmup_task():
    import urllib.request
    import json

    global warmup_status
    print("[Warmup] Starting background warmup for AI components...")

    # 1. Warmup Chroma client
    with session_tracer.log_event("warmup.chroma_init") as ev:
        try:
            from app.rag.ingest import get_vectorstore
            get_vectorstore()
            print("[Warmup] Vector Database (Chroma) initialized successfully.")
            ev["status"] = "ok"
            warmup_status["chroma"] = "ready"
        except Exception as e:
            print(f"[Warmup] Chroma warmup skipped/failed: {e}")
            ev["status"] = "skipped"
            ev["error"] = str(e)
            warmup_status["chroma"] = "skipped"

    # 2. Embed model warmup removed
    # Previously, we pre-loaded the embedding model. However, keeping it in VRAM
    # (even though it's only 274 MB) can fragment memory or prevent gemma2:2b from
    # finding a contiguous block on 4 GB GPUs, causing CUDA OOM on the first chat.
    # It now loads lazily (with keep_alive=0) only when needed.

    warmup_status["is_warming_up"] = False
    warmup_status["is_complete"] = True
    print("[Warmup] Background warmup complete (models will load lazily to preserve VRAM).")


# ---- Modern lifespan context manager (replaces deprecated @app.on_event) ----
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create directories and fire off warmup
    print("[Server] Lipi AI backend starting up…")
    try:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        print(f"[Server] Upload directory ready: {UPLOAD_DIR}")
    except Exception as e:
        print(f"[Server] WARNING — could not create upload directory: {e}")
    session_tracer.start_event(
        "session.start",
        session_id=session_tracer.session_id,
    )
    session_tracer.end_event("session.start", status="ok")
    task = asyncio.create_task(_warmup_task())
    print("[Server] Background warmup task scheduled.")
    yield
    # Shutdown: log session end, cancel warmup if still running, flush trace
    print("[Server] Lipi AI backend shutting down…")
    session_tracer.start_event("session.end")
    session_tracer.end_event("session.end", status="ok")
    if not task.done():
        print("[Server] Cancelling in-progress warmup task…")
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            print("[Server] Warmup task cancelled cleanly.")
    session_tracer.flush()
    print("[Server] Session trace flushed. Goodbye!")


# ---- Create the FastAPI app ----
app = FastAPI(
    title="Lipi AI Backend API",
    description="A local AI-powered study assistant using LangChain, Chroma, and Ollama.",
    version="1.0.1",
    lifespan=lifespan,
)

# ---- CORS: restrict to known local origins only ----
# NOTE: allow_origins=["*"] + allow_credentials=True is rejected by browsers
# (CORS spec forbids it). Enumerate the actual origins the Electron/Vite dev
# server uses instead.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # CRA / alternate dev server
        "http://localhost:8000",   # Self (docs, health check)
        "null",                    # Electron file:// protocol sends Origin: null
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Register route modules ----
app.include_router(upload.router, prefix="/api", tags=["Upload"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])


# ---- Root endpoint (health check) ----
@app.get("/")
async def root():
    """
    A simple health check endpoint.
    If you visit http://localhost:8000/ in your browser, you should see this response.
    This confirms the server is running.
    """
    print("[Health] Health-check endpoint hit — server is alive.")
    return {
        "app": "lipi-ai-desktop",
        "message": "Lipi AI API is running!",
        "docs": "Visit /docs for the interactive API documentation.",
    }


# ---- Warmup status endpoint ----
@app.get("/api/warmup-status")
async def get_warmup_status():
    """Return background AI model warmup progress."""
    return warmup_status
