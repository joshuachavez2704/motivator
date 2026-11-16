import { useCallback, useRef, useState } from 'react'
import { createPuzzle, savePiece, removePiece } from './api'
import type { SavedPosition } from './api'
import { randomSeed } from './puzzle'
import { requestPhoto } from './usePuzzlePhoto'
import type { Piece, PuzzlePhoto, BoardPosition, PuzzleSize } from './types'
import type { PuzzleSession } from './puzzle-session'

// What the server told us when the game opened
export type AccountStart = {
  puzzleId: string
  photo: PuzzlePhoto
  seed: number
  rows: number
  cols: number
  earnedBase: number
  positions: SavedPosition[]
}

// A puzzle that lives on the server. The game reports every change to the pieces,
// and we send the differences to the server, one request at a time and in order.
// (earned and dailyCap come from the habits screen, so the caller adds them)
export function useAccountSession(
  start: AccountStart,
): Omit<PuzzleSession, 'earned' | 'dailyCap'> & { earnedBase: number } {
  const [photo, setPhoto] = useState(start.photo)
  const [seed, setSeed] = useState(start.seed)
  // earned pieces that were used up on earlier puzzles: they do not count towards this one
  const [earnedBase, setEarnedBase] = useState(start.earnedBase)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // the puzzle we are saving into
  const puzzleId = useRef(start.puzzleId)
  // what the server already knows: pieceId -> position
  const known = useRef(new Map<number, BoardPosition>(start.positions.map((p) => [p.pieceId, { x: p.x, y: p.y }])))
  // every request waits for the one before it, so moves reach the server in order
  const queue = useRef<Promise<void>>(Promise.resolve())

  function enqueue(job: () => Promise<void>, undo: () => void) {
    queue.current = queue.current.then(job).then(
      () => setSaveError(null),
      () => {
        undo() // forget that we saved it, so the next change tries again
        setSaveError("Couldn't save your last move. We'll try again on your next one.")
      },
    )
  }

  const savePieces = useCallback((pieces: Piece[]) => {
    const id = puzzleId.current
    for (const piece of pieces) {
      const before = known.current.get(piece.id)
      const after = piece.position

      if (after === null) {
        if (!before) continue
        known.current.delete(piece.id)
        enqueue(
          () => removePiece(id, piece.id),
          () => known.current.set(piece.id, before),
        )
      } else if (!before || before.x !== after.x || before.y !== after.y) {
        known.current.set(piece.id, after)
        enqueue(
          () => savePiece(id, piece.id, after.x, after.y),
          () => known.current.delete(piece.id),
        )
      }
    }
  }, [])

  // a new photo, a new seed, and a new puzzle on the server (an empty board)
  const startNew = useCallback(async (size: PuzzleSize): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const nextPhoto = await requestPhoto()
      const nextSeed = randomSeed()
      const created = await createPuzzle(size.rows, size.cols, nextSeed, nextPhoto)
      puzzleId.current = created.id
      known.current = new Map() // nothing is saved on the new puzzle yet
      setPhoto(nextPhoto)
      setSeed(nextSeed)
      setEarnedBase(created.earnedBase)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a new puzzle')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    photo,
    seed,
    rows: start.rows,
    cols: start.cols,
    earnedBase,
    loading,
    error,
    saveError,
    initialPositions: start.positions,
    startNew,
    savePieces,
  }
}