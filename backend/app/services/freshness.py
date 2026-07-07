"""
Freshness Tier 로직 (마스터 플랜 §1.1)

영상 연령에 따라 갱신 주기를 차등 적용하여 YouTube API 쿼터를 절약한다.

| Tier     | 영상 연령  | 갱신 주기 |
|----------|-----------|----------|
| HOT      | 0~24h     | 1시간    |
| WARM     | 1~3일     | 3시간    |
| COOL     | 3~7일     | 12시간   |
| COLD     | 7~30일    | 24시간   |
| ARCHIVED | 30일 초과 | 갱신 중단 |
"""
from datetime import datetime, timedelta, timezone

TIER_INTERVALS: dict[str, timedelta] = {
    "HOT": timedelta(hours=1),
    "WARM": timedelta(hours=3),
    "COOL": timedelta(hours=12),
    "COLD": timedelta(hours=24),
}


def calc_freshness_tier(published_at: datetime) -> str:
    """영상 발행일 기준으로 freshness tier를 계산한다."""
    age = datetime.now(timezone.utc) - published_at

    if age < timedelta(days=1):
        return "HOT"
    elif age < timedelta(days=3):
        return "WARM"
    elif age < timedelta(days=7):
        return "COOL"
    elif age < timedelta(days=30):
        return "COLD"
    else:
        return "ARCHIVED"


def calc_next_refresh(published_at: datetime) -> datetime | None:
    """다음 갱신 시각을 계산한다. ARCHIVED인 경우 None 반환."""
    tier = calc_freshness_tier(published_at)

    if tier == "ARCHIVED":
        return None

    interval = TIER_INTERVALS[tier]
    return datetime.now(timezone.utc) + interval


def update_video_freshness(video) -> None:
    """Video ORM 객체의 freshness_tier와 next_refresh_at을 갱신한다."""
    tier = calc_freshness_tier(video.published_at)
    video.freshness_tier = tier

    next_refresh = calc_next_refresh(video.published_at)
    if next_refresh is not None:
        video.next_refresh_at = next_refresh
