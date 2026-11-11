import { useEffect, useRef, useState } from 'react'
import { useTracking } from './useTracking'
import TrackingScreen from './TrackingScreen'
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

type View = 'tracking' | 'puzzle'

// Remember which screen you were on, so reloading the page doesn't send you back to Habits.
const VIEW_KEY = 'habitPuzzleView'

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'puzzle' ? 'puzzle' : 'tracking'
  } catch {
    return 'tracking' // storage can be blocked; Habits is a fine place to start
  }
}

function saveView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    // storage can be blocked; the screen still switches, it just won't be remembered
  }
}

// Two screens that stay alive side by side (the board must not forget where its pieces are
// when you look at your habits), so the one you are not on is only hidden.
function AccountPlay({ start }: { start: AccountStart }) {
  const session = useAccountSession(start)
  const tracking = useTracking()
  const [view, setView] = useState<View>(loadView)

  function showView(next: View) {
    setView(next)
    saveView(next)
  }

  return (
    <>
      <nav className="view-tabs">
        <button type="button" aria-pressed={view === 'tracking'} onClick={() => showView('tracking')}>
          Habits
        </button>
        <button type="button" aria-pressed={view === 'puzzle'} onClick={() => showView('puzzle')}>
          Puzzle
        </button>
      </nav>
      <div hidden={view !== 'tracking'}>
        <TrackingScreen tracking={tracking} />
      </div>
      <div hidden={view !== 'puzzle'}>
        <App
          session={{
            ...session,
            earnedTotal: tracking.data?.earnedTotal ?? 0,
            dailyCap: tracking.data?.settings.dailyCap ?? null,
          }}
        />
      </div>
    </>
  )
}
