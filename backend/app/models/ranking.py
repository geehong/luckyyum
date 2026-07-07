import uuid
from datetime import datetime
from sqlalchemy import BigInteger, String, Float, Integer, ForeignKey, DateTime, func, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base

class PetRanking(Base):
    __tablename__ = "pet_rankings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    pet_nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    pet_tier: Mapped[int] = mapped_column(Integer, nullable=False, default=1) # 1: Egg, 2: Baby, etc.
    pet_mbti: Mapped[str] = mapped_column(String(10), nullable=False)
    care_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    last_care_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 관계 설정
    user = relationship("User", back_populates="pet_rankings")