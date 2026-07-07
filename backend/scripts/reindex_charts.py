import sys
import logging
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.models import ChartEntry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def main():
    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    engine = create_engine(sync_url, echo=False)
    Session = sessionmaker(bind=engine)

    with Session() as session:
        try:
            logger.info("=== Starting ChartEntry Re-indexing ===")

            # Fetch all distinct combinations of (chart_type, region, category, rank_basis)
            groups = session.execute(
                select(
                    ChartEntry.chart_type,
                    ChartEntry.region,
                    ChartEntry.category,
                    ChartEntry.rank_basis
                ).distinct()
            ).all()

            logger.info("Found %d distinct chart timelines.", len(groups))

            for chart_type, region, category, rank_basis in groups:
                logger.info("Re-indexing timeline: type=%s, region=%s, category=%s, basis=%s",
                            chart_type, region, category, rank_basis)

                # Fetch all period keys for this group sorted chronologically
                periods = session.execute(
                    select(ChartEntry.period_key)
                    .where(ChartEntry.chart_type == chart_type)
                    .where(ChartEntry.region == region)
                    .where(ChartEntry.category == category)
                    .where(ChartEntry.rank_basis == rank_basis)
                    .distinct()
                    .order_by(ChartEntry.period_key.asc())
                ).scalars().all()

                prev_pos_map = {}

                for period_key in periods:
                    # Fetch entries sorted by their current position
                    entries = session.execute(
                        select(ChartEntry)
                        .where(ChartEntry.chart_type == chart_type)
                        .where(ChartEntry.region == region)
                        .where(ChartEntry.category == category)
                        .where(ChartEntry.rank_basis == rank_basis)
                        .where(ChartEntry.period_key == period_key)
                        .order_by(ChartEntry.position.asc())
                    ).scalars().all()

                    current_pos_map = {}
                    for i, entry in enumerate(entries):
                        new_pos = i + 1
                        current_pos_map[entry.video_id] = new_pos

                        # Lookup previous position from the previous period key's reindexed positions
                        prev_pos = prev_pos_map.get(entry.video_id)

                        # Update database model values
                        entry.position = new_pos
                        entry.prev_position = prev_pos

                    # Move window forward
                    prev_pos_map = current_pos_map

            session.commit()
            logger.info("=== Re-indexing Completed Successfully ===")

        except Exception as e:
            session.rollback()
            logger.exception("Error occurred during database re-indexing: %s", e)
            sys.exit(1)


if __name__ == "__main__":
    main()
