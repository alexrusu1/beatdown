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
  uid: number;
  name: string;
  health: number;
  alive: boolean;
}


export interface Guess {
  song?: string;
  artist?: string;
  year?: number;
  album?: string;
}


export interface Song {
  name: string;
  artist: string;
  year: number;
  album: string;
  previewURL: string;
}


export interface Game {
  phase: GamePhase;
  players: Player[];
  turnIndex: number;
  currentSong: Song | null;
  originalGuesses: Record<number, Guess>;
  circleGuesses: Record<number, Guess>;
  answerRevealed: boolean;
  winner?: number | null;
}


export type GameAction =
  | { type: "ADD_PLAYER"; player: Omit<Player, "health" | "alive"> }
  | { type: "START_GAME" }
  | { type: "PLAY_SONG"; song: Song }
  | { type: "END_SONG" }
  | { type: "ORIGINAL_GUESS_SUBMIT"; guesses: Guess }
  | { type: "CIRCLE_GUESS_SUBMIT"; playerId: number; guesses: Guess }
  | { type: "REVEAL_ANSWERS" }
  | { type: "RESOLVE_ROUND" }


// ──────────────────────────────────────────────── Helpers


function calculateAccuracy(
  guess: Guess,
  correct: Song
): number {
  let score = 0;
  if (guess.song?.toLowerCase() === correct.name.toLowerCase()) score += 30;
  if (guess.artist?.toLowerCase() === correct.artist.toLowerCase()) score += 30;
  if (guess.year === correct.year) score += 20;
  if (guess.album?.toLowerCase() === correct.album.toLowerCase()) score += 20;
  return score;
}


function isWinningGuess(guess: Guess, correct: Song): boolean {
  return (
    guess.song?.toLowerCase() === correct.name.toLowerCase() &&
    guess.artist?.toLowerCase() === correct.artist.toLowerCase()
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
        return { ...game, currentSong: action.song };
      }
      if (action.type === "END_SONG") {
        return { ...game, phase: "ORIGINAL_GUESS_TURN" };
      }
      return game;


    // ───────── ORIGINAL GUESS
    case "ORIGINAL_GUESS_TURN":
      if (action.type !== "ORIGINAL_GUESS_SUBMIT" || !game.currentSong)
        return game;


      const originalPlayer = game.players[game.turnIndex];
      const instantWin = isWinningGuess(action.guesses, game.currentSong);


      return {
        ...game,
        originalGuesses: { [originalPlayer.uid]: action.guesses },
        phase: instantWin ? "REVEAL_RESULTS" : "CIRCLE_GUESS_TURN"
      };


    // ───────── CIRCLE GUESS
    case "CIRCLE_GUESS_TURN":
    if (action.type !== "CIRCLE_GUESS_SUBMIT") return game;

    const originalUid = game.players[game.turnIndex].uid;
    if (action.playerId === originalUid) return game;
    if (game.circleGuesses[action.playerId]) return game;

    const nextCircle = {
        ...game.circleGuesses,
        [action.playerId]: action.guesses
    };

    const aliveCount = game.players.filter(p => p.alive).length - 1;
    const allGuessed = Object.keys(nextCircle).length >= aliveCount;

    return {
        ...game,
        circleGuesses: nextCircle,
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

    const origGuess = game.originalGuesses[originalUidReveal];
    if (origGuess) {
      const acc = calculateAccuracy(origGuess, song);
      if (acc >= 80) {
        const dmg = 20 + Math.floor((acc - 80) / 2);
        players = players.map(p =>
          p.alive && p.uid !== originalUidReveal
            ? { ...p, health: Math.max(0, p.health - dmg) }
            : p
        );
      }
    }

    Object.entries(game.circleGuesses).forEach(([uid, guess]) => {
      const acc = calculateAccuracy(guess, song);
      const heal = Math.floor(acc / 10);
      players = players.map(p =>
        p.uid === Number(uid) && p.alive
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

