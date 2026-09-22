from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import get_current_user
from app.models.schemas import QueryRequest, QueryResponse, SourceSchema, UserModel
from app.services.document_service import get_document
from app.services.retrieval_service import retrieve_chunks
from app.services.llm_service import generate_answer
from app.services.usage_service import reserve_ai_call

router = APIRouter()

@router.post("/query", response_model=QueryResponse)
def query_document(
    request: QueryRequest, 
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    doc = get_document(db, request.document_id, current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    try:
        docs = retrieve_chunks(request.document_id, request.question)
        
        if not docs:
            return QueryResponse(answer="This information is not mentioned or provided in the document.", sources=[])
        if not reserve_ai_call(db, current_user.id):
            raise HTTPException(status_code=429, detail="Monthly AI request quota exceeded")
        answer = generate_answer(docs, request.question)
        
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
        raise HTTPException(status_code=500, detail=str(e))
