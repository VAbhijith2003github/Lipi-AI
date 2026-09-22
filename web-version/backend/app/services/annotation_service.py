import uuid

from sqlalchemy.orm import Session

from app.models.schemas import DocumentAnnotationModel, DocumentVersionModel


def list_annotations(db: Session, document_id: str):
    return db.query(DocumentAnnotationModel).filter(
        DocumentAnnotationModel.document_id == document_id
    ).order_by(DocumentAnnotationModel.created_at.asc()).all()


def create_annotation(db: Session, document_id: str, user_id: str, annotation):
    item = DocumentAnnotationModel(
        id=f"annotation_{uuid.uuid4().hex[:12]}",
        document_id=document_id,
        user_id=user_id,
        page=annotation.page,
        rects=[rect.model_dump() for rect in annotation.rects],
        selected_text=annotation.selected_text,
        color=annotation.color,
        note=annotation.note,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_annotation(db: Session, annotation_id: str, document_id: str, user_id: str):
    return db.query(DocumentAnnotationModel).filter(
        DocumentAnnotationModel.id == annotation_id,
        DocumentAnnotationModel.document_id == document_id,
        DocumentAnnotationModel.user_id == user_id,
    ).first()


def update_annotation(db: Session, item, update):
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


def delete_annotation(db: Session, item):
    db.delete(item)
    db.commit()


def create_version(db: Session, document_id: str, filename: str, upload_result, storage_bytes: int):
    version = DocumentVersionModel(
        id=f"version_{uuid.uuid4().hex[:12]}",
        document_id=document_id,
        filename=filename,
        cloudinary_public_id=upload_result["public_id"],
        cloudinary_secure_url=upload_result["secure_url"],
        storage_bytes=storage_bytes,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


def list_versions(db: Session, document_id: str):
    return db.query(DocumentVersionModel).filter(
        DocumentVersionModel.document_id == document_id
    ).order_by(DocumentVersionModel.created_at.desc()).all()


def get_version(db: Session, version_id: str, document_id: str):
    return db.query(DocumentVersionModel).filter(
        DocumentVersionModel.id == version_id,
        DocumentVersionModel.document_id == document_id,
    ).first()
