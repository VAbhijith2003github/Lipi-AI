import os
import json
import hashlib
import chromadb
from app.rag.text_splitter import StructureAwareChunker
from app.rag.embeddings import CustomOllamaEmbeddings
from app.config import CHROMA_PERSIST_DIR, CHROMA_COLLECTION_NAME, CHUNK_SIZE, CHUNK_OVERLAP


# ── Collection index helpers ──────────────────────────────────────────────────
# Maps display filename (basename) → MD5 of file content (used as the Chroma
# collection directory key). This guarantees two files with the same name but
# different content get separate collections, and re-uploading the same file
# is idempotent.

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


# ── Collection factory ────────────────────────────────────────────────────────

def get_collection(filename: str = None, content_id: str = None):
    """
    Get or create the Chroma collection for a given document.

    Args:
        filename:   Display name of the document (basename). Used as the
                    metadata filter value ("source") for scoped queries.
        content_id: MD5 hex-digest of the raw file bytes.
                    Supplied at ingest time — used as the on-disk collection
                    directory key and persisted to collection_index.json.
                    Omitted at retrieval time — the index is consulted instead.
                    Falls back to MD5(filename) if the file is not in the index
                    (e.g., legacy collections written before this change).
    """
    if not filename:
        path = CHROMA_PERSIST_DIR
    else:
        if content_id:
            # Ingest path: use the content hash and persist the mapping.
            dir_key = content_id
            _save_index(filename, dir_key)
        else:
            # Retrieval path: look up the hash written during ingestion.
            idx = _load_index()
            dir_key = idx.get(filename, hashlib.md5(filename.encode("utf-8")).hexdigest())

        path = os.path.join(os.path.normpath(CHROMA_PERSIST_DIR), "docs", dir_key)

    client = chromadb.PersistentClient(path=path)
    collection = client.get_or_create_collection(
        name=CHROMA_COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    return collection


# ── Ingestion pipeline ────────────────────────────────────────────────────────

def ingest_document(file_path: str, extractor: str = "pymupdf") -> int:
    """
    Extract, chunk, embed, and store a document in Chroma.

    Returns the number of chunks stored.
    Raises ValueError for unsupported file types or when all extractors fail.
    """
    ext = os.path.splitext(file_path)[1].lower()

    # ── Compute content hash for collision-safe collection keying ──────────────
    with open(file_path, "rb") as fh:
        content_hash = hashlib.md5(fh.read()).hexdigest()

    page_chunks = None
    text = ""

    # ── Extract text ──────────────────────────────────────────────────────────
    if ext == ".pdf":
        if extractor == "docling":
            try:
                print(f"Attempting to extract '{file_path}' using Docling…")
                import os as _os
                _os.environ["TORCHDYNAMO_DISABLE"] = "1"  # Suppress C++ JIT requirement on Windows
                from docling.document_converter import DocumentConverter
                converter = DocumentConverter()
                result = converter.convert(file_path)
                text = result.document.export_to_markdown()
                print("Docling extraction successful.")
            except Exception as docling_err:
                print(f"Docling extraction failed: {docling_err}. Falling back to pymupdf4llm…")
                extractor = "pymupdf"
        
        if extractor == "pymupdf":
            try:
                import pymupdf4llm
                res = pymupdf4llm.to_markdown(file_path, page_chunks=True)
                if isinstance(res, list) and len(res) > 0:
                    page_chunks = res
                else:
                    raise ValueError("pymupdf4llm returned an empty result")
            except Exception as mupdf_err:
                print(f"pymupdf4llm failed: {mupdf_err}. Falling back to pypdf…")
                try:
                    from pypdf import PdfReader
                    reader = PdfReader(file_path)
                    text = "\n".join(page.extract_text() or "" for page in reader.pages)
                except Exception as pdf_err:
                    print(f"pypdf extraction failed: {pdf_err}")
                    text = ""

        # ── All extractors failed — surface the error rather than embed a stub ──
        if not page_chunks and not text.strip():
            filename_clean = os.path.basename(file_path)
            raise ValueError(
                f"Failed to extract any text from '{filename_clean}'. "
                "All extraction methods (Docling, pymupdf4llm, pypdf) failed. "
                "The file may be encrypted, corrupted, or image-only (scanned without OCR text layer). "
                "Please check the file and try again."
            )

    elif ext in [".txt", ".md"]:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
        except Exception as txt_err:
            raise ValueError(
                f"Could not read text file '{os.path.basename(file_path)}': {txt_err}"
            ) from txt_err

    else:
        raise ValueError(
            f"Unsupported file type: '{ext}'. "
            "Supported types are: .pdf, .txt, .md"
        )

    # ── Chunk ─────────────────────────────────────────────────────────────────
    chunker = StructureAwareChunker(CHUNK_SIZE, CHUNK_OVERLAP)
    chunk_objs = chunker.split_document(text=text, page_chunks=page_chunks)

    if not chunk_objs:
        return 0

    # ── Embed ─────────────────────────────────────────────────────────────────
    chunk_texts = [item["text"] for item in chunk_objs]
    embeddings = CustomOllamaEmbeddings().embed_documents(chunk_texts)
    filename = os.path.basename(file_path)

    metadatas = [
        {
            "source": filename,
            "page": item["metadata"].get("page", 1),
            "section": item["metadata"].get("section", "General"),
            "chunk_index": i,
        }
        for i, item in enumerate(chunk_objs)
    ]

    # ── Store (content-hash-keyed collection) ─────────────────────────────────
    collection = get_collection(filename, content_id=content_hash)

    # Clear any prior vectors for this file before upserting.
    try:
        collection.delete(where={"source": filename})
    except Exception as del_err:
        print(f"[Ingest] Chroma delete warning for '{filename}': {del_err}")

    collection.upsert(
        ids=[f"{filename}_{i}" for i in range(len(chunk_objs))],
        documents=chunk_texts,
        embeddings=embeddings,
        metadatas=metadatas,
    )
    return len(chunk_objs)
