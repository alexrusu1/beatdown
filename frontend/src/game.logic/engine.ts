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
  isPlaying?: boolean; // used for multiplayer playback sync
}


export interface Game {
  phase: GamePhase;
  players: Player[];
  turnIndex: number;
  circleGuessIndex?: number;
  currentSong: Song | null;
  originalGuesses: Record<number, Guess>;
  circleGuesses: Record<number, Guess>;
  answerRevealed: boolean;
  winner?: string | number | null;
  guessStartTime: number | null; // Timestamp when the current guess phase started
  guessTimeLimit: number; // Time limit for guessing in seconds
  selectedYearRange: string; // e.g., "2020s", "1990s", "all"
  categories?: string[];
}


export type GameAction =
  | { type: "ADD_PLAYER"; player: Omit<Player, "health" | "alive"> }
  | { type: "START_GAME" }
  | { type: "PLAY_SONG"; song: Song }
  | { type: "END_SONG" }
  | { type: "SET_PLAYING"; playing: boolean }
  | { type: "ORIGINAL_GUESS_SUBMIT"; guesses: Guess }
  | { type: "CIRCLE_GUESS_SUBMIT"; playerId: String; guesses: Guess }
  | { type: "REVEAL_ANSWERS" }
  | { type: "GUESS_TIMEOUT" } // New action for when guess time runs out
  | { type: "SET_YEAR_RANGE"; yearRange: string } // New action for setting year range
  | { type: "RESOLVE_ROUND" }
  | { type: "SET_CATEGORIES"; categories: string[] }


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

      if (action.type === "SET_CATEGORIES") {
        // update the set of allowed categories in lobby
        return {
          ...game,
          categories: [...action.categories]
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
          guessStartTime: null,
          answerRevealed: false,
          selectedYearRange: game.selectedYearRange, // Carry over selected year range
          winner: undefined
        };
      }
      return game;


    // ───────── SONG_PLAYING
    case "SONG_PLAYING":
      if (action.type === "PLAY_SONG") {
        // respect provided playing flag or default to false (so guesser must
        // hit play)
        return { ...game,
          guessStartTime: Date.now(), // Start timer when song begins playing
          ...game,
          currentSong: { ...action.song, isPlaying: action.song.isPlaying ?? false }
        };
      }
      if (action.type === "END_SONG") {
        return { ...game, phase: "ORIGINAL_GUESS_TURN" };
      }
      if (action.type === "SET_PLAYING") {
        if (!game.currentSong) return game;
        return {
          ...game,
          currentSong: { ...game.currentSong, isPlaying: action.playing }
        };
      }
      return game;


    // ───────── ORIGINAL GUESS
    case "ORIGINAL_GUESS_TURN": {
      if (!game.currentSong) return game;
      if (action.type !== "ORIGINAL_GUESS_SUBMIT" && action.type !== "GUESS_TIMEOUT") return game;

      const originalPlayer = game.players[game.turnIndex];
      const guesses = action.type === "ORIGINAL_GUESS_SUBMIT" ? action.guesses : {}; // No guesses if timed out
      const instantWin = action.type === "ORIGINAL_GUESS_SUBMIT" ? isWinningGuess(guesses, game.currentSong) : false;
      const acc = action.type === "ORIGINAL_GUESS_SUBMIT" ? calculateAccuracy(guesses, game.currentSong) : 0;
 
      if (instantWin || acc >= 60) {
        return {
          ...game,
          originalGuesses: { [originalPlayer.uid]: action.guesses },
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

      return {
        ...game,
        guessStartTime: Date.now(), // Reset timer for circle guess
        ...game,
        originalGuesses: { [String(originalPlayer.uid)]: action.guesses },
        circleGuessIndex: firstCircleIndex,
        phase: "CIRCLE_GUESS_TURN"
      };
    }
    // ───────── CIRCLE GUESS
    case "CIRCLE_GUESS_TURN": {
      if (action.type !== "CIRCLE_GUESS_SUBMIT") return game;
      if (!game.currentSong) return game;

      const originalUid = game.players[game.turnIndex].uid;
      if (String(action.playerId) === String(originalUid)) return game;

      const circleIndex = game.circleGuessIndex ?? (game.turnIndex + 1) % game.players.length;

      let expectedIndex = circleIndex;
      while (
        !game.players[expectedIndex].alive ||
        String(game.players[expectedIndex].uid) === String(originalUid)
      ) {
        expectedIndex = (expectedIndex + 1) % game.players.length;
      }

      const guesses = action.type === "CIRCLE_GUESS_SUBMIT" ? action.guesses : {};
      const playerId = action.type === "CIRCLE_GUESS_SUBMIT" ? action.playerId : String(game.players[expectedIndex].uid);

      // If it's a timeout, we don't process a guess, just move on
      if (action.type === "CIRCLE_GUESS_SUBMIT" && String(playerId) !== String(game.players[expectedIndex].uid)) return game;

      const nextCircle = { ...game.circleGuesses,
        [String(playerId)]: guesses
      };

      const guessAcc = calculateAccuracy(action.guesses, game.currentSong);

      if (guessAcc >= 60) {
        return {
          ...game,
          circleGuesses: nextCircle,
          circleGuessIndex: undefined,
          phase: "WAITING_TO_REVEAL"
        };
      }

      const aliveCount = game.players.filter(p => p.alive).length - 1;
      const allGuessed = Object.keys(nextCircle).length >= aliveCount;

      let nextCircleIndex = (expectedIndex + 1) % game.players.length;
      while (
        !game.players[nextCircleIndex].alive ||
        String(game.players[nextCircleIndex].uid) === String(originalUid)
      ) {
        nextCircleIndex = (nextCircleIndex + 1) % game.players.length;
      }

      return {
        ...game,
        guessStartTime: Date.now(), // Reset timer for next circle guess or reveal
        ...game,
        circleGuesses: nextCircle,
        circleGuessIndex: allGuessed ? undefined : nextCircleIndex,
        phase: allGuessed ? "WAITING_TO_REVEAL" : game.phase
      };
    }

    // ───────── WAITING TO REVEAL
    case "WAITING_TO_REVEAL":
      if (action.type === "REVEAL_ANSWERS") {
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
        if (origGuess) {
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
          const acc = calculateAccuracy(guess, song);
          const heal = Math.floor(acc / 5);
          players = players.map(p =>
            String(p.uid) === uid && p.alive
              ? { ...p, health: Math.min(100, p.health + heal) }
              : p
          );
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
          selectedYearRange: game.selectedYearRange, // Carry over selected year range
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
            // Keep isHost status
            // Keep categories
          })),
          winner: undefined
        };
      }
      return game;


    // ───────── SET YEAR RANGE
    case "LOBBY":
      if (action.type === "SET_YEAR_RANGE") {
        return { ...game,
          selectedYearRange: action.yearRange
        };
      }
    default:
      return game;
  }
}
