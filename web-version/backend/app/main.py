from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import upload, query, save, documents, auth, chat, usage
from app.database import init_db
from app.config import settings

app = FastAPI(title="Lipi Backend API", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
@app.on_event("startup")
def on_startup():
    init_db()

# Include routers
app.include_router(upload.router, tags=["Documents"])
app.include_router(save.router, tags=["Documents"])
app.include_router(query.router, tags=["Query"])
app.include_router(documents.router, tags=["Documents"])
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(chat.router)
app.include_router(usage.router, tags=["Usage"])

@app.get("/health", tags=["System"])
def health_check():
    return {"status": "ok"}
