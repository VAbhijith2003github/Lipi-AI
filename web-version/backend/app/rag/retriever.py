from app.rag.vectorstore import get_vectorstore

def get_document_retriever(document_id: str):
    vectorstore = get_vectorstore()
    
    # Qdrant filters correctly by matching the metadata field 'document_id'
    # using LangChain's generic metadata filtering format
    return vectorstore.as_retriever(
        search_kwargs={
            "k": 5,
            "filter": {"document_id": document_id}
        }
    )
