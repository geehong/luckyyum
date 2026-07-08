import os
import json
import asyncio
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

router = APIRouter(tags=["Live"])

_api_key = os.getenv("GOOGLE_API_KEY")
_client = genai.Client(api_key=_api_key) if _api_key else None

# ListModels로 확인된, 이 프로젝트의 API 키 기준 bidiGenerateContent(Live API) 지원 모델.
# "Gemini 3 Flash Live" 등 상위 모델이 열리면 이 상수만 교체하면 됨.
#
# 실측 결과(2026-07-08): 이 모델은 response_modalities=["TEXT"]를 지원하지 않는
# "native audio" 전용 모델이라 TEXT 요청 시 즉시 에러가 남. 대신 response_modalities=["AUDIO"] +
# output_audio_transcription을 사용하면 오디오 생성과 함께 실시간 텍스트 트랜스크립트를 받을 수 있어,
# 이번 범위(텍스트만 노출, 오디오 재생은 보류)에 맞게 트랜스크립트만 클라이언트로 전달한다.
LIVE_MODEL = "models/gemini-2.5-flash-native-audio-latest"


def build_persona(mbti: Optional[str]) -> str:
    if not mbti:
        return "당신은 사용자가 키우는 귀여운 반려동물입니다. 짧고 다정하게 한국어로 대화하세요."
    return (
        f"당신은 {mbti} 성향의 반려동물입니다. 그 성격에 맞는 말투와 반응을 일관되게 유지하며, "
        "짧고 다정하게 한국어로 대화하세요."
    )


@router.websocket("/ws/live-talk")
async def live_talk(websocket: WebSocket):
    """RN LiveTalkScreen ↔ Gemini Live API 텍스트(트랜스크립트) 중계.

    Gemini API 키를 클라이언트에 노출하지 않기 위해 서버가 항상 경유한다.
    프로토콜:
      client -> server 첫 메시지: {"type": "init", "mbti": "ISTP" | null}
      client -> server 이후: {"type": "message", "text": "..."}
      server -> client: {"text": "..."} (트랜스크립트 조각, 스트리밍)
                      | {"done": true} (한 턴의 응답이 끝났을 때)
                      | {"error": "..."}
    """
    await websocket.accept()

    if _client is None:
        await websocket.send_json({"error": "GOOGLE_API_KEY not configured"})
        await websocket.close()
        return

    try:
        init_raw = await websocket.receive_text()
        init_msg = json.loads(init_raw)
    except (WebSocketDisconnect, json.JSONDecodeError):
        await websocket.close()
        return

    mbti = init_msg.get("mbti") if isinstance(init_msg, dict) else None
    persona = build_persona(mbti)

    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        output_audio_transcription=types.AudioTranscriptionConfig(),
        system_instruction=persona,
    )

    try:
        async with _client.aio.live.connect(model=LIVE_MODEL, config=config) as session:

            async def pump_client_to_gemini():
                while True:
                    raw = await websocket.receive_text()
                    msg = json.loads(raw)
                    if msg.get("type") == "message" and msg.get("text"):
                        await session.send_client_content(
                            turns={"role": "user", "parts": [{"text": msg["text"]}]},
                            turn_complete=True,
                        )

            async def pump_gemini_to_client():
                async for response in session.receive():
                    server_content = response.server_content
                    if not server_content:
                        continue
                    transcription = server_content.output_transcription
                    if transcription and transcription.text:
                        await websocket.send_json({"text": transcription.text})
                    if server_content.turn_complete:
                        await websocket.send_json({"done": True})

            await asyncio.gather(pump_client_to_gemini(), pump_gemini_to_client())

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"error": str(e)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
