"""LuckyYum FastAPI 진입점 — 미들웨어 설정 및 라우터 등록만 담당."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import rankings, auth, users, tester, live
from fastapi.responses import RedirectResponse

# ── 앱 초기화 ─────────────────────────────────────────────────────────
app = FastAPI(
    title="LuckyYum API",
    description="사주 펫 랭킹 서비스 API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*", # 개발 환경에서는 모두 허용. 운영 시 프론트엔드 도메인 추가
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 라우터 등록 ───────────────────────────────────────────────────────
app.include_router(rankings.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tester.router)
app.include_router(live.router)

@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "message": "LuckyYum API is running"}

@app.get("/appdown", tags=["App"])
async def download_latest_app():
    return RedirectResponse(
        url="https://github.com/geehong/luckyyum/releases/latest/download/luckyyum-latest.apk"
    )
