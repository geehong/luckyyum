"""
YouTube Data API v3 클라이언트

트렌딩 Shorts 수집, 영상/채널 통계 배치 조회 기능 제공.
YouTube API 쿼터: videos.list = 1 unit, search.list = 100 units
→ videos.list 배치 호출(50개/1unit)이 가장 효율적.
"""
import logging
from datetime import datetime, timezone
from typing import Callable
from isodate import parse_duration

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import redis
import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Shorts 최대 길이 (초)
MAX_SHORTS_DURATION = 60

# Redis 동기식 클라이언트 초기화
_redis_sync = redis.from_url(settings.REDIS_URL, decode_responses=True)


def check_is_shorts_via_head(video_id: str) -> bool:
    """유튜브 Shorts 여부를 HEAD 요청을 통해 실시간 검증하고 7일간 캐싱한다."""
    cache_key = f"isshort:{video_id}"
    try:
        cached_val = _redis_sync.get(cache_key)
        if cached_val is not None:
            return cached_val == "true"
    except Exception as e:
        logger.warning("Redis 연결 오류 (isshort 조회 실패): %s", e)

    url = f"https://www.youtube.com/shorts/{video_id}"
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        resp = httpx.head(url, headers=headers, follow_redirects=False, timeout=5.0)

        is_short = False
        if resp.status_code == 200:
            is_short = True
        elif resp.status_code in (301, 302, 303, 307, 308):
            loc = resp.headers.get("Location", "")
            if "/shorts/" in loc:
                is_short = True

        try:
            # 7일 캐싱 (7 * 24 * 3600 = 604800초)
            _redis_sync.setex(cache_key, 604800, "true" if is_short else "false")
        except Exception as e:
            logger.warning("Redis 캐시 쓰기 실패: %s", e)

        return is_short
    except Exception as e:
        logger.warning("유튜브 Shorts HEAD 검증 실패 (%s): %s", video_id, e)
        return False


class YouTubeClient:
    """YouTube Data API v3 래퍼 클라이언트."""

    def __init__(self, api_key: str | list[str] | None = None):
        if isinstance(api_key, list):
            self._api_keys = [k for k in api_key if k]
        elif api_key:
            self._api_keys = [api_key]
        else:
            self._api_keys = settings.youtube_api_keys

        if not self._api_keys:
            raise ValueError("YOUTUBE_API_KEY가 설정되지 않았습니다.")

        self._current_key_idx = 0
        self._build_service()

    def _build_service(self):
        key = self._api_keys[self._current_key_idx]
        self._service = build("youtube", "v3", developerKey=key)

    def _rotate_key(self):
        if len(self._api_keys) <= 1:
            return
        self._current_key_idx = (self._current_key_idx + 1) % len(self._api_keys)
        logger.info("YouTube API Key rotated to index %d: %s...", self._current_key_idx, self._api_keys[self._current_key_idx][:10])
        self._build_service()

    def _execute_with_retry(self, request_builder_fn):
        """Runs the API request with automatic key rotation and retries on quota exceeded errors."""
        for attempt in range(len(self._api_keys)):
            try:
                request = request_builder_fn(self._service)
                return request.execute()
            except HttpError as e:
                is_quota_error = False
                if e.resp.status == 429:
                    is_quota_error = True
                elif e.resp.status == 403:
                    try:
                        content = e.content.decode("utf-8")
                        if "quotaExceeded" in content or "quota" in content.lower():
                            is_quota_error = True
                    except Exception:
                        pass

                # If it's a quota error and we have more keys left, rotate and retry
                if is_quota_error and attempt < len(self._api_keys) - 1:
                    logger.warning("YouTube API Quota Exceeded/Rate Limited. Rotating API Key. Attempt %d/%d", attempt + 1, len(self._api_keys))
                    self._rotate_key()
                    continue
                else:
                    raise e

    # ── 트렌딩 영상 조회 ──────────────────────────────────

    def fetch_trending_videos(
        self,
        region_code: str | None = None,
        max_results: int = 50,
        published_after: datetime | None = None,
        filter_fn: Callable | None = None,
    ) -> tuple[list[dict], list[str]]:
        """#shorts 영상을 검색하여 반환한다.

        region_code=None → 전세계 기준
        published_after  → 특정 날짜 이후 업로드된 영상만
        search.list (100 units) → videos.list (1 unit)
        """
        query = "#shorts"
        if region_code == "KR":
            query = "#쇼츠 OR 쇼츠"
        elif region_code == "JP":
            query = "#ショート OR ショート"
        elif region_code == "TW":
            query = "#短影音 OR 短影音"

        params: dict = dict(
            part="id",
            q=query,
            type="video",
            videoDuration="short",
            order="viewCount",
            maxResults=max_results,
        )
        if region_code:
            params["regionCode"] = region_code
        if published_after:
            params["publishedAfter"] = published_after.strftime("%Y-%m-%dT%H:%M:%SZ")

        try:
            search_resp = self._execute_with_retry(lambda s: s.search().list(**params))
        except HttpError as e:
            logger.error("YouTube API search 조회 실패: %s", e)
            return [], []

        video_ids = [
            item["id"]["videoId"]
            for item in search_resp.get("items", [])
            if item.get("id", {}).get("videoId")
        ]
        if not video_ids:
            logger.warning("search.list 결과 videoId 없음")
            return [], []

        # DB에 이미 존재하는 영상 제외 필터링 (콜백 함수 사용)
        original_video_ids = list(video_ids)
        if filter_fn:
            original_count = len(video_ids)
            video_ids = filter_fn(video_ids)
            filtered_count = len(video_ids)
            logger.info("기존 영상 필터링: %d개 -> %d개 (신규 영상만 수집 대상)", original_count, filtered_count)
            if not video_ids:
                logger.info("검색된 모든 영상이 이미 DB에 존재합니다.")
                return [], original_video_ids

        # 영상 상세 정보 배치 조회
        try:
            detail_resp = self._execute_with_retry(
                lambda s: s.videos().list(
                    part="snippet,contentDetails,statistics",
                    id=",".join(video_ids),
                )
            )
        except HttpError as e:
            logger.error("YouTube API videos.list 조회 실패: %s", e)
            return [], original_video_ids

        videos = []
        for item in detail_resp.get("items", []):
            parsed = self._parse_video_item(item)
            if parsed:
                videos.append(parsed)

        logger.info("트렌딩 Shorts %d개 수집 (search 결과 %d개)", len(videos), len(video_ids))
        return videos, original_video_ids


    def fetch_shorts_paginated(
        self,
        region_code: str | None = None,
        published_after: datetime | None = None,
        video_category_id: str | None = None,
        page_token: str | None = None,
        max_results: int = 50,
    ) -> tuple[list[dict], list[str], str | None]:
        """페이지네이션 지원 Shorts 검색 (백필 전용).

        Returns:
            (video_items, all_video_ids, next_page_token)
        비용: search 100 units + videos.list 1 unit
        """
        query = "#shorts"
        if region_code == "KR":
            query = "#쇼츠 OR 쇼츠"
        elif region_code == "JP":
            query = "#ショート OR ショート"
        elif region_code == "TW":
            query = "#短影音 OR 短影音"

        params: dict = dict(
            part="id",
            q=query,
            type="video",
            videoDuration="short",
            order="viewCount",
            maxResults=max_results,
        )
        if region_code:
            params["regionCode"] = region_code
        if published_after:
            params["publishedAfter"] = published_after.strftime("%Y-%m-%dT%H:%M:%SZ")
        if video_category_id:
            params["videoCategoryId"] = video_category_id
        if page_token:
            params["pageToken"] = page_token

        try:
            search_resp = self._execute_with_retry(lambda s: s.search().list(**params))
        except HttpError as e:
            logger.error("YouTube API search 조회 실패: %s", e)
            return [], [], None

        next_page_token: str | None = search_resp.get("nextPageToken")
        video_ids = [
            item["id"]["videoId"]
            for item in search_resp.get("items", [])
            if item.get("id", {}).get("videoId")
        ]
        if not video_ids:
            return [], [], next_page_token

        try:
            detail_resp = self._execute_with_retry(
                lambda s: s.videos().list(
                    part="snippet,contentDetails,statistics",
                    id=",".join(video_ids),
                )
            )
        except HttpError as e:
            logger.error("YouTube API videos.list 조회 실패: %s", e)
            return [], video_ids, next_page_token

        videos = []
        for item in detail_resp.get("items", []):
            parsed = self._parse_video_item(item)
            if parsed:
                videos.append(parsed)

        logger.info(
            "백필 Shorts %d개 수집 (next_page_token: %s)",
            len(videos),
            next_page_token,
        )
        return videos, video_ids, next_page_token

    # ── 영상 상세 배치 조회 ────────────────────────────────

    def fetch_video_details(self, video_ids: list[str]) -> tuple[list[dict], list[str]]:
        """최대 50개 영상 ID로 통계를 배치 조회한다.

        비용: 1 unit (50개까지 동일)
        """
        if not video_ids:
            return [], []

        # 50개씩 분할
        results = []
        missing_ids = []
        for i in range(0, len(video_ids), 50):
            chunk = video_ids[i : i + 50]
            try:
                response = self._execute_with_retry(
                    lambda s: s.videos().list(
                        part="snippet,contentDetails,statistics",
                        id=",".join(chunk),
                    )
                )
                
                # API 호출 성공 시, 요청한 ID 중 응답에 없는 ID를 missing_ids로 식별
                found_ids = {item["id"] for item in response.get("items", [])}
                for vid in chunk:
                    if vid not in found_ids:
                        missing_ids.append(vid)
            except HttpError as e:
                logger.error("YouTube API 영상 조회 실패: %s", e)
                continue

            for item in response.get("items", []):
                parsed = self._parse_video_item(item)
                if parsed:
                    results.append(parsed)

        logger.info("영상 상세 %d개 조회 완료, 누락/삭제: %d개", len(results), len(missing_ids))
        return results, missing_ids


    # ── 채널 배치 조회 ────────────────────────────────────

    def fetch_channel_details(self, channel_ids: list[str]) -> list[dict]:
        """최대 50개 채널 ID로 채널 정보를 배치 조회한다."""
        if not channel_ids:
            return []

        results = []
        for i in range(0, len(channel_ids), 50):
            chunk = channel_ids[i : i + 50]
            try:
                response = self._execute_with_retry(
                    lambda s: s.channels().list(
                        part="snippet,statistics",
                        id=",".join(chunk),
                    )
                )
            except HttpError as e:
                logger.error("YouTube API 채널 조회 실패: %s", e)
                continue

            for item in response.get("items", []):
                parsed = self._parse_channel_item(item)
                if parsed:
                    results.append(parsed)

        logger.info("채널 상세 %d개 조회 완료", len(results))
        return results

    # ── 내부 파서 ─────────────────────────────────────────

    @staticmethod
    def _parse_video_item(item: dict) -> dict | None:
        """YouTube API 응답 아이템을 내부 딕셔너리로 변환한다."""
        try:
            snippet = item["snippet"]
            stats = item.get("statistics", {})
            content = item.get("contentDetails", {})

            # ISO 8601 duration → 초 변환
            duration_str = content.get("duration", "PT0S")
            try:
                duration_sec = int(parse_duration(duration_str).total_seconds())
            except Exception:
                duration_sec = 0

            # 발행일 파싱
            published_str = snippet.get("publishedAt", "")
            try:
                published_at = datetime.fromisoformat(
                    published_str.replace("Z", "+00:00")
                )
            except Exception:
                published_at = datetime.now(timezone.utc)

            # Shorts 판별 신호 (메타데이터 및 HEAD 실시간 검증 조합)
            title = snippet.get("title", "")
            description = snippet.get("description", "")
            meta_is_short = (
                duration_sec <= MAX_SHORTS_DURATION
                or "#shorts" in title.lower()
                or "#shorts" in description.lower()
            )
            is_short = False
            if meta_is_short:
                # 쿼터 절약을 위해 메타데이터 상으로 쇼츠가 될 가능성이 있는 경우에만 HEAD 검증 수행
                is_short = check_is_shorts_via_head(item["id"])

            # 태그 (최대 30개)
            tags = snippet.get("tags", [])[:30] if snippet.get("tags") else []

            # 언어
            default_language = (
                snippet.get("defaultLanguage")
                or snippet.get("defaultAudioLanguage")
            )

            # 지역 제한 (차단 국가 콤마 구분 문자열)
            region_restriction = content.get("regionRestriction", {})
            blocked = region_restriction.get("blocked", [])
            region_blocked = ",".join(blocked) if blocked else None

            return {
                "platform_video_id": item["id"],
                "channel_id_yt": snippet.get("channelId", ""),
                "title": title,
                "description": description[:500] if description else None,
                "thumbnail_url": (
                    snippet.get("thumbnails", {})
                    .get("high", {})
                    .get("url")
                ),
                "duration_sec": duration_sec,
                "view_count": int(stats.get("viewCount", 0)),
                "like_count": int(stats.get("likeCount", 0)),
                "comment_count": int(stats.get("commentCount", 0)),
                "category_id": snippet.get("categoryId"),
                "is_short": is_short,
                "published_at": published_at,
                "tags": tags,
                "default_language": default_language,
                "region_blocked": region_blocked,
            }
        except (KeyError, ValueError) as e:
            logger.warning("영상 파싱 실패: %s — %s", item.get("id"), e)
            return None

    @staticmethod
    def _parse_channel_item(item: dict) -> dict | None:
        """YouTube API 채널 응답을 내부 딕셔너리로 변환한다."""
        try:
            snippet = item["snippet"]
            stats = item.get("statistics", {})

            published_str = snippet.get("publishedAt", "")
            try:
                published_at = datetime.fromisoformat(
                    published_str.replace("Z", "+00:00")
                )
            except Exception:
                published_at = None

            return {
                "platform_id": item["id"],
                "title": snippet.get("title", ""),
                "handle": snippet.get("customUrl"),
                "thumbnail_url": (
                    snippet.get("thumbnails", {})
                    .get("high", {})
                    .get("url")
                ),
                "description": (snippet.get("description", "") or "")[:500] or None,
                "subscriber_count": int(stats.get("subscriberCount", 0)),
                "video_count": int(stats.get("videoCount", 0)),
                "view_count": int(stats.get("viewCount", 0)),
                "published_at": published_at,
            }
        except (KeyError, ValueError) as e:
            logger.warning("채널 파싱 실패: %s — %s", item.get("id"), e)
            return None
