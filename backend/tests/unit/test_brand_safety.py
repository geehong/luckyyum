"""브랜드 안전 필터 단위 테스트 (T49)"""
import pytest

from app.services.brand_safety import compute_safety_score, determine_safety_status


# ── compute_safety_score ─────────────────────────────────────────────

def test_clean_content_is_safe():
    """욕설 없는 일반 제목은 점수 0이어야 한다."""
    score = compute_safety_score("귀여운 고양이 영상", "고양이가 뛰어놀아요")
    assert score == 0.0


def test_hard_block_keyword_high_score():
    """Hard block 키워드 포함 시 점수 0.7 이상이어야 한다."""
    score = compute_safety_score("씨발 개웃기네", "")
    assert score >= 0.7


def test_english_block_keyword():
    """영어 욕설도 감지해야 한다."""
    score = compute_safety_score("This is fucking crazy", "")
    assert score >= 0.4


def test_soft_flag_keyword_medium_score():
    """Soft flag 키워드 단독은 중간 점수여야 한다."""
    score = compute_safety_score("성인 콘텐츠 주의", "")
    assert 0.1 <= score < 0.7


def test_safe_context_reduces_score():
    """안전 맥락 단어가 있으면 점수가 절반으로 내려가야 한다."""
    score_no_context = compute_safety_score("마약 위험성", "")
    score_with_context = compute_safety_score("마약 위험성", "교육 목적 다큐멘터리")
    assert score_with_context < score_no_context


def test_score_capped_at_one():
    """점수는 최대 1.0을 넘지 않아야 한다."""
    score = compute_safety_score(
        "씨발 fuck shit bitch 개새끼 병신 지랄", "nigger faggot"
    )
    assert score <= 1.0


def test_tags_are_checked():
    """태그에 포함된 욕설도 감지해야 한다."""
    score = compute_safety_score("평범한 제목", "", tags=["#씨발", "funny"])
    assert score >= 0.4


# ── determine_safety_status ──────────────────────────────────────────

@pytest.mark.parametrize("score,expected", [
    (0.0, "safe"),
    (0.29, "safe"),
    (0.3, "flagged"),
    (0.69, "flagged"),
    (0.7, "hidden"),
    (1.0, "hidden"),
])
def test_status_thresholds(score: float, expected: str):
    """점수 임계값별 상태 변환이 정확해야 한다."""
    assert determine_safety_status(score) == expected
