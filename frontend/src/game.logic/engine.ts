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
  winner?: String | null;
  /** optional list of enabled categories (pop, Hip-Hop/rap, R&B/soul, dance) */
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
  | { type: "RESOLVE_ROUND" }
  | { type: "SET_CATEGORIES"; categories: string[] }


// ──────────────────────────────────────────────── Helpers

// Spelling Tolerance
function levenshteinDistance(a: string, b: string): number {
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
  const c: string[] = [];
  for (let i = 0; i < correct.length; i++){
    c.push(correct[i].toLowerCase().trim());
  }
  
  // Exact match
  for (let i = 0; i < c.length; i++){
    if (g === c[i]) return true;
  }
  
  // Calculate similarity ratio
  const similaritiesList = [];
  for(let i = 0; i < c.length; i++){
    const distance = levenshteinDistance(g, c[i]);
    const maxLength = Math.max(g.length, c[i].length);
    const similarity = 1 - distance / maxLength;
    similaritiesList.push(similarity);
  }
  
  return Math.max(...similaritiesList) >= threshold;
}

function calculateAccuracy(guess: Guess, correct: Song): number {
  if (!correct) return 0;
  
  let score = 0;
  
  // Song name - allow 80% similarity
  if (guess.song && isSimilar(guess.song, correct.answerNames, 0.6)) score += 30;
  
  // Artist - allow 80% similarity
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
  
  // Album - allow 80% similarity
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
          answerRevealed: false,
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
    case "ORIGINAL_GUESS_TURN":
      if (action.type !== "ORIGINAL_GUESS_SUBMIT" || !game.currentSong)
        return game;

      const originalPlayer = game.players[game.turnIndex];
      const instantWin = isWinningGuess(action.guesses, game.currentSong);
      const acc = calculateAccuracy(action.guesses, game.currentSong);

      // If instant win OR high accuracy (>= 60), skip circle guessing
      if (instantWin || acc >= 60) {
        return {
          ...game,
          originalGuesses: { [originalPlayer.uid]: action.guesses },
          phase: "REVEAL_RESULTS"
        };
      }

      // Low accuracy (< 60): move to circle guessing
      let firstCircleIndex = (game.turnIndex + 1) % game.players.length;
      while (
        !game.players[firstCircleIndex].alive || 
        game.players[firstCircleIndex].uid === originalPlayer.uid
      ) {
        firstCircleIndex = (firstCircleIndex + 1) % game.players.length;
      }

      return {
        ...game,
        originalGuesses: { [String(originalPlayer.uid)]: action.guesses },
        circleGuessIndex: firstCircleIndex,
        phase: "CIRCLE_GUESS_TURN"
      };


    // ───────── CIRCLE GUESS
    case "CIRCLE_GUESS_TURN":
      if (action.type !== "CIRCLE_GUESS_SUBMIT") return game;
      if (!game.currentSong) return game; // Add safety check

      const originalUid = game.players[game.turnIndex].uid;
      if (action.playerId === originalUid) return game;
      
      // Initialize circleGuessIndex if not set
      const circleIndex = game.circleGuessIndex ?? (game.turnIndex + 1) % game.players.length;
      
      // Find the next alive player who isn't the original guesser
      let expectedIndex = circleIndex;
      while (
        !game.players[expectedIndex].alive || 
        game.players[expectedIndex].uid === originalUid
      ) {
        expectedIndex = (expectedIndex + 1) % game.players.length;
      }
      
      const expectedPlayer = game.players[expectedIndex];
      
      // Only accept guess from the expected player
      if (action.playerId !== expectedPlayer.uid) return game;
      
      const nextCircle = {
        ...game.circleGuesses,
        [String(action.playerId)]: action.guesses
      };

      // CHECK ACCURACY OF THIS GUESS
      const guessAcc = calculateAccuracy(action.guesses, game.currentSong);
      
      // If this circle guess has >= 60 accuracy, reveal immediately
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
      
      // Move to next player in circle
      let nextCircleIndex = (expectedIndex + 1) % game.players.length;
      while (
        !game.players[nextCircleIndex].alive || 
        game.players[nextCircleIndex].uid === originalUid
      ) {
        nextCircleIndex = (nextCircleIndex + 1) % game.players.length;
      }

      return {
        ...game,
        circleGuesses: nextCircle,
        circleGuessIndex: allGuessed ? undefined : nextCircleIndex,
        phase: allGuessed ? "WAITING_TO_REVEAL" : game.phase
      };

    // ───────── WAITING TO REVEAL (add this after CIRCLE_GUESS_TURN)
    case "WAITING_TO_REVEAL":
    if (action.type === "REVEAL_ANSWERS") {
        return { ...game, phase: "REVEAL_RESULTS", answerRevealed: true };
    }
    return game;

    // ───────── REVEAL
  case "REVEAL_RESULTS":  
  if (action.type === "RESOLVE_ROUND") {
    if (!game.currentSong) return game;

    const song = game.currentSong;
    const originalUidReveal = game.players[game.turnIndex].uid;

    let players = game.players.map(p => ({ ...p }));

    const origGuess = game.originalGuesses[String(originalUidReveal)] ?? 
                      game.originalGuesses[Number(originalUidReveal)];

    if (origGuess) {
      const acc = calculateAccuracy(origGuess, song);
      if (acc >= 60) {
        const dmg = 20 + Math.floor((acc - 60) / 2);
        players = players.map(p =>
          p.alive && p.uid !== originalUidReveal
            ? { ...p, health: Math.max(0, p.health - dmg) }
            : p
        );
      }
    }

    Object.entries(game.circleGuesses).forEach(([uid, guess]) => {
      const acc = calculateAccuracy(guess, song);
      const heal = Math.floor(acc / 5);
      players = players.map(p =>
        String(p.uid) === String(uid) && p.alive
          ? { ...p, health: Math.min(100, p.health + heal) }
          : p
      );
    });

    // resolve round logic
    const updated = players.map(p => ({
      ...p,
      alive: p.health > 0
    }));

    const alive = updated.filter(p => p.alive);
    if (alive.length <= 1) {
      return {
        ...game,
        players: updated,
        phase: "GAME_OVER",
        winner: String(alive[0]?.uid) ?? null
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
      phase: "SONG_PLAYING",
      currentSong: null,
      originalGuesses: {},
      circleGuesses: {},
      answerRevealed: false
    };
  }
  return game;

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
          })),
          winner: undefined
        };
      }
      return game;


    default:
      return game;
  }
}

