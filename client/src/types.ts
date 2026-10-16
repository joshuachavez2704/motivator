export type Task = {
  id: number
  text: string
  weight: number
  done: boolean
}

export type Puzzle = {
  id: number
  imageUrl: string
  rows: number
  cols: number
  seed: number // decides the piece shapes: same seed, same shapes
}

export type BoardPosition = {
  x: number // 0 to 1, fraction of the board's width
  y: number // 0 to 1, fraction of the board's height
}

export type Piece = {
  id: number
  puzzleId: number
  row: number // where this piece belongs in the finished picture
  col: number
  // Top-left corner of the piece's base square (tabs stick out past it).
  // null means the piece is still in the tray.
  position: BoardPosition | null
}