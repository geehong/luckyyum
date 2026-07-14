import os
import glob

directory = "/home/geehong/luckyyuum/app/android/app/src/main/res/drawable"

actions = [
    ("happy", "pet_fly_happy_sheet*.png"),
    ("walk", "pet_fly_walk_sheet*.png"),
    ("bathe", "pet_fly_bathe_sheet*.png"),
    ("sick", "pet_fly_sick_sheet*.png"),
    ("dirty", "pet_fly_dirty_sheet*.png"),
    ("vaccinate", "pet_fly_vaccinate_sheet*.png")
]

for action, pattern in actions:
    files = sorted(glob.glob(os.path.join(directory, pattern)))
    # filter out the original sheet by size or name if necessary
    # The user named the sliced files with digits at the end
    sliced_files = [f for f in files if any(char.isdigit() for char in os.path.basename(f))]
    
    if len(sliced_files) == 9:
        xml_content = '<?xml version="1.0" encoding="utf-8"?>\n<animation-list xmlns:android="http://schemas.android.com/apk/res/android" android:oneshot="false">\n'
        for i, old_path in enumerate(sliced_files):
            new_name = f"pet_fly_{action}_{i+1:02d}.png"
            new_path = os.path.join(directory, new_name)
            os.rename(old_path, new_path)
            
            # Add to XML
            xml_content += f'    <item android:drawable="@drawable/pet_fly_{action}_{i+1:02d}" android:duration="150" />\n'
            
        xml_content += '</animation-list>'
        
        # Save XML
        xml_path = os.path.join(directory, f"pet_fly_{action}_anim.xml")
        with open(xml_path, 'w') as f:
            f.write(xml_content)
        print(f"Successfully processed {action} (renamed 9 files and created XML).")
    else:
        print(f"Warning: Expected 9 files for {action}, but found {len(sliced_files)}.")

