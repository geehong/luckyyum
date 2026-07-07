"""
Redis 캐시 래퍼 모듈

캐시 키 패턴:
  ranking:{rank_type}   → 랭킹 목록 JSON (TTL 10분)
"""
import json
import logging
from typing import Any

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

RANKING_TTL = 600  # 10분


class Cache:
    def __init__(self) -> None:
        self._client: aioredis.Redis | None = None

    def _get_client(self) -> aioredis.Redis:
        import asyncio
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if self._client is None or getattr(self, "_loop", None) != current_loop:
            self._client = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
            self._loop = current_loop
        return self._client

    async def get_ranking(self, rank_type: str) -> list[dict] | None:
        try:
            raw = await self._get_client().get(f"ranking:{rank_type}")
            if raw:
                return json.loads(raw)
        except Exception as e:
            logger.warning("Redis get_ranking 실패: %s", e)
        return None

    async def set_ranking(self, rank_type: str, data: list[dict]) -> None:
        try:
            await self._get_client().setex(
                f"ranking:{rank_type}",
                RANKING_TTL,
                json.dumps(data, ensure_ascii=False),
            )
        except Exception as e:
            logger.warning("Redis set_ranking 실패: %s", e)

    async def delete(self, key: str) -> None:
        try:
            await self._get_client().delete(key)
        except Exception as e:
            logger.warning("Redis delete 실패 (%s): %s", key, e)

    async def get(self, key: str) -> Any | None:
        try:
            return await self._get_client().get(key)
        except Exception as e:
            logger.warning("Redis get 실패 (%s): %s", key, e)
        return None

    async def setex(self, key: str, ttl: int, value: str) -> None:
        try:
            await self._get_client().setex(key, ttl, value)
        except Exception as e:
            logger.warning("Redis setex 실패 (%s): %s", key, e)


cache = Cache()
