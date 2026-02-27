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
    dispatch({ type: "END_SONG" });
  };
}

// REPLACE THIS ENTIRE FUNCTION:
export function handleEngineEffects(
  prev: Game,
  next: Game,
  audioEl: HTMLAudioElement
) {
  // If we get a different preview URL (even mid-song), always reset the audio
  if (
    next.currentSong &&
    prev.currentSong?.previewURL !== next.currentSong.previewURL
  ) {
    audioEl.pause();
    audioEl.src = next.currentSong.previewURL;
    audioEl.currentTime = 0;
  }

  // set the src whenever we enter SONG_PLAYING without a previous song
  if (
    prev.phase !== "SONG_PLAYING" &&
    next.phase === "SONG_PLAYING" &&
    next.currentSong
  ) {
    // source already set above if it changed, but ensure it exists
    audioEl.src = next.currentSong.previewURL;
    audioEl.currentTime = 0;
    // don't auto-play here; play state handled separately below
  }

  // if we leave SONG_PLAYING, stop audio
  if (
    prev.phase === "SONG_PLAYING" && 
    next.phase !== "SONG_PLAYING" &&
    prev.currentSong !== null
  ) {
    audioEl.pause();
    audioEl.currentTime = 0;
  }

  // sync play/pause flag (useful for multiplayer)
  const prevPlaying = prev.currentSong?.isPlaying;
  const nextPlaying = next.currentSong?.isPlaying;
  if (prevPlaying !== nextPlaying) {
    if (nextPlaying) {
      audioEl.play().catch(() => {});
    } else {
      audioEl.pause();
    }
  }
}