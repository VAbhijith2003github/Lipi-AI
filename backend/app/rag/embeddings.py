import threading
from app.config import OLLAMA_BASE_URL, OLLAMA_EMBED_MODEL

from langchain_ollama import OllamaEmbeddings

# ---------------------------------------------------------------------------
# Module-level embedder singleton
# ---------------------------------------------------------------------------
# Re-creating OllamaEmbeddings on every ingest/query call is wasteful.
# The Ollama embedder carries no per-request mutable state (model + base_url
# are fixed for the process lifetime), so a single shared instance is safe.

_ollama_embedder: OllamaEmbeddings | None = None
_ollama_embedder_lock = threading.Lock()


def get_embedder(mode: str = "ollama", api_key: str = None):
    """
    Factory that returns the correct LangChain embedder based on the active mode.

    Args:
        mode:    'ollama' for local Ollama embeddings (singleton reuse),
                 'gemini' for Google cloud embeddings (per-key instance).
        api_key: Required when mode='gemini'.
    """
    if mode == "gemini":
        if not api_key:
            raise ValueError("Google API key is required for Gemini embedding mode.")
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        # We explicitly request 768 dimensions for gemini-embedding-001 if needed
        return GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=api_key,
            output_dimensionality=768,
        )

    # Ollama embedder: return the cached singleton, creating it if necessary.
    global _ollama_embedder
    if _ollama_embedder is not None:
        return _ollama_embedder
    with _ollama_embedder_lock:
        if _ollama_embedder is None:
            _ollama_embedder = OllamaEmbeddings(
                model=OLLAMA_EMBED_MODEL,
                base_url=OLLAMA_BASE_URL,
                keep_alive=0
            )
    return _ollama_embedder
