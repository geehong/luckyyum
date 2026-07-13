with open("app/android/app/src/main/res/drawable/layout_svg/button2.svg", "r") as f:
    content = f.read()

defs_start = content.find('<defs>')
defs_section = content[defs_start:]
svg_header = content[:content.find('<g filter=')]

body = content[content.find('<g filter='):defs_start]
blocks = body.split('</g>')
blocks = [b.strip() + '\n</g>\n' for b in blocks if b.strip()]

print(f"Found {len(blocks)} blocks.")
for i, b in enumerate(blocks):
    print(f"Block {i} starts with: {b[:30]}")
