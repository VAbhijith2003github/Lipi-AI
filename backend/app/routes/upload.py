"""
upload.py — File Upload Endpoint

PURPOSE:
This route handles the POST /upload endpoint. When the user selects a PDF
or text file in the Electron app, the frontend sends it here.

FLOW:
  1. Receive the file from the frontend.
  2. Save it temporarily to the 'uploads/' directory.
  3. Pass it to the RAG ingestion pipeline (ingest.py) which:
     - Reads the file
     - Splits it into chunks
     - Embeds the chunks using Ollama
     - Stores the vectors in Chroma DB
  4. Return a success message with the number of chunks created.
"""

import os
import asyncio
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from app.rag.ingest import ingest_document
from app.config import UPLOAD_DIR

# APIRouter lets us define routes in separate files and then "include" them
# in the main FastAPI app. This keeps main.py clean and organised.
router = APIRouter()

# Global lock to serialize document ingestion processes
ingestion_lock = asyncio.Lock()


from fastapi import Form

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    extractor: str = Form("pymupdf")
):
    """
    Upload a PDF or text document for indexing.

    Args:
        file: The uploaded file (sent as multipart form data from the frontend).
        extractor: The extraction engine to use (e.g., 'pymupdf' or 'docling').

    Returns:
        JSON with the filename and number of chunks created.
    """

    # ---- Step 1: Validate the file type ----
    allowed_extensions = [".pdf", ".txt", ".md"]
    file_extension = os.path.splitext(file.filename)[1].lower()

    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file_extension}. Allowed: {allowed_extensions}"
        )

    # ---- Step 2: Save the file to disk ----
    # We need to save it temporarily because PyPDFLoader reads from a file path.
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, file.filename)

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # ---- Step 3: Run the ingestion pipeline (queued using lock) ----
    async with ingestion_lock:
        try:
            num_chunks = await run_in_threadpool(ingest_document, file_path, extractor)
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

    return {
        "message": "Document uploaded and indexed successfully!",
        "filename": file.filename,
        "chunks_created": num_chunks,
    }
from fastapi.responses import FileResponse

@router.get("/pdf/{filename}")
async def serve_pdf(filename: str):
    """
    Serve raw PDF bytes from uploads directory.
    """
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
         raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, media_type="application/pdf")


@router.post("/clear-data")
async def clear_data():
    """
    Clear all uploaded files and all vector database embeddings.
    """
    from app.config import CHROMA_PERSIST_DIR
    import shutil
    import gc
    import chromadb

    chroma_error = None
    upload_error = None

    # Force Python to run garbage collection to release open sqlite db file handles
    gc.collect()

    if os.path.exists(CHROMA_PERSIST_DIR):
        try:
            shutil.rmtree(CHROMA_PERSIST_DIR)
            os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
        except Exception as initial_err:
            # If rmtree failed due to locked DB files (common on Windows), delete contents programmatically
            try:
                # Clear root collection
                try:
                    client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
                    for coll in client.list_collections():
                        client.delete_collection(coll.name)
                    client._system.stop()
                except Exception:
                    pass

                # Clear sub-document collection directories
                docs_dir = os.path.join(CHROMA_PERSIST_DIR, "docs")
                if os.path.exists(docs_dir):
                    for sub in os.listdir(docs_dir):
                        sub_path = os.path.join(docs_dir, sub)
                        if os.path.isdir(sub_path):
                            try:
                                client = chromadb.PersistentClient(path=sub_path)
                                for coll in client.list_collections():
                                    client.delete_collection(coll.name)
                                client._system.stop()
                            except Exception:
                                pass

                # Clean up any other files/directories we have permissions to remove
                for root, dirs, files in os.walk(CHROMA_PERSIST_DIR, topdown=False):
                    for file in files:
                        file_path = os.path.join(root, file)
                        try:
                            os.remove(file_path)
                        except Exception:
                            pass
                    for dir in dirs:
                        dir_path = os.path.join(root, dir)
                        try:
                            os.rmdir(dir_path)
                        except Exception:
                            pass
            except Exception as final_err:
                chroma_error = f"{initial_err} -> {final_err}"

    if os.path.exists(UPLOAD_DIR):
        try:
            shutil.rmtree(UPLOAD_DIR)
            os.makedirs(UPLOAD_DIR, exist_ok=True)
        except Exception as e:
            try:
                for root, dirs, files in os.walk(UPLOAD_DIR, topdown=False):
                    for file in files:
                        try:
                            os.remove(os.path.join(root, file))
                        except Exception:
                            pass
                    for dir in dirs:
                        try:
                            os.rmdir(os.path.join(root, dir))
                        except Exception:
                            pass
            except Exception as final_err:
                upload_error = f"{e} -> {final_err}"

    if chroma_error or upload_error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear some data. Chroma error: {chroma_error}. Upload error: {upload_error}."
        )

    return {"message": "All database embeddings and uploaded documents cleared successfully."}


