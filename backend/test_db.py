import asyncio
from app.db import AsyncSessionLocal, engine
from app.models import ChartEntry, Video
from sqlalchemy import select, func
from datetime import datetime

engine.echo = False

async def test():
    async with AsyncSessionLocal() as session:
        # 1. Total count
        total = await session.execute(select(func.count(ChartEntry.id)))
        print(f"Total ChartEntry count: {total.scalar()}")

        # 2. Distinct chart_types and period_keys
        types_res = await session.execute(
            select(ChartEntry.chart_type, func.count(ChartEntry.id))
            .group_by(ChartEntry.chart_type)
        )
        print("\n=== Counts by chart_type ===")
        for t, count in types_res.all():
            print(f"type={t} count={count}")

        # 3. Oldest/newest created_at in ChartEntry
        min_max = await session.execute(
            select(func.min(ChartEntry.created_at), func.max(ChartEntry.created_at))
        )
        min_c, max_c = min_max.first()
        print(f"\nChartEntry created_at range: {min_c} to {max_c}")

        # 4. Count entries where video was published before 2025-01-01
        old_v_count = await session.execute(
            select(func.count(ChartEntry.id))
            .join(Video)
            .where(Video.published_at < datetime(2025, 1, 1))
        )
        print(f"\nChartEntry count referring to videos published before 2025: {old_v_count.scalar()}")

        # 5. Distinct period_keys for daily/weekly/monthly/yearly
        pkeys_res = await session.execute(
            select(ChartEntry.chart_type, ChartEntry.period_key, func.count(ChartEntry.id))
            .group_by(ChartEntry.chart_type, ChartEntry.period_key)
            .order_by(ChartEntry.chart_type, ChartEntry.period_key)
        )
        print("\n=== Distinct period_keys ===")
        for t, pk, count in pkeys_res.all():
            print(f"type={t} period_key={pk} count={count}")

if __name__ == "__main__":
    asyncio.run(test())
