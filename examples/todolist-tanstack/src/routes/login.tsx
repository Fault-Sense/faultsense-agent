import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { login } from '../server/auth'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const result = await login({ data: { username, password } })
    if ('error' in result) {
      setError(result.error)
      return
    }
    navigate({ to: '/todos' })
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Faultsense Todo Demo</h1>
        <p style={styles.subtitle}>Sign in to continue</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            style={styles.input}
            autoComplete="username"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            style={styles.input}
            autoComplete="current-password"
          />
          {/* fs-assert route: on success, navigate to /todos.
              On error, show .login-error message.
              Mutex="each" because success is a route assertion and error is a DOM assertion —
              they need cross-type mutual exclusion. */}
          <button
            type="submit"
            style={styles.button}
            fs-assert="auth/login"
            fs-trigger="click"
            fs-assert-mutex="each"
            fs-assert-route-success="/todos"
            fs-assert-added-error=".login-error"
          >
            Sign In
          </button>
        </form>
        {error && (
          <div className="login-error" style={styles.error}>
            {error}
          </div>
        )}
        <p style={styles.hint}>
          Use <strong>demo</strong> / <strong>demo</strong>
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: '#fafafa',
  },
  card: {
    width: 360,
    padding: '2.5rem 2rem',
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e4e4e7',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    margin: 0,
    textAlign: 'center' as const,
    color: '#18181b',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#71717a',
    textAlign: 'center' as const,
    margin: '0.5rem 0 1.5rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  input: {
    padding: '0.625rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid #d4d4d8',
    borderRadius: 6,
    outline: 'none',
  },
  button: {
    padding: '0.625rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#18181b',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    marginTop: '0.25rem',
  },
  error: {
    marginTop: '1rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.8125rem',
    color: '#dc2626',
    background: '#fef2f2',
    borderRadius: 6,
    border: '1px solid #fecaca',
  },
  hint: {
    fontSize: '0.75rem',
    color: '#a1a1aa',
    textAlign: 'center' as const,
    marginTop: '1.25rem',
    marginBottom: 0,
  },
}
