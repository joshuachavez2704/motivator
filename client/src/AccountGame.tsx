import { useEffect, useRef, useState } from 'react'
import { loadPuzzle, createPuzzle } from './api'
import type { StoredPhoto } from './api'
import { demoPuzzle, randomSeed } from './puzzle'
import { requestPhoto } from './usePuzzlePhoto'
import { useAccountSession } from './useAccountSession'
import type { AccountStart } from './useAccountSession'
import type { PuzzlePhoto } from './types'
import App from './App'

// Fetch the player's saved puzzle, or start their very first one.
async function openPuzzle(): Promise<AccountStart> {
  const { puzzle, positions } = await loadPuzzle()
  if (puzzle) {
    return {
      puzzleId: puzzle.id,
      photo: puzzle.photo as StoredPhoto as PuzzlePhoto,
      seed: puzzle.seed,
      positions,
    }
  }
  const photo = await requestPhoto()
  const seed = randomSeed()
  const puzzleId = await createPuzzle(demoPuzzle.rows, demoPuzzle.cols, seed, photo)
  return { puzzleId, photo, seed, positions: [] }
}

// The game for a signed-in player: wait for their puzzle, then play it.
export default function AccountGame() {
  const [start, setStart] = useState<AccountStart | null>(null)
  const [error, setError] = useState<string | null>(null)
  const began = useRef(false) // dev mode runs effects twice; only ask the server once

  useEffect(() => {
    if (began.current) return
    began.current = true
    openPuzzle()
      .then(setStart)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your puzzle'))
  }, [])

  if (error) return <p role="alert">Could not load your puzzle: {error}</p>
  if (!start) return <p className="auth-loading">Loading your puzzle…</p>
  return <AccountPlay start={start} />
}

function AccountPlay({ start }: { start: AccountStart }) {
  const session = useAccountSession(start)
  return <App session={session} />
}
