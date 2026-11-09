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