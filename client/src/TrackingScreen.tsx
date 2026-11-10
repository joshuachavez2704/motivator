import { useState } from 'react'
import type { SubmitEvent } from 'react'
import type { PieceValues } from './api'
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

export default function TrackingScreen({ tracking }: { tracking: Tracking }) {
  const { data, error } = tracking

  if (!data) {
    return <p className="auth-loading">{error ?? 'Loading your habits…'}</p>
  }

  const { settings, habits, todos } = data

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

      <div className="tracking-columns">
        <div className="tracking-card">
          <h3>Habits</h3>
          <ul>
            {habits.length === 0 && <li className="tracking-empty">No habits yet. Add one you want to repeat every day.</li>}
            {habits.map((h) => (
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
          <AddForm label="New habit" placeholder="A habit to repeat daily" onAdd={tracking.addHabit} />
        </div>

        <div className="tracking-card">
          <h3>To-Do</h3>
          <ul>
            {todos.length === 0 && <li className="tracking-empty">Nothing planned for today. Pick your one thing.</li>}
            {todos.map((t) => (
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
          <AddForm label="New to-do" placeholder="Something for today" onAdd={tracking.addTodo} />
        </div>
      </div>

      <div className="tracking-card">
        <h3>Pieces per task</h3>
        <p className="tracking-hint">What each finished task earns. Past days keep the pieces they already earned.</p>
        <PieceValuesBox key={JSON.stringify(settings)} saved={settings} onSave={tracking.saveSettings} />
      </div>
    </section>
  )
}
