from datetime import datetime

from sqlalchemy import case, or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import UserUsageModel


def current_period_start(now: datetime | None = None) -> datetime:
    now = now or datetime.utcnow()
    return datetime(now.year, now.month, 1)


def get_or_create_usage(db: Session, user_id: str) -> UserUsageModel:
    usage = db.get(UserUsageModel, user_id)
    if usage:
        return usage
    usage = UserUsageModel(user_id=user_id, api_calls_period_start=current_period_start())
    db.add(usage)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        usage = db.get(UserUsageModel, user_id)
    return usage


def reserve_storage(db: Session, user_id: str, storage_bytes: int) -> bool:
    if storage_bytes < 0:
        raise ValueError("storage_bytes must be non-negative")
    get_or_create_usage(db, user_id)
    result = db.execute(
        update(UserUsageModel)
        .where(
            UserUsageModel.user_id == user_id,
            UserUsageModel.storage_bytes_used + storage_bytes <= settings.user_storage_limit_bytes,
        )
        .values(storage_bytes_used=UserUsageModel.storage_bytes_used + storage_bytes)
    )
    db.commit()
    return result.rowcount == 1


def release_storage(db: Session, user_id: str, storage_bytes: int):
    if storage_bytes <= 0:
        return
    get_or_create_usage(db, user_id)
    db.execute(
        update(UserUsageModel)
        .where(UserUsageModel.user_id == user_id)
        .values(
            storage_bytes_used=case(
                (UserUsageModel.storage_bytes_used >= storage_bytes, UserUsageModel.storage_bytes_used - storage_bytes),
                else_=0,
            )
        )
    )
    db.commit()


def reserve_ai_call(db: Session, user_id: str) -> bool:
    get_or_create_usage(db, user_id)
    period_start = current_period_start()
    result = db.execute(
        update(UserUsageModel)
        .where(
            UserUsageModel.user_id == user_id,
            or_(
                UserUsageModel.api_calls_period_start.is_(None),
                UserUsageModel.api_calls_period_start != period_start,
                UserUsageModel.api_calls_used < settings.user_ai_call_limit,
            ),
        )
        .values(
            api_calls_period_start=period_start,
            api_calls_used=case(
                (UserUsageModel.api_calls_period_start == period_start, UserUsageModel.api_calls_used + 1),
                else_=1,
            ),
        )
    )
    db.commit()
    return result.rowcount == 1


def get_usage_snapshot(db: Session, user_id: str) -> dict:
    usage = get_or_create_usage(db, user_id)
    period_start = current_period_start()
    api_calls_used = usage.api_calls_used if usage.api_calls_period_start == period_start else 0
    return {
        "storage_bytes_used": usage.storage_bytes_used,
        "storage_bytes_limit": settings.user_storage_limit_bytes,
        "api_calls_used": api_calls_used,
        "api_calls_limit": settings.user_ai_call_limit,
        "api_calls_period_start": period_start,
    }
