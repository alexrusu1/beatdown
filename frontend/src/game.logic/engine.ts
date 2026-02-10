export type GamePhase =
    | "LOBBY"
    | "SONG_PLAYING"
    | "ORIGINAL_GUESS_TURN"
    | "CIRCLE_GUESS"
    | "REVEAL_RESULTS"
    | "APPLY_DAMAGE_HEAL"
    | "CHECK_GAME_OVER"

export interface Player {
    id: number
    name: string
    health: number
    alive: boolean
}

export interface Game {
    phase: GamePhase
    players: Player[]
    turn: number
}

export type GameAction =
    | {type: "START_GAME"}
    | {type: "PLAY_SONG"}
    | {type: "END_SONG"}
    | {type: "ORIGINAL_GUESSES"; guesses: Guess}
    | {type: "CIRCLE_GUESSES"; playerId: string; guesses: Guess}
    | {type: "VERIFY_ANSWERS"}
    | {type: "APPLY_DAMAGE_HEAL"}
    | {type: "CHECK_DEAD"}

export interface Guess {
    song?: string
    artist?: string
    year?: number
    album?: string
}