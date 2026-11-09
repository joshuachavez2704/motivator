import { useAuth } from './auth-context'
import AccountGame from './AccountGame'
import GuestGame from './GuestGame'

// Signed in: the puzzle lives on the server. Guest: it lives in this browser.
export default function Game() {
  const { user } = useAuth()
  // key: signing in as someone else must start a fresh game, not reuse the old one
  return user ? <AccountGame key={user.id} /> : <GuestGame />
}
