import os
import chromadb
from pypdf import PdfReader
from app.rag.text_splitter import StructureAwareChunker
from app.rag.embeddings import CustomOllamaEmbeddings
from app.config import CHROMA_PERSIST_DIR, CHROMA_COLLECTION_NAME, CHUNK_SIZE, CHUNK_OVERLAP

def get_collection():
    client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
    return client.get_or_create_collection(
        name=CHROMA_COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"}
    )

def ingest_document(file_path: str) -> int:
    ext = os.path.splitext(file_path)[1].lower()
    page_chunks = None
    text = ""

    if ext == ".pdf":
        try:
            import pymupdf4llm
            # pymupdf4llm extracts pages as Markdown dictionaries: [{"text": "...", "page": 1}, ...]
            page_chunks = pymupdf4llm.to_markdown(file_path, page_chunks=True)
        except Exception as e:
            print(f"pymupdf4llm extraction fallback: {e}")
            from pypdf import PdfReader
            text = "\n".join(page.extract_text() or "" for page in PdfReader(file_path).pages)
    elif ext in [".txt", ".md"]:
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    chunker = StructureAwareChunker(CHUNK_SIZE, CHUNK_OVERLAP)
    chunk_objs = chunker.split_document(text=text, page_chunks=page_chunks)

    if not chunk_objs:
        return 0

    chunk_texts = [item["text"] for item in chunk_objs]
    embeddings = CustomOllamaEmbeddings().embed_documents(chunk_texts)
    filename = os.path.basename(file_path)

    metadatas = []
    for i, item in enumerate(chunk_objs):
        meta = item["metadata"]
        metadatas.append({
            "source": filename,
            "page": meta.get("page", 1),
            "section": meta.get("section", "General"),
            "chunk_index": i
        })

    get_collection().add(
        ids=[f"{filename}_{i}" for i in range(len(chunk_objs))],
        documents=chunk_texts,
        embeddings=embeddings,
        metadatas=metadatas
    )
    return len(chunk_objs)
