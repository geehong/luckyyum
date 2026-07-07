"""
YouTube 수집 Celery 태스크

- collect_trending_shorts: 1시간마다 트렌딩 Shorts 수집
- refresh_video_stats: 5분마다 갱신 대상 영상 통계 배치 갱신
"""
import logging
from datetime import datetime, timezone, timedelta
import asyncio
import statistics
from sqlalchemy import create_engine, select, delete
from sqlalchemy.orm import sessionmaker, Session

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

from app.celery_app import celery_app
from app.config import settings
from app.crawlers.youtube_client import YouTubeClient
from app.services.freshness import update_video_freshness
from app.services.brand_safety import apply_safety
from app.services.ranking import calculate_z_score, calculate_decay, compute_final_score, compute_rising_score
from app.core.cache import cache
from sqlalchemy.orm import selectinload


def _make_async_session():
    """Celery 태스크마다 새 이벤트 루프에서 안전하게 사용하도록 NullPool 엔진을 반환한다."""
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    return async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

logger = logging.getLogger(__name__)

# Celery Worker는 동기 코드이므로 동기 엔진 사용
# asyncpg URL을 psycopg2용으로 변환
_sync_url = settings.DATABASE_URL.replace(
    "postgresql+asyncpg://", "postgresql://"
)
_engine = create_engine(_sync_url, echo=False, pool_pre_ping=True)
SyncSession = sessionmaker(bind=_engine)


def _get_or_create_channel(session: Session, channel_data: dict):
    """채널을 upsert하고 ORM 객체를 반환한다."""
    from app.models import Channel, PlatformEnum

    channel = session.execute(
        select(Channel).where(
            Channel.platform == PlatformEnum.youtube,
            Channel.platform_id == channel_data["platform_id"],
        )
    ).scalar_one_or_none()

    if channel is None:
        channel = Channel(
            platform=PlatformEnum.youtube,
            platform_id=channel_data["platform_id"],
            handle=channel_data.get("handle"),
            title=channel_data["title"],
            thumbnail_url=channel_data.get("thumbnail_url"),
            description=channel_data.get("description"),
            subscriber_count=channel_data.get("subscriber_count", 0),
            video_count=channel_data.get("video_count", 0),
            view_count=channel_data.get("view_count", 0),
            published_at=channel_data.get("published_at"),
        )
        session.add(channel)
        session.flush()
        logger.info("새 채널 저장: %s (ID: %d)", channel.title, channel.id)
    else:
        # 기존 채널 통계 업데이트
        channel.subscriber_count = channel_data.get("subscriber_count", channel.subscriber_count)
        channel.video_count = channel_data.get("video_count", channel.video_count)
        channel.view_count = channel_data.get("view_count", channel.view_count)
        channel.thumbnail_url = channel_data.get("thumbnail_url", channel.thumbnail_url)

    return channel


# 유튜브 categoryId -> CategoryEnum 매핑 사전
YOUTUBE_CATEGORY_MAP = {
    "1": "other",          # Film & Animation
    "2": "other",          # Autos & Vehicles
    "10": "music",         # Music
    "15": "other",         # Pets & Animals
    "17": "sports",        # Sports
    "18": "other",         # Short Movies
    "19": "other",         # Travel & Events
    "20": "gaming",        # Gaming
    "21": "other",         # Videoblogging
    "22": "people",        # People & Blogs
    "23": "comedy",        # Comedy
    "24": "entertainment", # Entertainment
    "25": "news",          # News & Politics
    "26": "other",         # Howto & Style (people or other)
    "27": "education",     # Education
    "28": "education",     # Science & Technology
    "29": "other",         # Nonprofits & Activism
    "30": "other",         # Movies
    "31": "other",         # Anime/Animation
}


def _upsert_video(session: Session, video_data: dict, channel_id: int):
    """영상을 upsert하고 freshness tier를 갱신한다."""
    from app.models import Video, CategoryEnum

    video = session.execute(
        select(Video).where(
            Video.platform_video_id == video_data["platform_video_id"]
        )
    ).scalar_one_or_none()

    # 유튜브 category_id를 CategoryEnum으로 매핑
    category_id_str = video_data.get("category_id")
    category_val = YOUTUBE_CATEGORY_MAP.get(category_id_str)
    category_enum = CategoryEnum(category_val) if category_val else None

    if video is None:
        video = Video(
            channel_id=channel_id,
            platform_video_id=video_data["platform_video_id"],
            title=video_data["title"],
            description=video_data.get("description"),
            thumbnail_url=video_data.get("thumbnail_url"),
            duration_sec=video_data.get("duration_sec"),
            view_count=video_data.get("view_count", 0),
            like_count=video_data.get("like_count", 0),
            comment_count=video_data.get("comment_count", 0),
            is_short=video_data.get("is_short", True),
            published_at=video_data["published_at"],
            tags=video_data.get("tags") or [],
            default_language=video_data.get("default_language"),
            region_blocked=video_data.get("region_blocked"),
            category=category_enum,
            status="active",
        )
        session.add(video)
        session.flush()
        logger.info("새 영상 저장: %s (ID: %d)", video.title, video.id)
    else:
        # 기존 영상 통계 업데이트
        video.view_count = video_data.get("view_count", video.view_count)
        video.like_count = video_data.get("like_count", video.like_count)
        video.comment_count = video_data.get("comment_count", video.comment_count)
        video.title = video_data.get("title", video.title)
        video.thumbnail_url = video_data.get("thumbnail_url", video.thumbnail_url)
        video.category = category_enum
        video.status = "active"

    # Freshness tier 갱신 (T27)
    update_video_freshness(video)

    # 브랜드 안전 점수 산정 (T45)
    apply_safety(video)

    return video


def _filter_existing_video_ids(video_ids: list[str]) -> list[str]:
    """이미 DB에 존재하는 영상 ID들을 제외하고 신규 영상 ID 목록만 반환한다."""
    from app.models import Video
    if not video_ids:
        return []
    with SyncSession() as session:
        existing = session.execute(
            select(Video.platform_video_id).where(Video.platform_video_id.in_(video_ids))
        ).scalars().all()
        existing_set = set(existing)
        return [vid for vid in video_ids if vid not in existing_set]


def _collect_shorts(
    label: str,
    region_code: str | None = None,
    published_after: datetime | None = None,
    max_results: int = 50,
    client: YouTubeClient | None = None,
) -> dict:
    """공통 수집 로직. 다양한 조건으로 재사용.

    client를 넘기면 해당 클라이언트(Key 지정)를 사용한다.
    """
    logger.info("=== Shorts 수집 시작 [%s] ===", label)

    if client is None:
        try:
            client = YouTubeClient()
        except ValueError as e:
            logger.error("YouTube 클라이언트 초기화 실패: %s", e)
            return {"status": "error", "message": str(e)}

    video_items, all_trending_ids = client.fetch_trending_videos(
        region_code=region_code,
        published_after=published_after,
        max_results=max_results,
        filter_fn=_filter_existing_video_ids,
    )
    if not all_trending_ids:
        logger.warning("[%s] 수집된 Shorts 없음", label)
        return {"status": "ok", "collected": 0}

    # 기존 트렌딩 영상(이미 DB에 있는 것) 통계 즉시 업데이트
    new_ids = {v["platform_video_id"] for v in video_items}
    existing_trending_ids = [vid for vid in all_trending_ids if vid not in new_ids]
    existing_details: list[dict] = []
    if existing_trending_ids:
        existing_details, _ = client.fetch_video_details(existing_trending_ids)

    channel_ids_yt = list({v["channel_id_yt"] for v in video_items if v.get("channel_id_yt")})
    channel_items = client.fetch_channel_details(channel_ids_yt) if channel_ids_yt else []
    channel_map = {ch["platform_id"]: ch for ch in channel_items}

    collected = 0
    updated_stats = 0
    now_utc = datetime.now(timezone.utc)

    with SyncSession() as session:
        try:
            from app.models import Video, VideoStat, VideoTrendingHistory

            # 신규 비디오 저장
            for vdata in video_items:
                ch_yt_id = vdata.pop("channel_id_yt", None)
                if not ch_yt_id:
                    continue
                ch_data = channel_map.get(ch_yt_id, {"platform_id": ch_yt_id, "title": "Unknown"})
                channel = _get_or_create_channel(session, ch_data)
                _upsert_video(session, vdata, channel.id)
                collected += 1

            session.flush()

            # 기존 트렌딩 영상 통계 즉시 갱신 + VideoStat 시계열 기록
            for edata in existing_details:
                video = session.execute(
                    select(Video).where(Video.platform_video_id == edata["platform_video_id"])
                ).scalar_one_or_none()
                if video is None:
                    continue
                video.view_count = edata.get("view_count", video.view_count)
                video.like_count = edata.get("like_count", video.like_count)
                video.comment_count = edata.get("comment_count", video.comment_count)
                session.add(VideoStat(
                    video_id=video.id,
                    view_count=video.view_count,
                    like_count=video.like_count,
                    comment_count=video.comment_count,
                    measured_at=now_utc,
                ))
                updated_stats += 1

            session.flush()

            # 전체 트렌딩 발견 이력 및 태깅 저장
            if all_trending_ids:
                videos_in_db = session.execute(
                    select(Video).where(Video.platform_video_id.in_(all_trending_ids))
                ).scalars().all()

                r_code = region_code or "GLOBAL"

                for video in videos_in_db:
                    if video.trending_regions is None:
                        video.trending_regions = [r_code]
                    elif r_code not in video.trending_regions:
                        video.trending_regions = list(video.trending_regions) + [r_code]
                    video.status = "active"
                    session.add(VideoTrendingHistory(
                        video_id=video.id,
                        region=r_code,
                        observed_at=now_utc,
                    ))

            session.commit()
            logger.info(
                "=== [%s] 수집 완료: 신규 %d개, 기존 통계 업데이트 %d개 ===",
                label, collected, updated_stats,
            )
        except Exception:
            session.rollback()
            logger.exception("[%s] 수집 중 에러", label)
            raise

    return {"status": "ok", "collected": collected, "updated": updated_stats}


# 수집 지역 전략:
# - 고정(매회): KR, US, JP  — 핵심 3개국 항상 수집
# - 로테이션(매회 1개 추가): TW → GB → DE → FR → BR → TW ... (시간 기반 순환)
# 총 4지역 × 200 units × 24회/day = 19,200 units/day (Key1 2개 키 한도 20,000 이내)
_ROTATING_REGIONS = ["TW", "GB", "DE", "FR", "BR"]

def get_collection_regions() -> list[str]:
    """매 수집마다 KR+US+JP 고정 + 로테이션 1개 반환."""
    import time
    idx = int(time.time() / 3600) % len(_ROTATING_REGIONS)
    rotating = _ROTATING_REGIONS[idx]
    return ["KR", "US", "JP", rotating]


def get_weighted_region() -> str:
    """단일 지역 랜덤 추출 (레거시 호환용)."""
    import random
    regions = ["KR", "US", "JP", "TW", "GB", "DE", "FR"]
    weights = [0.35, 0.25, 0.15, 0.10, 0.05, 0.05, 0.05]
    return random.choices(regions, weights=weights, k=1)[0]


@celery_app.task(name="app.crawlers.tasks.refresh_video_stats")
def refresh_video_stats():
    """갱신 예정 시각이 지난 영상의 통계를 배치 갱신한다.

    5분마다 Celery Beat에 의해 호출.
    next_refresh_at <= now() 인 영상을 50개까지 조회 → YouTube API 배치 호출.
    """
    from app.models import Video, VideoStat

    logger.info("=== 영상 통계 갱신 시작 ===")

    now = datetime.now(timezone.utc)

    with SyncSession() as session:
        # 갱신 대상 영상 50개 조회
        videos = session.execute(
            select(Video)
            .where(Video.status == "active")
            .where(Video.next_refresh_at <= now)
            .where(Video.freshness_tier != "ARCHIVED")
            .order_by(Video.next_refresh_at)
            .limit(50)
        ).scalars().all()

        if not videos:
            logger.info("갱신 대상 영상 없음")
            return {"status": "ok", "refreshed": 0, "deleted": 0}

        video_ids_yt = [v.platform_video_id for v in videos]
        video_map = {v.platform_video_id: v for v in videos}

        logger.info("갱신 대상 %d개 영상: %s", len(video_ids_yt), video_ids_yt[:5])

        # YouTube API 배치 조회
        try:
            client = YouTubeClient()
            details, missing_ids = client.fetch_video_details(video_ids_yt)
        except ValueError as e:
            logger.error("YouTube 클라이언트 초기화 실패: %s", e)
            return {"status": "error", "message": str(e)}

        # 통계 갱신
        refreshed = 0
        deleted_count = 0
        try:
            for d in details:
                vid = d["platform_video_id"]
                video = video_map.get(vid)
                if video is None:
                    continue

                video.view_count = d.get("view_count", video.view_count)
                video.like_count = d.get("like_count", video.like_count)
                video.comment_count = d.get("comment_count", video.comment_count)

                # 시계열 통계 저장
                stat_entry = VideoStat(
                    video_id=video.id,
                    view_count=video.view_count,
                    like_count=video.like_count,
                    comment_count=video.comment_count,
                    measured_at=now
                )
                session.add(stat_entry)

                # Freshness tier 재계산 (T27)
                update_video_freshness(video)
                refreshed += 1

            # 누락된 비디오들 Tombstone 처리 (404/비공개)
            for m_id in missing_ids:
                video = video_map.get(m_id)
                if video is not None:
                    video.status = "deleted"
                    video.freshness_tier = "ARCHIVED"
                    deleted_count += 1
                    logger.info("비디오 Tombstone 처리 (삭제/비공개): %s (ID: %d)", video.title, video.id)

            session.commit()
            logger.info("=== 영상 통계 갱신 완료: %d개 갱신, %d개 삭제 ===", refreshed, deleted_count)
        except Exception:
            session.rollback()
            logger.exception("통계 갱신 중 에러 발생")
            raise

    return {"status": "ok", "refreshed": refreshed, "deleted": deleted_count}


@celery_app.task(name="app.crawlers.tasks.compute_global_rankings")
def compute_global_rankings():
    """
    모든 비디오의 점수를 계산하고 랭킹 테이블 업데이트 및 캐싱 (5분마다 실행)
    """
    return asyncio.run(_compute_global_rankings())


async def _compute_global_rankings():
    from app.models import Video, Ranking

    async with _make_async_session()() as session:
        # 1. 대상 비디오 조회 (Shorts이고 안전한 것들, T45)
        stmt = (
            select(Video)
            .options(selectinload(Video.channel))
            .where(Video.is_short == True)
            .where(Video.safety_status.notin_(["hidden", "banned"]))
        )
        result = await session.execute(stmt)
        videos = result.scalars().all()

        if not videos:
            logger.info("순위 계산 대상 영상 없음")
            return "No videos to rank"

        # 2. 통계치 추출 (Z-score 계산용)
        views = [float(v.view_count) for v in videos]
        likes = [float(v.like_count) for v in videos]
        comments = [float(v.comment_count) for v in videos]

        def get_stats(data):
            if len(data) < 2:
                return (sum(data) / len(data) if data else 0.0), 0.0
            return statistics.mean(data), statistics.stdev(data)

        m_v, s_v = get_stats(views)
        m_l, s_l = get_stats(likes)
        m_c, s_c = get_stats(comments)

        # 3. 점수 계산 — 글로벌 랭킹은 순수 인기도(decay 없음) + 언어 가중치
        from app.services.ranking import global_lang_weight
        scored_videos = []
        for v in videos:
            vz = calculate_z_score(float(v.view_count), m_v, s_v)
            lz = calculate_z_score(float(v.like_count), m_l, s_l)
            cz = calculate_z_score(float(v.comment_count), m_c, s_c)
            final_score = compute_final_score(vz, lz, cz, 1.0) * global_lang_weight(v)
            scored_videos.append((v, final_score))

        # 4. 정렬 (점수 내림차순)
        scored_videos.sort(key=lambda x: x[1], reverse=True)
        top_100 = scored_videos[:100]

        # 5. DB 업데이트 (기존 global 랭킹 삭제 전 이전 순위 저장)
        old_rows = (await session.execute(
            select(Ranking.video_id, Ranking.position).where(Ranking.rank_type == "global")
        )).all()
        prev_pos_map = {r.video_id: r.position for r in old_rows}

        await session.execute(delete(Ranking).where(Ranking.rank_type == "global"))

        ranking_objects = []
        cache_data = []
        for i, (video, score) in enumerate(top_100):
            pos = i + 1
            prev_pos = prev_pos_map.get(video.id)  # None = 신규 진입
            ranking_objects.append(Ranking(
                video_id=video.id,
                rank_type="global",
                score=score,
                position=pos,
                prev_position=prev_pos,
            ))
            cache_data.append({
                "id": video.id,
                "title": video.title,
                "channel_title": video.channel.title,
                "thumbnail_url": video.thumbnail_url,
                "view_count": video.view_count,
                "like_count": video.like_count,
                "score": score,
                "position": pos,
                "prev_position": prev_pos,
                "platform_video_id": video.platform_video_id,
                "category": video.category.value if video.category else None,
                "published_at": video.published_at.isoformat() if video.published_at else None,
            })

        session.add_all(ranking_objects)
        await session.commit()

        # 6. Redis 캐시 업데이트
        await cache.set_ranking("global", cache_data)
        logger.info("글로벌 랭킹 계산 및 캐싱 완료: %d개", len(top_100))

        return f"Computed global rankings for {len(top_100)} videos"


@celery_app.task(name="app.crawlers.tasks.compute_rising_rankings")
def compute_rising_rankings():
    """Rising Star 랭킹 계산 및 캐싱 (5분마다 실행)."""
    return asyncio.run(_compute_rising_rankings())


async def _compute_rising_rankings():
    """48시간 이내 Shorts 영상 중 속도×신선도 점수가 높은 영상 TOP 50.

    "New" 탭 전용: 누적 조회수만 큰 오래된 영상이 아니라
    방금 올라와서 빠르게 뜨는 영상을 노출하기 위해 창을 48시간으로 좁힌다.
    """
    from app.models import Video, Ranking
    from datetime import timedelta

    now_utc = datetime.now(timezone.utc)
    cutoff = now_utc - timedelta(hours=48)

    async with _make_async_session()() as session:
        stmt = (
            select(Video)
            .options(selectinload(Video.channel))
            .where(Video.is_short == True)
            .where(Video.published_at >= cutoff)
            .where(Video.safety_status.notin_(["hidden", "banned"]))
        )
        result = await session.execute(stmt)
        videos = result.scalars().all()

        if not videos:
            logger.info("Rising 계산 대상 영상 없음")
            return "No videos for rising"

        scored = []
        for v in videos:
            score = compute_rising_score(
                view_count=v.view_count,
                like_count=v.like_count,
                published_at=v.published_at,
            )
            scored.append((v, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        top_50 = scored[:50]

        old_rows = (await session.execute(
            select(Ranking.video_id, Ranking.position).where(Ranking.rank_type == "rising")
        )).all()
        prev_pos_map = {r.video_id: r.position for r in old_rows}

        await session.execute(delete(Ranking).where(Ranking.rank_type == "rising"))

        ranking_objects = []
        cache_data = []
        for i, (video, score) in enumerate(top_50):
            pos = i + 1
            prev_pos = prev_pos_map.get(video.id)
            ranking_objects.append(Ranking(
                video_id=video.id,
                rank_type="rising",
                score=score,
                position=pos,
                prev_position=prev_pos,
            ))
            cache_data.append({
                "id": video.id,
                "title": video.title,
                "channel_title": video.channel.title,
                "thumbnail_url": video.thumbnail_url,
                "view_count": video.view_count,
                "like_count": video.like_count,
                "score": score,
                "position": pos,
                "prev_position": prev_pos,
                "platform_video_id": video.platform_video_id,
                "category": video.category.value if video.category else None,
                "published_at": video.published_at.isoformat() if video.published_at else None,
            })

        session.add_all(ranking_objects)
        await session.commit()

        await cache.set_ranking("rising", cache_data)
        logger.info("Rising 랭킹 계산 완료: %d개", len(top_50))
        return f"Computed rising rankings for {len(top_50)} videos"


@celery_app.task(name="app.crawlers.tasks.compute_category_rankings")
def compute_category_rankings():
    """카테고리별 랭킹 계산 및 캐싱 (5분마다 실행)."""
    return asyncio.run(_compute_category_rankings())


async def _compute_category_rankings():
    from app.models import Video, Ranking, CategoryEnum

    async with _make_async_session()() as session:
        stmt = (
            select(Video)
            .options(selectinload(Video.channel))
            .where(Video.is_short == True)
            .where(Video.category.isnot(None))
        )
        result = await session.execute(stmt)
        videos = result.scalars().all()

        if not videos:
            return "No categorized videos"

        # 카테고리별로 그룹화
        from collections import defaultdict
        by_category: dict[str, list] = defaultdict(list)
        for v in videos:
            by_category[v.category.value].append(v)

        # 전체 통계 (Z-score 분모는 전체 영상 기준)
        all_views = [float(v.view_count) for v in videos]
        all_likes = [float(v.like_count) for v in videos]
        all_comments = [float(v.comment_count) for v in videos]

        def get_stats(data: list[float]) -> tuple[float, float]:
            if len(data) < 2:
                return (data[0] if data else 0.0), 0.0
            return statistics.mean(data), statistics.stdev(data)

        m_v, s_v = get_stats(all_views)
        m_l, s_l = get_stats(all_likes)
        m_c, s_c = get_stats(all_comments)

        # 기존 카테고리 랭킹 이전 순위 저장 후 전체 삭제
        old_cat_rows = (await session.execute(
            select(Ranking.video_id, Ranking.rank_type, Ranking.position)
            .where(Ranking.rank_type.like("category:%"))
        )).all()
        prev_cat_pos_map: dict[str, dict[int, int]] = {}
        for r in old_cat_rows:
            prev_cat_pos_map.setdefault(r.rank_type, {})[r.video_id] = r.position

        for cat in CategoryEnum:
            await session.execute(
                delete(Ranking).where(Ranking.rank_type == f"category:{cat.value}")
            )

        all_ranking_objects = []
        for cat_value, cat_videos in by_category.items():
            rank_type_key = f"category:{cat_value}"
            prev_pos_map = prev_cat_pos_map.get(rank_type_key, {})

            from app.services.ranking import global_lang_weight
            scored = []
            for v in cat_videos:
                vz = calculate_z_score(float(v.view_count), m_v, s_v)
                lz = calculate_z_score(float(v.like_count), m_l, s_l)
                cz = calculate_z_score(float(v.comment_count), m_c, s_c)
                decay = calculate_decay(v.published_at)
                score = compute_final_score(vz, lz, cz, decay) * global_lang_weight(v)
                scored.append((v, score))

            scored.sort(key=lambda x: x[1], reverse=True)
            top_50 = scored[:50]

            cache_data = []
            for i, (video, score) in enumerate(top_50):
                pos = i + 1
                prev_pos = prev_pos_map.get(video.id)
                all_ranking_objects.append(Ranking(
                    video_id=video.id,
                    rank_type=rank_type_key,
                    score=score,
                    position=pos,
                    prev_position=prev_pos,
                ))
                cache_data.append({
                    "id": video.id,
                    "title": video.title,
                    "channel_title": video.channel.title,
                    "thumbnail_url": video.thumbnail_url,
                    "view_count": video.view_count,
                    "score": score,
                    "position": pos,
                    "prev_position": prev_pos,
                    "platform_video_id": video.platform_video_id,
                    "category": cat_value,
                    "like_count": video.like_count,
                    "published_at": video.published_at.isoformat() if video.published_at else None,
                })

            await cache.set_ranking(f"category:{cat_value}", cache_data)

        session.add_all(all_ranking_objects)
        await session.commit()
        logger.info("카테고리 랭킹 계산 완료: %d 카테고리", len(by_category))
        return f"Computed category rankings for {len(by_category)} categories"


def _generate_chart_snapshot(chart_type: str, period_start: datetime, period_end: datetime, period_key: str, prev_period_key: str):
    from datetime import timedelta
    from app.models import Video, VideoStat, ChartEntry
    
    regions = ["GLOBAL", "KR", "US", "JP", "TW", "GB", "DE", "FR"]
    categories = [None] + ["gaming", "entertainment", "music", "education", "news", "sports", "comedy", "people", "other"]
    rank_bases = ["algo", "view_count", "view_delta", "rising"]
    
    with SyncSession() as session:
        try:
            for region in regions:
                # 1. 대상 비디오 필터링 (지역 기여도 왜곡 보정 - 2025년 이후 발행 비디오 대상)
                cutoff = datetime(2025, 1, 1, tzinfo=timezone.utc)
                from app.models import VideoTrendingHistory
                from app.services.ranking import apply_region_filter
                if region == "GLOBAL":
                    # GLOBAL: published_at 기준으로 기간 필터 → weekly/monthly/yearly 명확 차별화
                    stmt = (
                        select(Video).options(selectinload(Video.channel))
                        .where(Video.status == "active")
                        .where(Video.is_short == True)
                        .where(Video.published_at >= period_start)
                        .where(Video.published_at <= period_end)
                    )
                else:
                    # 지역 차트: 해당 기간에 트렌딩 관측된 영상 + 언어 필터
                    stmt = (
                        select(Video)
                        .options(selectinload(Video.channel))
                        .join(VideoTrendingHistory)
                        .where(Video.status == "active")
                        .where(Video.is_short == True)
                        .where(Video.published_at >= cutoff)
                        .where(VideoTrendingHistory.region == region)
                        .where(VideoTrendingHistory.observed_at >= period_start)
                        .where(VideoTrendingHistory.observed_at <= period_end)
                    )
                    stmt = apply_region_filter(stmt, region)
                    stmt = stmt.distinct()
                videos = session.execute(stmt).scalars().all()
                if not videos:
                    continue
                
                video_ids = [v.id for v in videos]
                
                # 시작 시점(period_start)의 조회수 조회 (view_delta 계산용)
                start_stats = session.execute(
                    select(VideoStat.video_id, VideoStat.view_count)
                    .where(VideoStat.video_id.in_(video_ids))
                    .where(VideoStat.measured_at >= period_start - timedelta(hours=12))
                    .where(VideoStat.measured_at <= period_start + timedelta(hours=12))
                    .order_by(VideoStat.measured_at.asc())
                ).all()
                
                start_views = {}
                for row in start_stats:
                    if row.video_id not in start_views:
                        start_views[row.video_id] = row.view_count
                
                for cat in categories:
                    # 카테고리별 필터링
                    cat_videos = [v for v in videos if (cat is None or (v.category and v.category.value == cat))]
                    if not cat_videos:
                        continue
                    
                    # Z-score용 통계 계산
                    views = [float(v.view_count) for v in cat_videos]
                    likes = [float(v.like_count) for v in cat_videos]
                    comments = [float(v.comment_count) for v in cat_videos]
                    
                    def get_stats(data):
                        if len(data) < 2:
                            return (sum(data) / len(data) if data else 0.0), 0.0
                        return statistics.mean(data), statistics.stdev(data)
                    
                    m_v, s_v = get_stats(views)
                    m_l, s_l = get_stats(likes)
                    m_c, s_c = get_stats(comments)
                    
                    for basis in rank_bases:
                        scored_videos = []
                        for v in cat_videos:
                            if basis == "view_count":
                                score = float(v.view_count)
                            elif basis == "view_delta":
                                start_val = start_views.get(v.id, v.view_count)
                                score = float(max(0, v.view_count - start_val))
                            elif basis == "rising":
                                hl = 12.0
                                if chart_type == "weekly":
                                    hl = 84.0
                                elif chart_type == "monthly":
                                    hl = 360.0
                                elif chart_type == "yearly":
                                    hl = 4380.0
                                score = compute_rising_score(v.view_count, v.like_count, v.published_at, freshness_half_life_hours=hl)
                            else:  # algo
                                vz = calculate_z_score(float(v.view_count), m_v, s_v)
                                lz = calculate_z_score(float(v.like_count), m_l, s_l)
                                cz = calculate_z_score(float(v.comment_count), m_c, s_c)
                                decay = calculate_decay(v.published_at)
                                score = compute_final_score(vz, lz, cz, decay)
                                if region == "GLOBAL":
                                    from app.services.ranking import global_lang_weight
                                    score *= global_lang_weight(v)
                            scored_videos.append((v, score))
                        
                        # 정렬 및 순위 커트라인 적용
                        scored_videos.sort(key=lambda x: x[1], reverse=True)
                        limit = 100 if cat is None else 50
                        top_entries = scored_videos[:limit]
                        
                        if not top_entries:
                            continue
                        
                        # 이전 기간 순위 및 최고 순위 인메모리 벌크 매핑
                        prev_pos_rows = session.execute(
                            select(ChartEntry.video_id, ChartEntry.position, ChartEntry.weeks_on_chart)
                            .where(ChartEntry.chart_type == chart_type)
                            .where(ChartEntry.period_key == prev_period_key)
                            .where(ChartEntry.region == region)
                            .where(ChartEntry.category == cat)
                            .where(ChartEntry.rank_basis == basis)
                        ).all()
                        prev_pos_map = {row.video_id: row.position for row in prev_pos_rows}
                        prev_weeks_map = {row.video_id: row.weeks_on_chart for row in prev_pos_rows}
                        
                        peak_pos_rows = session.execute(
                            select(ChartEntry.video_id, func.min(ChartEntry.position).label("peak"))
                            .where(ChartEntry.chart_type == chart_type)
                            .where(ChartEntry.region == region)
                            .where(ChartEntry.category == cat)
                            .where(ChartEntry.rank_basis == basis)
                            .group_by(ChartEntry.video_id)
                        ).all()
                        peak_pos_map = {row.video_id: row.peak for row in peak_pos_rows}
                        
                        # 기존 해당 기간 차트 엔트리 삭제 (중복 생성 방지)
                        session.execute(
                            delete(ChartEntry)
                            .where(ChartEntry.chart_type == chart_type)
                            .where(ChartEntry.period_key == period_key)
                            .where(ChartEntry.region == region)
                            .where(ChartEntry.category == cat)
                            .where(ChartEntry.rank_basis == basis)
                        )
                        
                        for i, (video, score) in enumerate(top_entries):
                            pos = i + 1
                            prev_pos = prev_pos_map.get(video.id)
                            
                            old_peak = peak_pos_map.get(video.id)
                            peak_pos = min(pos, old_peak) if old_peak is not None else pos
                            
                            weeks = prev_weeks_map.get(video.id, 0) + 1
                            start_val = start_views.get(video.id, video.view_count)
                            v_delta = max(0, video.view_count - start_val)
                            
                            entry = ChartEntry(
                                chart_type=chart_type,
                                period_key=period_key,
                                period_start=period_start,
                                period_end=period_end,
                                region=region,
                                category=cat,
                                video_id=video.id,
                                rank_basis=basis,
                                position=pos,
                                prev_position=prev_pos,
                                peak_position=peak_pos,
                                weeks_on_chart=weeks,
                                view_delta=v_delta,
                                view_count=video.view_count,
                                zscore=score if basis == "algo" else None,
                                velocity=score if basis == "rising" else None,
                                like_count=video.like_count,
                                created_at=period_end
                            )
                            session.add(entry)
            session.commit()
            logger.info("=== 차트 스냅샷 생성 완료 (%s, %s) ===", chart_type, period_key)
        except Exception:
            session.rollback()
            logger.exception("차트 스냅샷 생성 중 에러 발생")
            raise


from sqlalchemy import func


# ── 공통 헬퍼 ──────────────────────────────────────────────────────────────────

def _get_db_video_count() -> int:
    """활성 영상 수 반환 (backfill_limit 비교용)."""
    from app.models import Video
    with SyncSession() as session:
        return session.execute(
            select(func.count(Video.id)).where(Video.status != "deleted")
        ).scalar() or 0


def _collect_two_pages(
    client,
    region_code: str | None,
    published_after: datetime | None,
    video_category_id: str | None = None,
) -> tuple[list[dict], list[str]]:
    """fetch_shorts_paginated 2회 호출로 최대 100개 수집.

    Returns:
        (video_items, all_ids)
        all_ids = 검색에서 발견된 전체 ID (기존+신규 포함)
        video_items = all_ids에 대한 상세 정보
    """
    all_items: list[dict] = []
    all_ids: list[str] = []
    seen_ids: set[str] = set()       # all_ids 중복 방지
    seen_item_ids: set[str] = set()  # all_items 중복 방지

    page_token: str | None = None
    for _ in range(2):
        items, ids, next_token = client.fetch_shorts_paginated(
            region_code=region_code,
            published_after=published_after,
            video_category_id=video_category_id,
            page_token=page_token,
        )
        # 검색 결과 ID 수집 (all_ids 먼저)
        for vid in ids:
            if vid not in seen_ids:
                all_ids.append(vid)
                seen_ids.add(vid)
        # 상세 정보 수집
        for item in items:
            vid = item.get("platform_video_id")
            if vid and vid not in seen_item_ids:
                all_items.append(item)
                seen_item_ids.add(vid)
        if not next_token:
            break
        page_token = next_token

    return all_items, all_ids


def _save_chart_entries_for_collection(
    session,
    all_ids: list[str],
    chart_type: str,
    period_key: str,
    period_start: datetime,
    period_end: datetime,
    region: str,
    now_utc: datetime,
) -> int:
    """수집된 영상 목록으로 chart_entries 저장 (4 rank_basis × 전체+카테고리별).

    - 언어 필터 없음: 수집 시 이미 지역별 분리됨
    - category=None(전체) + 카테고리별 엔트리 모두 저장
    Returns: 저장된 비디오 수
    """
    import statistics as _stat_mod
    from app.models import Video, ChartEntry, VideoStat
    from sqlalchemy import delete as sa_delete
    from app.services.ranking import (
        calculate_z_score, calculate_decay,
        compute_final_score, compute_rising_score,
    )

    # 수집된 ID 기준 조회 — 언어 필터 제거 (수집 시 지역 분리됨)
    stmt = (
        select(Video)
        .where(Video.platform_video_id.in_(all_ids))
        .where(Video.status == "active")
        .where(Video.published_at >= period_start)
        .order_by(Video.view_count.desc())
    )
    videos = session.execute(stmt).scalars().all()

    if not videos:
        return 0

    video_ids = [v.id for v in videos]

    # 기간 시작 시점 view_count (±30분 VideoStat → view_delta 계산용)
    start_stats = session.execute(
        select(VideoStat.video_id, VideoStat.view_count)
        .where(VideoStat.video_id.in_(video_ids))
        .where(VideoStat.measured_at >= period_start - timedelta(minutes=30))
        .where(VideoStat.measured_at <= period_start + timedelta(minutes=30))
        .order_by(VideoStat.measured_at.asc())
    ).all()
    start_views: dict[int, int] = {}
    for row in start_stats:
        if row.video_id not in start_views:
            start_views[row.video_id] = row.view_count

    # 기존 해당 기간 row 전체 삭제
    session.execute(
        sa_delete(ChartEntry)
        .where(ChartEntry.chart_type == chart_type)
        .where(ChartEntry.period_key == period_key)
        .where(ChartEntry.region == region)
    )

    def _gs(data: list) -> tuple[float, float]:
        if len(data) < 2:
            return (data[0] if data else 0.0), 0.0
        return _stat_mod.mean(data), _stat_mod.stdev(data)

    # 카테고리 그룹: None(전체) + 실제 존재하는 카테고리
    by_cat: dict[str, list] = {}
    for v in videos:
        if v.category:
            by_cat.setdefault(v.category.value, []).append(v)
    cat_groups: list[tuple] = [(None, videos)] + [(cat, vids) for cat, vids in by_cat.items()]

    for (category, cat_videos) in cat_groups:
        if not cat_videos:
            continue

        views_arr    = [float(v.view_count) for v in cat_videos]
        likes_arr    = [float(v.like_count or 0) for v in cat_videos]
        comments_arr = [float(getattr(v, "comment_count", 0) or 0) for v in cat_videos]
        m_v, s_v = _gs(views_arr)
        m_l, s_l = _gs(likes_arr)
        m_c, s_c = _gs(comments_arr)

        for basis in ["view_count", "algo", "view_delta", "rising"]:
            # rank_basis + category별 이전 period_key → prev_position
            prev_pk = session.execute(
                select(ChartEntry.period_key)
                .where(ChartEntry.chart_type == chart_type)
                .where(ChartEntry.region == region)
                .where(ChartEntry.rank_basis == basis)
                .where(ChartEntry.category == category)
                .where(ChartEntry.period_key < period_key)
                .order_by(ChartEntry.period_key.desc())
                .limit(1)
            ).scalar_one_or_none()

            prev_pos_map: dict[int, int] = {}
            if prev_pk:
                prev_rows = session.execute(
                    select(ChartEntry.video_id, ChartEntry.position)
                    .where(ChartEntry.chart_type == chart_type)
                    .where(ChartEntry.region == region)
                    .where(ChartEntry.rank_basis == basis)
                    .where(ChartEntry.category == category)
                    .where(ChartEntry.period_key == prev_pk)
                ).all()
                for row in prev_rows:
                    prev_pos_map[row.video_id] = row.position

            # 점수 계산 및 정렬
            if basis == "view_count":
                scored = [(v, float(v.view_count)) for v in cat_videos]
            elif basis == "view_delta":
                scored = [(v, float(max(0, v.view_count - start_views.get(v.id, v.view_count)))) for v in cat_videos]
            elif basis == "rising":
                scored = [(v, compute_rising_score(v.view_count, v.like_count or 0, v.published_at)) for v in cat_videos]
            else:  # algo
                from app.services.ranking import global_lang_weight
                scored = []
                for v in cat_videos:
                    vz = calculate_z_score(float(v.view_count), m_v, s_v)
                    lz = calculate_z_score(float(v.like_count or 0), m_l, s_l)
                    cz = calculate_z_score(float(getattr(v, "comment_count", 0) or 0), m_c, s_c)
                    decay = calculate_decay(v.published_at)
                    score = compute_final_score(vz, lz, cz, decay)
                    if region == "GLOBAL":
                        score *= global_lang_weight(v)
                    scored.append((v, score))

            scored.sort(key=lambda x: x[1], reverse=True)

            for i, (video, score) in enumerate(scored):
                pos = i + 1
                start_val = start_views.get(video.id, video.view_count)
                v_delta = max(0, video.view_count - start_val)
                session.add(ChartEntry(
                    chart_type=chart_type,
                    period_key=period_key,
                    period_start=period_start,
                    period_end=period_end,
                    region=region,
                    category=category,
                    video_id=video.id,
                    rank_basis=basis,
                    position=pos,
                    prev_position=prev_pos_map.get(video.id),
                    view_delta=v_delta if v_delta > 0 else None,
                    view_count=video.view_count,
                    like_count=video.like_count or 0,
                    zscore=score if basis == "algo" else None,
                    velocity=score if basis == "rising" else None,
                    created_at=now_utc,
                ))

    return len(videos)


def _upsert_video_batch(
    session,
    video_items: list[dict],
    all_ids: list[str],
    client,
    region: str,
    now_utc: datetime,
    update_only: bool = False,
) -> tuple[int, int]:
    """신규 저장 + 기존 통계 업데이트 공통 로직.

    update_only=True 이면 신규 저장 없이 기존 영상 통계만 갱신.
    Returns: (collected_new, updated_existing)
    """
    from app.models import Video, VideoStat, VideoTrendingHistory

    collected = 0
    updated = 0

    if update_only:
        # DB >= BACKFILL_LIMIT: video_items의 상세 데이터로 기존 영상 통계만 갱신
        # (existing_ids 방식은 video_items에 이미 모든 상세 데이터가 있어 항상 빈 집합)
        detail_map = {v["platform_video_id"]: v for v in video_items}
        if detail_map:
            db_videos = session.execute(
                select(Video).where(Video.platform_video_id.in_(list(detail_map.keys())))
            ).scalars().all()
            for video in db_videos:
                vdata = detail_map[video.platform_video_id]
                video.view_count = vdata.get("view_count", video.view_count)
                video.like_count = vdata.get("like_count", video.like_count)
                video.comment_count = vdata.get("comment_count", video.comment_count)
                session.add(VideoStat(
                    video_id=video.id,
                    view_count=video.view_count,
                    like_count=video.like_count,
                    comment_count=video.comment_count,
                    measured_at=now_utc,
                ))
                update_video_freshness(video)
                updated += 1
        session.flush()
    else:
        channel_map: dict = {}
        if video_items:
            channel_ids_yt = list({v["channel_id_yt"] for v in video_items if v.get("channel_id_yt")})
            if channel_ids_yt:
                channel_items = client.fetch_channel_details(channel_ids_yt)
                channel_map = {ch["platform_id"]: ch for ch in channel_items}

        for vdata in video_items:
            ch_yt_id = vdata.pop("channel_id_yt", None)
            if not ch_yt_id:
                continue
            ch_data = channel_map.get(ch_yt_id, {"platform_id": ch_yt_id, "title": "Unknown"})
            channel = _get_or_create_channel(session, ch_data)
            _upsert_video(session, vdata, channel.id)
            collected += 1
        session.flush()

    if all_ids:
        videos_in_db = session.execute(
            select(Video).where(Video.platform_video_id.in_(all_ids))
        ).scalars().all()
        for video in videos_in_db:
            if video.trending_regions is None:
                video.trending_regions = [region]
            elif region not in video.trending_regions:
                video.trending_regions = list(video.trending_regions) + [region]
            video.status = "active"
            session.add(VideoTrendingHistory(
                video_id=video.id, region=region, observed_at=now_utc,
            ))

    return collected, updated


# ── Key1: 실시간(4h) 수집 ───────────────────────────────────────────────────────

@celery_app.task(name="app.crawlers.tasks.collect_realtime_shorts")
def collect_realtime_shorts():
    """[Key1] 4시간마다 최근 4시간 내 신규 TOP 100 수집 → chart_type='real' 저장.
    KR+US+JP 고정 + 로테이션 1개 = 4지역 순차 수집 후 GLOBAL 합산.
    """
    try:
        client = YouTubeClient(api_key=settings.youtube_api_keys)
    except ValueError as e:
        return {"status": "error", "message": str(e)}

    now_utc = datetime.now(timezone.utc)
    period_start = now_utc - timedelta(hours=4)
    search_published_after = now_utc - timedelta(hours=8)
    kst_hour = (now_utc + timedelta(hours=9)).strftime("%Y-%m-%dT%H")
    regions = get_collection_regions()

    total_collected = total_updated = total_chart = 0
    all_global_ids: list[str] = []
    seen_global: set[str] = set()

    for region in regions:
        video_items, all_ids = _collect_two_pages(client, region, search_published_after)
        if not all_ids:
            continue

        # period_start 이전 발행 영상 제거 후 조회수 내림차순 정렬
        video_items = sorted(
            [item for item in video_items if item.get("published_at") and item["published_at"] >= period_start],
            key=lambda x: x.get("view_count", 0),
            reverse=True,
        )
        all_ids = [item["platform_video_id"] for item in video_items]
        if not all_ids:
            continue

        for vid in all_ids:
            if vid not in seen_global:
                all_global_ids.append(vid)
                seen_global.add(vid)

        with SyncSession() as session:
            try:
                c, u = _upsert_video_batch(session, video_items, all_ids, client, region, now_utc)
                cs = _save_chart_entries_for_collection(
                    session, all_ids, "real", kst_hour,
                    period_start, now_utc, region, now_utc,
                )
                session.commit()
                total_collected += c; total_updated += u; total_chart += cs
            except Exception:
                session.rollback()
                logger.exception("[collect_realtime_shorts] region=%s 에러", region)

    # 전 지역 합산 GLOBAL real 차트 생성
    if all_global_ids:
        with SyncSession() as session:
            try:
                cs = _save_chart_entries_for_collection(
                    session, all_global_ids, "real", kst_hour,
                    period_start, now_utc, "GLOBAL", now_utc,
                )
                session.commit()
                total_chart += cs
            except Exception:
                session.rollback()
                logger.exception("[collect_realtime_shorts] GLOBAL 차트 에러")

    compute_global_rankings.delay()
    compute_rising_rankings.delay()
    logger.info("[realtime] regions=%s 신규 %d 업데이트 %d 차트 %d행",
                regions, total_collected, total_updated, total_chart)
    return {"status": "ok", "collected": total_collected, "updated": total_updated, "chart_rows": total_chart}


# ── Key1: 일간(24h) 수집 ───────────────────────────────────────────────────────

@celery_app.task(name="app.crawlers.tasks.collect_daily_shorts")
def collect_daily_shorts():
    """[Key1] 홀수 시간마다 최근 24시간 내 신규 TOP 100 수집 → chart_type='daily' 저장.
    KR+US+JP 고정 + 로테이션 1개 = 4지역 순차 수집 (800 units/호출).
    """
    try:
        client = YouTubeClient(api_key=settings.youtube_api_keys)
    except ValueError as e:
        return {"status": "error", "message": str(e)}

    now_utc = datetime.now(timezone.utc)
    kst_offset = timedelta(hours=9)
    today_midnight_kst = (now_utc + kst_offset).replace(hour=0, minute=0, second=0, microsecond=0)
    period_start = today_midnight_kst - kst_offset  # KST 오늘 00:00 → UTC
    # API 인덱싱 지연 보정: period_start 6시간 전부터 넓게 검색 후 Python에서 재필터링
    search_published_after = period_start - timedelta(hours=6)
    kst_hour = (now_utc + kst_offset).strftime("%Y-%m-%dT%H")
    regions = get_collection_regions()

    total_collected = total_updated = total_chart = 0
    all_global_ids: list[str] = []
    seen_global: set[str] = set()

    for region in regions:
        video_items, all_ids = _collect_two_pages(client, region, search_published_after)
        if not all_ids:
            continue

        # period_start(KST 00:00) 이전 발행 영상 제거 후 조회수 내림차순 정렬
        video_items = sorted(
            [item for item in video_items if item.get("published_at") and item["published_at"] >= period_start],
            key=lambda x: x.get("view_count", 0),
            reverse=True,
        )
        all_ids = [item["platform_video_id"] for item in video_items]
        if not all_ids:
            continue

        for vid in all_ids:
            if vid not in seen_global:
                all_global_ids.append(vid)
                seen_global.add(vid)

        with SyncSession() as session:
            try:
                c, u = _upsert_video_batch(session, video_items, all_ids, client, region, now_utc)
                cs = _save_chart_entries_for_collection(
                    session, all_ids, "daily", kst_hour,
                    period_start, now_utc, region, now_utc,
                )
                session.commit()
                total_collected += c; total_updated += u; total_chart += cs
            except Exception:
                session.rollback()
                logger.exception("[collect_daily_shorts] region=%s 에러", region)

    # 전 지역 합산 GLOBAL daily 차트 생성
    if all_global_ids:
        with SyncSession() as session:
            try:
                cs = _save_chart_entries_for_collection(
                    session, all_global_ids, "daily", kst_hour,
                    period_start, now_utc, "GLOBAL", now_utc,
                )
                session.commit()
                total_chart += cs
            except Exception:
                session.rollback()
                logger.exception("[collect_daily_shorts] GLOBAL 차트 에러")

    compute_global_rankings.delay()
    compute_category_rankings.delay()
    logger.info("[daily] regions=%s 신규 %d 업데이트 %d 차트 %d행",
                regions, total_collected, total_updated, total_chart)
    return {"status": "ok", "collected": total_collected, "updated": total_updated, "chart_rows": total_chart}


# ── Key2: 글로벌 전체기간 수집 (backfill_limit 적용) ─────────────────────────────

@celery_app.task(name="app.crawlers.tasks.collect_global_shorts")
def collect_global_shorts():
    """[Key2] 매시간 전체기간 누적조회수순 100개 수집.

    DB 수 < BACKFILL_LIMIT: 신규 저장 + 업데이트
    DB 수 >= BACKFILL_LIMIT: 업데이트 전용
    """
    if not settings.YOUTUBE_API_KEY2:
        logger.warning("YOUTUBE_API_KEY2 미설정 — collect_global_shorts 건너뜀")
        return {"status": "skipped", "reason": "no key2"}

    db_count = _get_db_video_count()
    update_only = db_count >= settings.BACKFILL_LIMIT

    if update_only:
        logger.info("[global] 리미트 도달 (%d/%d): 업데이트 전용", db_count, settings.BACKFILL_LIMIT)

    region = get_weighted_region()
    now_utc = datetime.now(timezone.utc)

    try:
        client = YouTubeClient(api_key=settings.YOUTUBE_API_KEY2)
    except ValueError as e:
        return {"status": "error", "message": str(e)}

    video_items, all_ids = _collect_two_pages(client, region, published_after=None)
    if not all_ids:
        return {"status": "ok", "collected": 0}

    collected = updated = 0
    with SyncSession() as session:
        try:
            collected, updated = _upsert_video_batch(
                session, video_items, all_ids, client, region, now_utc,
                update_only=update_only,
            )
            session.commit()
        except Exception:
            session.rollback()
            logger.exception("[collect_global_shorts] 에러")
            raise

    logger.info("[global] db=%d/%d 신규 %d 업데이트 %d",
                db_count, settings.BACKFILL_LIMIT, collected, updated)
    return {
        "status": "ok",
        "db_count": db_count,
        "update_only": update_only,
        "collected": collected,
        "updated": updated,
    }


# ── 오늘 조회수 delta 랭킹 ────────────────────────────────────────────────────

@celery_app.task(name="app.crawlers.tasks.compute_today_delta_rankings")
def compute_today_delta_rankings():
    """KST 자정 이후 조회수 증가량 기준 TOP 50 계산 및 캐싱."""
    return asyncio.run(_compute_today_delta_rankings())


async def _compute_today_delta_rankings():
    """video_stats 시계열로 오늘 view_delta를 계산해 랭킹에 저장한다."""
    from app.models import Video, VideoStat, Ranking

    # KST 오늘 자정을 UTC로 변환 (KST = UTC+9)
    now_utc = datetime.now(timezone.utc)
    kst_offset = timedelta(hours=9)
    now_kst = now_utc + kst_offset
    today_start_kst = now_kst.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_utc = today_start_kst - kst_offset

    async with _make_async_session()() as session:
        result = await session.execute(
            select(Video)
            .options(selectinload(Video.channel))
            .where(Video.is_short == True)
            .where(Video.status == "active")
            .where(Video.safety_status.notin_(["hidden", "banned"]))
        )
        videos = result.scalars().all()

        if not videos:
            logger.info("오늘 delta 계산 대상 영상 없음")
            return "No videos"

        video_ids = [v.id for v in videos]

        # 오늘 자정 ±2시간 이내 가장 이른 VideoStat → 시작 조회수
        start_stats = await session.execute(
            select(VideoStat.video_id, VideoStat.view_count)
            .where(VideoStat.video_id.in_(video_ids))
            .where(VideoStat.measured_at >= today_start_utc - timedelta(hours=2))
            .where(VideoStat.measured_at <= today_start_utc + timedelta(hours=1))
            .order_by(VideoStat.measured_at.asc())
        )
        start_views: dict[int, int] = {}
        for row in start_stats.all():
            if row.video_id not in start_views:
                start_views[row.video_id] = row.view_count

        scored = []
        for v in videos:
            start_val = start_views.get(v.id)
            if start_val is None:
                continue  # 오늘 시작 통계 없으면 제외
            delta = max(0, v.view_count - start_val)
            scored.append((v, delta))

        scored.sort(key=lambda x: x[1], reverse=True)
        top_50 = scored[:50]

        old_rows = (await session.execute(
            select(Ranking.video_id, Ranking.position).where(Ranking.rank_type == "today_delta")
        )).all()
        prev_pos_map = {r.video_id: r.position for r in old_rows}

        await session.execute(delete(Ranking).where(Ranking.rank_type == "today_delta"))

        ranking_objects = []
        cache_data = []
        for i, (video, delta) in enumerate(top_50):
            pos = i + 1
            prev_pos = prev_pos_map.get(video.id)
            ranking_objects.append(Ranking(
                video_id=video.id,
                rank_type="today_delta",
                score=float(delta),
                position=pos,
                prev_position=prev_pos,
            ))
            cache_data.append({
                "id": video.id,
                "title": video.title,
                "channel_title": video.channel.title,
                "thumbnail_url": video.thumbnail_url,
                "view_count": video.view_count,
                "view_delta": delta,
                "score": float(delta),
                "position": pos,
                "prev_position": prev_pos,
                "platform_video_id": video.platform_video_id,
                "category": video.category.value if video.category else None,
                "published_at": video.published_at.isoformat() if video.published_at else None,
            })

        session.add_all(ranking_objects)
        await session.commit()
        await cache.set_ranking("today_delta", cache_data)
        logger.info("오늘 delta 랭킹 계산 완료: %d개", len(top_50))
        return f"Computed today_delta rankings for {len(top_50)} videos"


# ── 백필 (Key2 전용) ──────────────────────────────────────────────────────────

import json as _json
import redis as _redis_lib

_redis_tasks = _redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
BACKFILL_STATE_KEY = "backfill:state"

# (video_category_id, region_code, period_days)
# None = 필터 없음
BACKFILL_COMBOS: list[tuple[str | None, str | None, int | None]] = [
    (cat_id, region, period)
    for cat_id in [None, "20", "10", "24", "27", "17", "23", "22", "25"]  # 9가지 + 전체
    for region in [None, "KR", "US", "JP", "TW"]                          # 5가지
    for period in [None, 30]                                               # 2가지
    # 총 90 콤보 × 101 units = 9,090 units/사이클 (Key2 일일 한도 이내)
]


def _get_backfill_state() -> dict:
    try:
        val = _redis_tasks.get(BACKFILL_STATE_KEY)
        if val:
            return _json.loads(val)
    except Exception:
        pass
    return {"combo_idx": 0, "page_token": None}


def _save_backfill_state(state: dict) -> None:
    try:
        _redis_tasks.set(BACKFILL_STATE_KEY, _json.dumps(state))
    except Exception as e:
        logger.error("백필 상태 저장 실패: %s", e)


@celery_app.task(name="app.crawlers.tasks.backfill_shorts")
def backfill_shorts():
    """[Key2 전용] 15분마다 카테고리×국가×기간 조합 1페이지씩 Shorts 백필.

    Redis에 진행 상태를 저장해 재시작 시에도 이어서 실행된다.
    90 콤보 × 15분 간격 = 1 사이클 약 22.5시간
    """
    if not settings.YOUTUBE_API_KEY2:
        logger.warning("YOUTUBE_API_KEY2 미설정 — 백필 건너뜀")
        return {"status": "skipped", "reason": "no key2"}

    state = _get_backfill_state()
    combo_idx = state.get("combo_idx", 0) % len(BACKFILL_COMBOS)
    page_token: str | None = state.get("page_token")

    cat_id, region, period_days = BACKFILL_COMBOS[combo_idx]
    published_after = (
        datetime.now(timezone.utc) - timedelta(days=period_days)
        if period_days else None
    )

    label = (
        f"백필[{combo_idx + 1}/{len(BACKFILL_COMBOS)}]"
        f" cat={cat_id} region={region} period={period_days}d"
    )
    logger.info("=== %s 시작 (page_token: %s) ===", label, page_token)

    try:
        client = YouTubeClient(api_key=settings.YOUTUBE_API_KEY2)
    except ValueError as e:
        logger.error("Key2 초기화 실패: %s", e)
        return {"status": "error", "message": str(e)}

    video_items, all_ids, next_page_token = client.fetch_shorts_paginated(
        region_code=region,
        published_after=published_after,
        video_category_id=cat_id,
        page_token=page_token,
    )

    # 신규/기존 영상 저장 (기존 _collect_shorts 공통 로직 재사용)
    result = _collect_shorts(
        label=label,
        region_code=region,
        published_after=published_after,
        client=client,
    ) if not video_items and not all_ids else None

    # video_items가 있는 경우 직접 저장
    collected = 0
    updated_stats = 0
    if all_ids:
        new_ids = {v["platform_video_id"] for v in video_items}
        existing_ids = [vid for vid in all_ids if vid not in new_ids]
        existing_details: list[dict] = []
        if existing_ids:
            existing_details, _ = client.fetch_video_details(existing_ids)

        channel_ids_yt = list({v["channel_id_yt"] for v in video_items if v.get("channel_id_yt")})
        channel_items = client.fetch_channel_details(channel_ids_yt) if channel_ids_yt else []
        channel_map = {ch["platform_id"]: ch for ch in channel_items}

        now_utc = datetime.now(timezone.utc)
        r_code = region or "GLOBAL"

        with SyncSession() as session:
            try:
                from app.models import Video, VideoStat, VideoTrendingHistory

                for vdata in video_items:
                    ch_yt_id = vdata.pop("channel_id_yt", None)
                    if not ch_yt_id:
                        continue
                    ch_data = channel_map.get(ch_yt_id, {"platform_id": ch_yt_id, "title": "Unknown"})
                    channel = _get_or_create_channel(session, ch_data)
                    _upsert_video(session, vdata, channel.id)
                    collected += 1

                session.flush()

                for edata in existing_details:
                    video = session.execute(
                        select(Video).where(Video.platform_video_id == edata["platform_video_id"])
                    ).scalar_one_or_none()
                    if video is None:
                        continue
                    video.view_count = edata.get("view_count", video.view_count)
                    video.like_count = edata.get("like_count", video.like_count)
                    video.comment_count = edata.get("comment_count", video.comment_count)
                    session.add(VideoStat(
                        video_id=video.id,
                        view_count=video.view_count,
                        like_count=video.like_count,
                        comment_count=video.comment_count,
                        measured_at=now_utc,
                    ))
                    updated_stats += 1

                session.flush()

                videos_in_db = session.execute(
                    select(Video).where(Video.platform_video_id.in_(all_ids))
                ).scalars().all()
                for video in videos_in_db:
                    if video.trending_regions is None:
                        video.trending_regions = [r_code]
                    elif r_code not in video.trending_regions:
                        video.trending_regions = list(video.trending_regions) + [r_code]
                    video.status = "active"
                    session.add(VideoTrendingHistory(
                        video_id=video.id,
                        region=r_code,
                        observed_at=now_utc,
                    ))

                session.commit()
            except Exception:
                session.rollback()
                logger.exception("[%s] 저장 중 에러", label)
                raise

    # 다음 상태 결정: 다음 페이지 있으면 유지, 없으면 다음 콤보
    if next_page_token:
        new_state: dict = {"combo_idx": combo_idx, "page_token": next_page_token}
    else:
        new_state = {"combo_idx": (combo_idx + 1) % len(BACKFILL_COMBOS), "page_token": None}

    _save_backfill_state(new_state)
    logger.info("=== %s 완료: 신규 %d개, 업데이트 %d개 → 다음 콤보 %d ===",
                label, collected, updated_stats, new_state["combo_idx"])
    return {
        "status": "ok",
        "collected": collected,
        "updated": updated_stats,
        "next_combo": new_state["combo_idx"],
        "next_page_token": new_state.get("page_token"),
    }


@celery_app.task(name="app.crawlers.tasks.daily_chart_snapshot")
def daily_chart_snapshot():
    """매일 00:00 KST: daily(어제) + weekly(7일 rolling) + monthly(30일 rolling) 동시 저장.

    period_key = KST 오늘 날짜 기준 'YYYY-MM-DD'
    weekly/monthly도 매일 저장해 임의 날짜 기준 과거 순위 조회 가능.
    """
    now_utc = datetime.now(timezone.utc)
    kst_today = (now_utc + timedelta(hours=9)).strftime("%Y-%m-%d")
    kst_yesterday = ((now_utc + timedelta(hours=9)) - timedelta(days=1)).strftime("%Y-%m-%d")

    # 1. Daily (어제 하루)
    daily_start = now_utc - timedelta(days=1)
    _generate_chart_snapshot(
        "daily", daily_start, now_utc,
        period_key=kst_yesterday,
        prev_period_key=((now_utc + timedelta(hours=9)) - timedelta(days=2)).strftime("%Y-%m-%d"),
    )

    # 2. Weekly rolling (최근 7일) — period_key = 오늘 날짜
    weekly_start = now_utc - timedelta(days=7)
    _generate_chart_snapshot(
        "weekly", weekly_start, now_utc,
        period_key=kst_today,
        prev_period_key=((now_utc + timedelta(hours=9)) - timedelta(days=1)).strftime("%Y-%m-%d"),
    )

    # 3. Monthly rolling (최근 30일) — period_key = 오늘 날짜
    monthly_start = now_utc - timedelta(days=30)
    _generate_chart_snapshot(
        "monthly", monthly_start, now_utc,
        period_key=kst_today,
        prev_period_key=((now_utc + timedelta(hours=9)) - timedelta(days=1)).strftime("%Y-%m-%d"),
    )

    # 4. Yearly rolling (최근 365일) — period_key = 오늘 날짜
    yearly_start = now_utc - timedelta(days=365)
    _generate_chart_snapshot(
        "yearly", yearly_start, now_utc,
        period_key=kst_today,
        prev_period_key=((now_utc + timedelta(hours=9)) - timedelta(days=1)).strftime("%Y-%m-%d"),
    )

    return f"Charts (daily/weekly/monthly/yearly) created for {kst_today}"

