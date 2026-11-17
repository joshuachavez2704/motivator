import { useState } from 'react'
import type { SubmitEvent } from 'react'
import type { PieceValues, HabitStreak } from './api'
import { useStats } from './useStats'
import { dayCount } from './chart'
import TrendChart from './TrendChart'
import type { Tracking } from './useTracking'
import './tracking.css'

// A small form with one text box that clears itself after you add something.
function AddForm({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState('')

  function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!text.trim()) return
    onAdd(text.trim())
    setText('')
  }

  return (
    <form className="tracking-add" onSubmit={submit}>
      <input aria-label={label} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={200} />
      <button type="submit">Add</button>
    </form>
  )
}

// The four numbers: what each kind of task is worth, and the daily limit.
// `key` on the caller makes this start over from the saved values after a save.
function PieceValuesBox({ saved, onSave }: { saved: PieceValues; onSave: (values: PieceValues) => void }) {
  const [draft, setDraft] = useState(saved)

  const fields: { key: keyof PieceValues; label: string; max: number }[] = [
    { key: 'habitPieces', label: 'Each habit', max: 20 },
    { key: 'todoPieces', label: 'Each to-do', max: 20 },
    { key: 'focusPieces', label: 'Your one thing', max: 20 },
    { key: 'dailyCap', label: 'Daily limit', max: 500 },
  ]
  const valid = fields.every((f) => Number.isInteger(draft[f.key]) && draft[f.key] >= 0 && draft[f.key] <= f.max)
  const changed = fields.some((f) => draft[f.key] !== saved[f.key])

  return (
    <form
      className="tracking-values"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && changed) onSave(draft)
      }}
    >
      {fields.map((f) => (
        <label key={f.key}>
          <span>{f.label}</span>
          <input
            type="number"
            min={0}
            max={f.max}
            value={Number.isNaN(draft[f.key]) ? '' : draft[f.key]}
            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value === '' ? NaN : Number(e.target.value) })}
          />
        </label>
      ))}
      <button type="submit" disabled={!valid || !changed}>
        Save
      </button>
    </form>
  )
}

// Which box is open full-size (null = the normal screen with every box small)
type Panel = 'habits' | 'todos' | 'streaks' | null

// How many rows a small box shows before "View" is the way to see the rest
const SMALL = { habits: 5, todos: 5, streaks: 3 }

// The title row of a box, with the button that opens it full-size (and brings it back)
function CardHeader({ title, count, open, onToggle }: { title: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <div className="tracking-head">
      <h3>{title}</h3>
      <button type="button" className="tracking-view" aria-expanded={open} onClick={onToggle}>
        {open ? 'Back' : count > 0 ? `View (${count})` : 'View'}
      </button>
    </div>
  )
}

function StreakRow({ streak }: { streak: HabitStreak }) {
  return (
    <li>
      <span className="streak-name">{streak.name}</span>
      <span className="streak-numbers">
        {streak.best === 0 ? (
          'no streak yet'
        ) : (
          <>
            best {dayCount(streak.best)}, now {streak.now}
          </>
        )}
      </span>
    </li>
  )
}

// Streaks and the two trend charts. They are fetched again whenever a tick changes them.
function StatsPanels({
  day,
  version,
  panel,
  setPanel,
}: {
  day: string
  version: string
  panel: Panel
  setPanel: (p: Panel) => void
}) {
  const { stats, failed } = useStats(day, version)
  const open = panel === 'streaks'
  const streaks = stats?.streaks ?? []
  const shown = open ? streaks : streaks.slice(0, SMALL.streaks)

  const streakCard = (
    <div className="tracking-card">
      <CardHeader title="Longest streaks" count={streaks.length} open={open} onToggle={() => setPanel(open ? null : 'streaks')} />
      {failed && !stats && <p className="tracking-empty">Could not load your streaks.</p>}
      {!stats && !failed && <p className="tracking-empty">Loading…</p>}
      {stats && streaks.length === 0 && <p className="tracking-empty">Add a habit and tick it a few days in a row.</p>}
      <ol className="streak-list">
        {shown.map((s) => (
          <StreakRow key={s.id} streak={s} />
        ))}
      </ol>
    </div>
  )

  // opened full-size: the streaks fill the screen on their own
  if (open) return streakCard

  return (
    <div className="tracking-stats">
      {streakCard}
      <div className="tracking-card">
        <h3>Trends</h3>
        {stats ? (
          <>
            <TrendChart title="Pieces earned per day" unit="pieces" days={stats.daily} value={(d) => d.pieces} tone="blue" />
            <TrendChart title="Habits done per day" unit="habits" days={stats.daily} value={(d) => d.habitsDone} tone="green" />
          </>
        ) : (
          <p className="tracking-empty">{failed ? 'Could not load your history.' : 'Loading…'}</p>
        )}
      </div>
    </div>
  )
}

export default function TrackingScreen({ tracking }: { tracking: Tracking }) {
  const { data, error } = tracking
  const [panel, setPanel] = useState<Panel>(null)

  if (!data) {
    return <p className="auth-loading">{error ?? 'Loading your habits…'}</p>
  }

  const { settings, habits, todos } = data
  // anything that changes a streak or a day's totals changes this text, which re-fetches the stats
  const version = `${data.earnedOnDay}:${habits.map((h) => (h.done ? 1 : 0)).join('')}:${habits.length}`

  const habitsOpen = panel === 'habits'
  const todosOpen = panel === 'todos'
  const habitRows = habitsOpen ? habits : habits.slice(0, SMALL.habits)
  const todoRows = todosOpen ? todos : todos.slice(0, SMALL.todos)

  const habitsCard = (
    <div className="tracking-card">
      <CardHeader title="Habits" count={habits.length} open={habitsOpen} onToggle={() => setPanel(habitsOpen ? null : 'habits')} />
      <ul>
        {habits.length === 0 && <li className="tracking-empty">No habits yet. Add one you want to repeat every day.</li>}
        {habitRows.map((h) => (
          <li key={h.id}>
            <label>
              <input type="checkbox" checked={h.done} onChange={(e) => tracking.toggleHabit(h.id, e.target.checked)} />
              <span>{h.name}</span>
            </label>
            <button type="button" className="tracking-remove" aria-label={`Remove habit ${h.name}`} onClick={() => tracking.removeHabit(h.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {!habitsOpen && habits.length > SMALL.habits && (
        <p className="tracking-more">+{habits.length - SMALL.habits} more. Press View to see them all.</p>
      )}
      <AddForm label="New habit" placeholder="A habit to repeat daily" onAdd={tracking.addHabit} />
    </div>
  )

  const todosCard = (
    <div className="tracking-card">
      <CardHeader title="To-Do" count={todos.length} open={todosOpen} onToggle={() => setPanel(todosOpen ? null : 'todos')} />
      <ul>
        {todos.length === 0 && <li className="tracking-empty">Nothing planned for today. Pick your one thing.</li>}
        {todoRows.map((t) => (
          <li key={t.id} className={t.focus ? 'tracking-focus' : undefined}>
            <label>
              <input type="checkbox" checked={t.done} onChange={(e) => tracking.changeTodo(t.id, { done: e.target.checked })} />
              <span>{t.text}</span>
            </label>
            {t.focus && <em className="tracking-badge">your one thing</em>}
            <button
              type="button"
              className="tracking-star"
              aria-label={t.focus ? `Stop making "${t.text}" my one thing` : `Make "${t.text}" my one thing`}
              aria-pressed={t.focus}
              onClick={() => tracking.changeTodo(t.id, { focus: !t.focus })}
            >
              {t.focus ? '★' : '☆'}
            </button>
            <button type="button" className="tracking-remove" aria-label={`Remove to-do ${t.text}`} onClick={() => tracking.removeTodo(t.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {!todosOpen && todos.length > SMALL.todos && (
        <p className="tracking-more">+{todos.length - SMALL.todos} more. Press View to see them all.</p>
      )}
      <AddForm label="New to-do" placeholder="Something for today" onAdd={tracking.addTodo} />
    </div>
  )

  return (
    <section className="tracking">
      <h2>Today</h2>
      <p className="tracking-earned">
        <strong>{data.earnedOnDay}</strong> pieces earned today (limit {settings.dailyCap}) ·{' '}
        <strong>{data.earnedTotal}</strong> in total
      </p>
      {error && (
        <p role="alert" className="tracking-error">
          {error}
        </p>
      )}

      {panel === null && (
        <div className="tracking-columns">
          {habitsCard}
          {todosCard}
        </div>
      )}
      {habitsOpen && habitsCard}
      {todosOpen && todosCard}

      {/* stays mounted when habits or to-dos are open, so it does not fetch again on every Back */}
      <div hidden={habitsOpen || todosOpen}>
        <StatsPanels day={tracking.day} version={version} panel={panel} setPanel={setPanel} />
      </div>

      {panel === null && (
        <div className="tracking-card">
          <h3>Pieces per task</h3>
          <p className="tracking-hint">What each finished task earns. Past days keep the pieces they already earned.</p>
          <PieceValuesBox key={JSON.stringify(settings)} saved={settings} onSave={tracking.saveSettings} />
        </div>
      )}
    </section>
  )
}
