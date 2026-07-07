import sys
import logging
from datetime import datetime, timezone, timedelta

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

def main():
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import sessionmaker

    from app.config import settings
    from app.crawlers.youtube_client import YouTubeClient
    from app.models import Channel, Video, PlatformEnum
    from app.services.freshness import update_video_freshness

    # 동기 엔진 (seed 스크립트용)
    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    engine = create_engine(sync_url, echo=False)
    Session = sessionmaker(bind=engine)

    # YouTube 클라이언트
    try:
        client = YouTubeClient()
    except ValueError as e:
        logger.error("YOUTUBE_API_KEY가 설정되지 않았습니다: %s", e)
        sys.exit(1)

    # 최근 24시간 내 발행된 동영상 대상 수집
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    logger.info("=== 최근 24시간 이내 발행된 YouTube Shorts 수집 시작 (컷오프: %s) ===", cutoff.isoformat())
    
    video_items = client.fetch_trending_videos(
        region_code="KR",
        max_results=50,
        published_after=cutoff
    )

    if not video_items:
        logger.warning("최근 24시간 내에 수집된 Shorts가 없습니다. 일반 트렌딩 영상 수집으로 대체합니다.")
        video_items = client.fetch_trending_videos(region_code="KR", max_results=50)

    if not video_items:
        logger.error("동영상을 수집할 수 없습니다.")
        sys.exit(1)

    # 15개로 제한
    video_items = video_items[:15]
    logger.info("Shorts %d개 수집 완료", len(video_items))

    # 채널 정보 일괄 조회
    channel_ids_yt = list({v["channel_id_yt"] for v in video_items if v.get("channel_id_yt")})
    channel_items = client.fetch_channel_details(channel_ids_yt)
    channel_map = {ch["platform_id"]: ch for ch in channel_items}

    # DB 저장
    with Session() as session:
        try:
            saved_count = 0
            for vdata in video_items:
                ch_yt_id = vdata.pop("channel_id_yt", None)
                if not ch_yt_id:
                    continue

                # 채널 upsert
                ch_info = channel_map.get(ch_yt_id, {"platform_id": ch_yt_id, "title": "Unknown"})
                channel = session.execute(
                    select(Channel).where(
                        Channel.platform == PlatformEnum.youtube,
                        Channel.platform_id == ch_info["platform_id"],
                    )
                ).scalar_one_or_none()

                if channel is None:
                    channel = Channel(
                        platform=PlatformEnum.youtube,
                        platform_id=ch_info["platform_id"],
                        handle=ch_info.get("handle"),
                        title=ch_info["title"],
                        thumbnail_url=ch_info.get("thumbnail_url"),
                        description=ch_info.get("description"),
                        subscriber_count=ch_info.get("subscriber_count", 0),
                        video_count=ch_info.get("video_count", 0),
                        view_count=ch_info.get("view_count", 0),
                        published_at=ch_info.get("published_at"),
                    )
                    session.add(channel)
                    session.flush()

                # 영상 upsert
                video = session.execute(
                    select(Video).where(
                        Video.platform_video_id == vdata["platform_video_id"]
                    )
                ).scalar_one_or_none()

                if video is None:
                    video = Video(
                        channel_id=channel.id,
                        platform_video_id=vdata["platform_video_id"],
                        title=vdata["title"],
                        description=vdata.get("description"),
                        thumbnail_url=vdata.get("thumbnail_url"),
                        duration_sec=vdata.get("duration_sec"),
                        view_count=vdata.get("view_count", 0),
                        like_count=vdata.get("like_count", 0),
                        comment_count=vdata.get("comment_count", 0),
                        is_short=vdata.get("is_short", True),
                        published_at=vdata["published_at"],
                    )
                    session.add(video)
                    session.flush()
                else:
                    video.view_count = vdata.get("view_count", video.view_count)
                    video.like_count = vdata.get("like_count", video.like_count)
                    video.comment_count = vdata.get("comment_count", video.comment_count)

                update_video_freshness(video)
                saved_count += 1

            session.commit()
            logger.info("=== 시드 완료: %d개 영상 저장/갱신 ===", saved_count)

        except Exception:
            session.rollback()
            logger.exception("시드 중 에러 발생")
            sys.exit(1)

if __name__ == "__main__":
    main()
