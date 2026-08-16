"""
Configuration file for the Lipi AI backend.

This file centralises all settings (model names, paths, chunk sizes) so that
if you ever want to swap the LLM model or change how documents are split,
you only need to edit this single file instead of hunting through the codebase.
"""

import os

# ---- Parse environment variables manually from .env if present ----
# Check backend/ directory (.env) and project root (../.env)
_possible_env_paths = [
    os.path.join(os.path.dirname(__file__), "..", ".env"),      # backend/.env
    os.path.join(os.path.dirname(__file__), "..", "..", ".env")  # project root .env
]

for _path in _possible_env_paths:
    if os.path.isfile(_path):
        with open(_path, "r", encoding="utf-8") as _f:
            for _line in _f:
                _line = _line.strip()
                if not _line or _line.startswith("#"):
                    continue
                if "=" in _line:
                    _k, _v = _line.split("=", 1)
                    _k = _k.strip()
                    _v = _v.strip().strip("'\"")
                    os.environ[_k] = _v

# ---------------------------------------------------------------------------
# Secrets & API Keys
# ---------------------------------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# ---------------------------------------------------------------------------
# Ollama Settings
# ---------------------------------------------------------------------------
# The base URL where Ollama is running. By default Ollama starts on port 11434.
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")

# The chat / instruct model used by the Tutor and Examiner agents.
# You can swap this to "qwen2", "mistral", "phi3", etc.
OLLAMA_CHAT_MODEL = os.environ.get("OLLAMA_CHAT_MODEL", "llama3.2:1b")

# The embedding model used to convert text chunks into vectors for Chroma.
# "nomic-embed-text" is small, fast, and produces high-quality embeddings.
OLLAMA_EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")

# ---------------------------------------------------------------------------
# Chroma DB Settings
# ---------------------------------------------------------------------------
# Where Chroma will persist its vector database on disk.
# This means your indexed documents survive server restarts.
CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_db")

# The name of the Chroma collection that stores our document vectors.
CHROMA_COLLECTION_NAME = "study_documents"

# ---------------------------------------------------------------------------
# Document Splitting Settings
# ---------------------------------------------------------------------------
# chunk_size  : The maximum number of tokens per chunk.
# chunk_overlap: How many tokens overlap between consecutive chunks.
#                Overlap prevents losing context at chunk boundaries.
# Larger chunks capture more semantic context per vector; reduced overlap trims
# DB size and avoids redundant context in the retrieved window.
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100

# ---------------------------------------------------------------------------
# Retrieval Settings
# ---------------------------------------------------------------------------
# Documents with this many chunks or fewer will have ALL chunks returned
# in reading order (capped to MAX_CONTEXT_TOKENS). Calibrated so that even
# at the new CHUNK_SIZE=800, full-doc mode stays well within token budget.
FULL_DOC_CHUNK_THRESHOLD = 20

# Number of top-k similar chunks to retrieve for large documents.
# The retriever further trims these to MAX_CONTEXT_TOKENS by relevance rank.
SIMILARITY_TOP_K = 10

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
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
