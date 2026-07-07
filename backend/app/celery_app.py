"""
Celery 앱 설정

Worker CMD: celery -A app.celery_app worker --loglevel=info --concurrency=2
Beat CMD:   celery -A app.celery_app beat --loglevel=info
"""
from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery_app = Celery(
    "shorts100",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    # 직렬화 설정
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # 타임존 (마스터 플랜 §5)
    timezone="Asia/Seoul",
    enable_utc=True,

    # Worker 안정성
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,

    # 태스크 모듈 자동 발견
    include=["app.crawlers.tasks"],

    # Beat 스케줄
    beat_schedule={
        # ── Key1: 실시간(4h 창) — 0,4,8,12,16,20시 ──────────────────────────
        # 6회/일: 최근 4시간 신규 TOP 100 → chart_type='real' (GLOBAL 포함)
        # Key1 소모: 200 units × 6회 = 1,200 units/일
        "collect-realtime": {
            "task": "app.crawlers.tasks.collect_realtime_shorts",
            "schedule": crontab(hour="0,4,8,12,16,20", minute=0),
        },
        # ── Key1: 일간(24h 창) — 홀수 시간 0분 ──────────────────────────────
        # 1,3,5...23시: 최근 24시간 신규 TOP 100 → chart_type='daily'
        # Key1 소모: 200 units × 12회 = 2,400 units/일
        "collect-daily": {
            "task": "app.crawlers.tasks.collect_daily_shorts",
            "schedule": crontab(hour="1,3,5,7,9,11,13,15,17,19,21,23", minute=0),
        },
        # ── Key2: 글로벌 전체기간 — 매시간 30분 ──────────────────────────────
        # 전체기간 TOP 100, backfill_limit 도달 시 업데이트 전용
        # Key2 소모: 200 units × 24회 = 4,800 units/일
        "collect-global": {
            "task": "app.crawlers.tasks.collect_global_shorts",
            "schedule": crontab(minute=30),
        },
        # ── 통계 갱신 (5분마다) ───────────────────────────────────────────────
        "refresh-video-stats": {
            "task": "app.crawlers.tasks.refresh_video_stats",
            "schedule": crontab(minute="*/5"),
        },
        # ── 랭킹 계산 폴백 (30분마다) ─────────────────────────────────────────
        "compute-rankings-fallback": {
            "task": "app.crawlers.tasks.compute_global_rankings",
            "schedule": crontab(minute="*/30"),
        },
        "compute-rising-rankings-fallback": {
            "task": "app.crawlers.tasks.compute_rising_rankings",
            "schedule": crontab(minute="*/30"),
        },
        "compute-category-rankings-fallback": {
            "task": "app.crawlers.tasks.compute_category_rankings",
            "schedule": crontab(minute="*/30"),
        },
        # ── 오늘 delta 랭킹 (30분마다) ───────────────────────────────────────
        "compute-today-delta-rankings": {
            "task": "app.crawlers.tasks.compute_today_delta_rankings",
            "schedule": crontab(minute="*/30"),
        },
        # ── 일간+주간+월간 차트 스냅샷 (KST 자정 00:00) ──────────────────────
        # daily(어제) + weekly(7일 rolling) + monthly(30일 rolling) 동시 저장
        "daily-chart-snapshot": {
            "task": "app.crawlers.tasks.daily_chart_snapshot",
            "schedule": crontab(hour=0, minute=0),
        },
    },
)
