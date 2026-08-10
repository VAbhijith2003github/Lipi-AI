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
import shutil
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import upload, chat
from app.config import UPLOAD_DIR, CHROMA_PERSIST_DIR

# ---- Clear Chroma DB on startup ----
if os.path.exists(CHROMA_PERSIST_DIR):
    try:
        shutil.rmtree(CHROMA_PERSIST_DIR)
        print(f"Cleared Chroma DB on startup: {CHROMA_PERSIST_DIR}")
    except Exception as e:
        print(f"Error clearing Chroma DB on startup: {e}")

# ---- Create the FastAPI app ----
app = FastAPI(
    title="Smart Study Companion API",
    description="A local AI-powered study assistant using LangChain, Chroma, and Ollama.",
    version="1.0.1",
)

# ---- Configure CORS ----
# We allow requests from localhost on common development ports.
# In production, you'd restrict this to your exact frontend URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server (React)
        "http://localhost:3000",   # Alternative React port
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],           # Allow all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],           # Allow all headers
)

# ---- Register route modules ----
# Each router handles a group of related endpoints.
# The prefix adds a path prefix: e.g., upload.router's "/upload" becomes "/api/upload".
# Tags group endpoints together in the Swagger docs.
app.include_router(upload.router, prefix="/api", tags=["Upload"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])

# ---- Create necessary directories ----
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ---- Root endpoint (health check) ----
@app.get("/")
async def root():
    """
    A simple health check endpoint.
    If you visit http://localhost:8000/ in your browser, you should see this response.
    This confirms the server is running.
    """
    return {
        "message": "Smart Study Companion API is running!",
        "docs": "Visit /docs for the interactive API documentation.",
    }
