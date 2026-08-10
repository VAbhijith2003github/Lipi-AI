import json
import urllib.request
from app.config import OLLAMA_BASE_URL, OLLAMA_EMBED_MODEL

class CustomOllamaEmbeddings:
    """
    Minimal direct Ollama embedding service wrapper.
    """
    def __init__(self, model=OLLAMA_EMBED_MODEL, base_url=OLLAMA_BASE_URL):
        self.model = model
        self.base_url = base_url.rstrip('/')

    def embed_query(self, text: str) -> list[float]:
        req = urllib.request.Request(
            f"{self.base_url}/api/embeddings",
            data=json.dumps({"model": self.model, "prompt": text}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read())["embedding"]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self.embed_query(t) for t in texts]
