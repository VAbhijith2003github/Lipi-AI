import os
import uuid
import tempfile
import cloudinary
import cloudinary.uploader
from cloudinary.utils import private_download_url
import fitz
import requests
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.config import settings
from app.rag.vectorstore import get_vectorstore

# Configure Cloudinary
cloudinary.config(
    cloud_name=settings.cloudinary_cloud_name,
    api_key=settings.cloudinary_api_key,
    api_secret=settings.cloudinary_api_secret,
    secure=True
)

async def process_and_ingest(file_bytes: bytes, filename: str):
    doc_id = f"doc_{uuid.uuid4().hex[:8]}"
    
    # 1. Save locally to a temp file for Cloudinary and PyMuPDF
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name
        
    cloudinary_public_id = None
    vectorstore = None
    try:
        # 2. Upload to Cloudinary
        upload_result = cloudinary.uploader.upload(
            tmp_path,
            resource_type="raw",
            folder="lipi/documents"
        )
        cloudinary_public_id = upload_result.get("public_id")
        cloudinary_secure_url = upload_result.get("secure_url")

        # 3. Extract text
        loader = PyMuPDFLoader(tmp_path)
        documents = loader.load()
        page_count = len(documents)

        # Enhance metadata
        for i, doc in enumerate(documents):
            doc.metadata["document_id"] = doc_id
            doc.metadata["filename"] = filename
            doc.metadata["page"] = i + 1

        # 4. Chunk text
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200
        )
        chunks = splitter.split_documents(documents)
        chunk_count = len(chunks)

        # 5. Embed and store in Qdrant
        vectorstore = get_vectorstore()
        vectorstore.add_documents(chunks)

        return {
            "document_id": doc_id,
            "cloudinary_public_id": cloudinary_public_id,
            "cloudinary_secure_url": cloudinary_secure_url,
            "page_count": page_count,
            "chunk_count": chunk_count
        }
    except Exception:
        if vectorstore:
            try:
                from qdrant_client.http import models
                vectorstore.client.delete(
                    collection_name=vectorstore.collection_name,
                    points_selector=models.FilterSelector(
                        filter=models.Filter(
                            must=[models.FieldCondition(
                                key="metadata.document_id",
                                match=models.MatchValue(value=doc_id),
                            )]
                        )
                    ),
                )
            except Exception:
                pass
        if cloudinary_public_id:
            delete_cloudinary_asset(cloudinary_public_id)
        raise
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

def delete_cloudinary_asset(public_id: str):
    if public_id:
        cloudinary.uploader.destroy(public_id, resource_type="raw")

def download_cloudinary_asset(public_id: str) -> bytes:
    url = private_download_url(public_id, "pdf", resource_type="raw", type="upload")
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    return response.content

def build_annotated_document(file_bytes: bytes, annotations) -> bytes:
    pdf = fitz.open(stream=file_bytes, filetype="pdf")
    try:
        for annotation in annotations:
            if annotation.page > len(pdf):
                continue
            page = pdf[annotation.page - 1]
            page_rect = page.rect
            color = tuple(int(annotation.color[index:index + 2], 16) / 255 for index in (1, 3, 5))
            for saved_rect in annotation.rects:
                rect = fitz.Rect(
                    page_rect.x0 + saved_rect["left"] * page_rect.width,
                    page_rect.y0 + saved_rect["top"] * page_rect.height,
                    page_rect.x0 + (saved_rect["left"] + saved_rect["width"]) * page_rect.width,
                    page_rect.y0 + (saved_rect["top"] + saved_rect["height"]) * page_rect.height,
                )
                pdf_annotation = page.add_highlight_annot(rect)
                pdf_annotation.set_colors(stroke=color)
                pdf_annotation.update()
        return pdf.tobytes(garbage=4, deflate=True)
    finally:
        pdf.close()


def upload_annotated_document(file_bytes: bytes, public_id: str):
    return cloudinary.uploader.upload(
        file_bytes,
        resource_type="raw",
        public_id=f"{public_id}_annotations_{uuid.uuid4().hex[:8]}",
        overwrite=False,
    )


def export_annotated_document(file_bytes: bytes, annotations, public_id: str):
    return upload_annotated_document(build_annotated_document(file_bytes, annotations), public_id)
