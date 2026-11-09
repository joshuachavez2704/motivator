import { createContext, useContext } from 'react'
import type { User } from './api'

export type AuthContextValue = {
  user: User | null // null means a guest: nothing is saved on the server
  signOut: () => Promise<void> // also how a guest gets back to the sign-in screen
}

export const AuthContext = createContext<AuthContextValue | null>(null)

// Any component can call this to find out who is playing.
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthGate>')
  return value
}