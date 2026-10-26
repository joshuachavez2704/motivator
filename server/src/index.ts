import express from 'express'
import dns from 'node:dns'
import { pool } from './db.js'
import type { NextFunction, Request, Response } from 'express'

dns.setDefaultResultOrder('ipv4first')  

const app = express()

app.use(express.json())

app.use((req, _res, next) => {
  console.log(new Date().toISOString(), req.method, req.url)
  next()
})

// a route with no outside calls, only to prove the server answers
app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

const PORT = Number(process.env.PORT ?? 3001)
const accessKey = process.env.UNSPLASH_ACCESS_KEY

if (!accessKey) {
  console.error('Missing UNSPLASH_ACCESS_KEY. Put it in server/.env')
  process.exit(1)
}

// The parts of Unsplash's response that we use
type UnsplashPhoto = {
  id: string
  alt_description: string | null
  width: number
  height: number
  urls: { raw: string }
  links: { html: string; download_location: string }
  user: { name: string; links: { html: string } }
}

app.get('/api/puzzle-image', async (req, res) => {
  const query =
    typeof req.query.query === 'string' ? req.query.query : 'landscape nature'

  const url = new URL('https://api.unsplash.com/photos/random')
  url.searchParams.set('orientation', 'landscape')
  url.searchParams.set('query', query)

  try {
    const upstream = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
      signal: AbortSignal.timeout(8000), // give up after 8 seconds
    })

    if (!upstream.ok) {
      res.status(502).json({ error: `Unsplash responded with ${upstream.status}` })
      return
    }

    const photo = (await upstream.json()) as UnsplashPhoto

    // send the browser only what it needs (never the key)
    res.json({
      id: photo.id,
      imageUrl: photo.urls.raw,
      width: photo.width,
      height: photo.height,
      alt: photo.alt_description ?? 'Puzzle photo',
      photographer: photo.user.name,
      photographerUrl: photo.user.links.html,
      photoUrl: photo.links.html,
      downloadLocation: photo.links.download_location,
    })
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: 'Could not reach Unsplash' })
  }
})




app.post('/api/photos/:id/download', async (req, res) => {
  const { id } = req.params
  // only letters, digits, - and _ : never build a URL from unchecked input
  if (!/^[\w-]+$/.test(id)) {
    res.status(400).json({ error: 'Bad photo id' })
    return
  }
  try {
    const r = await fetch(`https://api.unsplash.com/photos/${id}/download`, {
      headers: { Authorization: `Client-ID ${accessKey}` },
      signal: AbortSignal.timeout(8000),
    })
    res.status(r.ok ? 204 : 502).end()
  } catch {
    res.status(502).end()
  }
})


app.get('/api/health/db', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true })
  } catch (err) {
    console.error('Database check failed:', err)
    res.status(503).json({ ok: false, error: 'Database not reachable' })
  }
})

app.post('/api/players', async (_req, res) => {
  try {
    const { rows } = await pool.query<{ id: string }>(
      'INSERT INTO players DEFAULT VALUES RETURNING id',
    )
    res.status(201).json({ id: rows[0].id })
  } catch (err) {
    console.error('Could not create player:', err)
    res.status(503).json({ error: 'Database not reachable' })
  }
})

app.post('/api/puzzles', requirePlayer, async (req, res) => {
  const { rows, cols, seed, photo } = (req.body ?? {}) as Record<string, unknown>

  if (!isIntInRange(rows, 1, 30) || !isIntInRange(cols, 1, 30) || !isIntInRange(seed, 0, 2147483647)) {
    res.status(400).json({ error: 'rows and cols must be whole numbers from 1 to 30, and seed a whole number from 0 up' })
    return
  }
  if (
    typeof photo !== 'object' ||
    photo === null ||
    Array.isArray(photo) ||
    typeof (photo as { id?: unknown }).id !== 'string'
  ) {
    res.status(400).json({ error: 'photo must be an object with a string id' })
    return
  }

  try {
    const { rows: created } = await pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO puzzles (player_id, rows, cols, seed, photo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [res.locals.playerId, rows, cols, seed, JSON.stringify(photo)],
    )
    res.status(201).json({ id: created[0].id, createdAt: created[0].created_at })
  } catch (err) {
    console.error('Could not create puzzle:', err)
    res.status(503).json({ error: 'Database not reachable' })
  }
})


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Runs before routes that need to know who is asking.
async function requirePlayer(req: Request, res: Response, next: NextFunction) {
  const id = req.header('X-Player-Id')
  if (!id || !UUID_RE.test(id)) {
    res.status(401).json({ error: 'Missing or invalid X-Player-Id header' })
    return
  }
  try {
    const { rowCount } = await pool.query('SELECT 1 FROM players WHERE id = $1', [id])
    if (rowCount === 0) {
      res.status(401).json({ error: 'Unknown player' })
      return
    }
    res.locals.playerId = id
    next()
  } catch (err) {
    console.error('Player lookup failed:', err)
    res.status(503).json({ error: 'Database not reachable' })
  }
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}


app.listen(PORT, (err?: Error) => {
  if (err) {
    console.error('Could not start the server:', err.message)
    process.exit(1)
  }
  console.log(`API listening on http://localhost:${PORT}`)
})