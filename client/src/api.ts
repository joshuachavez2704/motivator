// All talking to our own API goes through this file, so the rest of the app never
// writes fetch calls by hand. The session cookie travels with every request
// automatically, because the browser sends it to the same site it came from.

export type User = { id: string; username: string }

// An error that remembers the HTTP status and the server's message
export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')

  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    // our API answers errors as { "error": "readable message" }
    let message = `The server answered ${res.status}`
    try {
      const body = (await res.json()) as { error?: unknown }
      if (typeof body.error === 'string') message = body.error
    } catch {
      // the body was not JSON; keep the generic message
    }
    throw new ApiError(res.status, message)
  }
  return res
}

// Who am I? Returns null for a guest (not signed in).
export async function fetchMe(): Promise<User | null> {
  const res = await request('/api/me')
  const { user } = (await res.json()) as { user: User | null }
  return user
}

export async function register(username: string, password: string): Promise<User> {
  const res = await request('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  return (await res.json()) as User
}

export async function login(username: string, password: string): Promise<User> {
  const res = await request('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  return (await res.json()) as User
}

export async function logout(): Promise<void> {
  await request('/api/logout', { method: 'POST' })
}

// ---- Saved puzzles (signed-in players only) ----

// The photo is stored as-is on the server; it only needs a string id.
export type StoredPhoto = { id: string } & Record<string, unknown>

export type SavedPuzzle = {
  id: string
  rows: number
  cols: number
  seed: number
  photo: StoredPhoto
}

export type SavedPosition = { pieceId: number; x: number; y: number }

// The player's newest puzzle and the pieces they have placed on the board.
// puzzle is null when they have not started one yet.
export async function loadPuzzle(): Promise<{
  puzzle: SavedPuzzle | null
  positions: SavedPosition[]
}> {
  const res = await request('/api/puzzle')
  return (await res.json()) as { puzzle: SavedPuzzle | null; positions: SavedPosition[] }
}

// Starts a new puzzle on the server and returns its id.
export async function createPuzzle(
  rows: number,
  cols: number,
  seed: number,
  photo: StoredPhoto,
): Promise<string> {
  const res = await request('/api/puzzles', {
    method: 'POST',
    body: JSON.stringify({ rows, cols, seed, photo }),
  })
  const { id } = (await res.json()) as { id: string }
  return id
}

// Remembers where one piece sits on the board (x and y are 0..1 fractions).
// The server answers 204 with no body, so there is nothing to parse.
export async function savePiece(
  puzzleId: string,
  pieceId: number,
  x: number,
  y: number,
): Promise<void> {
  await request(`/api/puzzles/${puzzleId}/pieces/${pieceId}`, {
    method: 'PUT',
    body: JSON.stringify({ x, y }),
  })
}

// Forgets a piece's position (it went back to the tray).
export async function removePiece(puzzleId: string, pieceId: number): Promise<void> {
  await request(`/api/puzzles/${puzzleId}/pieces/${pieceId}`, { method: 'DELETE' })
}
