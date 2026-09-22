from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.schemas import (
    AnnotationCreate,
    AnnotationResponse,
    AnnotationUpdate,
    DocumentVersionResponse,
    UserModel,
)
from app.services.annotation_service import (
    create_annotation,
    create_version,
    delete_annotation,
    get_annotation,
    list_annotations,
    list_versions,
    update_annotation,
)
from app.services.document_service import get_document
from app.services.ingestion_service import build_annotated_document, delete_cloudinary_asset, download_cloudinary_asset, upload_annotated_document
from app.services.usage_service import release_storage, reserve_storage

router = APIRouter()


def require_document(db: Session, document_id: str, user_id: str):
    document = get_document(db, document_id, user_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.get("/documents/{document_id}/annotations", response_model=list[AnnotationResponse])
def get_annotations(document_id: str, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    require_document(db, document_id, current_user.id)
    return list_annotations(db, document_id)


@router.post("/documents/{document_id}/annotations", response_model=AnnotationResponse, status_code=201)
def add_annotation(document_id: str, request: AnnotationCreate, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    require_document(db, document_id, current_user.id)
    return create_annotation(db, document_id, current_user.id, request)


@router.patch("/documents/{document_id}/annotations/{annotation_id}", response_model=AnnotationResponse)
def edit_annotation(document_id: str, annotation_id: str, request: AnnotationUpdate, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    require_document(db, document_id, current_user.id)
    annotation = get_annotation(db, annotation_id, document_id, current_user.id)
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return update_annotation(db, annotation, request)


@router.delete("/documents/{document_id}/annotations/{annotation_id}", status_code=204)
def remove_annotation(document_id: str, annotation_id: str, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    require_document(db, document_id, current_user.id)
    annotation = get_annotation(db, annotation_id, document_id, current_user.id)
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")
    delete_annotation(db, annotation)


@router.get("/documents/{document_id}/versions", response_model=list[DocumentVersionResponse])
def get_versions(document_id: str, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    require_document(db, document_id, current_user.id)
    return list_versions(db, document_id)


@router.post("/documents/{document_id}/export", response_model=DocumentVersionResponse, status_code=201)
def export_annotations(document_id: str, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    document = require_document(db, document_id, current_user.id)
    annotations = list_annotations(db, document_id)
    if not annotations:
        raise HTTPException(status_code=409, detail="Add an annotation before exporting")
    uploaded_public_id = None
    exported_bytes = None
    try:
        exported_bytes = build_annotated_document(download_cloudinary_asset(document.cloudinary_public_id), annotations)
        if not reserve_storage(db, current_user.id, len(exported_bytes)):
            raise HTTPException(status_code=413, detail="Storage quota exceeded. Delete a document or version before exporting.")
        upload_result = upload_annotated_document(exported_bytes, document.cloudinary_public_id)
        uploaded_public_id = upload_result["public_id"]
        filename = document.filename.removesuffix(".pdf") + "_annotated.pdf"
        return create_version(db, document_id, filename, upload_result, len(exported_bytes))
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        try:
            if uploaded_public_id:
                delete_cloudinary_asset(uploaded_public_id)
        except Exception:
            pass
        finally:
            if exported_bytes is not None:
                release_storage(db, current_user.id, len(exported_bytes))
        raise HTTPException(status_code=502, detail="Could not export the annotated PDF") from exc
