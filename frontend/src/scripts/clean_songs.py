import json
import os
import re

def normalize(text):
    text = re.sub(r"[^a-z0-9\s.,\'\"!?\/-@%&#$*]", "", text.lower()).strip()
    return re.sub(r"\s+", " ", text).strip()

def clean_songs_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        songs = json.load(f)

    cleaned_songs = []
    seen_keys = set()
    
    # Keywords indicating wrong versions
    wrong_version_keywords = [
        "glee cast", "symphonic version", "techno version", 
        "karaoke", "lullaby renditions",
        "made famous by", "tribute", "type beat"
    ]
    
    # Specific artists to exclude for known covers identified in the dataset
    cover_artists = ["twopilots", "r-swift", "boyce avenue", "jdagxd", "nautylusprod"]

    for song in songs:
        year = song.get("year")
        display_name = song.get("displayName", "").lower()
        display_artists = song.get("displayArtists", "").lower()
        
        # 1. Skip wrong versions based on keywords (bypassed if released in 2024 or later)
        is_wrong_version = any(kw in display_name or kw in display_artists for kw in wrong_version_keywords)
        is_cover_artist = any(ca in display_artists for ca in cover_artists)
        
        if (is_wrong_version or is_cover_artist) and (not year or year < 2024):
            print(f"Removing wrong version/cover: {song['displayName']} by {song['displayArtists']}")
            continue

        # 2. Check for duplicates
        answer_name = normalize(song.get("answerName", ""))
        artists = song.get("artists", [])
        primary_artist = normalize(artists[0]) if artists else ""
        
        unique_key = f"{answer_name}::{primary_artist}"
        
        if unique_key in seen_keys:
            print(f"Removing duplicate: {song['displayName']} by {song['displayArtists']}")
            continue
        
        seen_keys.add(unique_key)
        cleaned_songs.append(song)

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(cleaned_songs, f, indent=2, ensure_ascii=False)
        
    print(f"Original count: {len(songs)}")
    print(f"Cleaned count: {len(cleaned_songs)}")

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.normpath(os.path.join(script_dir, "..", "data", "songs.json"))
    clean_songs_json(json_path)