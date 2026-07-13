import re

def extract_buttons(filepath, filenames):
    with open(filepath, 'r') as f:
        content = f.read()

    defs_start = content.find('<defs>')
    defs_section = content[defs_start:]
    
    header = content[:content.find('<g filter=')]
    header = re.sub(r'width="[0-9.]+"', 'width="109"', header, count=1)
    header = re.sub(r'height="[0-9.]+"', 'height="109"', header, count=1)
    
    body = content[content.find('<g filter='):defs_start]
    blocks = body.split('</g>')
    blocks = [b.strip() + '\n</g>\n' for b in blocks if b.strip()]

    for i in range(4):
        b1 = blocks[i*2]
        b2 = blocks[i*2 + 1]
        
        cx_match = re.search(r'cx="([0-9.]+)"', b1)
        cy_match = re.search(r'cy="([0-9.]+)"', b1)
        if not cx_match or not cy_match:
            print("ERROR: cx or cy not found in block", filepath, i)
            return
        cx = float(cx_match.group(1))
        cy = float(cy_match.group(1))
        
        new_viewbox = f"{cx - 54.5} {cy - 54.5} 109 109"
        
        btn_header = re.sub(r'viewBox="[^"]+"', f'viewBox="{new_viewbox}"', header, count=1)
        
        out_content = btn_header + b1 + b2 + defs_section
        out_filepath = f"app/src/assets/svg/{filenames[i]}"
        with open(out_filepath, 'w') as f:
            f.write(out_content)

names2 = ["btn_feed.svg", "btn_bathe.svg", "btn_play.svg", "btn_medicine.svg"]
extract_buttons("app/android/app/src/main/res/drawable/layout_svg/button2.svg", names2)

names1 = ["btn_clean.svg", "btn_pet.svg", "btn_status.svg", "btn_talk.svg"]
extract_buttons("app/android/app/src/main/res/drawable/layout_svg/button1-1.svg", names1)
print("Done extracting completely isolated SVGs with correct mapping.")
