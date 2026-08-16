import json
import urllib.request
import urllib.error
from app.config import OLLAMA_BASE_URL, OLLAMA_EMBED_MODEL


class CustomOllamaEmbeddings:
    """
    Ollama embedding service wrapper.

    Primary path  : POST /api/embed  (Ollama ≥ 0.3) — true batch endpoint.
                    Payload: {"model": "...", "input": ["text1", "text2", ...]}.
                    One network round-trip for any number of chunks.

    Fallback path : POST /api/embeddings — legacy single-text endpoint,
                    called sequentially only if the batch endpoint is unavailable.

    NOTE: The chat model is intentionally never used as an embedding fallback.
    Chat and embedding models operate in different vector spaces; mixing them
    silently corrupts similarity scores in the vector store.
    """

    def __init__(self, model: str = OLLAMA_EMBED_MODEL, base_url: str = OLLAMA_BASE_URL):
        self.model = model
        self.base_url = base_url.rstrip("/")

    # ── Low-level helpers ─────────────────────────────────────────────────────

    def _post(self, endpoint: str, payload: dict, timeout: int) -> dict | None:
        """POST JSON to an Ollama endpoint and return the parsed response dict."""
        req = urllib.request.Request(
            f"{self.base_url}{endpoint}",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return json.loads(res.read())
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", errors="ignore")
            except Exception:
                pass
            print(f"[Embeddings] HTTP {e.code} from {endpoint}: {body}")
            return None
        except Exception as e:
            print(f"[Embeddings] Request error ({endpoint}): {e}")
            return None

    # ── Public API ────────────────────────────────────────────────────────────

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """
        Embed a list of texts using a single batch request where possible.

        Attempt 1 — /api/embed (Ollama ≥ 0.3 batch endpoint):
            One round-trip for the entire list. Preferred for any non-trivial
            document since it is orders of magnitude faster than sequential calls.

        Attempt 2 — /api/embeddings (legacy sequential):
            Used only as a last resort when the batch endpoint is unavailable
            (e.g., older Ollama installations).

        Raises:
            ConnectionError: If the embedding model cannot be reached via either
                             endpoint, so ingestion fails cleanly rather than
                             storing empty/zero vectors.
        """
        clean = [t.strip() if t and t.strip() else "empty" for t in texts]

        # ── Attempt 1: batch /api/embed ───────────────────────────────────────
        data = self._post(
            "/api/embed",
            {"model": self.model, "input": clean},
            timeout=120,
        )
        if (
            data
            and isinstance(data.get("embeddings"), list)
            and len(data["embeddings"]) == len(clean)
        ):
            print(f"[Embeddings] Batch-embedded {len(clean)} chunks via /api/embed.")
            return data["embeddings"]

        # ── Attempt 2: sequential legacy /api/embeddings ──────────────────────
        print(
            "[Embeddings] /api/embed unavailable or returned wrong count — "
            "falling back to sequential /api/embeddings."
        )
        embeddings: list[list[float]] = []
        for i, text in enumerate(clean):
            data = self._post(
                "/api/embeddings",
                {"model": self.model, "prompt": text},
                timeout=30,
            )
            if not data or "embedding" not in data:
                raise ConnectionError(
                    f"Ollama embedding failed for model '{self.model}' at chunk {i + 1}/{len(clean)}. "
                    f"Ensure Ollama is running on {self.base_url} and the model is pulled "
                    f"(run: ollama pull {self.model})."
                )
            embeddings.append(data["embedding"])

        return embeddings

    def embed_query(self, text: str) -> list[float]:
        """Embed a single query string. Reuses embed_documents for consistency."""
        return self.embed_documents([text])[0]
