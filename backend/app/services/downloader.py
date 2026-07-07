import asyncio
import os
import json
import time
import uuid

# Download directory configuration
DOWNLOAD_DIR = "/app/static/downloads"

async def extract_metadata(url: str) -> dict:
    """
    Extract video metadata using yt-dlp.
    Raises ValueError with specific codes if fails.
    """
    proc = await asyncio.create_subprocess_exec(
        "yt-dlp",
        "--dump-json",
        "--no-playlist",
        url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    
    if proc.returncode != 0:
        err_msg = stderr.decode("utf-8", errors="ignore").lower()
        if "private" in err_msg or "sign in" in err_msg or "confirm" in err_msg:
            raise ValueError("PRIVATE_VIDEO")
        elif "not found" in err_msg or "404" in err_msg or "deleted" in err_msg:
            raise ValueError("DELETED_VIDEO")
        else:
            raise ValueError("UNSUPPORTED_URL")
            
    try:
        info = json.loads(stdout.decode("utf-8"))
        return {
            "id": info.get("id"),
            "title": info.get("title") or "Shorts Video",
            "thumbnail": info.get("thumbnail") or (info.get("thumbnails", [{}])[0].get("url") if info.get("thumbnails") else ""),
            "duration": info.get("duration") or 0,
            "extractor": info.get("extractor") or "unknown",
        }
    except Exception:
        raise ValueError("UNSUPPORTED_URL")

async def download_video(url: str, file_id: str) -> str:
    """
    Download video file to local storage.
    Returns the absolute path to the downloaded file.
    """
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    out_tmpl = os.path.join(DOWNLOAD_DIR, f"{file_id}.%(ext)s")
    
    proc = await asyncio.create_subprocess_exec(
        "yt-dlp",
        "--no-playlist",
        "-f", "best[ext=mp4]/best",
        "-o", out_tmpl,
        url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    await proc.communicate()
    
    if proc.returncode != 0:
        raise ValueError("DOWNLOAD_FAILED")
        
    for ext in ["mp4", "mkv", "webm", "3gp"]:
        path = os.path.join(DOWNLOAD_DIR, f"{file_id}.{ext}")
        if os.path.exists(path):
            return path
            
    raise ValueError("DOWNLOAD_FILE_NOT_FOUND")

def clean_old_files(max_age_seconds: int = 3600, max_dir_size_bytes: int = 5 * 1024 * 1024 * 1024):
    """
    Purge files older than max_age_seconds.
    Also ensures total directory size does not exceed max_dir_size_bytes.
    """
    if not os.path.exists(DOWNLOAD_DIR):
        return
        
    now = time.time()
    files = []
    
    # 1. Delete expired files
    for f in os.listdir(DOWNLOAD_DIR):
        fp = os.path.join(DOWNLOAD_DIR, f)
        if os.path.isfile(fp):
            stat = os.stat(fp)
            if stat.st_mtime < now - max_age_seconds:
                try:
                    os.remove(fp)
                except OSError:
                    pass
            else:
                files.append((fp, stat.st_size, stat.st_mtime))
                
    # 2. Limit disk cache to 5GB (delete oldest first)
    total_size = sum(f[1] for f in files)
    if total_size > max_dir_size_bytes:
        files.sort(key=lambda x: x[2]) # sort by mtime ascending
        for fp, size, mtime in files:
            try:
                os.remove(fp)
                total_size -= size
            except OSError:
                pass
            if total_size <= max_dir_size_bytes:
                break
