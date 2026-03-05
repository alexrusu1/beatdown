import { gameReducer } from "./engine";
import type { Game } from "./engine";

let game: Game;
let dispatchInternal: (action: any) => void;

export function initEngineEffects(
  audioEl: HTMLAudioElement,
  getGame: () => Game,
  dispatch: (action: any) => void
) {
  game = getGame();
  dispatchInternal = dispatch;

  audioEl.onended = () => {
    console.log("Audio ended, dispatching END_SONG");
    dispatch({ type: "END_SONG" });
  };

  audioEl.onerror = (e) => {
    console.error("Audio error:", e);
  };

  audioEl.oncanplay = () => {
    console.log("Audio can play");
  };

  audioEl.onloadstart = () => {
    console.log("Audio load started");
  };
}

// REPLACE THIS ENTIRE FUNCTION:
export function handleEngineEffects(
  prev: Game,
  next: Game,
  audioEl: HTMLAudioElement
) {
  console.log("handleEngineEffects", {
    prevPhase: prev.phase,
    nextPhase: next.phase,
    prevSong: prev.currentSong?.name,
    nextSong: next.currentSong?.name,
    prevPlaying: prev.currentSong?.isPlaying,
    nextPlaying: next.currentSong?.isPlaying
  });
  
  // If we get a different preview URL (even mid-song), always reset the audio
  if (
    next.currentSong &&
    prev.currentSong?.previewURL !== next.currentSong.previewURL
  ) {
    console.log("Setting audio src to:", next.currentSong.previewURL);
    audioEl.pause();
    audioEl.src = next.currentSong.previewURL;
    audioEl.currentTime = 0;
    audioEl.load(); // Load the new audio source
  }

  // set the src whenever we enter SONG_PLAYING without a previous song
  if (
    prev.phase !== "SONG_PLAYING" &&
    next.phase === "SONG_PLAYING" &&
    next.currentSong
  ) {
    // source already set above if it changed, but ensure it exists
    console.log("Entering SONG_PLAYING, setting src:", next.currentSong.previewURL);
    audioEl.src = next.currentSong.previewURL;
    audioEl.currentTime = 0;
    audioEl.load(); // Load the audio source
    // don't auto-play here; play state handled separately below
  }

  // if we leave SONG_PLAYING, stop audio
  if (
    prev.phase === "SONG_PLAYING" && 
    next.phase !== "SONG_PLAYING" &&
    prev.currentSong !== null
  ) {
    console.log("Leaving SONG_PLAYING, pausing audio");
    audioEl.pause();
    audioEl.currentTime = 0;
  }

  // sync play/pause flag (useful for multiplayer)
  const prevPlaying = prev.currentSong?.isPlaying;
  const nextPlaying = next.currentSong?.isPlaying;
  if (prevPlaying !== nextPlaying) {
    console.log("Play/pause change:", prevPlaying, "->", nextPlaying);
    if (nextPlaying) {
      console.log("Attempting to play audio");
      // Check if audio is ready to play
      if (audioEl.readyState >= 2) { // HAVE_CURRENT_DATA or higher
        audioEl.play().catch((err) => {
          console.error("Failed to play audio:", err);
        });
      } else {
        console.log("Audio not ready, waiting for canplay event");
        const onCanPlay = () => {
          console.log("Audio can now play, starting playback");
          audioEl.play().catch((err) => {
            console.error("Failed to play audio after canplay:", err);
          });
          audioEl.removeEventListener('canplay', onCanPlay);
        };
        audioEl.addEventListener('canplay', onCanPlay);
      }
    } else {
      console.log("Pausing audio");
      audioEl.pause();
    }
  }
}