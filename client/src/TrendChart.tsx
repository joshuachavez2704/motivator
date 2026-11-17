import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { labelIndexes, longDate, nearestIndex, niceMax, shortDate } from './chart'
import type { DayStats } from './api'
import './charts.css'

type Props = {
  title: string // names the one line, so there is no legend
  unit: string // "pieces", "habits"
  days: DayStats[]
  value: (d: DayStats) => number
  tone: 'blue' | 'green'
}

// The drawing is 640 x 200 and scales to fit; these are the edges of the plot inside it.
const W = 640
const H = 200
const LEFT = 44
const RIGHT = 14
const TOP = 12
const BOTTOM = 26

// One line chart: a value for every day. Point at it (or use the arrow keys) to read a day.
export default function TrendChart({ title, unit, days, value, tone }: Props) {
  const id = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)

  const values = days.map(value)
  const total = values.reduce((a, b) => a + b, 0)
  const top = niceMax(Math.max(0, ...values))
  const count = days.length

  const x = (i: number) => (count <= 1 ? LEFT : LEFT + (i / (count - 1)) * (W - LEFT - RIGHT))
  const y = (v: number) => TOP + (1 - v / top) * (H - TOP - BOTTOM)

  const points = values.map((v, i) => `${x(i)},${y(v)}`)
  const line = points.length ? `M${points.join('L')}` : ''
  const area = points.length ? `${line}L${x(count - 1)},${y(0)}L${x(0)},${y(0)}Z` : ''
  const ticks = [0, top / 2, top]
  const last = count - 1

  function move(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    // work in the drawing's own units, whatever size it is shown at
    const drawingX = ((e.clientX - box.left) / box.width) * W
    setActive(nearestIndex((drawingX - LEFT) / (W - LEFT - RIGHT), count))
  }

  function key(e: KeyboardEvent<HTMLDivElement>) {
    if (count === 0) return
    const at = active ?? last
    if (e.key === 'ArrowLeft') setActive(Math.max(0, at - 1))
    else if (e.key === 'ArrowRight') setActive(Math.min(last, at + 1))
    else if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(last)
    else if (e.key === 'Escape') setActive(null)
    else return
    e.preventDefault()
  }

  const shown = active === null ? null : days[active]
  // keep the tooltip inside the chart: flip it to the left of the line on the right half
  const leftPct = active === null ? 0 : (x(active) / W) * 100
  const flip = leftPct > 55

  return (
    <figure className={`trend trend-${tone}`}>
      <figcaption>
        <h4 id={`${id}-title`}>{title}</h4>
        <span className="trend-sum">
          {total} {unit} in {count} days
        </span>
        <button type="button" className="trend-toggle" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </figcaption>

      {asTable ? (
        <div className="trend-table">
          <table>
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">{unit}</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.day}>
                  <th scope="row">{longDate(d.day)}</th>
                  <td>{value(d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="trend-plot"
          ref={wrapRef}
          tabIndex={0}
          role="group"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-hint`}
          onKeyDown={key}
          onBlur={() => setActive(null)}
        >
          <span id={`${id}-hint`} className="sr-only">
            Use the left and right arrow keys to read each day.
          </span>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`${title}, last ${count} days`}
            onPointerMove={move}
            onPointerDown={move}
            onPointerLeave={() => setActive(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line className="trend-grid" x1={LEFT} x2={W - RIGHT} y1={y(t)} y2={y(t)} />
                <text className="trend-axis" x={LEFT - 6} y={y(t)} textAnchor="end" dominantBaseline="middle">
                  {t}
                </text>
              </g>
            ))}
            {labelIndexes(count).map((i) => (
              <text key={i} className="trend-axis" x={x(i)} y={H - 6} textAnchor={i === last ? 'end' : 'middle'}>
                {i === last ? 'Today' : shortDate(days[i].day)}
              </text>
            ))}

            <path className="trend-area" d={area} />
            <path className="trend-line" d={line} />

            {active !== null && (
              <line className="trend-cross" x1={x(active)} x2={x(active)} y1={TOP} y2={y(0)} />
            )}
            {count > 0 && (
              <circle className="trend-dot" cx={x(active ?? last)} cy={y(values[active ?? last])} r={5} />
            )}
          </svg>

          {shown && (
            <div className="trend-tip" role="status" style={{ left: `${leftPct}%` }} data-flip={flip || undefined}>
              <strong>{longDate(shown.day)}</strong>
              <span>
                {value(shown)} {unit}
              </span>
            </div>
          )}
        </div>
      )}
    </figure>
  )
}
