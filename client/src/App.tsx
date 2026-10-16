import { useState, useRef, useMemo } from 'react'
import type { SubmitEvent, PointerEvent as ReactPointerEvent } from 'react'
import './App.css'
import { piecesEarned, createPieces, overlaps, snapToNeighbors, demoPuzzle } from './puzzle'
import { generateShape, TAB_MARGIN } from './shapes'
import type { Task, Piece, BoardPosition } from './types'
import Board from './Board'
import PieceView from './PieceView'
import ImagePreview from './ImagePreview'


type DragState = {
  id: number
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

  const completedWeight = tasks
    .filter((task) => task.done)
    .reduce((sum, task) => sum + task.weight, 0)

  const pieces = piecesEarned(completedWeight, piecesPerPoint, dailyCap)

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

  function dropPiece(id: number, x: number, y: number, gx: number, gy: number) {
    const board = boardRef.current?.getBoundingClientRect()
    const tray = trayRef.current?.getBoundingClientRect()

    if (board && isInside(board, x, y)) {
      const { rows, cols } = demoPuzzle
      const boxW = (1 + 2 * TAB_MARGIN) / cols
      const boxH = (1 + 2 * TAB_MARGIN) / rows
      // top-left of the piece's box, then step in by the tab margin to reach its base square
      const px = (x - board.left) / board.width - gx * boxW + TAB_MARGIN / cols
      const py = (y - board.top) / board.height - gy * boxH + TAB_MARGIN / rows
      movePiece(id, {
        x: clamp(px, 0, 1 - 1 / cols),
        y: clamp(py, 0, 1 - 1 / rows),
      })
    } else if (tray && isInside(tray, x, y)) {
      movePiece(id, null)
    }
    // dropped somewhere else: the piece stays where it was
  }

  function startDrag(e: ReactPointerEvent<HTMLDivElement>, piece: Piece) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const gx = (e.clientX - rect.left) / rect.width
    const gy = (e.clientY - rect.top) / rect.height
    const { width, height } = rect

    setDrag({ id: piece.id, x: e.clientX, y: e.clientY, gx, gy, width, height })

    function onMove(ev: PointerEvent) {
      setDrag({
        id: piece.id,
        x: ev.clientX,
        y: ev.clientY,
        gx,
        gy,
        width,
        height,
      })
    }
    function stop() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', stop)
      setDrag(null)
    }
    function onUp(ev: PointerEvent) {
      dropPiece(piece.id, ev.clientX, ev.clientY, gx, gy)
      stop()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', stop)
  }

  const draggedPiece = drag ? allPieces.find((p) => p.id === drag.id) : undefined

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
        {allPieces
          .filter((p) => p.position === null)
          .map((p) => (
            <PieceView
              key={p.id}
              piece={p}
              puzzle={demoPuzzle}
              shape={shape}
              onPointerDown={startDrag}
              style={{ opacity: p.id === drag?.id ? 0.3 : 1 }}
            />
          ))}
      </div>

      <ImagePreview imageUrl={demoPuzzle.imageUrl} />

      <Board
        puzzle={demoPuzzle}
        shape={shape}
        pieces={allPieces}
        boardRef={boardRef}
        draggingId={drag?.id ?? null}
        onPiecePointerDown={startDrag}
      />

      {drag && draggedPiece && (
        <PieceView
          ghost
          piece={draggedPiece}
          puzzle={demoPuzzle}
          shape={shape}
          style={{
            position: 'fixed',
            left: drag.x - drag.gx * drag.width,
            top: drag.y - drag.gy * drag.height,
            width: drag.width,
            height: drag.height,
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        />
      )}
    </main>
  )
}

export default App