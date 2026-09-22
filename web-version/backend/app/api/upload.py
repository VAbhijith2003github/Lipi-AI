from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import get_current_user
from app.services.ingestion_service import delete_cloudinary_asset, process_and_ingest
from app.services.document_service import create_document_record
from app.services.retrieval_service import delete_qdrant_vectors
from app.models.schemas import DocumentResponse, UserModel
from app.config import settings
from app.services.usage_service import release_storage, reserve_storage

router = APIRouter()

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...), 
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    file_bytes = await file.read()
    max_size = settings.max_upload_size_mb * 1024 * 1024
    if len(file_bytes) > max_size:
        raise HTTPException(status_code=413, detail=f"PDF files must be at most {settings.max_upload_size_mb} MB")
    if b"%PDF-" not in file_bytes[:1024]:
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid PDF")

    storage_bytes = len(file_bytes)
    if not reserve_storage(db, current_user.id, storage_bytes):
        raise HTTPException(status_code=413, detail="Storage quota exceeded. Delete a document or version before uploading.")
    
    # Process and ingest
    try:
        result = await process_and_ingest(file_bytes, file.filename)
    except Exception as e:
        release_storage(db, current_user.id, storage_bytes)
        raise HTTPException(status_code=500, detail=str(e))
    
    # Save to database
    try:
        db_doc = create_document_record(
            db=db,
            doc_id=result["document_id"],
            filename=file.filename,
            user_id=current_user.id,
            cloudinary_id=result["cloudinary_public_id"],
            cloud_url=result["cloudinary_secure_url"],
            page_count=result["page_count"],
            chunk_count=result["chunk_count"],
            storage_bytes=storage_bytes,
        )
    except Exception as exc:
        db.rollback()
        try:
            delete_cloudinary_asset(result["cloudinary_public_id"])
            delete_qdrant_vectors(result["document_id"])
        except Exception:
            pass
        finally:
            release_storage(db, current_user.id, storage_bytes)
        raise HTTPException(status_code=500, detail="Could not save the uploaded document") from exc
    
    return DocumentResponse(
        document_id=db_doc.id,
        filename=db_doc.filename,
        cloud_url=db_doc.cloudinary_secure_url,
        page_count=db_doc.page_count,
        chunk_count=db_doc.chunk_count,
        created_at=db_doc.created_at,
    )
