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
  imageUrl: '',
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

// Unsplash lets us ask for any size by adding parameters to the "raw" URL.
// The picture must have the same shape as the board (cols : rows), otherwise
// it would be stretched, so we ask for exactly that shape and let it crop.
export function sizedPhotoUrl(rawUrl: string, puzzle: Puzzle, width = 1200): string {
  const url = new URL(rawUrl)
  url.searchParams.set('w', String(width))
  url.searchParams.set('h', String(Math.round((width * puzzle.rows) / puzzle.cols)))
  url.searchParams.set('fit', 'crop')
  url.searchParams.set('q', '80')
  return url.toString()
}

// How far (in piece widths) two neighbours may be from their perfect fit
// and still count as locked together.
export const LOCK_TOLERANCE = 0.05

// Are `a` and `b` placed side by side exactly the way they sit in the picture?
export function areLocked(a: Piece, b: Piece, puzzle: Puzzle): boolean {
  if (a.position === null || b.position === null) return false

  const dr = b.row - a.row
  const dc = b.col - a.col
  if (Math.abs(dr) + Math.abs(dc) !== 1) return false // must be direct neighbours

  // where b would be if it fit a perfectly
  const expectedX = a.position.x + dc / puzzle.cols
  const expectedY = a.position.y + dr / puzzle.rows
  const off = Math.hypot(
    (b.position.x - expectedX) * puzzle.cols,
    (b.position.y - expectedY) * puzzle.rows,
  )
  return off < LOCK_TOLERANCE
}

// Every piece connected to `startId` through a chain of locked neighbours
// (including the piece itself).
export function connectedGroup(
  startId: number,
  pieces: Piece[],
  puzzle: Puzzle,
): Piece[] {
  const start = pieces.find((p) => p.id === startId)
  if (!start) return []

  const group = [start]
  const seen = new Set([startId])

  // `group` grows while we loop over it, so we also visit neighbours of neighbours
  for (let i = 0; i < group.length; i++) {
    for (const p of pieces) {
      if (!seen.has(p.id) && areLocked(group[i], p, puzzle)) {
        seen.add(p.id)
        group.push(p)
      }
    }
  }
  return group
}

// Pieces are earned in a fixed order (for now the piece id: top-left to
// bottom-right). If the player has earned 5 pieces, the first 5 are theirs
// and the rest are still locked.
export function isEarned(piece: Piece, earned: number): boolean {
  return piece.id < earned
}