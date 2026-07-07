"""Auth 라우터"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.services.auth import hash_password, verify_password, generate_token

router = APIRouter(prefix="/api/auth", tags=["Auth"])


# ── Pydantic 모델 ─────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=4, max_length=50)
    name: Optional[str] = None
    age_group: Optional[str] = None
    gender: Optional[str] = None
    country: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class GoogleLoginRequest(BaseModel):
    credential: str


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    age_group: Optional[str] = None
    gender: Optional[str] = None
    country: Optional[str] = None


def _user_dict(user: User) -> dict:
    return {
        "username": user.username, "role": user.role,
        "email": user.email, "name": user.name, "age_group": user.age_group,
        "gender": user.gender, "country": user.country, "avatar_url": user.avatar_url,
    }


# ── 엔드포인트 ────────────────────────────────────────────────────────

@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.username == req.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")
    new_user = User(
        username=req.username, hashed_password=hash_password(req.password),
        name=req.name, age_group=req.age_group, gender=req.gender, country=req.country,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    token = generate_token({"user_id": str(new_user.id)})
    return {"access_token": token, "token_type": "bearer", "user": _user_dict(new_user)}


@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()
    if not user or not user.hashed_password or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid username or password")
    token = generate_token({"user_id": str(user.id)})
    return {"access_token": token, "token_type": "bearer", "user": _user_dict(user)}


@router.get("/me")
async def me(current_user: Optional[User] = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return _user_dict(current_user)


@router.get("/config")
async def get_auth_config():
    from app.config import settings
    return {"google_client_id": settings.GOOGLE_OAUTH_KEY or ""}


@router.post("/oauth/google")
async def google_oauth_login(req: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    from google.oauth2 import id_token
    from google.auth.transport import requests
    from app.config import settings

    client_id = settings.GOOGLE_OAUTH_KEY
    if not client_id:
        raise HTTPException(status_code=500, detail="Google Client ID is not configured on the server.")
    try:
        idinfo = id_token.verify_oauth2_token(req.credential, requests.Request(), client_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Google token: {str(e)}")

    oauth_id = idinfo.get("sub")
    email = idinfo.get("email")
    name = idinfo.get("name")
    avatar_url = idinfo.get("picture")

    if not oauth_id:
        raise HTTPException(status_code=400, detail="OAuth ID (sub) not provided in Google token.")

    result = await db.execute(select(User).where(User.oauth_id == oauth_id))
    user = result.scalar_one_or_none()

    if not user and email:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            user.oauth_provider = "google"
            user.oauth_id = oauth_id
            if not user.avatar_url:
                user.avatar_url = avatar_url
            if not user.name:
                user.name = name
            db.add(user)
            await db.commit()
            await db.refresh(user)

    if not user:
        base_username = email.split("@")[0] if email else f"google_{oauth_id[:8]}"
        username = base_username
        suffix = 1
        while True:
            if not (await db.execute(select(User).where(User.username == username))).scalar_one_or_none():
                break
            username = f"{base_username}_{suffix}"
            suffix += 1
        user = User(
            username=username, hashed_password=None, email=email,
            oauth_provider="google", oauth_id=oauth_id,
            avatar_url=avatar_url, name=name, role="member"
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = generate_token({"user_id": str(user.id)})
    return {"access_token": token, "token_type": "bearer", "user": _user_dict(user)}


@router.put("/profile")
async def update_profile(
    req: ProfileUpdateRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    for field in ("name", "age_group", "gender", "country"):
        val = getattr(req, field)
        if val is not None:
            setattr(current_user, field, val)
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return {"status": "success", "user": _user_dict(current_user)}


