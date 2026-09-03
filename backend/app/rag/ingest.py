import gc
import hashlib
import json
import os
import threading

from langchain_chroma import Chroma
from langchain_core.documents import Document

from app.rag.text_splitter import StructureAwareChunker
from app.rag.embeddings import get_embedder
from app.config import CHROMA_PERSIST_DIR, CHROMA_COLLECTION_NAME, CHUNK_SIZE, CHUNK_OVERLAP, DOCLING_DEVICE
from app.trace import session_tracer

# Both Ollama (nomic-embed-text) and Gemini (with output_dimensionality=768) produce
# 768-dimensional embeddings. Used for dimension validation without an API call.
EXPECTED_EMBED_DIM = 768

# ---------------------------------------------------------------------------
# Docling CPU-only singleton
# ---------------------------------------------------------------------------
_docling_converter = None
_docling_lock = threading.Lock()

# Process-wide lock serialising all ChromaDB write operations.
# ChromaDB uses SQLite which supports concurrent reads but not concurrent
# writes. Without this lock, simultaneous ingest + chat retrieval threads
# can both try to write/read the same collection file, causing SQLite
# "database is locked" errors and crashes.
_chroma_write_lock = threading.Lock()

def _get_docling_converter():
    global _docling_converter
    if _docling_converter is not None:
        return _docling_converter
    with _docling_lock:
        if _docling_converter is not None:
            return _docling_converter
        print(f"[Docling] Initialising DocumentConverter (device={DOCLING_DEVICE.upper()}, first use)…")
        try:
            from docling.document_converter import DocumentConverter, PdfFormatOption
            from docling.datamodel.pipeline_options import (
                PdfPipelineOptions,
                AcceleratorOptions,
                AcceleratorDevice,
            )

            # Map config string → AcceleratorDevice enum
            _device_map = {
                "cpu":  AcceleratorDevice.CPU,
                "cuda": AcceleratorDevice.CUDA,
                "mps":  AcceleratorDevice.MPS,
            }
            device = _device_map.get(DOCLING_DEVICE, AcceleratorDevice.CPU)
            if DOCLING_DEVICE not in _device_map:
                print(f"[Docling] Unknown DOCLING_DEVICE='{DOCLING_DEVICE}'; falling back to CPU.")

            pipeline_options = PdfPipelineOptions()
            pipeline_options.do_ocr = True
            pipeline_options.do_table_structure = True
            pipeline_options.accelerator_options = AcceleratorOptions(
                num_threads=4,
                device=device,
            )

            _docling_converter = DocumentConverter(
                format_options={"pdf": PdfFormatOption(pipeline_options=pipeline_options)}
            )
            print(f"[Docling] DocumentConverter ready (device={device.name}).")
        except Exception as init_err:
            print(f"[Docling] WARNING — could not configure pipeline: {init_err}. Falling back to default.")
            from docling.document_converter import DocumentConverter
            _docling_converter = DocumentConverter()
        return _docling_converter


# ---------------------------------------------------------------------------
# Collection index helpers
# ---------------------------------------------------------------------------
def _index_path() -> str:
    return os.path.join(os.path.normpath(CHROMA_PERSIST_DIR), "collection_index.json")

def _load_index() -> dict:
    path = _index_path()
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def _save_index(filename: str, content_id: str) -> None:
    path = _index_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    idx = _load_index()
    idx[filename] = content_id
    with open(path, "w", encoding="utf-8") as f:
        json.dump(idx, f, indent=2)

# ---------------------------------------------------------------------------
# Collection factory (LangChain Chroma)
# ---------------------------------------------------------------------------
def get_vectorstore(filename: str = None, content_id: str = None, mode: str = "ollama", api_key: str = None) -> Chroma:
    """
    Get or create the LangChain Chroma vectorstore for a given document.
    """
    if not filename:
        path = os.path.join(os.path.normpath(CHROMA_PERSIST_DIR), mode)
    else:
        if content_id:
            dir_key = content_id
            _save_index(filename, dir_key)
        else:
            idx = _load_index()
            dir_key = idx.get(filename, hashlib.md5(filename.encode("utf-8")).hexdigest())

        old_path = os.path.join(os.path.normpath(CHROMA_PERSIST_DIR), "docs", dir_key)
        path = os.path.join(os.path.normpath(CHROMA_PERSIST_DIR), "docs", mode, dir_key)
        if os.path.exists(old_path) and not os.path.exists(path):
            try:
                import shutil
                os.makedirs(os.path.dirname(path), exist_ok=True)
                shutil.move(old_path, path)
                print(f"[Ingest] Migrated legacy index '{dir_key}' → {mode}/ namespace.")
            except Exception as move_err:
                print(f"[Ingest] WARNING — migration of '{dir_key}' failed: {move_err}. Will re-index.")

    os.makedirs(path, exist_ok=True)
    embedder = get_embedder(mode=mode, api_key=api_key)
    
    vectorstore = Chroma(
        collection_name=CHROMA_COLLECTION_NAME,
        embedding_function=embedder,
        persist_directory=path
    )
    return vectorstore

# ---------------------------------------------------------------------------
# Ingestion pipeline
# ---------------------------------------------------------------------------
def _stream_md5(file_path: str) -> str:
    md5 = hashlib.md5()
    with open(file_path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            md5.update(chunk)
    return md5.hexdigest()

def ingest_document(file_path: str, extractor: str = "pymupdf", mode: str = "ollama", api_key: str = None, force: bool = False) -> int:
    """Extract, chunk, embed, and store a document in Chroma via LangChain."""
    ext = os.path.splitext(file_path)[1].lower()
    filename = os.path.basename(file_path)

    with session_tracer.log_event("ingest.hash", file=filename) as ev:
        content_hash = _stream_md5(file_path)
        ev["content_hash"] = content_hash

    page_chunks = None
    text = ""

    with session_tracer.log_event("ingest.extract_text", file=filename, extractor=extractor, ext=ext) as ev:
        if ext == ".pdf":
            if extractor == "docling":
                try:
                    os.environ["TORCHDYNAMO_DISABLE"] = "1"
                    converter = _get_docling_converter()
                    result = converter.convert(file_path)
                    text = result.document.export_to_markdown()
                    ev["extractor_used"] = "docling"
                    del result
                    gc.collect()
                except Exception as docling_err:
                    print(f"[Docling] Extraction failed: {docling_err}. Falling back to pymupdf…")
                    extractor = "pymupdf"

            if extractor == "pymupdf":
                try:
                    import pymupdf
                    doc = pymupdf.open(file_path)
                    extracted_pages = []
                    for page_num in range(len(doc)):
                        p = doc[page_num]
                        p_text = p.get_text("text")
                        if p_text and p_text.strip():
                            extracted_pages.append({"text": p_text, "page": page_num + 1})
                        
                    doc.close()
                    if extracted_pages:
                        page_chunks = extracted_pages
                        ev["extractor_used"] = "pymupdf"
                    else:
                        raise ValueError("PyMuPDF found no selectable text")
                except Exception as mupdf_err:
                    print(f"PyMuPDF failed: {mupdf_err}. Falling back to pypdf…")
                    try:
                        from pypdf import PdfReader
                        reader = PdfReader(file_path)
                        text = "\n".join(page.extract_text() or "" for page in reader.pages)
                        ev["extractor_used"] = "pypdf"
                    except Exception as pdf_err:
                        print(f"pypdf extraction failed: {pdf_err}")
                        text = ""

            if not page_chunks and not text.strip():
                raise ValueError("Failed to extract any text.")
        elif ext in [".txt", ".md"]:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
            ev["extractor_used"] = "plaintext"
        else:
            raise ValueError(f"Unsupported file type: '{ext}'")

    with session_tracer.log_event("ingest.chunk", file=filename) as ev:
        chunker = StructureAwareChunker(CHUNK_SIZE, CHUNK_OVERLAP)
        chunk_objs = chunker.split_document(text=text, page_chunks=page_chunks)
        ev["num_chunks"] = len(chunk_objs)

    if not chunk_objs:
        return 0

    vectorstore = get_vectorstore(filename, content_id=content_hash, mode=mode, api_key=api_key)

    if force:
        import shutil
        if hasattr(vectorstore, "_persist_directory") and vectorstore._persist_directory and os.path.exists(vectorstore._persist_directory):
            try:
                shutil.rmtree(vectorstore._persist_directory)
            except Exception as e:
                print(f"[Ingest] Warning: could not delete directory {vectorstore._persist_directory}: {e}")
        vectorstore = get_vectorstore(filename, content_id=content_hash, mode=mode, api_key=api_key)
    else:
        try:
            # Avoid checking if it exists directly on collection, Chroma doesn't have an easy way 
            # to just count without fetching except via _collection
            existing_count = vectorstore._collection.count()
            if existing_count > 0:
                peek_data = vectorstore._collection.peek(limit=1)
                if peek_data and peek_data.get("embeddings") and len(peek_data["embeddings"]) > 0:
                    coll_dim = len(peek_data["embeddings"][0])
                    if coll_dim != EXPECTED_EMBED_DIM:
                        print(f"[Ingest] Dimension mismatch detected for '{filename}' in mode '{mode}'. Expected {EXPECTED_EMBED_DIM}, got {coll_dim}. Re-indexing.")
                        return ingest_document(file_path, extractor=extractor, mode=mode, api_key=api_key, force=True)
                print(f"[Ingest] '{filename}' already has {existing_count} chunks for mode '{mode}'. Skipping.")
                return existing_count
        except Exception as e:
            print(f"[Ingest] Error checking existing: {e}")

    # Convert chunks to LangChain Documents
    documents = []
    for i, item in enumerate(chunk_objs):
        doc = Document(
            page_content=item["text"],
            metadata={
                "source": filename,
                "page": item["metadata"].get("page", 1),
                "section": item["metadata"].get("section", "General"),
                "chunk_index": i,
            }
        )
        documents.append(doc)

    with session_tracer.log_event("ingest.store", file=filename, num_chunks=len(documents)) as ev:
        with _chroma_write_lock:
            try:
                vectorstore._collection.delete(where={"source": filename})
            except Exception:
                pass

            # We construct IDs manually to match original implementation
            ids = [f"{filename}_{i}" for i in range(len(documents))]

            # Batch size of 10 caps each Ollama embed request at ~6 500 tokens
            # (10 chunks × 650 tokens). The previous value of 50 sent ~32 500
            # tokens per request, which overwhelmed llama-server on 4 GB GPUs
            # and caused "connection forcibly closed" / Compute errors on large PDFs.
            EMBED_BATCH_SIZE = 10
            MAX_RETRIES = 3

            def _add_batch_with_retry(batch_docs, batch_ids, batch_num: int):
                """
                Attempt to embed + store one batch, retrying up to MAX_RETRIES times
                on transient Ollama errors (connection resets, compute errors, timeouts).
                Falls back to single-document inserts if the full batch keeps failing.
                """
                import time
                last_err = None
                for attempt in range(1, MAX_RETRIES + 1):
                    try:
                        vectorstore.add_documents(documents=batch_docs, ids=batch_ids)
                        return  # success
                    except Exception as err:
                        last_err = err
                        err_str = str(err).lower()
                        is_transient = any(k in err_str for k in [
                            "connection", "forcibly closed", "compute error",
                            "timeout", "500", "wsarecv", "wsasend",
                        ])
                        if not is_transient:
                            raise  # non-retryable (e.g. bad model name) — fail immediately
                        wait = 2 ** attempt  # 2 s, 4 s, 8 s
                        print(
                            f"[Ingest] Batch {batch_num} attempt {attempt}/{MAX_RETRIES} "
                            f"failed ({err}). Retrying in {wait}s…"
                        )
                        time.sleep(wait)

                # All retries exhausted → try one-doc-at-a-time as last resort
                print(
                    f"[Ingest] Batch {batch_num} failed after {MAX_RETRIES} retries. "
                    f"Falling back to single-document inserts for this batch…"
                )
                for doc, doc_id in zip(batch_docs, batch_ids):
                    try:
                        vectorstore.add_documents(documents=[doc], ids=[doc_id])
                    except Exception as single_err:
                        print(f"[Ingest] WARNING — could not store chunk '{doc_id}': {single_err}")

            total_batches = (len(documents) + EMBED_BATCH_SIZE - 1) // EMBED_BATCH_SIZE
            for batch_num, i in enumerate(range(0, len(documents), EMBED_BATCH_SIZE), start=1):
                batch_docs = documents[i:i + EMBED_BATCH_SIZE]
                batch_ids = ids[i:i + EMBED_BATCH_SIZE]
                print(f"[Ingest] Embedding batch {batch_num}/{total_batches} ({len(batch_docs)} chunks)…")
                _add_batch_with_retry(batch_docs, batch_ids, batch_num)

            ev["collection_path"] = str(CHROMA_PERSIST_DIR)

    try:
        from app.rag.retriever import invalidate_chunk_count_cache
        invalidate_chunk_count_cache(filename)
    except Exception:
        pass

    return len(documents)
