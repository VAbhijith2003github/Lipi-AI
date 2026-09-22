import uuid
from sqlalchemy.orm import Session
from app.models.schemas import ChatSessionModel, ChatMessageModel

def create_chat_session(db: Session, user_id: str, document_id: str, title: str = "New Chat") -> ChatSessionModel:
    session_id = f"session_{uuid.uuid4().hex[:8]}"
    db_session = ChatSessionModel(
        id=session_id,
        user_id=user_id,
        document_id=document_id,
        title=title
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session

def get_chat_sessions(db: Session, user_id: str, document_id: str | None = None):
    q = db.query(ChatSessionModel).filter(ChatSessionModel.user_id == user_id)
    if document_id:
        q = q.filter(ChatSessionModel.document_id == document_id)
    return q.order_by(ChatSessionModel.created_at.desc()).all()

def get_chat_session(db: Session, session_id: str, user_id: str):
    return db.query(ChatSessionModel).filter(
        ChatSessionModel.id == session_id,
        ChatSessionModel.user_id == user_id
    ).first()

def get_chat_history(db: Session, session_id: str, user_id: str):
    # Verify session belongs to user
    session = get_chat_session(db, session_id, user_id)
    if not session:
        return None
    return db.query(ChatMessageModel).filter(ChatMessageModel.session_id == session_id).order_by(ChatMessageModel.created_at.asc()).all()

def add_message_to_session(db: Session, session_id: str, role: str, content: str) -> ChatMessageModel:
    msg_id = f"msg_{uuid.uuid4().hex[:8]}"
    db_msg = ChatMessageModel(
        id=msg_id,
        session_id=session_id,
        role=role,
        content=content
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    return db_msg
