import { describe, it, expect } from 'vitest'
import {
  piecesEarned,
  createPieces,
  overlaps,
  snapToNeighbors,
  areLocked,
  connectedGroup,
  sizedPhotoUrl,
  earnRanks,
  isEarned,
  randomSeed,
  placePieces,
  trayOrder,
  trayWindow,
  demoPuzzle,
} from './puzzle'
import type { Piece, BoardPosition } from './types'

// demoPuzzle is 4 rows by 6 columns, so one piece is 1/6 of the board wide and 1/4 tall

// copies of the pieces with some of them placed on the board
function withPositions(positions: Record<number, BoardPosition>): Piece[] {
  return createPieces(demoPuzzle).map((p) =>
    p.id in positions ? { ...p, position: positions[p.id] } : p,
  )
}

describe('piecesEarned', () => {
  it('gives no pieces when nothing is completed', () => {
    expect(piecesEarned(0, 2, 20)).toBe(0)
  })

  it('multiplies completed weight by pieces per point', () => {
    expect(piecesEarned(3, 2, 20)).toBe(6)
  })

  it('never goes above the daily cap', () => {
    expect(piecesEarned(100, 2, 20)).toBe(20)
  })

  it('rounds down partial pieces', () => {
    expect(piecesEarned(3, 1.5, 20)).toBe(4)
  })

  it('never returns a negative number', () => {
    expect(piecesEarned(-5, 2, 20)).toBe(0)
  })
})

describe('createPieces', () => {
  it('makes one piece per cell, all in the tray', () => {
    const pieces = createPieces(demoPuzzle)
    expect(pieces).toHaveLength(24)
    expect(pieces.every((p) => p.position === null)).toBe(true)
  })

  it('numbers pieces row by row', () => {
    const pieces = createPieces(demoPuzzle)
    expect(pieces[0]).toMatchObject({ id: 0, row: 0, col: 0 })
    expect(pieces[7]).toMatchObject({ id: 7, row: 1, col: 1 })
    expect(pieces[23]).toMatchObject({ id: 23, row: 3, col: 5 })
  })
})

describe('overlaps', () => {
  const a = { x: 0.2, y: 0.2 }

  it('counts two pieces on the same spot as overlapping', () => {
    expect(overlaps(a, a, demoPuzzle)).toBe(true)
  })

  it('counts half a piece apart as overlapping', () => {
    expect(overlaps(a, { x: 0.2 + 0.5 / 6, y: 0.2 }, demoPuzzle)).toBe(true)
  })

  it('lets pieces sit exactly side by side', () => {
    expect(overlaps(a, { x: 0.2 + 1 / 6, y: 0.2 }, demoPuzzle)).toBe(false)
  })

  it('lets pieces sit exactly one above the other', () => {
    expect(overlaps(a, { x: 0.2, y: 0.2 + 1 / 4 }, demoPuzzle)).toBe(false)
  })

  it('forgives a small overlap when placing by eye', () => {
    expect(overlaps(a, { x: 0.2 + 0.9 / 6, y: 0.2 }, demoPuzzle)).toBe(false)
  })
})

describe('snapToNeighbors', () => {
  const placed = { x: 0.2, y: 0.2 }
  // piece 0 is on the board; piece 1 belongs directly to its right
  const pieces = withPositions({ 0: placed })
  const piece1 = pieces[1]
  const perfect = { x: 0.2 + 1 / 6, y: 0.2 }

  it('jumps a nearly-right piece into its exact spot', () => {
    const dropped = { x: perfect.x + 0.02, y: perfect.y - 0.02 }
    const result = snapToNeighbors(piece1, dropped, pieces, demoPuzzle)
    expect(result.x).toBeCloseTo(perfect.x)
    expect(result.y).toBeCloseTo(perfect.y)
  })

  it('leaves a piece alone when it is dropped far away', () => {
    const dropped = { x: 0.8, y: 0.8 }
    expect(snapToNeighbors(piece1, dropped, pieces, demoPuzzle)).toEqual(dropped)
  })

  it('does not snap to a piece that is not its neighbour', () => {
    // piece 2 is two columns away from piece 0, so it must not snap beside it
    const piece2 = pieces[2]
    const dropped = { x: perfect.x + 0.02, y: perfect.y }
    expect(snapToNeighbors(piece2, dropped, pieces, demoPuzzle)).toEqual(dropped)
  })
})

describe('areLocked and connectedGroup', () => {
  const step = 1 / 6
  const row = withPositions({
    0: { x: 0.1, y: 0.1 },
    1: { x: 0.1 + step, y: 0.1 },
    2: { x: 0.1 + 2 * step, y: 0.1 },
    6: { x: 0.7, y: 0.6 }, // belongs below piece 0, but is placed somewhere else
  })

  it('says correct neighbours placed exactly side by side are locked', () => {
    expect(areLocked(row[0], row[1], demoPuzzle)).toBe(true)
  })

  it('says a piece placed a bit off is not locked', () => {
    const off = withPositions({ 0: { x: 0.1, y: 0.1 }, 1: { x: 0.1 + step + 0.1, y: 0.1 } })
    expect(areLocked(off[0], off[1], demoPuzzle)).toBe(false)
  })

  it('says pieces in the tray are never locked', () => {
    const tray = createPieces(demoPuzzle)
    expect(areLocked(tray[0], tray[1], demoPuzzle)).toBe(false)
  })

  it('finds the whole chain of locked pieces', () => {
    const ids = connectedGroup(0, row, demoPuzzle).map((p) => p.id).sort((a, b) => a - b)
    expect(ids).toEqual([0, 1, 2])
  })

  it('finds the same chain starting from the middle', () => {
    const ids = connectedGroup(1, row, demoPuzzle).map((p) => p.id).sort((a, b) => a - b)
    expect(ids).toEqual([0, 1, 2])
  })

  it('returns just the piece itself when nothing is locked to it', () => {
    expect(connectedGroup(6, row, demoPuzzle).map((p) => p.id)).toEqual([6])
  })
})

describe('sizedPhotoUrl', () => {
  it('asks Unsplash for a picture with the same shape as the board', () => {
    const url = new URL(sizedPhotoUrl('https://images.unsplash.com/photo-1?ixid=abc', demoPuzzle))
    expect(url.searchParams.get('w')).toBe('1200')
    expect(url.searchParams.get('h')).toBe('800') // 1200 * 4 / 6
    expect(url.searchParams.get('fit')).toBe('crop')
  })

  it('keeps the parameters that were already on the URL', () => {
    const url = new URL(sizedPhotoUrl('https://images.unsplash.com/photo-1?ixid=abc', demoPuzzle))
    expect(url.searchParams.get('ixid')).toBe('abc')
  })
})

describe('earnRanks', () => {
  it('gives every piece exactly one rank (a shuffle of 0..n-1)', () => {
    const rank = earnRanks(24, 42)
    expect(rank).toHaveLength(24)
    expect([...rank].sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, i) => i))
  })

  it('is the same every time for the same seed', () => {
    expect(earnRanks(24, 7)).toEqual(earnRanks(24, 7))
  })

  it('differs between seeds', () => {
    expect(earnRanks(24, 1)).not.toEqual(earnRanks(24, 2))
  })
})

describe('isEarned', () => {
  const pieces = createPieces(demoPuzzle)

  it('earns exactly as many pieces as the player has earned', () => {
    const rank = earnRanks(24, 99)
    for (const earned of [0, 1, 6, 24]) {
      const count = pieces.filter((p) => isEarned(p, earned, rank)).length
      expect(count).toBe(earned)
    }
  })

  it('never earns a piece while the player has earned nothing', () => {
    const rank = earnRanks(24, 5)
    expect(pieces.some((p) => isEarned(p, 0, rank))).toBe(false)
  })
})

describe('randomSeed', () => {
  it('is a whole number the database can store', () => {
    for (let i = 0; i < 100; i++) {
      const seed = randomSeed()
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThanOrEqual(2147483647)
    }
  })
})

describe('placePieces', () => {
  it('puts a piece back where it was saved and leaves the rest in the tray', () => {
    const placed = placePieces(createPieces(demoPuzzle), [{ pieceId: 3, x: 0.25, y: 0.5 }])
    expect(placed[3].position).toEqual({ x: 0.25, y: 0.5 })
    expect(placed.filter((p) => p.position !== null)).toHaveLength(1)
  })

  it('does nothing when nothing was saved', () => {
    const placed = placePieces(createPieces(demoPuzzle), [])
    expect(placed.every((p) => p.position === null)).toBe(true)
  })

  it('does not change the pieces it was given', () => {
    const original = createPieces(demoPuzzle)
    placePieces(original, [{ pieceId: 0, x: 0.1, y: 0.1 }])
    expect(original[0].position).toBeNull()
  })
})

describe('trayOrder', () => {
  const rank = earnRanks(24, 11)
  const byRank = (pieces: Piece[]) => pieces.map((p) => rank[p.id])

  it('lists earned pieces that are not on the board, in the order they were earned', () => {
    const order = trayOrder(createPieces(demoPuzzle), 10, rank, [])
    expect(order).toHaveLength(10)
    expect(byRank(order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('leaves out pieces that are already on the board', () => {
    const earnedFirst = createPieces(demoPuzzle).find((p) => rank[p.id] === 0)!
    const pieces = withPositions({ [earnedFirst.id]: { x: 0.1, y: 0.1 } })
    const order = trayOrder(pieces, 3, rank, [])
    expect(order.map((p) => p.id)).not.toContain(earnedFirst.id)
    expect(order).toHaveLength(2)
  })

  it('puts a piece you just put back at the front', () => {
    const pieces = createPieces(demoPuzzle)
    const lastEarned = pieces.find((p) => rank[p.id] === 4)!
    const order = trayOrder(pieces, 5, rank, [lastEarned.id])
    expect(order[0].id).toBe(lastEarned.id)
    expect(order).toHaveLength(5)
  })

  it('ignores a "put back" piece that is not earned or is on the board', () => {
    const pieces = createPieces(demoPuzzle)
    const unearned = pieces.find((p) => rank[p.id] === 20)!
    expect(trayOrder(pieces, 5, rank, [unearned.id])).toHaveLength(5)
  })
})

describe('trayWindow', () => {
  const list = [0, 1, 2, 3, 4, 5, 6]

  it('shows everything when it all fits', () => {
    expect(trayWindow(list, 0, 10)).toEqual(list)
  })

  it('shows only the limit, from the start', () => {
    expect(trayWindow(list, 0, 3)).toEqual([0, 1, 2])
  })

  it('moves to the next batch', () => {
    expect(trayWindow(list, 3, 3)).toEqual([3, 4, 5])
  })

  it('wraps around to the front', () => {
    expect(trayWindow(list, 6, 3)).toEqual([6, 0, 1])
  })

  it('shows every piece before repeating one', () => {
    const seen = new Set<number>()
    for (let offset = 0; offset < 7; offset += 3) {
      trayWindow(list, offset, 3).forEach((n) => seen.add(n))
    }
    expect(seen.size).toBe(7)
  })
})