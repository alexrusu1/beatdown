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
  isPass?: boolean;
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

export type GameMode = "CLASSIC" | "RACE";

export interface Game {
  phase: GamePhase;
  mode: GameMode;
  readyPlayers: string[];
  skipVotes: string[];
  roundWinner?: string | null;
  players: Player[];
  turnIndex: number;
  circleGuessIndex?: number;
  currentSong: Song | null;
  originalGuesses: Record<string | number, Guess>;
  circleGuesses: Record<string | number, Guess>;
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
  | { type: "SUBMIT_GUESS"; playerId: string | number; guesses: Guess }
  | { type: "GUESS_TIMEOUT" }
  | { type: "SET_SONG_SELECTIONS"; selections: SongSelection[] }
  | { type: "REVEAL_ANSWERS" }
  | { type: "RESOLVE_ROUND" }
  | { type: "SET_GAME_MODE"; mode: GameMode }
  | { type: "PLAYER_READY"; playerId: string | number }
  | { type: "VOTE_SKIP"; playerId: string | number }
  | { type: "SKIP_BROKEN_SONG"; src: string }


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

export function isSimilar(guess: string, correct: any, threshold: number = 0.6): boolean {
  if (!guess || !correct) return false;
  
  // Normalize correct to array - handle string, array, or Firebase objects
    
  const g = guess.toLowerCase().trim();
  let candidates: string[] = [];
  
  if (Array.isArray(correct)) {
    candidates = correct.map(s => String(s).toLowerCase().trim());
  } else if (typeof correct === 'object') {
    candidates = Object.values(correct).map(s => String(s).toLowerCase().trim());
  } else {
    candidates = [String(correct).toLowerCase().trim()];
  }

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
          mode: game.mode || "CLASSIC",
          readyPlayers: [],
          skipVotes: [],
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

      if (action.type === "SET_GAME_MODE") {
        return { ...game, mode: action.mode };
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
          guessTimeLimit: 30, // Reset default guess limit
          answerRevealed: false,
          songSelections: game.songSelections, // Carry over selections
          winner: undefined,
          readyPlayers: [],
          skipVotes: [],
          roundWinner: null
        };
      }
      return game;


    // ───────── SONG_PLAYING
    case "SONG_PLAYING":
      if (action.type === "GUESS_TIMEOUT" && game.mode === "RACE") {
        return { ...game, phase: "REVEAL_RESULTS", roundWinner: null, readyPlayers: [], skipVotes: [] };
      }
      if (action.type === "VOTE_SKIP" && game.mode === "RACE") {
        const player = game.players.find(p => String(p.uid) === String(action.playerId));
        if (!player || !player.alive) return game; // Only alive players can vote

        const newVotes = [...new Set([...(game.skipVotes || []), String(action.playerId)])];
        const alivePlayers = game.players.filter(p => p.alive);
        
        if (newVotes.length >= alivePlayers.length) {
          return { ...game, phase: "REVEAL_RESULTS", roundWinner: null, readyPlayers: [], skipVotes: [] };
        }
        return { ...game, skipVotes: newVotes };
      }
      if (action.type === "SUBMIT_GUESS" && game.mode === "RACE" && game.currentSong) {
        const acc = calculateAccuracy(action.guesses, game.currentSong);
        if (acc >= 60 || isWinningGuess(action.guesses, game.currentSong)) {
          // A player guessed correctly! Deal damage to everyone else.
          const dmg = 20 + Math.floor((acc - 60) / 2);
          let players = game.players.map(p =>
            p.alive && String(p.uid) !== String(action.playerId)
              ? { ...p, health: Math.max(0, p.health - dmg) }
              : p
          );

          const updated = players.map(p => ({ ...p, alive: p.health > 0 }));
          const alive = updated.filter(p => p.alive);

          if (alive.length <= 1) {
            return {
              ...game,
              players: updated,
              phase: "GAME_OVER",
              winner: alive[0]?.uid ?? String(action.playerId)
            };
          }

          return {
            ...game,
            players: updated,
            phase: "REVEAL_RESULTS",
            roundWinner: String(action.playerId),
            readyPlayers: [],
            skipVotes: [],
            originalGuesses: { [String(action.playerId)]: action.guesses } 
          };
        }
        // Incorrect guesses in race mode are simply ignored to allow spamming
        return game;
      }
      if (action.type === "PLAY_SONG") {
        // respect provided playing flag or default to false (so guesser must
        // hit play)
        return {
          ...game,
          currentSong: { ...action.song, isPlaying: action.song.isPlaying ?? false, hasBeenPlayed: false }
        };
      }
      if (action.type === "END_SONG") {
        if (game.mode === "RACE") {
          // If the song ends, start a 20-second grace period for final guesses
          return { ...game, guessStartTime: Date.now(), guessTimeLimit: 20 };
        }
        return {
          ...game,
          phase: "ORIGINAL_GUESS_TURN",
          guessStartTime: Date.now(),
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
      if (action.type === "SKIP_BROKEN_SONG") {
        if (game.currentSong && action.src.includes(game.currentSong.previewUrl)) {
          return { ...game, currentSong: null };
        }
        return game;
      }
      return game;


    // ───────── ORIGINAL GUESS
    case "ORIGINAL_GUESS_TURN": {
      if (!game.currentSong) return game;

      let updatedGame = game;
      if (action.type === "SUBMIT_GUESS") {
        console.log(
          `[reducer:ORIGINAL_GUESS_TURN] SUBMIT_GUESS received from player ${action.playerId}.`
        );
        const safeGuesses = Object.keys(action.guesses).length === 0 ? { isPass: true } : action.guesses;
        updatedGame = {
          ...game,
          preFireGuesses: { ...game.preFireGuesses, [String(action.playerId)]: safeGuesses }
        };
      }
      const originalPlayerId = updatedGame.players[updatedGame.turnIndex].uid;
      const isTurnEnd = (action.type === "SUBMIT_GUESS" && String(action.playerId) === String(originalPlayerId)) || action.type === "GUESS_TIMEOUT";
      
      if (action.type === "SUBMIT_GUESS" && !isTurnEnd) {
        console.log(
          `[reducer:ORIGINAL_GUESS_TURN] Player ${action.playerId} is not the active guesser. Storing pre-fire and waiting.`
        );
        return updatedGame;
      }

      if (!isTurnEnd) {
        return updatedGame;
      }
      
      console.log(`[reducer:ORIGINAL_GUESS_TURN] Turn ending for player ${originalPlayerId}. Processing guess.`);
      // Get the guess to evaluate from the staging area.
      const submittedGuess = updatedGame.preFireGuesses[String(originalPlayerId)] || {};
      const instantWin = isWinningGuess(submittedGuess, game.currentSong);
      const acc = calculateAccuracy(submittedGuess, game.currentSong);
      
      // Move the processed guess to the official originalGuesses map and remove from pre-fire.
      const updatedOriginalGuesses = { ...game.originalGuesses, [String(originalPlayerId)]: submittedGuess };
      const updatedPreFireGuesses = { ...updatedGame.preFireGuesses };
      delete updatedPreFireGuesses[String(originalPlayerId)];
 
      if (instantWin || acc >= 60) {
        return {
          ...updatedGame,
          originalGuesses: updatedOriginalGuesses,
          preFireGuesses: updatedPreFireGuesses,
          phase: "REVEAL_RESULTS",
          roundWinner: String(originalPlayerId)
        };
      }

      const aliveOthers = updatedGame.players.filter(p => p.alive && String(p.uid) !== String(originalPlayerId));
      if (aliveOthers.length === 0) {
        return {
          ...updatedGame,
          guessStartTime: null,
          originalGuesses: updatedOriginalGuesses,
          preFireGuesses: updatedPreFireGuesses,
          phase: "WAITING_TO_REVEAL"
        };
      }

      let firstCircleIndex = (game.turnIndex + 1) % game.players.length;
      while (
        !game.players[firstCircleIndex].alive ||
        String(game.players[firstCircleIndex].uid) === String(originalPlayerId)
      ) {
        firstCircleIndex = (firstCircleIndex + 1) % game.players.length;
      }

      return {
        ...updatedGame,
        guessStartTime: Date.now(), // Reset timer for circle guess
        originalGuesses: updatedOriginalGuesses,
        preFireGuesses: updatedPreFireGuesses,
        circleGuessIndex: firstCircleIndex,
        phase: "CIRCLE_GUESS_TURN",
      };
    }


    // ───────── CIRCLE GUESS
    case "CIRCLE_GUESS_TURN": {
      if (!game.currentSong || game.circleGuessIndex === undefined) return game; // Ensure currentSong and circleGuessIndex are defined
      
      let updatedGame = game;
      if (action.type === "SUBMIT_GUESS") {
        console.log(
          `[reducer:CIRCLE_GUESS_TURN] SUBMIT_GUESS received from player ${action.playerId}.`
        );
        const safeGuesses = Object.keys(action.guesses).length === 0 ? { isPass: true } : action.guesses;
        updatedGame = {
          ...game,
          preFireGuesses: { ...game.preFireGuesses, [String(action.playerId)]: safeGuesses }
        };
      }
      const currentGuesserId = updatedGame.players[updatedGame.circleGuessIndex!].uid;
      const isTurnEnd = (action.type === "SUBMIT_GUESS" && String(action.playerId) === String(currentGuesserId)) || action.type === "GUESS_TIMEOUT";
      
      if (action.type === "SUBMIT_GUESS" && !isTurnEnd) {
        console.log(
          `[reducer:CIRCLE_GUESS_TURN] Player ${action.playerId} is not the active guesser. Storing pre-fire and waiting.`
        );
        return updatedGame;
      }

      if (!isTurnEnd) return updatedGame;

      console.log(`[reducer:CIRCLE_GUESS_TURN] Turn ending for player ${currentGuesserId}. Processing guess.`);
      // Get the guess to evaluate from the staging area.
      const submittedGuess = updatedGame.preFireGuesses[String(currentGuesserId)] || {};
      const guessAcc = calculateAccuracy(submittedGuess, game.currentSong);

      // Move the processed guess to the official circleGuesses map and remove from pre-fire.
      const updatedCircleGuesses = { ...updatedGame.circleGuesses, [String(currentGuesserId)]: submittedGuess };
      const updatedPreFireGuesses = { ...updatedGame.preFireGuesses };
      delete updatedPreFireGuesses[String(currentGuesserId)];

      if (guessAcc >= 60) {
        return {
          ...updatedGame,
          circleGuesses: updatedCircleGuesses,
          preFireGuesses: updatedPreFireGuesses,
          circleGuessIndex: undefined,
          phase: "WAITING_TO_REVEAL",
          guessStartTime: null,
          roundWinner: String(currentGuesserId)
        };
      }

      // Find next player for circle guess
      const alivePlayers = game.players.filter(p => p.alive);
      const originalPlayerId = game.players[game.turnIndex].uid;
      const circleOrder = alivePlayers.filter(p => String(p.uid) !== String(originalPlayerId));
      const guessedPlayerIds = Object.keys(updatedCircleGuesses);

      const allGuessed = circleOrder.every(p => guessedPlayerIds.includes(String(p.uid)));

      let nextCircleIndex = updatedGame.circleGuessIndex!;
      let nextPlayerFound = false;

      for (let i = 0; i < game.players.length; i++) {
        nextCircleIndex = (nextCircleIndex + 1) % game.players.length;
        const nextPlayer = game.players[nextCircleIndex];
        if (nextPlayer.alive && String(nextPlayer.uid) !== String(originalPlayerId) && !updatedCircleGuesses[String(nextPlayer.uid)]) {
          nextPlayerFound = true;
          break;
        }
      }

      return {
        ...updatedGame,
        circleGuesses: updatedCircleGuesses,
        preFireGuesses: updatedPreFireGuesses,
        circleGuessIndex: allGuessed || !nextPlayerFound ? undefined : nextCircleIndex,
        phase: allGuessed || !nextPlayerFound ? "WAITING_TO_REVEAL" : game.phase, // Transition phase if circle is done
        guessStartTime: Date.now(), // Reset timer for the next turn
      };
    }

    // ───────── WAITING TO REVEAL
    case "WAITING_TO_REVEAL":
      if (action.type === "SUBMIT_GUESS") { // Allow pre-firing for the next round
        console.log(
          `[reducer:WAITING_TO_REVEAL] SUBMIT_GUESS received from player ${action.playerId}. Storing as pre-fire for next round.`
        );
        const safeGuesses = Object.keys(action.guesses).length === 0 ? { isPass: true } : action.guesses;
        return {
          ...game,
          preFireGuesses: { ...game.preFireGuesses, [String(action.playerId)]: safeGuesses }
        };
      }
      if (action.type === "REVEAL_ANSWERS") { // This action was missing from GameAction type
        return { ...game, phase: "REVEAL_RESULTS", answerRevealed: true };
      }
      return game;

    // ───────── REVEAL RESULTS
    case "REVEAL_RESULTS": {
      if (action.type === "PLAYER_READY" && game.mode === "RACE") {
        const newReady = [...new Set([...(game.readyPlayers || []), String(action.playerId)])];
        const alivePlayers = game.players.filter(p => p.alive);

        if (newReady.length >= alivePlayers.length) {
          // Everyone is ready! Start next round automatically
          let nextTurn = (game.turnIndex + 1) % game.players.length;
          while (!game.players[nextTurn].alive) {
            nextTurn = (nextTurn + 1) % game.players.length;
          }

          return {
            ...game,
            turnIndex: nextTurn,
            phase: "SONG_PLAYING",
            currentSong: null,
            originalGuesses: {},
            circleGuesses: {},
            preFireGuesses: {},
            guessStartTime: null,
            guessTimeLimit: 30,
            readyPlayers: [],
            skipVotes: [],
            roundWinner: null
          };
        }
        return { ...game, readyPlayers: newReady };
      }
      if (action.type === "RESOLVE_ROUND") {
        if (!game.currentSong) return game;

        const song = game.currentSong;
        const originalUidReveal = game.players[game.turnIndex].uid;
        let players = game.players.map(p => ({ ...p }));

        const origGuess = game.originalGuesses[String(originalUidReveal)];
        if (origGuess && Object.keys(origGuess).some(k => k !== "isPass")) { // Only deal damage if there was an actual guess
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
          if (Object.keys(guess).some(k => k !== "isPass")) { // Only heal if there was an actual guess
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
          guessTimeLimit: 30,
          phase: "SONG_PLAYING",
          currentSong: null,
          originalGuesses: {},
          circleGuesses: {},
          preFireGuesses: {}, // Clear all pre-fire guesses for the new round
          songSelections: game.songSelections,
          answerRevealed: false,
          roundWinner: null
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
