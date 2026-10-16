import type { Puzzle, Piece, BoardPosition } from './types'

export function piecesEarned(
  completedWeight: number,
  piecesPerPoint: number,
  dailyCap: number,
): number {
  const raw = completedWeight * piecesPerPoint
  const capped = Math.min(raw, dailyCap)
  return Math.max(0, Math.floor(capped))
}

export const demoPuzzle: Puzzle = {
  id: 1,
  imageUrl: 'https://picsum.photos/seed/habit/1200/800',
  rows: 4,
  cols: 6,
  seed: 42,
}

export function createPieces(puzzle: Puzzle): Piece[] {
  const pieces: Piece[] = []
  for (let row = 0; row < puzzle.rows; row++) {
    for (let col = 0; col < puzzle.cols; col++) {
      pieces.push({
        id: row * puzzle.cols + col,
        puzzleId: puzzle.id,
        row,
        col,
        position: null,
      })
    }
  }
  return pieces
}

// How far two pieces' base squares may overlap, as a fraction of one piece.
// Pieces that sit correctly side by side are exactly 1 apart, so they never
// count as overlapping; the small allowance keeps placing by eye forgiving.
export const OVERLAP_TOLERANCE = 0.15

export function overlaps(
  a: BoardPosition,
  b: BoardPosition,
  puzzle: Puzzle,
): boolean {
  // convert board fractions into "piece widths" so x and y are comparable
  const dx = Math.abs(a.x - b.x) * puzzle.cols
  const dy = Math.abs(a.y - b.y) * puzzle.rows
  return dx < 1 - OVERLAP_TOLERANCE && dy < 1 - OVERLAP_TOLERANCE
}


// How close (in piece widths) a dropped piece must be to its correct spot
// next to a neighbour before it jumps into place.
export const SNAP_DISTANCE = 0.3

// If `piece` was dropped at `pos` near a spot where it would fit against a
// placed neighbour (the piece directly above, below, left or right of it in
// the finished picture), return that exact spot. Otherwise return `pos`.
export function snapToNeighbors(
  piece: Piece,
  pos: BoardPosition,
  pieces: Piece[],
  puzzle: Puzzle,
): BoardPosition {
  const { rows, cols } = puzzle
  let best = pos
  let bestDist = SNAP_DISTANCE

  for (const other of pieces) {
    if (other.id === piece.id || other.position === null) continue

    // how many rows/cols is this piece away from `other` in the real picture?
    const dr = piece.row - other.row
    const dc = piece.col - other.col
    if (Math.abs(dr) + Math.abs(dc) !== 1) continue // only direct neighbours

    // where it would sit if it fit perfectly against `other`
    const target = {
      x: other.position.x + dc / cols,
      y: other.position.y + dr / rows,
    }

    // never snap to a spot that hangs off the board
    const eps = 1e-9
    if (
      target.x < -eps ||
      target.y < -eps ||
      target.x > 1 - 1 / cols + eps ||
      target.y > 1 - 1 / rows + eps
    ) {
      continue
    }

    const dist = Math.hypot((target.x - pos.x) * cols, (target.y - pos.y) * rows)
    if (dist < bestDist) {
      best = target
      bestDist = dist
    }
  }

  return best
}