import os
import json
import time
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel

# Project root path resolution
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
OUTPUT_DIR = PROJECT_ROOT / "content_factory" / "output"
OUTPUT_FILE = OUTPUT_DIR / "fortunes.json"

# Load environment variables
load_dotenv(dotenv_path=PROJECT_ROOT / ".env")
api_key = os.getenv("GOOGLE_API_KEY")

if not api_key:
    raise ValueError("GOOGLE_API_KEY is not set in .env")

client = genai.Client(api_key=api_key)

# Pydantic schema for structured output
class FortuneResponse(BaseModel):
    message: str
    lucky_item: str

DAY_MASTERS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
MONTH_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
TIERS = [1, 2, 3, 4, 5]

MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3-flash",
    "gemini-3.5-flash"
]

def generate_fortunes():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    results = []
    existing_ids = set()
    
    # 1. Load existing data to prevent duplicates
    if OUTPUT_FILE.exists():
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                results = json.load(f)
                for item in results:
                    if "id" in item:
                        existing_ids.add(item["id"])
            print(f"Loaded {len(existing_ids)} existing fortunes.")
        except json.JSONDecodeError:
            print("Existing JSON is invalid. Starting fresh.")
    
    count = 0
    
    # 2. Iterate and generate missing combinations
    for dm in DAY_MASTERS:
        for mb in MONTH_BRANCHES:
            for tier in TIERS:
                f_id = f"{dm}-{mb}-{tier}"
                if f_id in existing_ids:
                    continue  # Skip already generated
                
                tier_str = {
                    5: "대길(최고)",
                    4: "길(좋음)",
                    3: "평(보통)",
                    2: "흉(나쁨)",
                    1: "대흉(최악)"
                }[tier]
                
                prompt = (
                    f"사주 명리학 기반의 펫 다마고치 앱에 들어갈 운세 대사를 작성해주세요.\n"
                    f"- 펫의 본질(일간): {dm}\n"
                    f"- 현재 환경/계절(월지): {mb}\n"
                    f"- 오늘의 운세 등급: {tier}등급 ({tier_str})\n"
                    f"지침:\n"
                    f"1. 1~2문장으로 짧고 귀엽게 작성할 것.\n"
                    f"2. {dm}의 속성과 {mb}의 계절적 특징을 가볍게 반영할 것.\n"
                    f"3. 등급에 맞는 분위기를 풍길 것.\n"
                    f"4. 행운의 아이템이나 행동(lucky_item)을 하나 추천할 것."
                )
                
                print(f"Generating: {f_id} ...")
                
                success = False
                while not success and MODELS:
                    current_model = MODELS[0]
                    try:
                        response = client.models.generate_content(
                            model=current_model,
                            contents=prompt,
                            config=types.GenerateContentConfig(
                                response_mime_type="application/json",
                                response_schema=FortuneResponse,
                                temperature=0.7,
                            ),
                        )
                        
                        data = json.loads(response.text)
                        new_item = {
                            "id": f_id,
                            "day_master": dm,
                            "month_branch": mb,
                            "tier": tier,
                            "message": data.get("message", ""),
                            "lucky_item": data.get("lucky_item", "")
                        }
                        results.append(new_item)
                        existing_ids.add(f_id)
                        count += 1
                        
                        # Save immediately after each successful generation to prevent data loss
                        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                            json.dump(results, f, ensure_ascii=False, indent=2)
                            
                        # Sleep 4.5 seconds to stay under 15 RPM limit
                        time.sleep(4.5)
                        success = True
                        
                    except Exception as e:
                        err_msg = str(e)
                        print(f"Error generating {f_id} with {current_model}: {err_msg}")
                        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg or "quota" in err_msg.lower():
                            if "GenerateRequestsPerMinute" in err_msg or "retry in" in err_msg:
                                print(f"[!] Hit RPM limit for {current_model}. Waiting 10 seconds before retrying...")
                                time.sleep(10)
                                # Do NOT pop the model, we just need to wait
                            else:
                                print(f"[!] Hit Daily/Total Quota for {current_model}. Switching to next model...")
                                MODELS.pop(0) # Remove exhausted model
                                if not MODELS:
                                    print("All models exhausted! Stopping.")
                                    return
                                time.sleep(2)
                        else:
                            # 503 Unavailable or other errors
                            print(f"[!] Server error for {current_model}. Retrying after 10 seconds...")
                            time.sleep(10)
    
    if count == 0:
        print("\nAll fortunes are already generated!")
    else:
        print(f"\nDone! Generated {count} NEW samples in {OUTPUT_FILE}")

if __name__ == "__main__":
    generate_fortunes()
