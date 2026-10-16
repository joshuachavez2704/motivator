import { useId, useMemo } from 'react'
import type { PointerEvent as ReactPointerEvent, CSSProperties } from 'react'
import { piecePath, TAB_MARGIN } from './shapes'
import type { PuzzleShape } from './shapes'
import type { Piece, Puzzle } from './types'

// how wide one piece's base square is when it sits in the tray
const TRAY_CELL_PX = 48
const TRAY_BOX_PX = TRAY_CELL_PX * (1 + 2 * TAB_MARGIN)

type Props = {
  piece: Piece
  puzzle: Puzzle
  shape: PuzzleShape
  style?: CSSProperties
  ghost?: boolean
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>, piece: Piece) => void
}

function PieceView({ piece, puzzle, shape, style, ghost, onPointerDown }: Props) {
  const { rows, cols, imageUrl } = puzzle
  // ids can't contain the characters React puts in useId() when used in url(#...)
  const clipId = 'clip' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const path = useMemo(
    () => piecePath(shape, piece.row, piece.col),
    [shape, piece.row, piece.col],
  )
  const size = 1 + 2 * TAB_MARGIN

  return (
    <div
      className={ghost ? 'piece piece-ghost' : 'piece'}
      onPointerDown={(e) => onPointerDown?.(e, piece)}
      style={{ width: TRAY_BOX_PX, height: TRAY_BOX_PX, ...style }}
    >
      <svg viewBox={`${-TAB_MARGIN} ${-TAB_MARGIN} ${size} ${size}`} width="100%" height="100%">
        <defs>
          <clipPath id={clipId}>
            <path d={path} />
          </clipPath>
        </defs>

        {imageUrl && (
          <image
            href={imageUrl}
            x={-piece.col}
            y={-piece.row}
            width={cols}
            height={rows}
            preserveAspectRatio="none"
            clipPath={`url(#${clipId})`}
          />
        )}

        <path
          className="piece-hit"
          d={path}
          fill={imageUrl ? 'transparent' : `hsl(${(piece.id * 37) % 360} 60% 70%)`}
          stroke="rgba(0, 0, 0, 0.45)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}

export default PieceView