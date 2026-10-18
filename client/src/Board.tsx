import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import PieceView from './PieceView'
import { TAB_MARGIN } from './shapes'
import type { PuzzleShape } from './shapes'
import type { Piece, Puzzle } from './types'
import './Board.css'

type Props = {
  puzzle: Puzzle
  shape: PuzzleShape
  pieces: Piece[]
  boardRef: RefObject<HTMLDivElement | null>
  draggingIds: number []
  onPiecePointerDown: (e: ReactPointerEvent<HTMLDivElement>, piece: Piece) => void
}

function Board({
  puzzle,
  shape,
  pieces,
  boardRef,
  draggingIds,
  onPiecePointerDown,
}: Props) {
  const { rows, cols } = puzzle

  return (
    <div
      className="board"
      ref={boardRef}
      style={{ aspectRatio: `${cols} / ${rows}` }}
    >

      {pieces.map((p) => {
        if (!p.position) return null
        const { x, y } = p.position
        return (
          <PieceView
            key={p.id}
            piece={p}
            puzzle={puzzle}
            shape={shape}
            onPointerDown={onPiecePointerDown}
            style={{
              position: 'absolute',
              // the box is bigger than the base square by the tab margin on every side
              left: `${(x - TAB_MARGIN / cols) * 100}%`,
              top: `${(y - TAB_MARGIN / rows) * 100}%`,
              width: `${((1 + 2 * TAB_MARGIN) / cols) * 100}%`,
              height: `${((1 + 2 * TAB_MARGIN) / rows) * 100}%`,
              opacity: draggingIds.includes(p.id) ? 0.3 : 1,
            }}
          />
        )
      })}
    </div>
  )
}

export default Board