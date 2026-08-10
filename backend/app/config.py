"""
Configuration file for the Smart Study Companion backend.

This file centralises all settings (model names, paths, chunk sizes) so that
if you ever want to swap the LLM model or change how documents are split,
you only need to edit this single file instead of hunting through the codebase.
"""

import os

# ---------------------------------------------------------------------------
# Ollama Settings
# ---------------------------------------------------------------------------
# The base URL where Ollama is running. By default Ollama starts on port 11434.
OLLAMA_BASE_URL = "http://127.0.0.1:11434"

# The chat / instruct model used by the Tutor and Examiner agents.
# You can swap this to "qwen2", "mistral", "phi3", etc.
OLLAMA_CHAT_MODEL = "llama3.2:1b"

# The embedding model used to convert text chunks into vectors for Chroma.
# "nomic-embed-text" is small, fast, and produces high-quality embeddings.
OLLAMA_EMBED_MODEL = "nomic-embed-text"

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
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 300


# ---------------------------------------------------------------------------
# Upload Settings
# ---------------------------------------------------------------------------
# Directory where uploaded files are temporarily saved before processing.
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
