import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { pool } from './db.js'

// ---------------------------------------------------------------- passwords

// scrypt settings: N is the memory/CPU cost, r the block size, p the parallelism.
// We save them inside every hash, so we can raise them later without breaking old accounts.
const SCRYPT = { N: 2 ** 15, r: 8, p: 3 }
const KEY_LENGTH = 32

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: 256 * N * r }, (err, key) => {
      if (err) reject(err)
      else resolve(key)
    })
  })
}

// Result looks like: scrypt$32768$8$3$<salt>$<hash>
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p)
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$')
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split('$')
  if (scheme !== 'scrypt' || !n || !r || !p || !saltB64 || !keyB64) return false
  const expected = Buffer.from(keyB64, 'base64')
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), Number(n), Number(r), Number(p))
  // timingSafeEqual compares without leaking, through timing, how many bytes matched
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// For unknown usernames we still do the expensive work, so "no such user" and
// "wrong password" take the same time and cannot be told apart.
let dummyHash: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('not-a-real-password')
  return dummyHash
}

// ----------------------------------------------------------------- sessions

const COOKIE_NAME = 'session'
const SESSION_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

// The database only ever sees this hash of the token, never the token itself.
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

function cookieOptions() {
  return {
    httpOnly: true, // JavaScript on the page cannot read it
    sameSite: 'lax' as const, // not sent on cross-site POSTs
    secure: process.env.NODE_ENV === 'production', // HTTPS only when deployed
    path: '/',
  }
}

async function startSession(res: Response, userId: string) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_MS)
  await pool.query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [
    hashToken(token),
    userId,
    expiresAt,
  ])
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_MS })
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(eq + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

type SessionUser = { id: string; username: string }

async function findSessionUser(req: Request): Promise<SessionUser | null> {
  const token = readCookie(req, COOKIE_NAME)
  if (!token) return null
  const { rows } = await pool.query<SessionUser>(
    `SELECT u.id, u.username
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  )
  return rows[0] ?? null
}

// Put this in front of any route that needs a signed-in user.
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await findSessionUser(req)
    if (!user) {
      res.status(401).json({ error: 'Please sign in' })
      return
    }
    res.locals.userId = user.id
    res.locals.username = user.username
    next()
  } catch (err) {
    console.error('Session lookup failed:', err)
    res.status(503).json({ error: 'Database not reachable' })
  }
}

// ------------------------------------------------------------------- routes

export const authRouter = Router()

const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/

authRouter.post('/register', async (req, res) => {
  const { username, password } = (req.body ?? {}) as Record<string, unknown>

  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    res.status(400).json({ error: 'Username must be 3 to 32 letters, numbers or underscores' })
    return
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Password must be 8 to 128 characters' })
    return
  }

  try {
    const passwordHash = await hashPassword(password)
    const { rows } = await pool.query<SessionUser>(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, passwordHash],
    )
    const user = rows[0]
    await startSession(res, user.id)
    res.status(201).json({ id: user.id, username: user.username })
  } catch (err) {
    // 23505 = unique violation: the name is taken (compared without regard to case)
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'That username is taken' })
      return
    }
    console.error('Register failed:', err)
    res.status(503).json({ error: 'Something went wrong' })
  }
})

authRouter.post('/login', async (req, res) => {
  const { username, password } = (req.body ?? {}) as Record<string, unknown>
  if (typeof username !== 'string' || typeof password !== 'string' || password.length > 128) {
    res.status(400).json({ error: 'Username and password are required' })
    return
  }

  try {
    const { rows } = await pool.query<SessionUser & { password_hash: string }>(
      'SELECT id, username, password_hash FROM users WHERE lower(username) = lower($1)',
      [username],
    )
    const user = rows[0]
    const ok = await verifyPassword(password, user ? user.password_hash : await getDummyHash())

    if (!user || !ok) {
      res.status(401).json({ error: 'Wrong username or password' })
      return
    }

    // tidy up: forget sessions that have already expired
    await pool.query('DELETE FROM sessions WHERE expires_at < now()')
    await startSession(res, user.id)
    res.json({ id: user.id, username: user.username })
  } catch (err) {
    console.error('Login failed:', err)
    res.status(503).json({ error: 'Something went wrong' })
  }
})

authRouter.post('/logout', async (req, res) => {
  try {
    const token = readCookie(req, COOKIE_NAME)
    if (token) await pool.query('DELETE FROM sessions WHERE id = $1', [hashToken(token)])
    res.clearCookie(COOKIE_NAME, cookieOptions())
    res.status(204).end()
  } catch (err) {
    console.error('Logout failed:', err)
    res.status(503).json({ error: 'Something went wrong' })
  }
})

// "Who am I?" A visitor who is not signed in is a guest: that is a normal answer, not an error.
authRouter.get('/me', async (req, res) => {
  try {
    const user = await findSessionUser(req)
    res.json({ user })
  } catch (err) {
    console.error('Me failed:', err)
    res.status(503).json({ error: 'Something went wrong' })
  }
})