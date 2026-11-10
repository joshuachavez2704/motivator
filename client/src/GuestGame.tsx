import { usePuzzlePhoto } from './usePuzzlePhoto'
import type { PuzzleSession } from './puzzle-session'
import App from './App'

// Guests: the photo and seed live in this browser, and nothing about the pieces is saved.
const noSave = () => {}
const nothingPlaced: PuzzleSession['initialPositions'] = []

export default function GuestGame() {
  const { photo, seed, loading, error, startNew } = usePuzzlePhoto()
  return (
    <App
      session={{
        photo,
        seed,
        loading,
        error,
        saveError: null,
        earnedTotal: null,
        dailyCap: null,
        initialPositions: nothingPlaced,
        startNew,
        savePieces: noSave,
      }}
    />
  )
}
