from datetime import datetime
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class UserModel(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    
    documents = relationship("DocumentModel", back_populates="owner", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSessionModel", back_populates="owner", cascade="all, delete-orphan")
    usage = relationship("UserUsageModel", back_populates="user", cascade="all, delete-orphan", uselist=False)


class DocumentModel(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, index=True)
    filename = Column(String, index=True)
    user_id = Column(String, ForeignKey("users.id"))
    local_path = Column(String, nullable=True)
    cloudinary_public_id = Column(String, nullable=True)
    cloudinary_secure_url = Column(String, nullable=True)
    cloud_saved = Column(Boolean, default=False)
    page_count = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)
    storage_bytes = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    owner = relationship("UserModel", back_populates="documents")
    chat_sessions = relationship("ChatSessionModel", back_populates="document", cascade="all, delete-orphan")
    annotations = relationship("DocumentAnnotationModel", back_populates="document", cascade="all, delete-orphan")
    versions = relationship("DocumentVersionModel", back_populates="document", cascade="all, delete-orphan")


class DocumentAnnotationModel(Base):
    __tablename__ = "document_annotations"

    id = Column(String, primary_key=True, index=True)
    document_id = Column(String, ForeignKey("documents.id"), index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    page = Column(Integer)
    rects = Column(JSON)
    selected_text = Column(String)
    color = Column(String, default="#ffea00")
    note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    document = relationship("DocumentModel", back_populates="annotations")


class DocumentVersionModel(Base):
    __tablename__ = "document_versions"

    id = Column(String, primary_key=True, index=True)
    document_id = Column(String, ForeignKey("documents.id"), index=True)
    cloudinary_public_id = Column(String)
    cloudinary_secure_url = Column(String)
    filename = Column(String)
    storage_bytes = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("DocumentModel", back_populates="versions")


class UserUsageModel(Base):
    __tablename__ = "user_usages"

    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    storage_bytes_used = Column(Integer, default=0, nullable=False)
    api_calls_used = Column(Integer, default=0, nullable=False)
    api_calls_period_start = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("UserModel", back_populates="usage")

class ChatSessionModel(Base):
    __tablename__ = "chat_sessions"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"))
    document_id = Column(String, ForeignKey("documents.id"))
    title = Column(String, default="New Chat")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("UserModel", back_populates="chat_sessions")
    document = relationship("DocumentModel", back_populates="chat_sessions")
    messages = relationship("ChatMessageModel", back_populates="session", cascade="all, delete-orphan")

class ChatMessageModel(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("chat_sessions.id"))
    role = Column(String)  # "user" or "model"
    content = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ChatSessionModel", back_populates="messages")

# Pydantic Schemas for API
class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: EmailStr

class Token(BaseModel):
    access_token: str
    token_type: str

class DocumentResponse(BaseModel):
    document_id: str
    filename: str
    cloud_url: str | None = None
    page_count: int
    chunk_count: int
    created_at: datetime

class AnnotationRect(BaseModel):
    left: float = Field(ge=0, le=1)
    top: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)

class AnnotationCreate(BaseModel):
    page: int = Field(gt=0)
    rects: list[AnnotationRect] = Field(min_length=1, max_length=100)
    selected_text: str = Field(min_length=1, max_length=10_000)
    color: str = Field(default="#ffea00", pattern=r"^#[0-9a-fA-F]{6}$")
    note: str | None = Field(default=None, max_length=2_000)

class AnnotationUpdate(BaseModel):
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    note: str | None = Field(default=None, max_length=2_000)

class AnnotationResponse(AnnotationCreate):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class DocumentVersionResponse(BaseModel):
    id: str
    filename: str
    created_at: datetime

    class Config:
        from_attributes = True


class UsageResponse(BaseModel):
    storage_bytes_used: int
    storage_bytes_limit: int
    api_calls_used: int
    api_calls_limit: int
    api_calls_period_start: datetime


class QueryRequest(BaseModel):
    document_id: str
    question: str

class SourceSchema(BaseModel):
    document_id: str
    filename: str
    page: int | None = None
    content: str

class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceSchema]

class ChatSessionCreate(BaseModel):
    document_id: str
    title: str | None = "New Chat"

class ChatSessionResponse(BaseModel):
    id: str
    document_id: str
    title: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ChatMessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True

class ChatQueryRequest(BaseModel):
    question: str
