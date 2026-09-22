from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.models.schemas import Base

# Setup SQLAlchemy engine
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def _ensure_column(table_name: str, column_name: str, definition: str):
    columns = {column["name"] for column in inspect(engine).get_columns(table_name)}
    if column_name not in columns:
        with engine.begin() as connection:
            connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"))


def init_db():
    Base.metadata.create_all(bind=engine)
    # The project predates a migration framework. Keep these additive changes safe for existing SQLite/Postgres installs.
    _ensure_column("documents", "storage_bytes", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column("document_versions", "storage_bytes", "INTEGER NOT NULL DEFAULT 0")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
