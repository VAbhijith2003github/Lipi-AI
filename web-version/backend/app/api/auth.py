from datetime import timedelta
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.schemas import UserModel, UserCreate, UserResponse, Token, UserUsageModel
from app.core.security import get_password_hash, verify_password, create_access_token
from app.config import settings

router = APIRouter()

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(user_in: UserCreate, db: Session = Depends(get_db)):
    email_lower = user_in.email.lower()
    user = db.query(UserModel).filter(UserModel.email == email_lower).first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )
    
    user = UserModel(
        id=f"usr_{uuid.uuid4().hex[:8]}",
        email=email_lower,
        hashed_password=get_password_hash(user_in.password),
    )
    db.add(user)
    db.add(UserUsageModel(user_id=user.id))
    db.commit()
    db.refresh(user)
    return user

@router.post("/login", response_model=Token)
def login_access_token(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    email_lower = form_data.username.lower()
    user = db.query(UserModel).filter(UserModel.email == email_lower).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
        
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": user.id}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}
