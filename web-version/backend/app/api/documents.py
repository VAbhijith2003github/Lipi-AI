from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.core.deps import get_current_user
from app.models.schemas import UserModel, DocumentResponse
from app.services.document_service import get_document, delete_document_record, get_all_documents
from app.services.ingestion_service import delete_cloudinary_asset, download_cloudinary_asset
from app.services.retrieval_service import delete_qdrant_vectors
from app.services.annotation_service import get_version, list_versions
from app.services.usage_service import release_storage

router = APIRouter()

@router.get("/documents", response_model=List[DocumentResponse])
def get_documents(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    docs = get_all_documents(db, current_user.id)
    return [
        DocumentResponse(
            document_id=doc.id,
            filename=doc.filename,
            cloud_url=doc.cloudinary_secure_url,
            page_count=doc.page_count,
            chunk_count=doc.chunk_count,
            created_at=doc.created_at,
        ) for doc in docs
    ]

@router.get("/documents/{document_id}", response_model=DocumentResponse)
def get_document_by_id(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    doc = get_document(db, document_id, current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    return DocumentResponse(
        document_id=doc.id,
        filename=doc.filename,
        cloud_url=doc.cloudinary_secure_url,
        page_count=doc.page_count,
        chunk_count=doc.chunk_count,
        created_at=doc.created_at,
    )

@router.get("/documents/{document_id}/file")
def get_document_file(
    document_id: str,
    version_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    doc = get_document(db, document_id, current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    version = get_version(db, version_id, doc.id) if version_id else None
    if version_id and not version:
        raise HTTPException(status_code=404, detail="Document version not found")
    try:
        return Response(
            content=download_cloudinary_asset(version.cloudinary_public_id if version else doc.cloudinary_public_id),
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{version.filename if version else doc.filename}"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not retrieve the PDF from cloud storage") from exc


@router.delete("/documents/{document_id}")
def delete_document(
    document_id: str, 
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    doc = get_document(db, document_id, current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    versions = list_versions(db, doc.id)
    storage_bytes = doc.storage_bytes + sum(version.storage_bytes for version in versions)
        
    try:
        # 1. Delete Cloudinary asset
        delete_cloudinary_asset(doc.cloudinary_public_id)
        for version in versions:
            delete_cloudinary_asset(version.cloudinary_public_id)
        
        # 2. Delete Qdrant vectors
        delete_qdrant_vectors(document_id)
        
        # 3. Delete Document record
        delete_document_record(db, document_id, current_user.id)
        release_storage(db, current_user.id, storage_bytes)
        
        return {"status": "success", "message": f"Document {document_id} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
