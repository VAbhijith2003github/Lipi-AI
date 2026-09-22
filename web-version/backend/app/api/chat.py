import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import get_current_user
from app.models.schemas import UserModel, ChatSessionCreate, ChatSessionResponse, ChatMessageResponse, ChatQueryRequest, QueryResponse, SourceSchema
from app.services import chat_service
from app.services.document_service import get_document
from app.services.retrieval_service import retrieve_chunks
from app.services.llm_service import generate_answer
from app.services.usage_service import reserve_ai_call

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

@router.post("/sessions", response_model=ChatSessionResponse)
def create_session(
    request: ChatSessionCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    # Verify doc exists (any user's doc is fine — Qdrant scopes by document_id)
    doc = get_document(db, request.document_id, current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    session = chat_service.create_chat_session(db, current_user.id, request.document_id, request.title)
    return session

@router.get("/sessions", response_model=list[ChatSessionResponse])
def get_sessions(
    document_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    sessions = chat_service.get_chat_sessions(db, current_user.id, document_id=document_id)
    return sessions

@router.get("/sessions/{session_id}", response_model=list[ChatMessageResponse])
def get_session_history(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    history = chat_service.get_chat_history(db, session_id, current_user.id)
    if history is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return history

@router.post("/sessions/{session_id}/query", response_model=QueryResponse)
def query_session(
    session_id: str,
    request: ChatQueryRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    # Look up session without user_id restriction (session ownership is via doc ownership)
    session = chat_service.get_chat_session(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    history = chat_service.get_chat_history(db, session_id, current_user.id) or []
    
    logger.info(f"Querying session {session_id} for document {session.document_id}. Question: {request.question}")
    
    docs = retrieve_chunks(session.document_id, request.question)
    logger.info(f"Retrieved {len(docs) if docs else 0} chunks.")
    
    if not docs:
        chat_service.add_message_to_session(db, session_id, "user", request.question)
        answer = "This information is not mentioned or provided in the document."
        chat_service.add_message_to_session(db, session_id, "model", answer)
        return QueryResponse(answer=answer, sources=[])
        
    try:
        if not reserve_ai_call(db, current_user.id):
            raise HTTPException(status_code=429, detail="Monthly AI request quota exceeded")
        answer = generate_answer(docs, request.question, chat_history=history)
        
        chat_service.add_message_to_session(db, session_id, "user", request.question)
        chat_service.add_message_to_session(db, session_id, "model", answer)
        
        sources = []
        for d in docs:
            sources.append(SourceSchema(
                document_id=d.metadata.get("document_id", ""),
                filename=d.metadata.get("filename", ""),
                page=d.metadata.get("page"),
                content=d.page_content
            ))
            
        return QueryResponse(answer=answer, sources=sources)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in chat query endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
