import json
import os

# The full path to the songs.json file you want to modify.
file_path = r'c:\Users\alexr\Downloads\beatdown\frontend\src\data\songs.json'

print(f"Attempting to read file at: {file_path}")

try:
    # Read the JSON file
    with open(file_path, 'r', encoding='utf-8') as f:
        songs = json.load(f)
    print(f"Successfully parsed {len(songs)} songs from the file.")

    try:
        # Find the index of the song "On & On"
        start_index = next(i for i, song in enumerate(songs) if song.get('displayName') == "On & On")
        print(f"Found 'On & On' at index {start_index}. Starting update...")

        changes_count = 0
        # Iterate from the found index to the end of the array
        for i in range(start_index, len(songs)):
            # Check if the category needs changing to avoid unnecessary writes
            if songs[i].get('categories') != ["Electronic"]:
                songs[i]['categories'] = ["Electronic"]
                changes_count += 1
        
        if changes_count == 0:
            print("No changes needed. All relevant songs already have the 'Electronic' category.")
        else:
            # Write the updated JSON back to the file
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(songs, f, indent=2, ensure_ascii=False)
            
            print(f"\nSuccess!")
            print(f"Updated {changes_count} song(s).")
            print("The categories have been changed to 'Electronic' from 'On & On' to the end of the file.")
            
    except StopIteration:
        print("Error: Could not find the song 'On & On' to start the update. No changes were made.")
    except Exception as e:
        print(f"An error occurred during the update process: {e}")
        
except FileNotFoundError:
    print(f"Error: Could not read the file at the specified path.")
    print(f"Please check if the path is correct: {file_path}")
except json.JSONDecodeError:
    print("Error parsing JSON. Please ensure the file is a valid JSON.")
except Exception as e:
    print(f"An unexpected error occurred: {e}")

