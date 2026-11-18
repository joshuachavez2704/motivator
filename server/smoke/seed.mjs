// Test helper: writes history straight into the database, because the API only lets you
// change today (and a day either side), so a streak cannot be built through it.
//   node smoke/seed.mjs ticks  <habitId> <days-ago,days-ago,...>
//   node smoke/seed.mjs earned <username> <days-ago:pieces,days-ago:pieces,...>
//   node smoke/seed.mjs todo   <username> <days-ago:text>      (one unfinished to-do)
// "days ago" counts back from today's date in UTC (the date the smoke tests send).
import pg from 'pg'

const [kind, target, list] = process.argv.slice(2)
if (!process.env.DATABASE_URL || !kind || !target || !list) {
  console.error('usage: DATABASE_URL=... node smoke/seed.mjs ticks|earned|todo <habitId|username> <list>')
  process.exit(2)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
try {
  if (kind === 'ticks') {
    for (const ago of list.split(',')) {
      await pool.query(
        `INSERT INTO habit_checks (habit_id, day) VALUES ($1, (now() AT TIME ZONE 'utc')::date - $2::int)
         ON CONFLICT DO NOTHING`,
        [Number(target), Number(ago)],
      )
    }
  } else if (kind === 'earned') {
    for (const item of list.split(',')) {
      const [ago, pieces] = item.split(':').map(Number)
      await pool.query(
        `INSERT INTO daily_earnings (user_id, day, pieces)
         SELECT id, (now() AT TIME ZONE 'utc')::date - $2::int, $3 FROM users WHERE username = $1
         ON CONFLICT (user_id, day) DO UPDATE SET pieces = EXCLUDED.pieces`,
        [target, ago, pieces],
      )
    }
  } else if (kind === 'todo') {
    const split = list.indexOf(':')
    const ago = Number(list.slice(0, split))
    const text = list.slice(split + 1)
    await pool.query(
      `INSERT INTO todos (user_id, day, text)
       SELECT id, (now() AT TIME ZONE 'utc')::date - $2::int, $3 FROM users WHERE username = $1`,
      [target, ago, text],
    )
  } else {
    throw new Error(`unknown kind: ${kind}`)
  }
} finally {
  await pool.end()
}