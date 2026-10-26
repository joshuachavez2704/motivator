import { readdir, readFile } from 'node:fs/promises'
import { pool } from './db.js'

// migrations/ sits next to src/ (and next to dist/ after a build)
const migrationsDir = new URL('../migrations/', import.meta.url)

async function migrate() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL')
  }

  // remember which files have already been applied
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations')
  const applied = new Set(rows.map((r) => r.name))

  // 001_..., 002_... run in name order
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()

  let ran = 0
  for (const file of files) {
    if (applied.has(file)) continue

    const sql = await readFile(new URL(file, migrationsDir), 'utf8')
    const client = await pool.connect()
    try {
      // all-or-nothing: if the file fails halfway, nothing from it is kept
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`applied ${file}`)
      ran++
    } catch (err) {
      await client.query('ROLLBACK')
      throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : err}`)
    } finally {
      client.release()
    }
  }

  console.log(ran === 0 ? 'Database is up to date.' : `Done. Applied ${ran} migration(s).`)
}

migrate()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => pool.end())