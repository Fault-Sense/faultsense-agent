import { Router } from 'express'
import { renderPage, renderFragment } from '../lib/hx.js'

export const authRouter = Router()

authRouter.get('/login', (req, res) => {
  renderPage(res, 'pages/login')
})

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body
  if (username === 'demo' && password === 'demo') {
    // HX-Location triggers a client-side nav via fetch + pushState,
    // preserving the agent session. HX-Redirect would do a hard reload
    // and drop pending assertions.
    res.set('HX-Location', '/todos')
    res.status(204).end()
    return
  }
  renderFragment(res, 'partials/login-error', { error: 'Invalid username or password' })
})

authRouter.post('/logout', (req, res) => {
  res.set('HX-Location', '/login')
  res.status(204).end()
})
