import { useEffect, useState } from 'react'
import * as api from './api'
import type { Stats } from './api'

// Streaks and the last 30 days, for the habits screen.
// `version` changes whenever something that affects them does (a tick, a to-do), so the
// numbers are fetched again. The old numbers stay on screen until the new ones arrive.
export function useStats(day: string, version: string) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true // ignore an answer that arrives after a newer request was sent
    api
      .loadStats(day)
      .then((loaded) => {
        if (!current) return
        setStats(loaded)
        setFailed(false)
      })
      .catch(() => {
        if (current) setFailed(true)
      })
    return () => {
      current = false
    }
  }, [day, version])

  return { stats, failed }
}
