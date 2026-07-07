import math
from datetime import datetime, timezone
from typing import List


def calculate_z_score(value: float, mean: float, std: float) -> float:
    if std == 0:
        return 0.0
    return (value - mean) / std


def calculate_decay(published_at: datetime, half_life_hours: float = 168.0) -> float:
    """시간 감쇠 알고리즘 (지수 감쇠).

    Score = Initial * (0.5)^(age / half_life)
    """
    now = datetime.now(timezone.utc)
    if published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)
    age_hours = (now - published_at).total_seconds() / 3600.0
    if age_hours < 0:
        age_hours = 0
    return math.pow(0.5, age_hours / half_life_hours)


def compute_final_score(
    view_z: float,
    like_z: float,
    comment_z: float,
    decay_factor: float,
) -> float:
    """Z-score 합산 후 시간 감쇠 적용.

    가중치: 조회수(1.0), 좋아요(1.2), 댓글(1.5)
    """
    raw_score = (view_z * 1.0) + (like_z * 1.2) + (comment_z * 1.5)
    return raw_score * decay_factor


def compute_rising_score(
    view_count: int,
    like_count: int,
    published_at: datetime,
    freshness_half_life_hours: float = 12.0,
) -> float:
    """Rising Star("New") 점수 = 시간당 조회수(속도) × 좋아요 가중치 × 신선도 감쇠.

    - velocity(시간당 조회수)로 "빠르게 뜨는" 영상을 잡고,
    - freshness 감쇠로 "방금 올라온" 영상에 가중치를 줘서
      누적 조회수만 큰 오래된 영상이 밀려나도록 한다.
    호출 전 48시간 이내 영상으로 필터링하는 것을 전제로 한다.
    """
    now = datetime.now(timezone.utc)
    if published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)

    age_hours = max((now - published_at).total_seconds() / 3600.0, 1.0)
    velocity = view_count / age_hours  # 시간당 조회수

    # 좋아요 비율 보정 (engagagement 높을수록 ×최대 1.5 배)
    engagement_boost = 1.0
    if view_count > 0:
        ratio = like_count / view_count
        engagement_boost = 1.0 + min(ratio * 10, 0.5)  # 최대 1.5배

    # 신선도 감쇠: 갓 올라온 영상일수록 1.0에 가깝고, 오래될수록 빠르게 작아진다.
    freshness = math.pow(0.5, age_hours / freshness_half_life_hours)

    return velocity * engagement_boost * freshness


_GLOBAL_LANG_WEIGHT: dict[str, float] = {
    "en": 1.00, "ko": 0.85, "ja": 0.70, "fr": 0.55, "es": 0.45,
    "pt": 0.35, "hi": 0.12, "id": 0.12, "ur": 0.10, "bn": 0.10,
    "ta": 0.10, "te": 0.10, "mr": 0.10,
}
_GLOBAL_LANG_WEIGHT_DEFAULT = 0.20


def global_lang_weight(video) -> float:
    """GLOBAL 차트용 언어 가중치.

    - 제목 내 비라틴 스크립트로 언어 감지 (힌디·벵골·드라비다·아랍·태국 등)
    - default_language en-IN 명시 태그 감지
    - 그 외는 _GLOBAL_LANG_WEIGHT 테이블 or 기본값 0.20
    """
    import re
    lang = (video.default_language or "")[:2].lower()
    full_lang = (video.default_language or "").lower()
    title = video.title or ""

    if re.search(r'[ऀ-ॿ]', title): return 0.12   # 데바나가리 (힌디 등)
    if re.search(r'[ঀ-৿]', title): return 0.10    # 벵골어
    if re.search(r'[஀-௿ఀ-౿ಀ-೿ഀ-ൿ]', title): return 0.10  # 타밀/텔루구/칸나다/말라얄람
    if re.search(r'[؀-ۿ]', title): return 0.10    # 아랍어/우르두
    if re.search(r'[฀-๿က-႟]', title): return 0.15  # 태국어/미얀마어
    if full_lang.startswith("en-in"):              # 인도 영어 명시 태그
        return 0.12
    return _GLOBAL_LANG_WEIGHT.get(lang, _GLOBAL_LANG_WEIGHT_DEFAULT)


def apply_region_filter(query, region_code: str):
    """지정된 지역(region_code)에 맞는 동영상 필터를 적용한다.
    
    KR, US, JP, IN, BR, GB, TW, DE, FR, MX 등을 지원한다.
    """
    from sqlalchemy import or_
    from app.models.video import Video
    
    region = region_code.upper()
    if region == "GLOBAL":
        return query
        
    lang_map = {
        "KR": ["ko"],
        "US": ["en"],
        "IN": ["hi", "en-IN"],
        "JP": ["ja"],
        "BR": ["pt"],
        "GB": ["en"],
        "TW": ["zh"],
        "DE": ["de"],
        "FR": ["fr"],
        "MX": ["es"],
    }
    
    langs = lang_map.get(region)
    if langs:
        conditions = [Video.default_language.startswith(lang) for lang in langs]
        if region == "KR":
            # 한국의 경우 제목에 한글이 포함된 경우도 인정
            conditions.append(Video.title.op("~")("[\uac00-\ud7a3]"))
        elif region == "JP":
            # 일본의 경우 제목에 일어(히라가나/가타카나)가 포함된 경우도 인정
            conditions.append(Video.title.op("~")("[\u3040-\u30ff]"))
        return query.where(or_(*conditions))
        
    return query