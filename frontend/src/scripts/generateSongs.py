import requests
import json
import re
import os
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "data", "songs.json"))
TOTAL_SONGS = 200
RESULTS_PER_REQUEST = 50


# ----------------------------
# Normalization Helpers
# ----------------------------

def normalize(text):
    return re.sub(r"[^a-z0-9\s]", "", text.lower()).strip()


def clean_title(title):
    title = re.sub(r"\(.*?\)", "", title)  # remove brackets
    title = re.sub(r"\[.*?\]", "", title)  # remove brackets
    title = re.sub(r"feat\.|ft\.|featuring", "", title, flags=re.IGNORECASE)
    return normalize(title)


def extract_featured_artists_from_title(title):
    match = re.search(r"(feat\.|ft\.|featuring)(.*)", title, re.IGNORECASE)
    if not match:
        return []

    featured_part = match.group(2)

    artists = re.split(r",|&| x ", featured_part)
    cleaned = []

    for artist in artists:
        artist = normalize(artist)
        if artist:
            cleaned.append(artist)

    return cleaned


def split_primary_artists(artist_string):
    artists = re.split(r",|&| x ", artist_string.lower())
    cleaned = []

    for artist in artists:
        artist = normalize(artist)
        if artist:
            cleaned.append(artist)

    return cleaned


# ----------------------------
# Load Existing Songs
# ----------------------------

def load_existing_songs():
    if not os.path.exists(OUTPUT_FILE):
        return [], set()

    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        try:
            songs = json.load(f)
        except (json.JSONDecodeError, ValueError):
            return [], set()

    existing_keys = set()

    for song in songs:
        key = normalize(song["answerName"] + song["artists"][0])
        existing_keys.add(key)

    return songs, existing_keys


# ----------------------------
# Fetch Songs
# ----------------------------

def fetch_pop_songs(target_total, existing_songs, existing_keys):
  SEARCH_TERMS = [
      "pop",
      "pop hits",
      "pop 2023",
      "pop 2022",
      "pop 2021",
      "pop love",
      "pop dance",
      "pop radio",
      "top pop",
      "viral pop",
      "pop 2010s",
      "pop 2000s"
  ]

  songs = []
  current_total = len(existing_songs)

  for term in SEARCH_TERMS:
      print(f"Searching: {term}")

      url = (
          "https://itunes.apple.com/search"
          f"?term={term}&entity=song&limit=50"
      )

      response = requests.get(url)
      data = response.json()

      for result in data.get("results", []):

          if current_total >= target_total:
              return songs

          # STRICT genre filter
          if result.get("primaryGenreName", "").lower() != "pop":
              continue

          display_name = result.get("trackName")
          artist_name = result.get("artistName")

          if not display_name or not artist_name:
              continue

          answer_name = clean_title(display_name)

          primary_artists = split_primary_artists(artist_name)
          featured_artists = extract_featured_artists_from_title(display_name)

          all_artists = list(set(primary_artists + featured_artists))

          if not all_artists:
              continue

          unique_key = normalize(answer_name + all_artists[0])

          if unique_key in existing_keys:
              continue

          existing_keys.add(unique_key)
          current_total += 1

          song_obj = {
              "displayName": display_name,
              "answerName": answer_name,
              "album": result.get("collectionName"),
              "albumAnswer": clean_title(result.get("collectionName") or ""),
              "albumCover": result.get("artworkUrl100", "").replace("100x100", "600x600"),
              "year": datetime.fromisoformat(
                  result.get("releaseDate").replace("Z", "+00:00")
              ).year if result.get("releaseDate") else None,
              "displayArtists": artist_name,
              "artists": all_artists,
              "previewUrl": result.get("previewUrl"),
              "categories": ["pop"]
          }

          songs.append(song_obj)

  return songs

# ----------------------------
# Main
# ----------------------------

def main():
  print("Loading existing songs...")
  existing_songs, existing_keys = load_existing_songs()

  target_total = TOTAL_SONGS


  print("Fetching new pop songs...")
  new_songs = fetch_pop_songs(target_total, existing_songs, existing_keys)

  all_songs = existing_songs + new_songs

  os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
  with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
      json.dump(all_songs, f, indent=2, ensure_ascii=False)

  print(f"✅ Added {len(new_songs)} new songs.")
  print(f"🎵 Total songs in file: {len(all_songs)}")


if __name__ == "__main__":
    main()