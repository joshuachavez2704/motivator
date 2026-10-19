import { useState, useRef, useMemo } from 'react'
import type { SubmitEvent, PointerEvent as ReactPointerEvent } from 'react'
import './App.css'
import {
  piecesEarned,
  createPieces,
  overlaps,
  sizedPhotoUrl,
  snapToNeighbors,
  connectedGroup,
  demoPuzzle,
  isEarned,
} from './puzzle'
import { generateShape, TAB_MARGIN } from './shapes'
import type { Task, Piece, BoardPosition, Puzzle } from './types'
import Board from './Board'
import PieceView from './PieceView'
import ImagePreview from './ImagePreview'
import { usePuzzlePhoto } from './usePuzzlePhoto'

// one piece being carried, positioned relative to the piece you grabbed (in pixels)
type DragMember = { id: number; dx: number; dy: number }

type DragState = {
  id: number // the piece under your pointer
  members: DragMember[] // everything being carried (just that piece, unless shift was held)
  x: number // current pointer position (pixels)
  y: number
  gx: number // where inside the piece's box it was grabbed (0 to 1)
  gy: number
  width: number // piece box size at pickup (pixels)
  height: number
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

function isInside(r: DOMRect, x: number, y: number) {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

function App() {
  const [text, setText] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [weight, setWeight] = useState(1)
  const [piecesPerPoint, setPiecesPerPoint] = useState(2)
  const [dailyCap, setDailyCap] = useState(20)
  const [allPieces, setAllPieces] = useState<Piece[]>(() =>
    createPieces(demoPuzzle),
  )
  const [drag, setDrag] = useState<DragState | null>(null)

  const boardRef = useRef<HTMLDivElement>(null)
  const trayRef = useRef<HTMLDivElement>(null)

  // the shapes only depend on the puzzle, so build them once
  const shape = useMemo(() => generateShape(demoPuzzle), [])

  // the photo from Unsplash (via our API); until it arrives the pieces are plain colours
  const { photo, loading, error, fetchNew } = usePuzzlePhoto()
  const puzzle: Puzzle = {
    ...demoPuzzle,
    imageUrl: photo ? sizedPhotoUrl(photo.imageUrl, demoPuzzle) : '',
  }

  const completedWeight = tasks
    .filter((task) => task.done)
    .reduce((sum, task) => sum + task.weight, 0)

  const pieces = piecesEarned(completedWeight, piecesPerPoint, dailyCap)

  // the tray only holds pieces that are earned and not on the board yet
  const trayPieces = allPieces.filter(
    (p) => p.position === null && isEarned(p, pieces),
  )

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!text.trim()) return
    setTasks([...tasks, { id: Date.now(), text, weight, done: false }])
    setText('')
  }

  function removeTask(id: number) {
    setTasks(tasks.filter((task) => task.id !== id))
  }

  function toggleTask(id: number) {
    setTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    )
  }

  function movePiece(id: number, position: BoardPosition | null) {
    setAllPieces((prev) => {
      const piece = prev.find((p) => p.id === id)
      if (!piece) return prev

      // if it was dropped near a spot where it fits a neighbour, use that exact spot
      const finalPosition =
        position === null
          ? null
          : snapToNeighbors(piece, position, prev, demoPuzzle)

      const blocked =
        finalPosition !== null &&
        prev.some(
          (p) =>
            p.id !== id &&
            p.position !== null &&
            overlaps(p.position, finalPosition, demoPuzzle),
        )
      if (blocked) return prev // too much overlap: leave everything as it was
      return prev.map((p) => (p.id === id ? { ...p, position: finalPosition } : p))
    })
  }

  // like movePiece, but for several locked pieces that travel together
  function moveGroup(ids: number[], grabbedId: number, target: BoardPosition) {
    setAllPieces((prev) => {
      const { rows, cols } = demoPuzzle
      const members = prev.filter(
        (p): p is Piece & { position: BoardPosition } =>
          ids.includes(p.id) && p.position !== null,
      )
      const grabbed = members.find((p) => p.id === grabbedId)
      if (!grabbed) return prev

      // how far the whole group moves = how far the grabbed piece moved
      let dx = target.x - grabbed.position.x
      let dy = target.y - grabbed.position.y

      // keep every member on the board
      const xs = members.map((p) => p.position.x)
      const ys = members.map((p) => p.position.y)
      const fits = (mx: number, my: number) =>
        Math.min(...xs) + mx >= -1e-9 &&
        Math.max(...xs) + mx <= 1 - 1 / cols + 1e-9 &&
        Math.min(...ys) + my >= -1e-9 &&
        Math.max(...ys) + my <= 1 - 1 / rows + 1e-9

      dx = clamp(dx, -Math.min(...xs), 1 - 1 / cols - Math.max(...xs))
      dy = clamp(dy, -Math.min(...ys), 1 - 1 / rows - Math.max(...ys))

      // snap the group onto pieces outside it: use the smallest correction any member wants
      const others = prev.filter((p) => !ids.includes(p.id))
      let fix = { x: 0, y: 0, size: Infinity }
      for (const m of members) {
        const wanted = { x: m.position.x + dx, y: m.position.y + dy }
        const snapped = snapToNeighbors(m, wanted, others, demoPuzzle)
        const cx = snapped.x - wanted.x
        const cy = snapped.y - wanted.y
        const size = Math.hypot(cx * cols, cy * rows)
        if (size > 1e-9 && size < fix.size) fix = { x: cx, y: cy, size }
      }
      if (fix.size < Infinity && fits(dx + fix.x, dy + fix.y)) {
        dx += fix.x
        dy += fix.y
      }

      // no member may overlap a piece that isn't part of the group
      const blocked = members.some((m) =>
        others.some(
          (o) =>
            o.position !== null &&
            overlaps(
              o.position,
              { x: m.position.x + dx, y: m.position.y + dy },
              demoPuzzle,
            ),
        ),
      )
      if (blocked) return prev

      return prev.map((p) =>
        ids.includes(p.id) && p.position
          ? { ...p, position: { x: p.position.x + dx, y: p.position.y + dy } }
          : p,
      )
    })
  }

  function dropPiece(
    id: number,
    ids: number[],
    x: number,
    y: number,
    gx: number,
    gy: number,
  ) {
    const board = boardRef.current?.getBoundingClientRect()
    const tray = trayRef.current?.getBoundingClientRect()

    if (board && isInside(board, x, y)) {
      const { rows, cols } = demoPuzzle
      const boxW = (1 + 2 * TAB_MARGIN) / cols
      const boxH = (1 + 2 * TAB_MARGIN) / rows
      // top-left of the piece's box, then step in by the tab margin to reach its base square
      const px = (x - board.left) / board.width - gx * boxW + TAB_MARGIN / cols
      const py = (y - board.top) / board.height - gy * boxH + TAB_MARGIN / rows
      if (ids.length > 1) {
        moveGroup(ids, id, { x: px, y: py })
      } else {
        movePiece(id, {
          x: clamp(px, 0, 1 - 1 / cols),
          y: clamp(py, 0, 1 - 1 / rows),
        })
      }
    } else if (tray && isInside(tray, x, y) && ids.length === 1) {
      movePiece(id, null) // groups can't go back to the tray
    }
    // dropped somewhere else: everything stays where it was
  }

  function startDrag(e: ReactPointerEvent<HTMLDivElement>, piece: Piece) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const gx = (e.clientX - rect.left) / rect.width
    const gy = (e.clientY - rect.top) / rect.height
    const { width, height } = rect

    // normally we carry just this piece; with shift held, everything locked to it comes too
    let members: DragMember[] = [{ id: piece.id, dx: 0, dy: 0 }]
    const board = boardRef.current?.getBoundingClientRect()
    const start = piece.position
    if (e.shiftKey && start && board) {
      members = connectedGroup(piece.id, allPieces, demoPuzzle).flatMap((m) =>
        m.position
          ? [
            {
              id: m.id,
              dx: (m.position.x - start.x) * board.width,
              dy: (m.position.y - start.y) * board.height,
            },
          ]
          : [],
      )
    }
    const ids = members.map((m) => m.id)

    const base = { id: piece.id, members, gx, gy, width, height }
    setDrag({ ...base, x: e.clientX, y: e.clientY })

    function onMove(ev: PointerEvent) {
      setDrag({ ...base, x: ev.clientX, y: ev.clientY })
    }
    function stop() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', stop)
      setDrag(null)
    }
    function onUp(ev: PointerEvent) {
      dropPiece(piece.id, ids, ev.clientX, ev.clientY, gx, gy)
      stop()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', stop)
  }

  return (
    <main>
      <h1>Habit Puzzle</h1>

      <section>
        <p>Completed weight today: {completedWeight}</p>
        <p>
          Pieces earned today: {pieces} / {dailyCap}
        </p>

        <label htmlFor="cap">Daily piece limit: </label>
        <input
          id="cap"
          type="number"
          min={0}
          value={dailyCap}
          onChange={(e) => setDailyCap(Number(e.target.value))}
        />

        <label htmlFor="rate"> Pieces per weight point: </label>
        <input
          id="rate"
          type="number"
          min={0}
          value={piecesPerPoint}
          onChange={(e) => setPiecesPerPoint(Number(e.target.value))}
        />
      </section>

      <form onSubmit={handleSubmit}>
        <label htmlFor="task">Task: </label>
        <input
          id="task"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you need to do?"
        />
        <select
          value={weight}
          onChange={(e) => setWeight(Number(e.target.value))}
        >
          <option value={1}>1 - Light</option>
          <option value={2}>2</option>
          <option value={3}>3 - Medium</option>
          <option value={4}>4</option>
          <option value={5}>5 - Heavy</option>
        </select>
        <button type="submit">Add</button>
      </form>

      <div>
        {tasks.map((task) => (
          <div key={task.id}>
            <input
              type="checkbox"
              checked={task.done}
              onChange={() => toggleTask(task.id)}
            />
            <span>
              {task.text} (weight {task.weight})
            </span>
            <button onClick={() => removeTask(task.id)}>Remove</button>
          </div>
        ))}
      </div>

      <div className="tray" ref={trayRef}>
        {trayPieces.length === 0 && (
          <span className="tray-empty">Complete tasks to earn puzzle pieces</span>
        )}
        {trayPieces.map((p) => (
          <PieceView
            key={p.id}
            piece={p}
            puzzle={puzzle}
            shape={shape}
            onPointerDown={startDrag}
            style={{ opacity: p.id === drag?.id ? 0.3 : 1 }}
          />
        ))}
      </div>

      <ImagePreview imageUrl={puzzle.imageUrl} />

      <div>
        <button type="button" onClick={fetchNew} disabled={loading}>
          {loading ? 'Loading photo…' : 'New photo'}
        </button>
        {error && <span role="alert"> Could not load a photo: {error}</span>}
      </div>

      <Board
        puzzle={puzzle}
        shape={shape}
        pieces={allPieces}
        boardRef={boardRef}
        draggingIds={drag ? drag.members.map((m) => m.id) : []}
        onPiecePointerDown={startDrag}
      />

      {drag &&
        drag.members.map((m) => {
          const piece = allPieces.find((p) => p.id === m.id)
          if (!piece) return null
          return (
            <PieceView
              ghost
              key={m.id}
              piece={piece}
              puzzle={puzzle}
              shape={shape}
              style={{
                position: 'fixed',
                left: drag.x - drag.gx * drag.width + m.dx,
                top: drag.y - drag.gy * drag.height + m.dy,
                width: drag.width,
                height: drag.height,
                pointerEvents: 'none',
                zIndex: 1000,
              }}
            />
          )
        })}

      {photo && (
        <p className="credit">
          Photo by{' '}
          <a
            href={`${photo.photographerUrl}?utm_source=habit_puzzle&utm_medium=referral`}
            target="_blank"
            rel="noreferrer"
          >
            {photo.photographer}
          </a>{' '}
          on{' '}
          <a
            href="https://unsplash.com/?utm_source=habit_puzzle&utm_medium=referral"
            target="_blank"
            rel="noreferrer"
          >
            Unsplash
          </a>
        </p>
      )}
    </main>
  )
}

export default App