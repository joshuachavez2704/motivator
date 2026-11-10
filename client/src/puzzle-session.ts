import type { Piece, PuzzlePhoto } from './types'
import type { SavedPosition } from './api'

// Everything the game needs from "wherever the puzzle lives".
// A guest's puzzle lives in this browser; a signed-in player's lives on the server.
// App only talks to this shape, so it never needs to know which one it has.
export type PuzzleSession = {
  photo: PuzzlePhoto | null
  seed: number
  loading: boolean
  error: string | null // the photo could not be loaded
  saveError: string | null // a move could not be saved
  initialPositions: SavedPosition[] // pieces already on the board when the game opens
  // pieces earned so far, counted by the server; null means this player has no tracking
  // (a guest), so App counts pieces from its own task list instead
  earnedTotal: number | null
  // the most pieces the tray shows at once (the daily limit); null means App uses its own
  dailyCap: number | null
  startNew: () => Promise<boolean> // true if a new puzzle was started
  savePieces: (pieces: Piece[]) => void // App calls this whenever the pieces change
}