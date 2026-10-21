import { useCallback, useEffect, useState } from 'react'
import type { PuzzlePhoto } from './types'

const STORAGE_KEY = 'puzzlePhoto'

// Remember the photo in this browser, so a reload keeps the same puzzle
// and we don't spend one of Unsplash's 50 requests per hour every time.
function loadSaved(): PuzzlePhoto | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? (JSON.parse(saved) as PuzzlePhoto) : null
  } catch {
    return null
  }
}

// Asks our API for a random photo and remembers it. Pure data in, data out:
// it never touches React state, so both the effect and the button can use it.
async function requestPhoto(): Promise<PuzzlePhoto> {
  const res = await fetch('/api/puzzle-image')
  if (!res.ok) throw new Error(`The server answered ${res.status}`)
  const data = (await res.json()) as PuzzlePhoto
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // storage can be blocked; the photo still works for this visit
  }
  void fetch(`/api/photos/${data.id}/download`, { method: 'POST' }).catch(() => {})
  return data
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Could not load a photo'
}

export function usePuzzlePhoto() {
  const [photo, setPhoto] = useState<PuzzlePhoto | null>(loadSaved)
  // if nothing is saved, a fetch is about to start, so begin in the loading state
  const [loading, setLoading] = useState(() => loadSaved() === null)
  const [error, setError] = useState<string | null>(null)

  // used by the "New photo" button
  const fetchNew = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPhoto(await requestPhoto())
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // first visit: nothing saved yet, so get a photo.
  // setState only happens inside the promise callbacks, after the response arrives.
  useEffect(() => {
    if (loadSaved() !== null) return
    requestPhoto()
      .then(setPhoto)
      .catch((err) => setError(messageOf(err)))
      .finally(() => setLoading(false))
  }, [])

  return { photo, loading, error, fetchNew }
}