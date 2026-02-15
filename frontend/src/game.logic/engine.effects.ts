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
  // Just set the src, don't try to play
  if (
    prev.phase !== "SONG_PLAYING" &&
    next.phase === "SONG_PLAYING" &&
    next.currentSong
  ) {
    audioEl.src = next.currentSong.previewURL;
    audioEl.currentTime = 0;
    // REMOVED: audioEl.play()
  }

  if (
    prev.phase === "SONG_PLAYING" && 
    next.phase !== "SONG_PLAYING" &&
    prev.currentSong !== null
  ) {
    audioEl.pause();
    audioEl.currentTime = 0;
  }
}