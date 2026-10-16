import type { Puzzle } from './types'

// How far a tab can stick out of a piece, measured in piece widths.
// Each piece is drawn in a box this much bigger than itself on every side.
export const TAB_MARGIN = 0.3

type Point = [number, number]

type Segment = { p0: Point; c1: Point; c2: Point; p3: Point }

// One interior edge between two neighbouring pieces. Both neighbours draw this
// same curve, so a tab on one piece always fits the blank on the other.
type Edge = {
  flip: boolean // which side the tab sticks out toward
  a: number // small random nudges that make every tab a little different
  b: number
  c: number
  d: number
  e: number
}

export type PuzzleShape = {
  horizontal: (Edge | null)[][] // [rows + 1][cols]: edges running left to right
  vertical: (Edge | null)[][] // [rows][cols + 1]: edges running top to bottom
}

// A small seeded random number generator: same seed, same sequence.
function mulberry32(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateShape({ rows, cols, seed }: Puzzle): PuzzleShape {
  const rand = mulberry32(seed)
  const jitter = 0.04
  const nudge = () => (rand() * 2 - 1) * jitter

  const makeEdge = (): Edge => ({
    flip: rand() < 0.5,
    a: nudge(),
    b: nudge(),
    c: nudge(),
    d: nudge(),
    e: nudge(),
  })

  // the outer border of the board stays flat (null)
  const horizontal = Array.from({ length: rows + 1 }, (_, r) =>
    Array.from({ length: cols }, () => (r === 0 || r === rows ? null : makeEdge())),
  )
  const vertical = Array.from({ length: rows }, () =>
    Array.from({ length: cols + 1 }, (_, c) => (c === 0 || c === cols ? null : makeEdge())),
  )

  return { horizontal, vertical }
}

const T = 0.1 // tab size

// The curve for one edge, as three cubic Bezier segments. Along the edge, `l`
// runs 0 to 1; `w` is how far the curve sticks out sideways.
function edgeSegments(edge: Edge, origin: Point, vertical: boolean): Segment[] {
  const { flip, a, b, c, d, e } = edge
  const side = flip ? -1 : 1
  const pt = (l: number, w: number): Point =>
    vertical
      ? [origin[0] + w * side, origin[1] + l]
      : [origin[0] + l, origin[1] + w * side]

  return [
    {
      p0: pt(0, 0),
      c1: pt(0.2, a),
      c2: pt(0.5 + b + d, -T + c),
      p3: pt(0.5 - T + b, T + c),
    },
    {
      p0: pt(0.5 - T + b, T + c),
      c1: pt(0.5 - 2 * T + b - d, 3 * T + c),
      c2: pt(0.5 + 2 * T + b - d, 3 * T + c),
      p3: pt(0.5 + T + b, T + c),
    },
    {
      p0: pt(0.5 + T + b, T + c),
      c1: pt(0.5 + b + d, -T + c),
      c2: pt(0.8, e),
      p3: pt(1, 0),
    },
  ]
}

const num = (n: number) => Math.round(n * 1000) / 1000
const pair = (p: Point) => `${num(p[0])} ${num(p[1])}`

// walk the edge in its natural direction
function forward(segs: Segment[]) {
  return segs.map((s) => `C ${pair(s.c1)} ${pair(s.c2)} ${pair(s.p3)}`).join(' ')
}

// walk the same edge the opposite way: reverse the order and swap each segment's ends
function backward(segs: Segment[]) {
  return [...segs]
    .reverse()
    .map((s) => `C ${pair(s.c2)} ${pair(s.c1)} ${pair(s.p0)}`)
    .join(' ')
}

// The outline of one piece as an SVG path. Coordinates are in piece widths,
// with the piece's own base square running from (0, 0) to (1, 1).
export function piecePath(shape: PuzzleShape, row: number, col: number): string {
  const top = shape.horizontal[row][col]
  const bottom = shape.horizontal[row + 1][col]
  const left = shape.vertical[row][col]
  const right = shape.vertical[row][col + 1]

  return [
    'M 0 0',
    top ? forward(edgeSegments(top, [0, 0], false)) : 'L 1 0',
    right ? forward(edgeSegments(right, [1, 0], true)) : 'L 1 1',
    bottom ? backward(edgeSegments(bottom, [0, 1], false)) : 'L 0 1',
    left ? backward(edgeSegments(left, [0, 0], true)) : 'L 0 0',
    'Z',
  ].join(' ')
}