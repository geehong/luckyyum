import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel

# Load environment variables
load_dotenv(dotenv_path="../.env")
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
TIERS = [1, 2, 3, 4, 5] # 1: 대흉, 5: 대길

# Generate only 5 samples for testing
SAMPLE_LIMIT = 5

def generate_fortunes():
    output_dir = "output"
    os.makedirs(output_dir, exist_ok=True)
    
    count = 0
    results = []
    
    for dm in DAY_MASTERS:
        for mb in MONTH_BRANCHES:
            for tier in TIERS:
                if count >= SAMPLE_LIMIT:
                    break
                
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
                
                print(f"Generating: {dm}-{mb}-{tier} ...")
                
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=FortuneResponse,
                        temperature=0.7,
                    ),
                )
                
                try:
                    data = json.loads(response.text)
                    results.append({
                        "id": f"{dm}-{mb}-{tier}",
                        "day_master": dm,
                        "month_branch": mb,
                        "tier": tier,
                        "message": data.get("message", ""),
                        "lucky_item": data.get("lucky_item", "")
                    })
                except Exception as e:
                    print(f"Error parsing JSON: {e}")
                
                count += 1
            
            if count >= SAMPLE_LIMIT:
                break
        if count >= SAMPLE_LIMIT:
            break
            
    # Save to JSON array
    json_path = os.path.join(output_dir, "fortunes.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        
    print(f"\nDone! Generated {len(results)} samples in {json_path}")

if __name__ == "__main__":
    generate_fortunes()
