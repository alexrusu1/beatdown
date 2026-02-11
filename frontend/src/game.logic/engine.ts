//phases in game
export type GamePhase =
    | "LOBBY"
    | "SONG_PLAYING"
    | "ORIGINAL_GUESS_TURN"
    | "VERIFICATION"
    | "CIRCLE_GUESS"
    | "REVEAL_RESULTS"
    | "APPLY_DAMAGE_HEAL"
    | "CHECK_GAME_OVER"

//info about each player
export interface Player {
    uid: number
    name: string
    health: number
    alive: boolean
}

//info about the game
export interface Game {
    phase: GamePhase
    players: Player[]
    turnIndex: number
    currentSong:{
        name: string
        artist: string
        year: number
        album: string
        previewURL: string
    } | null
    originalGuesses: Record<number, Guess>
    circleGuesses: Record<number, Guess>

    answerRevealed: boolean
    winner?: number | null
}

//action that can be used to move between phases
export type GameAction =
    | {type: "ADD_PLAYER"}
    | {type: "START_GAME"}
    | {type: "PLAY_SONG"}
    | {type: "END_SONG"}
    | {type: "ORIGINAL_GUESSES_SUBMIT"; guesses: Guess}
    | {type: "CIRCLE_GUESSES_SUBMIT"; playerId: string; guesses: Guess}
    | {type: "VERIFY_ANSWERS"; correct: boolean}
    | {type: "REVEAL_ANSWERS"}
    | {type: "APPLY_DAMAGE_HEAL"}
    | {type: "CHECK_DEAD"}

//guess info
export interface Guess {
    song?: string
    artist?: string
    year?: number
    album?: string
}

//logic to move from one phase to another using actions
export function GameReducer (
    game: Game,
    action: GameAction
): Game {
        switch(game.phase){
            case "LOBBY":
                if(action.type == "START_GAME")
                    return {...game, phase: "SONG_PLAYING"}
                return game
            
            case "SONG_PLAYING":
                if(action.type == "END_SONG")
                    return {...game, phase: "ORIGINAL_GUESS_TURN"}
                return game
            
            case "ORIGINAL_GUESS_TURN":
                if(action.type == "ORIGINAL_GUESSES_SUBMIT")
                    return {...game, phase: "VERIFICATION"}
                return game
            
            case "VERIFICATION":
                if(action.type == "VERIFY_ANSWERS")
                    return {...game, phase: action.correct ? "REVEAL_RESULTS" : "CIRCLE_GUESS"}
                return game

            case "CIRCLE_GUESS":
                if(action.type == "REVEAL_ANSWERS")
                    return {...game, phase: "REVEAL_RESULTS"}
                return game

            case "REVEAL_RESULTS":
                if(action.type == "APPLY_DAMAGE_HEAL")
                    return {...game, phase: "APPLY_DAMAGE_HEAL"}
                return game

            case "APPLY_DAMAGE_HEAL":
                if(action.type == "CHECK_DEAD")
                    return {...game, phase: "CHECK_GAME_OVER"}
                return game

            case "CHECK_GAME_OVER":
                const alivePlayers = game.players.filter(p => p.alive)

                if(alivePlayers.length == 1)
                    return {...game, phase: "LOBBY"}

                return {...game, phase: "SONG_PLAYING"}
        }
    }