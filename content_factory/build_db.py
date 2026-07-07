import sqlite3
import json
import os
import hashlib

def build_db():
    output_dir = "output"
    json_path = os.path.join(output_dir, "fortunes.json")
    db_path = os.path.join(output_dir, "fortune.sqlite")
    
    if not os.path.exists(json_path):
        print(f"Error: {json_path} does not exist. Run generate.py first.")
        return
        
    with open(json_path, "r", encoding="utf-8") as f:
        fortunes = json.load(f)
        
    # Connect to SQLite
    if os.path.exists(db_path):
        os.remove(db_path)
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Create table
    cursor.execute("""
    CREATE TABLE fortunes (
        id TEXT PRIMARY KEY,
        day_master TEXT,
        month_branch TEXT,
        tier INTEGER,
        message TEXT,
        lucky_item TEXT
    )
    """)
    
    # Insert data
    for item in fortunes:
        cursor.execute("""
        INSERT INTO fortunes (id, day_master, month_branch, tier, message, lucky_item)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (item['id'], item['day_master'], item['month_branch'], item['tier'], item['message'], item['lucky_item']))
        
    conn.commit()
    conn.close()
    print(f"Created {db_path} with {len(fortunes)} records.")
    
    # Generate meta.json
    with open(db_path, "rb") as f:
        bytes_data = f.read()
        file_hash = hashlib.md5(bytes_data).hexdigest()
        
    meta = {
        "version": 1,
        "db_url": "https://cdn.luckyyum.example.com/fortune.sqlite",
        "checksum": file_hash,
        "updated_at": "2026-07-07T00:00:00Z"
    }
    
    meta_path = os.path.join(output_dir, "meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
        
    print(f"Created {meta_path} with checksum {file_hash}.")

if __name__ == "__main__":
    build_db()
