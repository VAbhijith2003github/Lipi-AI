import tiktoken
from app.rag.embeddings import CustomOllamaEmbeddings
from app.rag.ingest import get_collection
from app.config import FULL_DOC_CHUNK_THRESHOLD, SIMILARITY_TOP_K, MAX_CONTEXT_TOKENS


_encoding = tiktoken.get_encoding("cl100k_base")


def _token_count(text: str) -> int:
    return len(_encoding.encode(text))


def _trim_to_budget(
    pairs: list[tuple[str, dict]],
    budget: int,
    relevance_first: bool = False,
) -> list[tuple[str, dict]]:
    """
    Trim (doc, meta) pairs so their total token count stays within `budget`.

    Args:
        pairs:           (document_text, metadata) pairs to trim.
        budget:          Maximum total tokens to keep.
        relevance_first: When True, pairs are assumed to be in descending
                         relevance order (from a similarity search). The most
                         relevant chunks are kept, then survivors are re-sorted
                         by page number so the LLM receives coherent reading order.
                         When False (full-doc mode), pairs are already in reading
                         order and no re-sort is applied.
    """
    kept: list[tuple[str, dict]] = []
    total = 0
    for doc, meta in pairs:
        tokens = _token_count(doc)
        if total + tokens > budget:
            break
        kept.append((doc, meta))
        total += tokens

    if relevance_first:
        # Re-sort survivors by page → chunk_index for coherent LLM reading.
        kept.sort(key=lambda p: (p[1].get("page", 1), p[1].get("chunk_index", 0)))

    return kept


def retrieve_context(query: str, filename: str = None, k: int = None) -> str:
    """
    Retrieve document context from Chroma, strictly scoped to the active document.

    Strategy by document size:
      - Small/medium docs (≤ FULL_DOC_CHUNK_THRESHOLD chunks):
          Return ALL chunks in page/reading order, hard-capped to MAX_CONTEXT_TOKENS.
      - Large docs (> threshold):
          Similarity search → keep top-k chunks within MAX_CONTEXT_TOKENS budget
          (most relevant first) → re-sort survivors by page for LLM coherence.

    Fallback behaviour:
      If the scoped similarity search returns no results, a single retry is
      attempted at 2× k, still within the same document scope. There is no
      cross-document fallback; if the retry also returns nothing, an empty
      string is returned so the LLM can truthfully say no context is available.
    """
    if k is None:
        k = SIMILARITY_TOP_K

    try:
        collection = get_collection(filename)

        # ── Step 1: For scoped documents, check total chunk count ──
        if filename:
            try:
                all_file_docs = collection.get(where={"source": filename})
                if all_file_docs and all_file_docs.get("documents"):
                    file_chunks = all_file_docs["documents"]
                    file_metas = all_file_docs.get("metadatas", [])
                    total_chunks = len(file_chunks)

                    # Small/medium documents — return all chunks in reading order,
                    # trimmed to the context token budget.
                    if 0 < total_chunks <= FULL_DOC_CHUNK_THRESHOLD:
                        pairs = list(zip(file_chunks, file_metas))
                        pairs.sort(key=lambda p: (
                            p[1].get("page", 1),
                            p[1].get("chunk_index", 0)
                        ))
                        pairs = _trim_to_budget(pairs, MAX_CONTEXT_TOKENS, relevance_first=False)
                        formatted = [
                            f"--- [Source: {filename} | Page: {m.get('page', 1)} | Section: {m.get('section', 'General')}] ---\n{d}"
                            for d, m in pairs
                        ]
                        return "\n\n".join(formatted)

                    # Large documents — cap k to the actual number of chunks available.
                    k = min(k, total_chunks)

            except Exception as get_err:
                print(f"[Retriever] Error fetching chunks for '{filename}': {get_err}")

        # ── Step 2: Vector similarity retrieval, scoped to the active document ──
        query_embed = CustomOllamaEmbeddings().embed_query(query)
        kwargs: dict = {"query_embeddings": [query_embed], "n_results": k}
        if filename:
            kwargs["where"] = {"source": filename}

        results = collection.query(**kwargs)
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]

        # ── Step 3: Single scoped retry at 2× k — no cross-document fallback ──
        if not docs and filename:
            retry_k = min(k * 2, 100)
            print(
                f"[Retriever] Scoped query for '{filename}' returned 0 results at k={k}. "
                f"Retrying with k={retry_k} (same scope)…"
            )
            retry_results = collection.query(
                query_embeddings=[query_embed],
                n_results=retry_k,
                where={"source": filename},
            )
            docs = retry_results.get("documents", [[]])[0]
            metas = retry_results.get("metadatas", [[]])[0]

        if not docs:
            print(f"[Retriever] No context found for query in document '{filename}'.")
            return ""

        # ── Step 4: Trim to token budget (relevance order), then re-sort by page ──
        pairs = list(zip(docs, metas))
        pairs = _trim_to_budget(pairs, MAX_CONTEXT_TOKENS, relevance_first=True)

        formatted = [
            f"--- Chunk {i + 1} [Source: {m.get('source', 'Document')} | "
            f"Page: {m.get('page', 1)} | Section: {m.get('section', 'General')}] ---\n{d}"
            for i, (d, m) in enumerate(pairs)
        ]
        return "\n\n".join(formatted)

    except Exception as e:
        print(f"[Retriever] Retrieval error: {e}")
        return ""
