"""랭킹 알고리즘 단위 테스트 (T49)"""
import math
from datetime import datetime, timezone, timedelta

import pytest

from app.services.ranking import (
    calculate_z_score,
    calculate_decay,
    compute_final_score,
    compute_rising_score,
)


# ── calculate_z_score ────────────────────────────────────────────────

def test_zscore_mean_is_zero():
    """평균값의 Z-score는 0이어야 한다."""
    assert calculate_z_score(5.0, 5.0, 2.0) == 0.0


def test_zscore_positive_above_mean():
    """평균보다 높으면 양수."""
    assert calculate_z_score(7.0, 5.0, 2.0) == pytest.approx(1.0)


def test_zscore_negative_below_mean():
    """평균보다 낮으면 음수."""
    assert calculate_z_score(3.0, 5.0, 2.0) == pytest.approx(-1.0)


def test_zscore_zero_std_returns_zero():
    """표준편차 0(모든 값이 동일)이면 0 반환 (ZeroDivision 방지)."""
    assert calculate_z_score(100.0, 100.0, 0.0) == 0.0


# ── calculate_decay ──────────────────────────────────────────────────

def test_decay_fresh_video_near_one():
    """방금 올린 영상(1분 전)의 감쇠 계수는 1에 가까워야 한다."""
    just_now = datetime.now(timezone.utc) - timedelta(minutes=1)
    decay = calculate_decay(just_now)
    assert decay > 0.99


def test_decay_old_video_lower_than_fresh():
    """오래된 영상이 새 영상보다 감쇠 계수가 낮아야 한다."""
    fresh = datetime.now(timezone.utc) - timedelta(hours=1)
    old = datetime.now(timezone.utc) - timedelta(days=7)
    assert calculate_decay(fresh) > calculate_decay(old)


def test_decay_half_life():
    """half_life_hours 경과 시 감쇠 계수가 정확히 0.5여야 한다."""
    half_life = 168.0
    old = datetime.now(timezone.utc) - timedelta(hours=half_life)
    decay = calculate_decay(old, half_life_hours=half_life)
    assert decay == pytest.approx(0.5, abs=0.01)


def test_decay_naive_datetime_handled():
    """naive datetime(tzinfo 없음)도 처리돼야 한다 (에러 없음)."""
    naive = datetime.utcnow() - timedelta(hours=24)
    decay = calculate_decay(naive)
    assert 0 < decay < 1


# ── compute_final_score ──────────────────────────────────────────────

def test_final_score_decay_reduces_score():
    """decay 계수가 낮을수록 최종 점수가 낮아야 한다."""
    score_fresh = compute_final_score(1.0, 1.0, 1.0, decay_factor=1.0)
    score_old = compute_final_score(1.0, 1.0, 1.0, decay_factor=0.5)
    assert score_fresh > score_old


def test_final_score_comment_weight_highest():
    """댓글 Z-score 가중치(1.5)가 조회수(1.0)보다 높아야 한다."""
    # 동일한 Z-score(2.0)에서 댓글(가중치 1.5)이 조회수(가중치 1.0)보다 높아야 함
    score_views = compute_final_score(view_z=2.0, like_z=0.0, comment_z=0.0, decay_factor=1.0)
    score_comments = compute_final_score(view_z=0.0, like_z=0.0, comment_z=2.0, decay_factor=1.0)
    assert score_comments > score_views


def test_final_score_all_zero():
    """모든 Z-score가 0이면 최종 점수도 0이어야 한다."""
    assert compute_final_score(0.0, 0.0, 0.0, 1.0) == 0.0


# ── compute_rising_score ─────────────────────────────────────────────

def test_rising_score_faster_is_higher():
    """같은 조회수라도 더 최근에 올린 영상의 Rising 점수가 높아야 한다."""
    now = datetime.now(timezone.utc)
    newer = now - timedelta(hours=2)
    older = now - timedelta(hours=48)
    score_new = compute_rising_score(1_000_000, 10_000, newer)
    score_old = compute_rising_score(1_000_000, 10_000, older)
    assert score_new > score_old


def test_rising_score_positive():
    """Rising 점수는 양수여야 한다."""
    pub = datetime.now(timezone.utc) - timedelta(hours=6)
    score = compute_rising_score(500_000, 5_000, pub)
    assert score > 0
