import requests
from auth import get_access_token
import random

def get_random_preview():
    token = get_access_token()

    headers = {
        "Authorization": f"Bearer {token}"
    }

    params = {
        "q": "year:1990-2024",
        "type": "track",
        "limit": 50
    }

    response = requests.get(
        "https://api.spotify.com/v1/search",
        headers=headers,
        params=params
    )

    tracks = response.json()["tracks"]["items"]

    previews = [
        t["preview_url"] for t in tracks if t["preview_url"]
    ]

    return random.choice(previews) if previews else None
