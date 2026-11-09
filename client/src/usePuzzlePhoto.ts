import { useCallback, useEffect, useRef, useState } from 'react'
import type { PuzzlePhoto } from './types'
import { randomSeed } from './puzzle'

const STORAGE_KEY = 'puzzleSave'

// A puzzle is its photo plus its seed (the seed decides the piece shapes).
type SavedPuzzle = { photo: PuzzlePhoto; seed: number }

// Remember the puzzle in this browser, so a reload keeps the same photo and shapes
// and we don't spend one of Unsplash's 50 requests per hour every time.
function loadSaved(): SavedPuzzle | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<SavedPuzzle>
    if (data.photo && typeof data.seed === 'number') {
      return { photo: data.photo, seed: data.seed }
    }
    return null
  } catch {
    return null
  }
}

function writeSaved(puzzle: SavedPuzzle) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(puzzle))
  } catch {
    // storage can be blocked; the puzzle still works for this visit
  }
}

// Asks our API for a random photo. Pure data in, data out: it never touches React state.
export async function requestPhoto(): Promise<PuzzlePhoto> {
  const res = await fetch('/api/puzzle-image')
  if (!res.ok) throw new Error(`The server answered ${res.status}`)
  const data = (await res.json()) as PuzzlePhoto
  // tell Unsplash this photo was used (their API rules require it).
  // fire and forget: if it fails, the puzzle still works.
  void fetch(`/api/photos/${data.id}/download`, { method: 'POST' }).catch(() => {})
  return data
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Could not load a photo'
}

export function usePuzzlePhoto() {
  const [photo, setPhoto] = useState<PuzzlePhoto | null>(() => loadSaved()?.photo ?? null)
  const [seed, setSeed] = useState<number>(() => loadSaved()?.seed ?? randomSeed())
  const firstSeed = useRef(seed) // the seed this visit started with
  // if nothing is saved, a fetch is about to start, so begin in the loading state
  const [loading, setLoading] = useState(() => loadSaved() === null)
  const [error, setError] = useState<string | null>(null)

  // "New photo" starts a new puzzle: a new photo AND a new seed (so new shapes).
  // Returns true if it worked, so the caller knows whether to clear the board.
  // If the photo cannot be loaded, nothing changes.
  const startNew = useCallback(async (): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const nextPhoto = await requestPhoto()
      const nextSeed = randomSeed()
      writeSaved({ photo: nextPhoto, seed: nextSeed })
      setPhoto(nextPhoto)
      setSeed(nextSeed)
      return true
    } catch (err) {
      setError(messageOf(err))
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  // first visit: nothing saved yet, so get a photo (keeping the seed we already have).
  // setState only happens inside the promise callbacks, after the response arrives.
  useEffect(() => {
    if (loadSaved() !== null) return
    requestPhoto()
      .then((first) => {
        writeSaved({ photo: first, seed: firstSeed.current })
        setPhoto(first)
      })
      .catch((err) => setError(messageOf(err)))
      .finally(() => setLoading(false))
  }, [])

  return { photo, seed, loading, error, startNew }
}