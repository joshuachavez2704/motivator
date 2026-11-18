import type { CarryoverTodo } from './api'

type Props = {
  tasks: CarryoverTodo[] // yesterday's unfinished tasks
  busy: boolean // a choice is being sent: stop more clicks until it is done
  onAccept: (ids: number[]) => void // move these to today
  onReject: (ids: number[]) => void // stop offering these
}

// "Yesterday's task was left unfinished. Roll it over to today?"
// Each task has its own check and x, and there is accept all / reject all for the lot.
export default function RolloverPrompt({ tasks, busy, onAccept, onReject }: Props) {
  if (tasks.length === 0) return null
  const all = tasks.map((t) => t.id)
  const many = tasks.length > 1

  return (
    <section className="rollover" aria-label="Unfinished tasks from yesterday">
      <p className="rollover-question">
        {many ? 'Yesterday’s tasks were left unfinished.' : 'Yesterday’s task was left unfinished.'} Roll{' '}
        {many ? 'them' : 'it'} over to today?
      </p>

      <ul className="rollover-list">
        {tasks.map((t) => (
          <li key={t.id}>
            <span className="rollover-text">{t.text}</span>
            <button
              type="button"
              className="rollover-yes"
              aria-label={`Roll over "${t.text}" to today`}
              disabled={busy}
              onClick={() => onAccept([t.id])}
            >
              ✓
            </button>
            <button
              type="button"
              className="rollover-no"
              aria-label={`Don't roll over "${t.text}"`}
              disabled={busy}
              onClick={() => onReject([t.id])}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="rollover-actions">
        <button type="button" disabled={busy} onClick={() => onAccept(all)}>
          Accept all
        </button>
        <button type="button" disabled={busy} onClick={() => onReject(all)}>
          Reject all
        </button>
      </div>
    </section>
  )
}
