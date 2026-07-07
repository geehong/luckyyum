from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime, timezone

from app.db import get_db
from app.models.ranking import PetRanking
from app.deps import get_current_user

router = APIRouter(prefix="/rankings", tags=["Rankings"])

class SyncRequest(BaseModel):
    pet_nickname: str
    pet_tier: int
    pet_mbti: str
    care_score: int

@router.post("/sync")
async def sync_pet_ranking(req: SyncRequest, user = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PetRanking).where(PetRanking.user_id == user.id))
    ranking = result.scalars().first()
    
    now = datetime.now(timezone.utc)
    
    if ranking:
        # Time travel check
        # Allow max 100 points per hour (3600 seconds)
        if ranking.last_care_time:
            time_diff = (now - ranking.last_care_time).total_seconds()
            score_diff = req.care_score - ranking.care_score
            
            if score_diff > 0 and time_diff > 0:
                max_allowed_score = (time_diff / 3600) * 100 + 50 # buffer 50
                if score_diff > max_allowed_score:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Time travel abuse detected")
        
        ranking.pet_nickname = req.pet_nickname
        ranking.pet_tier = req.pet_tier
        ranking.pet_mbti = req.pet_mbti
        ranking.care_score = req.care_score
        ranking.last_care_time = now
    else:
        new_ranking = PetRanking(
            user_id=user.id,
            pet_nickname=req.pet_nickname,
            pet_tier=req.pet_tier,
            pet_mbti=req.pet_mbti,
            care_score=req.care_score,
            last_care_time=now
        )
        db.add(new_ranking)
        
    await db.commit()
    return {"message": "Pet ranking synchronized successfully"}

@router.get("/")
async def get_global_ranking(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PetRanking)
        .order_by(PetRanking.care_score.desc())
        .limit(100)
    )
    rankings = result.scalars().all()
    
    return {
        "rankings": [
            {
                "pet_nickname": r.pet_nickname,
                "pet_tier": r.pet_tier,
                "pet_mbti": r.pet_mbti,
                "care_score": r.care_score
            } for r in rankings
        ]
    }
