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

export function usePuzzlePhoto() {
  const [photo, setPhoto] = useState<PuzzlePhoto | null>(loadSaved)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchNew = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/puzzle-image')
      if (!res.ok) throw new Error(`The server answered ${res.status}`)
      const data = (await res.json()) as PuzzlePhoto
      setPhoto(data)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch {
        // storage can be blocked; the photo still works for this visit
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load a photo')
    } finally {
      setLoading(false)
    }
  }, [])

  // first visit: nothing saved yet, so get a photo
  useEffect(() => {
    if (loadSaved() === null) {
      void fetchNew()
    }
  }, [fetchNew])

  return { photo, loading, error, fetchNew }
}