from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.schemas import UsageResponse, UserModel
from app.services.usage_service import get_usage_snapshot

router = APIRouter()


@router.get("/usage", response_model=UsageResponse)
def get_usage(db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    return get_usage_snapshot(db, current_user.id)
