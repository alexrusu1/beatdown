import requests
import json
import re
import os
import time
from datetime import datetime
import csv
from urllib.parse import quote_plus

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "data", "songs.json"))
TOTAL_SONGS = 10000
RESULTS_PER_REQUEST = 50


# ----------------------------
# Normalization Helpers
# ----------------------------

def normalize(text):
    text = re.sub(r"[^a-z0-9\s.,\'\"!?\/-@%&#$*]", "", text.lower()).strip()
    return re.sub(r"\s+", " ", text).strip()



def clean_title(title):
    title = re.sub(r"\(.*?\)", "", title)  # remove parentheses
    title = re.sub(r"\[.*?\]", "", title)  # remove brackets
    title = re.sub(r"\b(feat\.|ft\.|featuring|with|prod\.)\b.*", "", title, flags=re.IGNORECASE)
    return normalize(title)


def generate_answer_variants(title):
    """
    Generate multiple accepted answer variants for a song title.

    Returns a list of normalized strings, starting with the cleanest
    version and including progressively more detail.

    Examples:
      "Blinding Lights (Remix)"  -> ["blinding lights", "blinding lights remix"]
      "As It Was [Live]"         -> ["as it was", "as it was live"]
      "Heat Waves (feat. X)"     -> ["heat waves", "heat waves feat x"]
    """
    variants = set()

    # 1. Fully stripped version (no brackets, no feat)
    base = clean_title(title)
    if base:
        variants.add(base)

    # 2. Extract parenthetical/bracket content and append to base
    paren_matches = re.findall(r"\(([^)]*)\)", title)
    bracket_matches = re.findall(r"\[([^\]]*)\]", title)
    extras = paren_matches + bracket_matches

    for extra in extras:
        # Skip pure featured-artist annotations — not useful as an answer variant
        if re.match(r"^(feat\.|ft\.|featuring)", extra.strip(), re.IGNORECASE):
            continue
        extra_clean = normalize(re.sub(r"feat\.|ft\.|featuring.*", "", extra, flags=re.IGNORECASE))
        if extra_clean and base:
            variants.add(f"{base} {extra_clean}".strip())

    # Return as a list, shortest (cleanest) first
    return sorted(variants, key=len)

EDITION_KEYWORDS = r"single|ep|remix|deluxe|remaster|remastered|edition|version|live|acoustic"

def generate_album_answer_variants(album):
    """
    Generate multiple accepted answer variants for an album name.

    Strips common suffixes like '- Single', '- EP', '(Deluxe Edition)', etc.
    and returns both the stripped and full versions.

    Examples:
      "Midnights - EP"              -> ["midnights", "midnights ep"]
      "Lover (Deluxe Edition)"      -> ["lover", "lover deluxe edition"]
      "After Hours - Single"        -> ["after hours", "after hours single"]
    """
    if not album:
        return []

    variants = set()

    # 1. Derive a single clean base by stripping ALL annotation sources:
    #    - parentheses/brackets
    #    - dash-separated edition suffixes
    base = album
    base = re.sub(r"\(([^)]*)\)", "", base)           # remove (...)
    base = re.sub(r"\[([^\]]*)\]", "", base)           # remove [...]
    base = re.sub(                                     # remove - Single / - EP / etc.
        rf"\s*-\s*({EDITION_KEYWORDS})\b.*",
        "",
        base,
        flags=re.IGNORECASE,
    )
    base = normalize(base)
    if base:
        variants.add(base)

    # 2. Collect each suffix separately, then append to base once
    suffixes = []

    # Dash-separated suffixes: "- Single", "- Deluxe Edition", etc.
    dash_match = re.search(
        rf"\s*-\s*(({EDITION_KEYWORDS})\b.*)",
        album,
        re.IGNORECASE,
    )
    if dash_match:
        suffixes.append(normalize(dash_match.group(1)))

    # Parenthetical/bracket content: "(Deluxe Edition)", "[Remastered]", etc.
    paren_matches = re.findall(r"\(([^)]*)\)", album)
    bracket_matches = re.findall(r"\[([^\]]*)\]", album)
    for extra in paren_matches + bracket_matches:
        cleaned = normalize(extra)
        if cleaned:
            suffixes.append(cleaned)

    # Add "base + each suffix" as a variant
    for suffix in suffixes:
        if base and suffix:
            variants.add(f"{base} {suffix}")

    # 3. Full normalized album name (handles unusual cases)
    full = normalize(album)
    if full:
        variants.add(full)

    return sorted(variants, key=len)


def extract_featured_artists_from_title(title):
    match = re.search(r"(feat\.|ft\.|featuring\.|with)(.*)", title, re.IGNORECASE)
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
        # Support both old (answerName string) and new (answerNames list) formats
        answer = song.get("answerNames", [song.get("answerName", "")])[0]
        key = normalize(answer + song["artists"][0])
        existing_keys.add(key)

    return songs, existing_keys


# ----------------------------
# Fetch Songs
# ----------------------------

def fetch_songs(target_total, existing_songs, existing_keys, terms="", search_name=""):
    # Normalize and URL-encode terms
    terms = quote_plus(terms or "")
    SEARCH_TERMS = [terms]

    songs = []
    current_total = len(existing_songs)

    for term in SEARCH_TERMS:

        # Prefer passing an explicit search_name (individual song) when provided
        if search_name:
            q = quote_plus(search_name)
            print(f"Searching: {search_name}")
            url = f"https://itunes.apple.com/search?term={q}&entity=song&limit={RESULTS_PER_REQUEST}"
        else:
            display_term = term or "(empty)"
            print(f"Searching: {display_term}")
            url = f"https://itunes.apple.com/search?term={term}&entity=song&limit={RESULTS_PER_REQUEST}"

        # Robust network handling with retries/backoff
        try_count = 0
        max_retries = 3
        while True:
            try:
                response = requests.get(url, timeout=10)
            except requests.RequestException as e:
                try_count += 1
                print(f"Request failed ({try_count}/{max_retries}): {e}")
                if try_count >= max_retries:
                    print("Skipping this term after repeated network errors.")
                    data = {"results": []}
                    break
                time.sleep(1 * try_count)
                continue

            if response.status_code != 200:
                print(f"Non-200 response {response.status_code} for url: {url}")
                # show small snippet for debugging
                snippet = (response.text or "")[:200]
                print("Response snippet:", snippet)
                try_count += 1
                if try_count >= max_retries:
                    print("Skipping this term after repeated non-200 responses.")
                    data = {"results": []}
                    break
                time.sleep(1 * try_count)
                continue

            # Try to parse JSON; handle HTML/error pages gracefully
            try:
                data = response.json()
            except (json.JSONDecodeError, ValueError) as e:
                print("Failed to decode JSON response:", e)
                # show small snippet to help debug (may be HTML or rate-limit message)
                snippet = (response.text or "")[:500]
                print("Response snippet (first 500 chars):\n", snippet)
                try_count += 1
                if try_count >= max_retries:
                    print("Skipping this term after repeated invalid responses.")
                    data = {"results": []}
                    break
                time.sleep(1 * try_count)
                continue
            break


        for result in data.get("results", []):

            if current_total >= target_total:
                return songs


            display_name = result.get("trackName")
            artist_name = result.get("artistName")

            if not display_name or not artist_name:
                continue

            # Generate all accepted answer variants for the song title
            answer_names = generate_answer_variants(display_name)

            if not answer_names:
                continue

            if answer_names[0].lower() != display_name.lower():
                answer_names.append(display_name)

            # Primary answer is the shortest/cleanest variant
            primary_answer = answer_names[0]

            primary_artists = split_primary_artists(artist_name)
            featured_artists = extract_featured_artists_from_title(display_name)
            all_artists = list(set(primary_artists + featured_artists))

            if not all_artists:
                continue

            unique_key = normalize(primary_answer + all_artists[0])

            if unique_key in existing_keys:
                continue

            existing_keys.add(unique_key)
            current_total += 1

            album = result.get("collectionName")
            answer_albums = generate_album_answer_variants(album)

            if not answer_albums:
                continue
            
            if answer_albums[0].lower() != album.lower():
                answer_albums.append(album)

            song_obj = {
                "displayName": display_name,
                # answerNames: list of all accepted answers (shortest/cleanest first)
                "answerNames": answer_names,
                # Keep answerName for backwards compatibility
                "answerName": primary_answer,
                "album": album,
                # albumAnswers: list of all accepted album answers
                "albumAnswers": answer_albums,
                # Keep albumAnswer for backwards compatibility
                "albumAnswer": clean_title(album or ""),
                "albumCover": result.get("artworkUrl100", "").replace("100x100", "600x600"),
                "year": datetime.fromisoformat(
                    result.get("releaseDate").replace("Z", "+00:00")
                ).year if result.get("releaseDate") else None,
                "displayArtists": artist_name,
                "artists": all_artists,
                "previewUrl": result.get("previewUrl"),
                "categories": [result["primaryGenreName"]] if result.get("primaryGenreName") else []
            }

            songs.append(song_obj)

            if search_name != "":
                return songs
            

    return songs


# ----------------------------
# Main
# ----------------------------

def main():
    print("Loading existing songs...")
    existing_songs, existing_keys = load_existing_songs()
    print("existing songs: " + str(len(existing_songs)))

    target_total = TOTAL_SONGS
    choice = 0

    while(choice != 1 and choice != 2 and choice != 3):
        choice = int(input("What would you like to do?\n" \
        "1: load songs based on a genre\n" \
        "2: load individual songs\n" \
        "3: load songs from a csv file\n"))

    search_term = ""
    search_genre = ""

    if choice == 1:
        search_genre = input("enter a genre: ")
        print("Fetching new songs...")
        new_songs = fetch_songs(target_total, existing_songs, existing_keys, search_genre, search_term)
    elif choice == 2:
        search_term = input("enter a song name and artist: ")
        new_songs = fetch_songs(target_total, existing_songs, existing_keys, search_genre, search_term)
    elif choice == 3:
        new_songs = []
        csv_file = input("what is the path of the csv file?\n")
        with open(csv_file, mode='r', newline='', encoding='utf-8') as file:
            csv_reader = csv.DictReader(file)
            for row in csv_reader:
                search_term = row['Track Name'] + " " + row['Artist Name(s)']
                new_songs += fetch_songs(target_total, existing_songs, existing_keys, search_genre, search_term)
                if len(new_songs) % 20 == 0:
                    print("waiting 20 seconds to avoid reaching API call limit...")
                    time.sleep(20)



    all_songs = existing_songs + new_songs

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_songs, f, indent=2, ensure_ascii=False)

    print(f"Added {len(new_songs)} new songs.")
    print(f"Total songs in file: {len(all_songs)}")


if __name__ == "__main__":
    main()