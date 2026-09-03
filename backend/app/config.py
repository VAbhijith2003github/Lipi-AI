"""
Configuration file for the Lipi AI backend.

This file centralises all settings (model names, paths, chunk sizes) so that
if you ever want to swap the LLM model or change how documents are split,
you only need to edit this single file instead of hunting through the codebase.
"""

import os
import sys

# ---- Detect if running in a PyInstaller frozen/packaged executable ----
IS_FROZEN = getattr(sys, "frozen", False)

# Disable ChromaDB telemetry to ensure fast, offline startup
os.environ["ANONYMIZED_TELEMETRY"] = "False"

# App Data Directory resolution (safe for Program Files installations)
if IS_FROZEN:
    _base_app_data = os.environ.get("APPDATA") or os.path.expanduser("~")
    DATA_DIR = os.path.join(_base_app_data, "LipiAI")
    os.makedirs(DATA_DIR, exist_ok=True)
else:
    DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# ---- Parse environment variables manually from .env if present ----
# Check app data, executable directory, backend/, and project root
_possible_env_paths = [
    os.path.join(DATA_DIR, ".env"),
    os.path.join(os.path.dirname(sys.executable) if IS_FROZEN else "", ".env"),
    os.path.join(os.path.dirname(__file__), "..", ".env"),      # backend/.env
    os.path.join(os.path.dirname(__file__), "..", "..", ".env")  # project root .env
]

_env_loaded = False
for _path in _possible_env_paths:
    if _path and os.path.isfile(_path):
        with open(_path, "r", encoding="utf-8") as _f:
            for _line in _f:
                _line = _line.strip()
                if not _line or _line.startswith("#"):
                    continue
                if "=" in _line:
                    _k, _v = _line.split("=", 1)
                    _k = _k.strip()
                    _v = _v.strip().strip("'\"")
                    if _k not in os.environ:
                        os.environ[_k] = _v
        print(f"[Config] Loaded environment variables from: {_path}")
        _env_loaded = True
        break

if not _env_loaded:
    print("[Config] No .env file found; relying on system environment variables.")

# ---------------------------------------------------------------------------
# Secrets & API Keys
# ---------------------------------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    print("[Config] GEMINI_API_KEY is not set — Gemini/cloud mode will be unavailable.")
else:
    print("[Config] GEMINI_API_KEY loaded successfully.")

# ---------------------------------------------------------------------------
# Ollama Settings
# ---------------------------------------------------------------------------
# The base URL where Ollama is running. By default Ollama starts on port 11434.
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")

# The chat / instruct model used by the Tutor and Examiner agents.
# You can swap this to "qwen2", "mistral", "phi3", etc.
OLLAMA_CHAT_MODEL = os.environ.get("OLLAMA_CHAT_MODEL", "gemma2:2b")

# The number of model layers to offload to the GPU.
# For a 4 GB GPU on Windows, Ollama often tries to offload 100% of gemma2:2b (26 layers),
# which requests ~1.6 GB VRAM. However, Windows Desktop (WDDM) can reserve so much memory 
# that this allocation fails with a CUDA OOM. Limiting to 16 layers uses ~1.1 GB VRAM,
# guaranteeing stability while keeping inference fast. (Set to -1 for auto).
OLLAMA_NUM_GPU = int(os.environ.get("OLLAMA_NUM_GPU", "0"))

# The embedding model used to convert text chunks into vectors for Chroma.
# "nomic-embed-text" is small, fast, and produces high-quality embeddings.
OLLAMA_EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")

# ---------------------------------------------------------------------------
# Docling PDF Extraction Settings
# ---------------------------------------------------------------------------
# Device for Docling's internal PyTorch models (layout detection, table structure,
# OCR). Options: "cpu" | "cuda" | "mps".
#
# VRAM SAFETY NOTE: Setting this to "cuda" is safe because the upload route
# wraps the entire ingest pipeline (including Docling extraction) inside the
# shared ollama_semaphore. This means Docling's GPU models (~950 MB) only load
# *after* any running Ollama chat inference has finished and released VRAM.
# The ollama_semaphore ensures they never overlap.
#
# GTX 1650 4 GB budget with DOCLING_DEVICE=cuda:
#   Windows WDDM:        ~500 MB
#   Docling models peak: ~950 MB
#   nomic-embed-text:    ~274 MB  (sequential, not simultaneous)
#   Headroom:            ~2.3 GB  → safe
#
# Default is "cpu" (zero VRAM risk, ~5-15 s/page slower).
# Set to "cuda" in .env to accelerate Docling on the GPU.
DOCLING_DEVICE = os.environ.get("DOCLING_DEVICE", "cpu").lower()

# Context window size in tokens for Ollama.
# IMPORTANT: num_ctx controls KV-cache allocation, NOT GPU offloading.
# A 4096-token KV cache for gemma2:2b uses ~400 MB of VRAM unnecessarily,
# since our retriever hard-caps context at 1800 tokens in Ollama mode.
# 2048 tokens saves ~150-200 MB VRAM and reduces time-to-first-token on
# mobile-class GPUs (e.g. GTX 1650 4 GB) without any quality loss.
OLLAMA_NUM_CTX = int(os.environ.get("OLLAMA_NUM_CTX", "2048"))

# ---------------------------------------------------------------------------
# Chroma DB Settings
# ---------------------------------------------------------------------------
# Where Chroma will persist its vector database on disk.
# This means your indexed documents survive server restarts.
CHROMA_PERSIST_DIR = os.path.join(DATA_DIR, "chroma_db")

# The name of the Chroma collection that stores our document vectors.
CHROMA_COLLECTION_NAME = "study_documents"

# ---------------------------------------------------------------------------
# Document Splitting Settings
# ---------------------------------------------------------------------------
# chunk_size  : The maximum number of tokens per chunk.
# chunk_overlap: How many tokens overlap between consecutive chunks.
#                Overlap prevents losing context at chunk boundaries.
CHUNK_SIZE = 650
CHUNK_OVERLAP = 80

# ---------------------------------------------------------------------------
# Retrieval Settings
# ---------------------------------------------------------------------------
# Documents with this many chunks or fewer will have ALL chunks returned
# in reading order (capped to MAX_CONTEXT_TOKENS).
FULL_DOC_CHUNK_THRESHOLD = 20

# Number of top-k similar chunks to retrieve for large documents.
# The retriever further trims these to MAX_CONTEXT_TOKENS by relevance rank.
# Reduced from 10 to 6: the 1800-token Ollama budget trims results anyway,
# and 6 chunks is sufficient while reducing Chroma query overhead.
SIMILARITY_TOP_K = 6

# ---------------------------------------------------------------------------
# Context Window Budget
# ---------------------------------------------------------------------------
# Hard cap (in tokens) on the total document context passed to the LLM.
# Leaves headroom for the system prompt, chat history, and the model's reply
# within an 8192-token context window.
MAX_CONTEXT_TOKENS = 4000

# ---------------------------------------------------------------------------
# Upload Settings
# ---------------------------------------------------------------------------
# Directory where uploaded files are temporarily saved before processing.
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")

# ---------------------------------------------------------------------------
# Trace / Audit Log Settings
# ---------------------------------------------------------------------------
# One JSON file per session is written here, named session_<timestamp>_<uid>.json.
TRACES_DIR = os.path.join(DATA_DIR, "traces")

