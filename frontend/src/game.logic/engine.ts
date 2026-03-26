// ───────────────────────── Types


export type GamePhase =
  | "LOBBY"
  | "SONG_PLAYING"
  | "ORIGINAL_GUESS_TURN"
  | "CIRCLE_GUESS_TURN"
  | "REVEAL_RESULTS"
  | "WAITING_TO_REVEAL"
  | "RESOLVE_ROUND"
  | "GAME_OVER";


export interface Player {
  uid: string | number;   // uid stored as string from Firebase
  name: string;
  health: number;
  alive: boolean;
  isHost?: boolean;       // identifies the creator/host of the room
}

export interface Guess {
  song?: string;
  artist?: string;
  year?: number;
  album?: string;
}


export interface Song {
  displayName: string;
  answerNames: string[];
  album: string;
  albumAnswers: string[];
  displayArtists: string;
  artists: string[];
  year: number;
  previewUrl: string;
  categories?: string[];
  isPlaying?: boolean; // used for multiplayer playback sync
  hasBeenPlayed?: boolean;
}

export interface SongSelection {
  year: string;
  category: string;
}


export interface Game {
  phase: GamePhase;
  players: Player[];
  turnIndex: number;
  circleGuessIndex?: number;
  currentSong: Song | null;
  originalGuesses: Record<number, Guess>;
  circleGuesses: Record<number, Guess>;
  preFireGuesses: Record<string | number, Guess>; // Stores guesses submitted by players not currently guessing
  answerRevealed: boolean;
  winner?: string | number | null;
  guessStartTime: number | null; // Timestamp when the current guess phase started (milliseconds)
  guessTimeLimit: number; // Time limit for guessing in seconds
  songSelections: SongSelection[];
}


export type GameAction =
  | { type: "ADD_PLAYER"; player: Omit<Player, "health" | "alive"> }
  | { type: "START_GAME" }
  | { type: "PLAY_SONG"; song: Song }
  | { type: "END_SONG" }
  | { type: "SET_PLAYING"; playing: boolean }
  | { type: "PRE_FIRE_GUESS_SUBMIT"; playerId: string | number; guesses: Guess }
  | { type: "ORIGINAL_GUESS_SUBMIT"; guesses: Guess }
  | { type: "CIRCLE_GUESS_SUBMIT"; playerId: String; guesses: Guess }
  | { type: "GUESS_TIMEOUT" } // New action for when guess time runs out
  | { type: "SET_SONG_SELECTIONS"; selections: SongSelection[] }
  | { type: "REVEAL_ANSWERS" }
  | { type: "RESOLVE_ROUND" }


// ──────────────────────────────────────────────── Helpers

// Spelling Tolerance
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function isSimilar(guess: string, correct: string[], threshold: number = 0.6): boolean {
  if (!guess) return false;
  
  // Normalize correct to array - handle string, array, or undefined
    
  const g = guess.toLowerCase().trim();
  const candidates = Array.isArray(correct) 
    ? correct.map(s => s.toLowerCase().trim())
    : [correct.toLowerCase().trim()];

  // Exact match
  if (candidates.some(c => g === c)) return true;

  // Best similarity ratio
  const best = Math.max(...candidates.map(c => {
    const distance = levenshteinDistance(g, c);
    const maxLength = Math.max(g.length, c.length);
    return 1 - distance / maxLength;
  }));

  return best >= threshold;
}

function calculateAccuracy(guess: Guess, correct: Song): number {
  if (!correct) return 0;
  
  let score = 0;
  
  // Song name - allow 60% similarity
  if (guess.song && isSimilar(guess.song, correct.answerNames, 0.6)) score += 30;

  // Artist - allow 60% similarity
  if (guess.artist && isSimilar(guess.artist, correct.artists, 0.6)) score += 30;
  
  // Year - partial points based on proximity
  if (guess.year !== undefined) {
    const yearDiff = Math.abs(guess.year - correct.year);
    if (yearDiff === 0) {
      score += 20; // Exact year
    } else if (yearDiff <= 2) {
      score += 15; // 1-2 year off
    } else if (yearDiff <= 5) {
      score += 10; // 3-5 years off
    } else if (yearDiff <= 10) {
      score += 5; // 6-10 years off
    }
    // More than 10 years off = 0 points
  }
  
  // Album - allow 60% similarity
  if (guess.album && isSimilar(guess.album, correct.albumAnswers, 0.6)) score += 20;
  
  return score;
}

function isWinningGuess(guess: Guess, correct: Song): boolean {
  return (
    guess.song !== undefined && isSimilar(guess.song, correct.answerNames, 0.6) &&
    guess.artist !== undefined && isSimilar(guess.artist, correct.artists, 0.6)
  );
}


// ──────────────────────────────────────────────── Reducer


export function gameReducer(game: Game, action: GameAction): Game {
  // Handle actions that can occur in (almost) any phase first
  if (action.type === "PRE_FIRE_GUESS_SUBMIT") {
    // Check if it's currently this player's turn to make an official guess
    const isPlayerGuessingTurn =
      (game.phase === "ORIGINAL_GUESS_TURN" && game.players[game.turnIndex].uid === action.playerId) ||
      (game.phase === "CIRCLE_GUESS_TURN" && game.circleGuessIndex !== undefined && game.players[game.circleGuessIndex].uid === action.playerId);

    // Only store pre-fire if it's NOT their turn
    if (!isPlayerGuessingTurn) {
      return { ...game, preFireGuesses: { ...game.preFireGuesses, [action.playerId]: action.guesses } };
    }
    return game;
  }
  switch (game.phase) {
    // ───────── LOBBY
    case "LOBBY":
      if (action.type === "ADD_PLAYER") {
        return {
          ...game,
          players: [
            ...game.players,
            { ...action.player, health: 100, alive: true }
          ]
        };
      }

      if (action.type === "SET_SONG_SELECTIONS") {
        return {
          ...game,
          songSelections: action.selections,
        };
      }

      if (action.type === "START_GAME" && game.players.length >= 2) {
        return {
          ...game,
          phase: "SONG_PLAYING",
          turnIndex: Math.floor(Math.random() * game.players.length),
          currentSong: null,
          originalGuesses: {},
          circleGuesses: {},
          preFireGuesses: {}, // Initialize pre-fire guesses
          guessStartTime: null,
          answerRevealed: false,
          songSelections: game.songSelections, // Carry over selections
          winner: undefined
        };
      }
      return game;


    // ───────── SONG_PLAYING
    case "SONG_PLAYING":
      if (action.type === "PLAY_SONG") {
        // respect provided playing flag or default to false (so guesser must
        // hit play)
        return {
          ...game,
          currentSong: { ...action.song, isPlaying: action.song.isPlaying ?? false, hasBeenPlayed: false }
        };
      }
      if (action.type === "END_SONG") {
        const originalPlayerUid = game.players[game.turnIndex].uid;
        const preFireGuess = game.preFireGuesses[originalPlayerUid];
        let newOriginalGuesses = { ...game.originalGuesses };
        let newPreFireGuesses = { ...game.preFireGuesses };

        if (preFireGuess) {
          newOriginalGuesses[originalPlayerUid] = preFireGuess;
          delete newPreFireGuesses[originalPlayerUid];
        }

        return {
          ...game,
          phase: "ORIGINAL_GUESS_TURN",
          guessStartTime: Date.now(),
          originalGuesses: newOriginalGuesses,
          preFireGuesses: newPreFireGuesses,
        };
      }
      if (action.type === "SET_PLAYING") {
        // This action is for controlling audio playback, not directly related to guesses
        if (!game.currentSong) return game;
        // Once the play button is clicked, hasBeenPlayed should be true forever for this song
        const hasBeenPlayed = game.currentSong.hasBeenPlayed || action.playing;
        return {
          ...game,
          currentSong: { ...game.currentSong, isPlaying: action.playing, hasBeenPlayed: action.playing || game.currentSong.hasBeenPlayed }
        };
      }
      return game;


    // ───────── ORIGINAL GUESS
    case "ORIGINAL_GUESS_TURN": {
      if (!game.currentSong) return game;
      if (action.type !== "ORIGINAL_GUESS_SUBMIT" && action.type !== "GUESS_TIMEOUT") return game;

      const originalPlayer = game.players[game.turnIndex];
      // If a new guess is submitted, it overrides any pre-fire guess. If timed out, use existing (pre-fire or empty).
      const submittedGuess = action.type === "ORIGINAL_GUESS_SUBMIT" ? action.guesses : (game.originalGuesses[originalPlayer.uid] || {});
      const instantWin = isWinningGuess(submittedGuess, game.currentSong);
      const acc = calculateAccuracy(submittedGuess, game.currentSong);

      const updatedOriginalGuesses = { ...game.originalGuesses, [originalPlayer.uid]: submittedGuess };
 
      if (instantWin || acc >= 60) {
        return {
          ...game,
          originalGuesses: updatedOriginalGuesses,
          phase: "REVEAL_RESULTS"
        };
      }

      let firstCircleIndex = (game.turnIndex + 1) % game.players.length;
      while (
        !game.players[firstCircleIndex].alive ||
        game.players[firstCircleIndex].uid === originalPlayer.uid
      ) {
        firstCircleIndex = (firstCircleIndex + 1) % game.players.length;
      }
      
      // Apply pre-fire guess for the first circle player if available
      let newCircleGuesses = { ...game.circleGuesses };
      let newPreFireGuesses = { ...game.preFireGuesses };
      const firstCirclePlayerUid = game.players[firstCircleIndex].uid;
      const firstCirclePreFireGuess = game.preFireGuesses[firstCirclePlayerUid];
      if (firstCirclePreFireGuess) {
        newCircleGuesses[firstCirclePlayerUid] = firstCirclePreFireGuess;
        delete newPreFireGuesses[firstCirclePlayerUid];
      }

      return {
        ...game,
        guessStartTime: Date.now(), // Reset timer for circle guess
        originalGuesses: updatedOriginalGuesses,
        circleGuessIndex: firstCircleIndex,
        circleGuesses: newCircleGuesses,
        preFireGuesses: newPreFireGuesses,
        phase: "CIRCLE_GUESS_TURN",
      };
    }


    // ───────── CIRCLE GUESS
    case "CIRCLE_GUESS_TURN": {
      if (action.type !== "CIRCLE_GUESS_SUBMIT" && action.type !== "GUESS_TIMEOUT") return game;
      if (!game.currentSong || game.circleGuessIndex === undefined) return game;

      const originalUid = game.players[game.turnIndex].uid;
      const expectedPlayer = game.players[game.circleGuessIndex];

      // On timeout, the "player" is the one whose turn it was.
      // On submit, it's the one who sent the action.
      const currentPlayerId = action.type === "CIRCLE_GUESS_SUBMIT" ? action.playerId : expectedPlayer.uid;

      // If a new guess is submitted, it overrides any pre-fire guess. If timed out, use existing (pre-fire or empty).
      const submittedGuess = action.type === "CIRCLE_GUESS_SUBMIT" ? action.guesses : (game.circleGuesses[String(currentPlayerId)] || {});

      // Only process if it's the expected player's turn or if it's a pre-fire guess for another player
      if (String(currentPlayerId) !== String(expectedPlayer.uid)) return game;

      let newCircleGuesses = { ...game.circleGuesses, [String(currentPlayerId)]: submittedGuess };
      let newPreFireGuesses = { ...game.preFireGuesses };

      // Evaluate the guess for the current player
      const guessAcc = calculateAccuracy(submittedGuess, game.currentSong);

      if (guessAcc >= 60) {
        return {
          ...game,
          circleGuesses: newCircleGuesses,
          circleGuessIndex: undefined,
          phase: "WAITING_TO_REVEAL",
          guessStartTime: null,
          preFireGuesses: { ...newPreFireGuesses, [String(currentPlayerId)]: undefined }, // Clear pre-fire guess for this player
        };
      }

      // Find next player for circle guess
      const alivePlayers = game.players.filter(p => p.alive);
      const circleOrder = alivePlayers.filter(p => String(p.uid) !== String(originalUid));
      const guessedPlayerIds = Object.keys(newCircleGuesses);

      const allGuessed = circleOrder.every(p => guessedPlayerIds.includes(String(p.uid)));

      let nextCircleIndex = game.circleGuessIndex;
      let nextPlayerFound = false;
      let potentialNextPlayerUid: string | number | undefined;

      for (let i = 0; i < game.players.length; i++) {
        nextCircleIndex = (nextCircleIndex + 1) % game.players.length;
        const nextPlayer = game.players[nextCircleIndex];
        if (nextPlayer.alive && String(nextPlayer.uid) !== String(originalUid) && !newCircleGuesses[String(nextPlayer.uid)]) {
          nextPlayerFound = true;
          potentialNextPlayerUid = nextPlayer.uid;
          break;
        }
      }

      // Apply pre-fire guess for the next player if available
      if (potentialNextPlayerUid !== undefined) {
        const nextPlayerPreFireGuess = game.preFireGuesses[potentialNextPlayerUid];
        if (nextPlayerPreFireGuess) {
          newCircleGuesses = {
            ...newCircleGuesses,
            [potentialNextPlayerUid]: nextPlayerPreFireGuess,
          };
          delete newPreFireGuesses[potentialNextPlayerUid];
        }
      }

      // Clear the current player's pre-fire guess after their turn is processed
      delete newPreFireGuesses[String(currentPlayerId)];

      return {
        ...game,
        guessStartTime: Date.now(), // Reset timer for the next turn
        circleGuesses: newCircleGuesses,
        circleGuessIndex: allGuessed || !nextPlayerFound ? undefined : nextCircleIndex,
        phase: allGuessed || !nextPlayerFound ? "WAITING_TO_REVEAL" : game.phase,
        preFireGuesses: newPreFireGuesses,
      };
    }

    // ───────── WAITING TO REVEAL
    case "WAITING_TO_REVEAL":
      if (action.type === "REVEAL_ANSWERS") { // This action was missing from GameAction type
        return { ...game, phase: "REVEAL_RESULTS", answerRevealed: true };
      }
      return game;

    // ───────── REVEAL RESULTS
    case "REVEAL_RESULTS": {
      if (action.type === "RESOLVE_ROUND") {
        if (!game.currentSong) return game;

        const song = game.currentSong;
        const originalUidReveal = game.players[game.turnIndex].uid;
        let players = game.players.map(p => ({ ...p }));

        const origGuess = game.originalGuesses[String(originalUidReveal) as any];
        if (origGuess && Object.keys(origGuess).length > 0) { // Only deal damage if there was an actual guess
          const acc = calculateAccuracy(origGuess, song);
          if (acc >= 60) {
            const dmg = 20 + Math.floor((acc - 60) / 2);
            players = players.map(p =>
              p.alive && String(p.uid) !== String(originalUidReveal)
                ? { ...p, health: Math.max(0, p.health - dmg) }
                : p
            );
          }
        }

        Object.entries(game.circleGuesses).forEach(([uid, guess]) => {
          if (Object.keys(guess).length > 0) { // Only heal if there was an actual guess
            const acc = calculateAccuracy(guess, song);
            const heal = Math.floor(acc / 5);
            players = players.map(p =>
              String(p.uid) === uid && p.alive
                ? { ...p, health: Math.min(100, p.health + heal) }
                : p
            );
          }
        });

        const updated = players.map(p => ({ ...p, alive: p.health > 0 }));
        const alive = updated.filter(p => p.alive);

        if (alive.length <= 1) {
          return {
            ...game,
            players: updated,
            phase: "GAME_OVER",
            winner: alive[0]?.uid ?? null
          };
        }

        let nextTurn = (game.turnIndex + 1) % updated.length;
        while (!updated[nextTurn].alive) {
          nextTurn = (nextTurn + 1) % updated.length;
        }

        return {
          ...game,
          players: updated,
          turnIndex: nextTurn,
          guessStartTime: null, // Reset timer for next round
          phase: "SONG_PLAYING",
          currentSong: null,
          originalGuesses: {},
          circleGuesses: {},
          preFireGuesses: {}, // Clear all pre-fire guesses for the new round
          songSelections: game.songSelections,
          answerRevealed: false
        };
      }
      return game;
    }

    // ───────── GAME OVER
    case "GAME_OVER":
      if (action.type === "START_GAME") {
        return {
          ...game,
          phase: "LOBBY",
          players: game.players.map(p => ({
            ...p,
            health: 100,
            alive: true
          })), // Reset health and alive status for all players
          preFireGuesses: {}, // Clear any remaining pre-fire guesses
          winner: undefined
        };
      }
      return game;


    default:
      return game;
  }
}
