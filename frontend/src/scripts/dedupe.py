import csv

# Function to read URIs from a CSV file
def get_uris(filename):
    uris = set()
    with open(filename, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)  # Skip header
        for row in reader:
            if row:
                uri = row[0].strip()
                uris.add(uri)
    return uris

# Get URIs from Wrap.csv and Childhood_Bangers.csv
wrap_uris = get_uris('frontend/src/scripts/Wrap.csv')
childhood_uris = get_uris('frontend/src/scripts/Childhood_Bangers.csv')

# Combine into a set of URIs to remove
remove_uris = wrap_uris | childhood_uris

# Read Chill_songs.csv and filter
with open('frontend/src/scripts/Chill_songs.csv', 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    header = next(reader)
    rows = [row for row in reader if row and row[0].strip() not in remove_uris]

# Write back to Chill_songs.csv
with open('frontend/src/scripts/Chill_songs.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(header)
    writer.writerows(rows)

print(f"Removed {len(remove_uris)} duplicate songs from Chill_songs.csv")