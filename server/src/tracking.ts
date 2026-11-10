import { Router } from 'express'
import type { Request, Response } from 'express'
import type { PoolClient } from 'pg'
import { pool } from './db.js'
import { requireUser } from './auth.js'

export const trackingRouter = Router()

// ------------------------------------------------------------------ helpers

// Wraps a route so any thrown error becomes a logged 503 instead of a crash.
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      console.error(`${req.method} ${req.path} failed:`, err)
      if (!res.headersSent) res.status(503).json({ error: 'Something went wrong' })
    })
  }
}

// "2026-11-10" and a real calendar date, and no more than a day away from the server's
// date (that covers every time zone). Stops anyone from filling in days far in the past.
function isAllowedDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) return false
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  return Math.abs(time - today) <= 24 * 60 * 60 * 1000
}

// a whole number that fits in a Postgres integer
function parseId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value)) return null
  return Number(value)
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function isCleanText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= max
}

type Db = Pick<PoolClient, 'query'>

// Makes sure this person has a settings row (the column defaults are the starting values).
async function ensureSettings(db: Db, userId: string) {
  await db.query('INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId])
}

// Works out how many pieces this person earned on a day and stores it.
// Rule: habits done + to-dos done + "one thing" done, each worth its own number of pieces,
// added up and held to the daily limit.
async function recomputeDay(db: Db, userId: string, day: string) {
  await ensureSettings(db, userId)
  await db.query(
    `INSERT INTO daily_earnings (user_id, day, pieces)
     SELECT $1, $2::date,
            LEAST(
              s.daily_cap,
              s.habit_pieces * (SELECT count(*) FROM habit_checks hc
                                  JOIN habits h ON h.id = hc.habit_id
                                 WHERE h.user_id = $1 AND hc.day = $2::date)::int
            + s.todo_pieces  * (SELECT count(*) FROM todos
                                 WHERE user_id = $1 AND day = $2::date AND done AND NOT is_focus)::int
            + s.focus_pieces * (SELECT count(*) FROM todos
                                 WHERE user_id = $1 AND day = $2::date AND done AND is_focus)::int
            )
       FROM user_settings s
      WHERE s.user_id = $1
     ON CONFLICT (user_id, day) DO UPDATE SET pieces = EXCLUDED.pieces`,
    [userId, day],
  )
}

// What the client needs after a change: pieces earned on the day that was changed
// (earnedOnDay), and across all days (earnedTotal).
async function earnedSummary(db: Db, userId: string, day: string) {
  const { rows } = await db.query<{ today: number; total: number }>(
    `SELECT coalesce(sum(pieces) FILTER (WHERE day = $2::date), 0)::int AS today,
            coalesce(sum(pieces), 0)::int AS total
       FROM daily_earnings WHERE user_id = $1`,
    [userId, day],
  )
  return { earnedOnDay: rows[0].today, earnedTotal: rows[0].total }
}

// Runs several queries as one all-or-nothing unit.
async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// ------------------------------------------------------------------- routes
// (each route says requireUser itself: this router is mounted on /api next to public routes)

// Everything the tracking screen shows for one day.
trackingRouter.get('/tracking', requireUser, handle(async (req, res) => {
  const day = req.query.day
  if (!isAllowedDay(day)) {
    res.status(400).json({ error: 'day must be a date like 2026-11-10 (today)' })
    return
  }
  const userId = res.locals.userId as string
  await ensureSettings(pool, userId)

  const [settings, habits, todos, earned] = await Promise.all([
    pool.query(
      `SELECT habit_pieces AS "habitPieces", todo_pieces AS "todoPieces",
              focus_pieces AS "focusPieces", daily_cap AS "dailyCap"
         FROM user_settings WHERE user_id = $1`,
      [userId],
    ),
    pool.query(
      `SELECT h.id, h.name,
              EXISTS (SELECT 1 FROM habit_checks c WHERE c.habit_id = h.id AND c.day = $2::date) AS done
         FROM habits h
        WHERE h.user_id = $1 AND h.archived_at IS NULL
        ORDER BY h.id`,
      [userId, day],
    ),
    pool.query(
      `SELECT id, text, done, is_focus AS focus
         FROM todos WHERE user_id = $1 AND day = $2::date
        ORDER BY is_focus DESC, id`,
      [userId, day],
    ),
    earnedSummary(pool, userId, day),
  ])

  res.json({ settings: settings.rows[0], habits: habits.rows, todos: todos.rows, ...earned })
}))

// Change how many pieces things are worth, and the daily limit.
trackingRouter.put('/settings', requireUser, handle(async (req, res) => {
  const { habitPieces, todoPieces, focusPieces, dailyCap } = (req.body ?? {}) as Record<string, unknown>
  if (
    !isIntInRange(habitPieces, 0, 20) ||
    !isIntInRange(todoPieces, 0, 20) ||
    !isIntInRange(focusPieces, 0, 20) ||
    !isIntInRange(dailyCap, 0, 500)
  ) {
    res.status(400).json({ error: 'Piece values must be whole numbers from 0 to 20, and the daily limit from 0 to 500' })
    return
  }
  await pool.query(
    `INSERT INTO user_settings (user_id, habit_pieces, todo_pieces, focus_pieces, daily_cap)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE
       SET habit_pieces = $2, todo_pieces = $3, focus_pieces = $4, daily_cap = $5`,
    [res.locals.userId, habitPieces, todoPieces, focusPieces, dailyCap],
  )
  res.json({ habitPieces, todoPieces, focusPieces, dailyCap })
}))

// ------------------------------------------------------------------- habits

trackingRouter.post('/habits', requireUser, handle(async (req, res) => {
  const { name } = (req.body ?? {}) as Record<string, unknown>
  if (!isCleanText(name, 100)) {
    res.status(400).json({ error: 'A habit needs a name of 1 to 100 characters' })
    return
  }
  const { rows } = await pool.query(
    'INSERT INTO habits (user_id, name) VALUES ($1, $2) RETURNING id, name',
    [res.locals.userId, name.trim()],
  )
  res.status(201).json({ ...rows[0], done: false })
}))

// "Deleting" a habit archives it: it leaves your list but its history stays.
trackingRouter.delete('/habits/:id', requireUser, handle(async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(404).json({ error: 'Habit not found' })
    return
  }
  const result = await pool.query(
    'UPDATE habits SET archived_at = now() WHERE id = $1 AND user_id = $2 AND archived_at IS NULL',
    [id, res.locals.userId],
  )
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Habit not found' })
    return
  }
  res.status(204).end()
}))

// Tick or untick a habit for one day.
trackingRouter.put('/habits/:id/days/:day', requireUser, handle(async (req, res) => {
  const id = parseId(req.params.id)
  const day = req.params.day
  const { done } = (req.body ?? {}) as Record<string, unknown>
  if (!isAllowedDay(day) || typeof done !== 'boolean') {
    res.status(400).json({ error: 'Send { "done": true or false } for today' })
    return
  }
  const userId = res.locals.userId as string
  const owned = id === null ? null : await pool.query(
    'SELECT 1 FROM habits WHERE id = $1 AND user_id = $2 AND archived_at IS NULL',
    [id, userId],
  )
  if (!owned || owned.rowCount === 0) {
    res.status(404).json({ error: 'Habit not found' })
    return
  }
  const summary = await inTransaction(async (db) => {
    if (done) {
      await db.query('INSERT INTO habit_checks (habit_id, day) VALUES ($1, $2::date) ON CONFLICT DO NOTHING', [id, day])
    } else {
      await db.query('DELETE FROM habit_checks WHERE habit_id = $1 AND day = $2::date', [id, day])
    }
    await recomputeDay(db, userId, day)
    return earnedSummary(db, userId, day)
  })
  res.json(summary)
}))

// -------------------------------------------------------------------- todos

trackingRouter.post('/todos', requireUser, handle(async (req, res) => {
  const { day, text } = (req.body ?? {}) as Record<string, unknown>
  if (!isAllowedDay(day) || !isCleanText(text, 200)) {
    res.status(400).json({ error: 'A to-do needs today\'s date and text of 1 to 200 characters' })
    return
  }
  const { rows } = await pool.query(
    `INSERT INTO todos (user_id, day, text) VALUES ($1, $2::date, $3)
     RETURNING id, text, done, is_focus AS focus`,
    [res.locals.userId, day, text.trim()],
  )
  res.status(201).json(rows[0])
}))

// Change a to-do: tick it, rename it, or make it "your one thing" for the day.
trackingRouter.patch('/todos/:id', requireUser, handle(async (req, res) => {
  const id = parseId(req.params.id)
  const { done, text, focus } = (req.body ?? {}) as Record<string, unknown>
  if (
    (done !== undefined && typeof done !== 'boolean') ||
    (focus !== undefined && typeof focus !== 'boolean') ||
    (text !== undefined && !isCleanText(text, 200)) ||
    (done === undefined && text === undefined && focus === undefined)
  ) {
    res.status(400).json({ error: 'Send done (true/false), text (1 to 200 characters) or focus (true/false)' })
    return
  }
  const userId = res.locals.userId as string

  const result = await inTransaction(async (db) => {
    const { rows: found } = id === null
      ? { rows: [] }
      : await db.query<{ day: string }>(
          `SELECT to_char(day, 'YYYY-MM-DD') AS day FROM todos WHERE id = $1 AND user_id = $2 FOR UPDATE`,
          [id, userId],
        )
    if (found.length === 0) return null
    const day = found[0].day

    // only one "one thing" per day: taking the title moves it from the old one
    if (focus === true) {
      await db.query('UPDATE todos SET is_focus = false WHERE user_id = $1 AND day = $2::date AND id <> $3', [userId, day, id])
    }
    const { rows } = await db.query(
      `UPDATE todos
          SET done = COALESCE($3, done),
              text = COALESCE($4, text),
              is_focus = COALESCE($5, is_focus)
        WHERE id = $1 AND user_id = $2
        RETURNING id, text, done, is_focus AS focus`,
      [id, userId, done ?? null, typeof text === 'string' ? text.trim() : null, focus ?? null],
    )
    await recomputeDay(db, userId, day)
    return { todo: rows[0], ...(await earnedSummary(db, userId, day)) }
  })

  if (!result) {
    res.status(404).json({ error: 'To-do not found' })
    return
  }
  res.json(result)
}))

trackingRouter.delete('/todos/:id', requireUser, handle(async (req, res) => {
  const id = parseId(req.params.id)
  const userId = res.locals.userId as string

  const summary = await inTransaction(async (db) => {
    if (id === null) return null
    const { rows } = await db.query<{ day: string }>(
      `DELETE FROM todos WHERE id = $1 AND user_id = $2 RETURNING to_char(day, 'YYYY-MM-DD') AS day`,
      [id, userId],
    )
    if (rows.length === 0) return null
    await recomputeDay(db, userId, rows[0].day)
    return earnedSummary(db, userId, rows[0].day)
  })

  if (!summary) {
    res.status(404).json({ error: 'To-do not found' })
    return
  }
  res.json(summary)
}))