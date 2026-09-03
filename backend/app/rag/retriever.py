import tiktoken
from app.rag.ingest import get_vectorstore
from app.config import FULL_DOC_CHUNK_THRESHOLD, SIMILARITY_TOP_K, MAX_CONTEXT_TOKENS, OLLAMA_NUM_CTX
from app.trace import session_tracer

_encoding = tiktoken.get_encoding("cl100k_base")

_chunk_count_cache: dict[tuple[str, str], int] = {}  # key: (filename, mode)

def _token_count(text: str) -> int:
    return len(_encoding.encode(text))

def _trim_to_budget(
    pairs: list[tuple[str, dict]],
    budget: int,
    relevance_first: bool = False,
) -> list[tuple[str, dict]]:
    kept: list[tuple[str, dict]] = []
    total = 0
    for doc, meta in pairs:
        tokens = _token_count(doc)
        if total + tokens > budget:
            break
        kept.append((doc, meta))
        total += tokens

    if relevance_first:
        kept.sort(key=lambda p: (p[1].get("page", 1), p[1].get("chunk_index", 0)))
    return kept

def invalidate_chunk_count_cache(filename: str) -> None:
    keys_to_remove = [k for k in _chunk_count_cache if k[0] == filename]
    for k in keys_to_remove:
        _chunk_count_cache.pop(k, None)

def retrieve_context(query: str, filename: str = None, k: int = None, mode: str = "ollama", api_key: str = None) -> str:
    """
    Retrieve document context from Chroma via LangChain Retriever, scoped to the active document.
    """
    if k is None:
        k = SIMILARITY_TOP_K

    # Use 75% of the configured KV-cache (num_ctx) as the retrieval budget.
    # This guarantees the assembled prompt (context + system prompt + user query)
    # never causes Ollama to silently expand num_ctx mid-request, which would
    # allocate extra VRAM during prompt prefill and trigger an OOM crash.
    token_budget = int(OLLAMA_NUM_CTX * 0.75) if mode == "ollama" else MAX_CONTEXT_TOKENS

    try:
        vectorstore = get_vectorstore(filename, mode=mode, api_key=api_key)

        if filename:
            try:
                cache_key = (filename, mode)
                if cache_key not in _chunk_count_cache:
                    _chunk_count_cache[cache_key] = vectorstore._collection.count()
                total_chunks = _chunk_count_cache[cache_key]

                if total_chunks == 0:
                    import os
                    from app.config import UPLOAD_DIR
                    from app.rag.ingest import ingest_document
                    file_path = os.path.join(UPLOAD_DIR, filename)
                    if os.path.isfile(file_path):
                        print(f"[Retriever] '{filename}' not indexed for mode '{mode}'. Auto-indexing...")
                        ingest_document(file_path, mode=mode, api_key=api_key)
                        vectorstore = get_vectorstore(filename, mode=mode, api_key=api_key)
                        _chunk_count_cache[cache_key] = vectorstore._collection.count()
                        total_chunks = _chunk_count_cache[cache_key]

                if total_chunks > 0:
                    if 0 < total_chunks <= FULL_DOC_CHUNK_THRESHOLD:
                        print(f"[Retriever] Full-doc strategy for '{filename}'.")
                        
                        retriever = vectorstore.as_retriever(
                            search_kwargs={"k": total_chunks, "filter": {"source": filename}}
                        )
                        # We just do a dummy query to get all sorted by page/index
                        # Actually a similarity search will return them ordered by relevance.
                        # Wait, as_retriever with search_type="similarity" is the default. 
                        # We just want ALL chunks.
                        # Using raw collection is easier to get all chunks without query embedding overhead:
                        docs_response = vectorstore._collection.get(where={"source": filename})
                        docs = docs_response.get("documents", [])
                        metas = docs_response.get("metadatas", [])
                        
                        pairs = list(zip(docs, metas))
                        pairs.sort(key=lambda p: (p[1].get("page", 1), p[1].get("chunk_index", 0)))
                        pairs = _trim_to_budget(pairs, token_budget, relevance_first=False)
                        
                        formatted = [
                            f"--- [Source: {filename} | Page: {m.get('page', 1)} | Section: {m.get('section', 'General')}] ---\n{d}"
                            for d, m in pairs
                        ]
                        return "\n\n".join(formatted)

                    k = min(k, total_chunks)
            except Exception as get_err:
                print(f"[Retriever] Error fetching count: {get_err}")
                _chunk_count_cache.pop((filename, mode), None)

        # ── Vector similarity retrieval (LangChain native) ──
        search_kwargs = {"k": k}
        if filename:
            search_kwargs["filter"] = {"source": filename}

        retriever = vectorstore.as_retriever(search_kwargs=search_kwargs)
        
        with session_tracer.log_event("retrieve.vector_search", filename=filename, k=k, mode=mode) as ev:
            try:
                found_docs = retriever.invoke(query)
            except Exception as invoke_err:
                err_str = str(invoke_err).lower()
                if "dimension" in err_str or "expecting" in err_str or "mismatch" in err_str:
                    print(f"[Retriever] Dimension mismatch for '{filename}' in {mode} mode: {invoke_err}")
                    import os
                    from app.config import UPLOAD_DIR
                    from app.rag.ingest import ingest_document
                    file_path = os.path.join(UPLOAD_DIR, filename) if filename else None
                    if file_path and os.path.isfile(file_path):
                        print(f"[Retriever] Auto-reindexing '{filename}'...")
                        ingest_document(file_path, mode=mode, api_key=api_key, force=True)
                        vectorstore = get_vectorstore(filename, mode=mode, api_key=api_key)
                        retriever = vectorstore.as_retriever(search_kwargs=search_kwargs)
                        found_docs = retriever.invoke(query)
                    else:
                        raise invoke_err
                else:
                    raise invoke_err
            ev["results_returned"] = len(found_docs)
            
            # Single retry if none found
            if not found_docs and filename:
                retry_k = min(k * 2, 100)
                print(f"[Retriever] 0 results. Retrying k={retry_k}")
                retriever.search_kwargs["k"] = retry_k
                found_docs = retriever.invoke(query)
                ev["results_after_retry"] = len(found_docs)

        if not found_docs:
            return ""

        # Trim to token budget and re-sort
        pairs = [(d.page_content, d.metadata) for d in found_docs]
        pairs = _trim_to_budget(pairs, token_budget, relevance_first=True)

        formatted = [
            f"--- Chunk {i + 1} [Source: {m.get('source', 'Document')} | "
            f"Page: {m.get('page', 1)} | Section: {m.get('section', 'General')}] ---\n{d}"
            for i, (d, m) in enumerate(pairs)
        ]
        return "\n\n".join(formatted)

    except Exception as e:
        print(f"[Retriever] Retrieval error: {e}")
        raise RuntimeError(f"Document retrieval error: {e}") from e
