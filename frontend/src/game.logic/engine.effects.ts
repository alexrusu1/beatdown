import type { Game } from "./engine";
// The game variable is not used here, it's passed into initEngineEffects as a getter.
let game: Game;
let dispatchInternal: (action: any) => void;
let guessTimer: NodeJS.Timeout | null = null;

export function initEngineEffects(
  audioEl: HTMLAudioElement,
  getGame: () => Game,
  dispatch: (action: any) => void
) { // Renamed parameter to 'dispatch' to avoid conflict with global 'dispatchInternal'
  game = getGame();
  dispatchInternal = dispatch;

  audioEl.onended = () => {
    console.log("Audio ended, dispatching END_SONG");
    dispatch({ type: "END_SONG" });
  };

  audioEl.onerror = (e) => {
    console.error("Audio error:", e);
    // If a track fails to load (e.g. 403), request a new song instead of skipping the round
    dispatchInternal({ type: "SKIP_BROKEN_SONG", src: audioEl.src });
  };

  audioEl.oncanplay = () => {
    console.log("Audio can play");
  };

  audioEl.onloadstart = () => {
    console.log("Audio load started");
  };
}

export function handleEngineEffects(
  prev: Game,
  next: Game,
  audioEl: HTMLAudioElement
) {
  console.log("handleEngineEffects", {
    prevPhase: prev.phase,
    nextPhase: next.phase,
    prevSong: prev.currentSong?.displayName,
    nextSong: next.currentSong?.displayName,
    prevPlaying: prev.currentSong?.isPlaying,
    nextPlaying: next.currentSong?.isPlaying,
    prevGuessStartTime: prev.guessStartTime,
    nextGuessStartTime: next.guessStartTime
  });
  
  // Clear any existing guess timer
  if (guessTimer) {
    clearTimeout(guessTimer);
    guessTimer = null;
  }

  // Start a new guess timer if entering a guess phase
  const isRacePostSong = next.phase === "SONG_PLAYING" && next.mode === "RACE" && next.guessStartTime !== null;
  if (
    (next.phase === "ORIGINAL_GUESS_TURN" || next.phase === "CIRCLE_GUESS_TURN" || isRacePostSong) &&
    next.guessStartTime !== null &&
    next.guessTimeLimit > 0
  ) {
    const timeRemaining = next.guessTimeLimit * 1000 - (Date.now() - (next.guessStartTime || 0)); // Ensure next.guessStartTime is not null
    guessTimer = setTimeout(() => {
      console.log("Guess timer timed out, dispatching GUESS_TIMEOUT");
      dispatchInternal({ type: "GUESS_TIMEOUT" });
    }, Math.max(0, timeRemaining)); // Ensure non-negative timeout
  }

  // If we get a different preview URL (even mid-song), always reset the audio
  if (
    next.currentSong &&
    prev.currentSong?.previewUrl !== next.currentSong.previewUrl
  ) {
    console.log("Setting audio src to:", next.currentSong.previewUrl);
    audioEl.pause();
    audioEl.src = next.currentSong.previewUrl;
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
    console.log("Entering SONG_PLAYING, setting src:", next.currentSong.previewUrl);
    audioEl.src = next.currentSong.previewUrl;
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
      audioEl.play().catch((err) => {
        console.error("Failed to play audio:", err);
      });
    } else {
      console.log("Pausing audio");
      audioEl.pause();
    }
  }
}