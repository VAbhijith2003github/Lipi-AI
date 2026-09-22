try:
    from langchain_qdrant import QdrantVectorStore
except ImportError:
    try:
        from langchain_qdrant import Qdrant as QdrantVectorStore
    except ImportError:
        from langchain_community.vectorstores import Qdrant as QdrantVectorStore
from qdrant_client import QdrantClient
from app.config import settings
from app.rag.embeddings import get_embeddings

COLLECTION_NAME = "lipi_documents"

def get_qdrant_client():
    # Supports both HTTP URL, Cloud with API key, and local disk
    return QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)

def get_vectorstore():
    embeddings = get_embeddings()
    client = get_qdrant_client()
    
    # Ensure collection exists, if using a persistent backend, QdrantVectorStore
    # handles creation on first ingestion, but checking/creating is safe.
    try:
        client.get_collection(COLLECTION_NAME)
    except Exception:
        from qdrant_client.http.models import VectorParams, Distance, PayloadSchemaType
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=3072, distance=Distance.COSINE)
        )
        client.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name="metadata.document_id",
            field_schema=PayloadSchemaType.KEYWORD,
        )

    try:
        return QdrantVectorStore(
            client=client,
            collection_name=COLLECTION_NAME,
            embedding=embeddings
        )
    except TypeError:
        return QdrantVectorStore(
            client=client,
            collection_name=COLLECTION_NAME,
            embeddings=embeddings
        )
