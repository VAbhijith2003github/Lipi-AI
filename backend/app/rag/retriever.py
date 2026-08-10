from app.rag.embeddings import CustomOllamaEmbeddings
from app.rag.ingest import get_collection

def retrieve_context(query: str, k: int = 6) -> str:
    """
    Direct similarity retrieval from the Chroma collection with enriched metadata headers.
    """
    try:
        query_embed = CustomOllamaEmbeddings().embed_query(query)
        results = get_collection().query(query_embeddings=[query_embed], n_results=k)
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]

        formatted_chunks = []
        for i, doc in enumerate(docs):
            meta = metas[i] if i < len(metas) else {}
            source = meta.get("source", "Document")
            page = meta.get("page", 1)
            section = meta.get("section", "General")
            
            # Format clean citation header for each context chunk
            formatted_chunk = f"--- Chunk {i+1} [Source: {source} | Page: {page} | Section: {section}] ---\n{doc}"
            formatted_chunks.append(formatted_chunk)

        return "\n\n".join(formatted_chunks)
    except Exception as e:
        print(f"Retrieval error: {e}")
        return ""
