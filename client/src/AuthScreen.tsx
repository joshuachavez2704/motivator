import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { login, register } from './api'
import type { User } from './api'
import './auth.css'

type Props = {
  onSignedIn: (user: User) => void
  onGuest: () => void
  notice: string | null // e.g. "couldn't reach the server"
}

export default function AuthScreen({ onSignedIn, onGuest, notice }: Props) {
  const [mode, setMode] = useState<'signin' | 'register'>('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const user =
        mode === 'signin'
          ? await login(username, password)
          : await register(username, password)
      onSignedIn(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const registering = mode === 'register'

  return (
    <main className="auth-screen">
      <h1>Habit Puzzle</h1>
      <p className="auth-tagline">Finish tasks, earn puzzle pieces.</p>

      {notice && <p className="auth-notice">{notice}</p>}

      <form className="auth-form" onSubmit={handleSubmit}>
        <h2>{registering ? 'Create an account' : 'Sign in'}</h2>

        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_]+"
            title="Letters, numbers and underscores only"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={registering ? 'new-password' : 'current-password'}
            minLength={registering ? 8 : undefined}
            maxLength={128}
            required
          />
        </label>

        {registering && (
          <p className="auth-hint">
            3 to 32 letters, numbers or underscores. Password: at least 8 characters.
          </p>
        )}

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy}>
          {busy ? 'One moment…' : registering ? 'Create account' : 'Sign in'}
        </button>

        <button
          type="button"
          className="auth-link"
          onClick={() => {
            setMode(registering ? 'signin' : 'register')
            setError(null)
          }}
        >
          {registering ? 'I already have an account' : 'Create an account'}
        </button>
      </form>

      <div className="auth-guest">
        <button type="button" onClick={onGuest}>
          Play as guest
        </button>
        <p className="auth-hint">Guests can play, but nothing is saved to the server.</p>
      </div>
    </main>
  )
}