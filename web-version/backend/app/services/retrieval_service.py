from app.rag.retriever import get_document_retriever
from app.rag.vectorstore import get_vectorstore

def retrieve_chunks(document_id: str, question: str):
    retriever = get_document_retriever(document_id)
    docs = retriever.invoke(question)
    return docs

def delete_qdrant_vectors(document_id: str):
    vectorstore = get_vectorstore()
    # Qdrant client delete operation based on filter
    from qdrant_client.http import models
    vectorstore.client.delete(
        collection_name=vectorstore.collection_name,
        points_selector=models.FilterSelector(
            filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="metadata.document_id",
                        match=models.MatchValue(value=document_id),
                    )
                ]
            )
        )
    )
