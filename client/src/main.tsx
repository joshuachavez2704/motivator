import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AuthGate from './AuthGate'
import Game from './Game'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <Game />
    </AuthGate>
  </StrictMode>,
)