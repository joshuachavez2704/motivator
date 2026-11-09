import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchMe, logout } from './api'
import type { User } from './api'
import { AuthContext } from './auth-context'
import AuthScreen from './AuthScreen'
import './auth.css'

// Wraps the whole app. Decides between: asking the server who you are, the sign-in
// screen, or the game itself (as a signed-in user or as a guest).
export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [guest, setGuest] = useState(false)
  const [checked, setChecked] = useState(false) // have we asked the server yet?
  const [notice, setNotice] = useState<string | null>(null)

  // On load, ask the server whether our cookie belongs to a signed-in user.
  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() =>
        setNotice("Couldn't reach the server. You can still play as a guest."),
      )
      .finally(() => setChecked(true))
  }, [])

  async function signOut() {
    try {
      await logout()
    } catch {
      // even if the server is unreachable, leave the signed-in view
    }
    setUser(null)
    setGuest(false)
  }

  if (!checked) {
    return <p className="auth-loading">Connecting…</p>
  }

  if (!user && !guest) {
    return (
      <AuthScreen
        onSignedIn={(u) => {
          setUser(u)
          setNotice(null)
        }}
        onGuest={() => setGuest(true)}
        notice={notice}
      />
    )
  }

  return (
    <AuthContext value={{ user, signOut }}>
      <div className="auth-bar">
        {user ? (
          <>
            <span>
              Signed in as <strong>{user.username}</strong>
            </span>
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <span>Playing as guest (progress is not saved)</span>
            <button type="button" onClick={signOut}>
              Sign in
            </button>
          </>
        )}
      </div>
      {children}
    </AuthContext>
  )
}