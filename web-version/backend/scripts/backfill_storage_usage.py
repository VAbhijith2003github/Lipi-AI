"""Populate storage quota values for documents that existed before quota tracking.

Run once after deploying the quota feature:
    python scripts/backfill_storage_usage.py
"""

from collections import defaultdict
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal, init_db
from app.models.schemas import DocumentModel, DocumentVersionModel, UserUsageModel
from app.services.ingestion_service import download_cloudinary_asset
from app.services.usage_service import current_period_start


def asset_size(public_id: str | None) -> int:
    return len(download_cloudinary_asset(public_id)) if public_id else 0


def main():
    init_db()
    db = SessionLocal()
    failures = []
    try:
        documents = db.query(DocumentModel).all()
        versions = db.query(DocumentVersionModel).all()
        for item in [*documents, *versions]:
            if item.storage_bytes or not item.cloudinary_public_id:
                continue
            try:
                item.storage_bytes = asset_size(item.cloudinary_public_id)
            except Exception as exc:
                failures.append(f"{item.id}: {exc}")

        db.commit()
        totals = defaultdict(int)
        for document in documents:
            totals[document.user_id] += document.storage_bytes
        document_owners = {document.id: document.user_id for document in documents}
        for version in versions:
            totals[document_owners.get(version.document_id)] += version.storage_bytes

        for user_id, total in totals.items():
            if not user_id:
                continue
            usage = db.get(UserUsageModel, user_id) or UserUsageModel(user_id=user_id, api_calls_period_start=current_period_start())
            usage.storage_bytes_used = total
            db.add(usage)
        db.commit()
    finally:
        db.close()

    if failures:
        raise SystemExit("Could not backfill: " + "; ".join(failures))
    print("Storage usage backfill complete.")


if __name__ == "__main__":
    main()
