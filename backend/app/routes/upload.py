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
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from app.rag.ingest import ingest_document
from app.config import UPLOAD_DIR

# APIRouter lets us define routes in separate files and then "include" them
# in the main FastAPI app. This keeps main.py clean and organised.
router = APIRouter()


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Upload a PDF or text document for indexing.

    Args:
        file: The uploaded file (sent as multipart form data from the frontend).

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

    # ---- Step 3: Run the ingestion pipeline ----
    try:
        num_chunks = ingest_document(file_path)
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

