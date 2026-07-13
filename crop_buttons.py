import os
import re

def crop_svg(filepath, out_filepath, center_x):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Replace the width, height, and viewBox
    # Original is <svg width="383" height="109" viewBox="0 0 383 109" ...>
    # We want width="96" height="109" viewBox="<center_x - 48> 0 96 109"
    new_viewbox = f"{center_x - 48} 0 96 109"
    
    # regex to replace width="..."
    content = re.sub(r'width="[0-9.]+"', 'width="96"', content, count=1)
    content = re.sub(r'viewBox="[^"]+"', f'viewBox="{new_viewbox}"', content, count=1)
    
    with open(out_filepath, 'w') as f:
        f.write(content)

centers = [53.0, 144.3, 235.6, 326.9]

# Top row (button2.svg) -> clean, status, talk, pet
src2 = "app/android/app/src/main/res/drawable/layout_svg/button2.svg"
crop_svg(src2, "app/src/assets/svg/btn_clean.svg", centers[0])
crop_svg(src2, "app/src/assets/svg/btn_status.svg", centers[1])
crop_svg(src2, "app/src/assets/svg/btn_talk.svg", centers[2])
crop_svg(src2, "app/src/assets/svg/btn_pet.svg", centers[3])

# Bottom row (button1-1.svg) -> feed, bathe, play, medicine
src1 = "app/android/app/src/main/res/drawable/layout_svg/button1-1.svg"
crop_svg(src1, "app/src/assets/svg/btn_feed.svg", centers[0])
crop_svg(src1, "app/src/assets/svg/btn_bathe.svg", centers[1])
crop_svg(src1, "app/src/assets/svg/btn_play.svg", centers[2])
crop_svg(src1, "app/src/assets/svg/btn_medicine.svg", centers[3])

print("Cropped SVGs.")
