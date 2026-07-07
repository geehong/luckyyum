import sys
import logging
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def main():
    from sqlalchemy import create_engine, select, delete
    from sqlalchemy.orm import sessionmaker
    from app.config import settings
    from app.models import ChartEntry, Video
    from app.services.ranking import apply_region_filter

    # Sync engine for scripts
    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    engine = create_engine(sync_url, echo=False)
    Session = sessionmaker(bind=engine)

    with Session() as session:
        try:
            logger.info("=== Starting ChartEntry Cleanup ===")

            # 1. Delete legacy 2021/older records
            logger.info("Deleting chart entries for videos published before 2025-01-01...")
            old_videos_subq = select(Video.id).where(Video.published_at < datetime(2025, 1, 1, tzinfo=timezone.utc))
            del_stmt = delete(ChartEntry).where(ChartEntry.video_id.in_(old_videos_subq))
            res = session.execute(del_stmt)
            logger.info("Deleted %d legacy chart entries.", res.rowcount)

            # 2. Delete incorrect regional entries
            regions = ["KR", "US", "JP", "TW", "GB", "DE", "FR", "MX", "IN", "BR"]
            for region in regions:
                logger.info("Cleaning up polluted entries for region %s...", region)
                
                # Subquery to select valid video IDs for this region
                subq = select(Video.id)
                subq = apply_region_filter(subq, region)
                
                # Delete any ChartEntry for this region that doesn't match the region's language filter
                del_stmt = (
                    delete(ChartEntry)
                    .where(ChartEntry.region == region)
                    .where(ChartEntry.video_id.not_in(subq))
                )
                res = session.execute(del_stmt)
                logger.info("Deleted %d incorrect entries for region %s.", res.rowcount, region)

            session.commit()
            logger.info("=== Cleanup Completed Successfully ===")

        except Exception as e:
            session.rollback()
            logger.exception("Error occurred during database cleanup: %s", e)
            sys.exit(1)


if __name__ == "__main__":
    main()
