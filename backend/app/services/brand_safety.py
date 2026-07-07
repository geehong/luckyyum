"""브랜드 안전 필터 서비스 (T45)

점수 범위: 0.0 (완전 안전) ~ 1.0 (매우 위험)
  < 0.3  → safe      (자동 승인)
  0.3~0.7 → flagged   (운영자 검토 큐)
  > 0.7  → hidden    (자동 숨김 + 운영자 확인)
"""

# ── 키워드 사전 ──────────────────────────────────────────────────────
# 욕설/혐오 (한국어 + 영어 주요 표현)
_HARD_BLOCK = {
    # 한국어 욕설 (주요 표현만 포함, 실제 운영 시 korcen 라이브러리로 확장)
    "씨발", "시발", "ㅅㅂ", "개새끼", "병신", "지랄", "엿같", "꺼져", "죽어",
    "썅", "존나", "ㅈㄴ", "ㄲㅈ", "닥쳐", "미친놈", "미친년",
    # 영어 욕설
    "fuck", "shit", "bitch", "nigger", "nigga", "faggot", "cunt",
    # 혐오/차별
    "혐오", "학살", "테러", "폭탄", "자살방법", "자살하는법",
}

# 주의 키워드 (단독으로는 낮은 점수, 복합 시 상승)
_SOFT_FLAG = {
    "섹스", "야동", "성인", "노출", "불법", "사기", "도박",
    "마약", "대마", "코카인", "총기", "칼부림",
    "sex", "porn", "nude", "naked", "drugs", "gambling",
}

# 안전한 맥락 예외어 (이 단어가 같이 있으면 감점)
_SAFE_CONTEXT = {
    "교육", "뉴스", "다큐", "예방", "prevention", "education", "awareness",
}


def compute_safety_score(title: str, description: str = "", tags: list[str] | None = None) -> float:
    """제목·설명·태그를 분석해 0.0~1.0 안전 점수를 반환한다.

    점수가 높을수록 위험하다.
    """
    tags = tags or []
    # 모든 텍스트를 소문자로 합침
    combined = " ".join([title, description] + tags).lower()

    score = 0.0

    # Hard block 키워드: 하나만 있어도 즉시 hidden 임계값(0.8) 이상
    for kw in _HARD_BLOCK:
        if kw in combined:
            score += 0.8
            if score >= 1.0:
                return 1.0

    # Soft flag 키워드: 발견 시 0.2씩 가산
    for kw in _SOFT_FLAG:
        if kw in combined:
            score += 0.2
            if score >= 1.0:
                return 1.0

    # 안전 맥락 예외어가 있으면 점수 절반으로 감소
    if score > 0:
        for kw in _SAFE_CONTEXT:
            if kw in combined:
                score *= 0.5
                break

    return min(score, 1.0)


def determine_safety_status(score: float) -> str:
    """점수를 safety_status 문자열로 변환한다."""
    if score >= 0.7:
        return "hidden"
    if score >= 0.3:
        return "flagged"
    return "safe"


def apply_safety(video) -> None:
    """Video ORM 객체에 safety_score / safety_status를 인플레이스 업데이트한다.

    이미 운영자가 수동으로 검토한 경우('safe'/'banned')는 덮어쓰지 않는다.
    """
    # 운영자가 이미 최종 결정한 상태는 건드리지 않음
    if video.safety_status in ("banned",):
        return

    score = compute_safety_score(
        title=video.title or "",
        description=video.description or "",
        tags=list(video.tags or []),
    )
    status = determine_safety_status(score)

    video.safety_score = score
    # 이미 운영자가 'safe'로 확정한 것도 재평가하지 않음
    if video.safety_status != "safe":
        video.safety_status = status
