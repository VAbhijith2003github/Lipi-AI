from sqlalchemy.orm import Session
from app.models.schemas import DocumentModel

def create_document_record(db: Session, doc_id: str, filename: str, user_id: str, cloudinary_id: str = None, cloud_url: str = None, page_count: int = 0, chunk_count: int = 0, storage_bytes: int = 0):
    db_doc = DocumentModel(
        id=doc_id,
        filename=filename,
        user_id=user_id,
        cloudinary_public_id=cloudinary_id,
        cloudinary_secure_url=cloud_url,
        cloud_saved=bool(cloudinary_id),
        page_count=page_count,
        chunk_count=chunk_count,
        storage_bytes=storage_bytes,
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc

def get_document(db: Session, doc_id: str, user_id: str):
    return db.query(DocumentModel).filter(DocumentModel.id == doc_id, DocumentModel.user_id == user_id).first()

def get_all_documents(db: Session, user_id: str):
    return db.query(DocumentModel).filter(DocumentModel.user_id == user_id).all()

def mark_cloud_saved(db: Session, doc_id: str, user_id: str, cloudinary_id: str, cloud_url: str):
    doc = get_document(db, doc_id, user_id)
    if doc:
        doc.cloudinary_public_id = cloudinary_id
        doc.cloudinary_secure_url = cloud_url
        doc.cloud_saved = True
        db.commit()
        db.refresh(doc)
    return doc

def delete_document_record(db: Session, doc_id: str, user_id: str):
    doc = get_document(db, doc_id, user_id)
    if doc:
        db.delete(doc)
        db.commit()
        return True
    return False
