import os
import logging
import requests
from typing import List
from langchain_core.embeddings import Embeddings
from app.config import settings

logger = logging.getLogger(__name__)

EMBED_MODEL = "gemini-embedding-001"


class GeminiRESTEmbeddings(Embeddings):
    """Calls the Gemini embedding REST endpoint directly — avoids gRPC entirely."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    def _embed(self, text: str) -> List[float]:
        resp = requests.post(
            settings.gemini_embed_url,
            params={"key": self.api_key},
            json={"model": f"models/{EMBED_MODEL}", "content": {"parts": [{"text": text}]}},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["embedding"]["values"]

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._embed(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._embed(text)


def get_embeddings() -> Embeddings:
    api_key = settings.google_api_key or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("Google API Key is not set")
    return GeminiRESTEmbeddings(api_key=api_key)
