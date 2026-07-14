import os
from PIL import Image

def process_sprite_sheet(filepath):
    print(f"Processing {filepath}...")
    try:
        img = Image.open(filepath).convert("RGBA")
        datas = img.getdata()
        
        newData = []
        for item in datas:
            # 크로마키 블루(파란색) 배경 투명화
            if item[2] > 150 and item[0] < 50 and item[1] < 50:
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)
        img.putdata(newData)
        
        # 3x3 자르기
        w, h = img.size
        frame_w = w // 3
        frame_h = h // 3
        
        base_name = os.path.basename(filepath).replace('_sheet.png', '')
        dir_name = os.path.dirname(filepath)
        
        idx = 1
        for r in range(3):
            for c in range(3):
                left = c * frame_w
                upper = r * frame_h
                right = left + frame_w
                lower = upper + frame_h
                
                frame = img.crop((left, upper, right, lower))
                frame_name = f"{base_name}_{idx:02d}.png"
                frame_path = os.path.join(dir_name, frame_name)
                frame.save(frame_path, "PNG")
                idx += 1
        print(f"Saved 9 frames for {base_name}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

directory = "/home/geehong/luckyyuum/app/android/app/src/main/res/drawable"
sheets = [
    "pet_fly_happy_sheet.png",
    "pet_fly_walk_sheet.png",
    "pet_fly_bathe_sheet.png",
    "pet_fly_sick_sheet.png",
    "pet_fly_dirty_sheet.png",
    "pet_fly_vaccinate_sheet.png"
]

for sheet in sheets:
    full_path = os.path.join(directory, sheet)
    if os.path.exists(full_path):
        process_sprite_sheet(full_path)
    else:
        print(f"File not found: {full_path}")

