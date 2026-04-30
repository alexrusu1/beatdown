import type { Game, Difficulty, Song, Guess } from "./engine";
let getGameInternal: () => Game;
let dispatchInternal: (action: any) => void;
let guessTimer: NodeJS.Timeout | null = null;

export function initEngineEffects(
  audioEl: HTMLAudioElement,
  getGame: () => Game,
  dispatch: (action: any) => void
) {
  getGameInternal = getGame;
  dispatchInternal = dispatch;

  audioEl.onended = () => {
    console.log("Audio ended, dispatching END_SONG");
    const currentGame = getGameInternal();
    if (currentGame?.currentSong) {
      dispatchInternal({ type: "END_SONG" });
    }
  };

  audioEl.onerror = (e) => {
    console.error("Audio error:", e);
    const currentGame = getGameInternal();
    // If a track fails to load (e.g. 403), request a new song instead of skipping the round
    if (currentGame?.currentSong) {
      dispatchInternal({ type: "SKIP_BROKEN_SONG", src: audioEl.src });
    }
  };

  audioEl.oncanplay = () => {
    console.log("Audio can play");
  };

  audioEl.onloadstart = () => {
    console.log("Audio load started");
  };
}

// AI Guessing Logic
function generateAIGuess(difficulty: Difficulty, song: Song): Guess {
    const guess: Guess = {};
    const random = Math.random();

    // Probabilities for guessing each part correctly
    let songChance = 0, artistChance = 0, yearChance = 0, albumChance = 0;

    switch (difficulty) {
        case "EASY":
            songChance = 0.6;
            artistChance = 0.3;
            break;
        case "MEDIUM":
            songChance = 0.85;
            artistChance = 0.75;
            yearChance = 0.4;
            albumChance = 0.15;
            break;
        case "HARD":
            songChance = 1.0;
            artistChance = 0.9;
            yearChance = 0.7;
            albumChance = 0.5;
            break;
    }

    if (random < songChance) {
        guess.song = song.answerNames[0]; // Guess the first answer name
    }
    if (random < artistChance) {
        guess.artist = song.artists[0]; // Guess the first artist
    }
    if (random < yearChance) {
        const yearOffset = difficulty === 'HARD' ? Math.floor(Math.random() * 3) - 1 : Math.floor(Math.random() * 11) - 5;
        guess.year = song.year + yearOffset;
    }
    if (random < albumChance) {
        guess.album = song.albumAnswers[0];
    }

    return Object.keys(guess).length > 0 ? guess : { isPass: true };
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
        if (err.name === "NotAllowedError") {
          window.dispatchEvent(new Event("audio-autoplay-failed"));
        }
      });
    } else {
      console.log("Pausing audio");
      audioEl.pause();
    }
  }

  // --- AI Player Logic ---
  if (next.isSolo && next.currentSong) {
      // --- AI for CLASSIC mode (turn-based) ---
      const isAITurnNow = (
          // Transitioned to AI's original guess turn
          (prev.phase !== "ORIGINAL_GUESS_TURN" && next.phase === "ORIGINAL_GUESS_TURN" && next.players[next.turnIndex]?.uid === "AI_PLAYER") ||
          // Transitioned to AI's circle guess turn
          (next.phase === "CIRCLE_GUESS_TURN" && prev.circleGuessIndex !== next.circleGuessIndex && next.circleGuessIndex !== undefined && next.players[next.circleGuessIndex]?.uid === "AI_PLAYER")
      );

      if (isAITurnNow) {
          // In Classic mode, the CPU should answer right away.
          const thinkTime = 0;

          console.log(`AI's turn (Classic). Guessing in ${thinkTime}ms...`);
          setTimeout(() => {
              const currentGame = getGameInternal();
              if (currentGame.currentSong) {
                  const aiGuess = generateAIGuess(currentGame.difficulty || "MEDIUM", currentGame.currentSong);
                  console.log("AI is guessing (Classic):", aiGuess);
                  dispatchInternal({
                      type: "SUBMIT_GUESS",
                      playerId: "AI_PLAYER",
                      guesses: aiGuess
                  });
              }
          }, thinkTime);
      }

      // --- AI for RACE mode (real-time) ---
      const justStartedRaceSong = next.mode === "RACE" && next.phase === "SONG_PLAYING" && prev.phase !== "SONG_PLAYING";
      
      if (justStartedRaceSong) {
          let thinkTime = 7000; // ms, default medium
          switch (next.difficulty) {
              case "EASY": thinkTime = 12000 + Math.random() * 6000; break; // Slower for race
              case "MEDIUM": thinkTime = 7000 + Math.random() * 5000; break;
              case "HARD": thinkTime = 3000 + Math.random() * 4000; break;
          }

          console.log(`AI in RACE mode. Will guess in ${thinkTime}ms...`);
          setTimeout(() => {
              const currentGame = getGameInternal();
              // Only guess if the round is still active (player hasn't won yet)
              if (currentGame.phase === "SONG_PLAYING" && currentGame.currentSong) {
                  const aiGuess = generateAIGuess(currentGame.difficulty || "MEDIUM", currentGame.currentSong);
                  console.log("AI is guessing in RACE mode:", aiGuess);
                  dispatchInternal({ type: "SUBMIT_GUESS", playerId: "AI_PLAYER", guesses: aiGuess });
              }
          }, thinkTime);
      }
  }
}