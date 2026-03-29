import { useState, useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { getTodos } from '../server/todos'
import { TodoList } from '../components/TodoList'
import { AddTodo } from '../components/AddTodo'
import { GettingStarted } from '../components/GettingStarted'
import { ActivityLog } from '../components/ActivityLog'

export const Route = createFileRoute('/todos')({
  loader: () => getTodos(),
  component: TodosPage,
})

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return isOnline
}

function TodosPage() {
  const navigate = useNavigate()
  const todos = Route.useLoaderData()
  const uncompleted = todos.filter((t) => !t.completed).length
  const isOnline = useOnlineStatus()

  const handleTitleClick = (e: React.MouseEvent<HTMLHeadingElement>) => {
    e.currentTarget.style.display = 'none'
  }

  const handleLogout = () => {
    window.Faultsense?.setUserContext?.(undefined)
    navigate({ to: '/login' })
  }

  return (
    <div style={styles.container}>
      {/* fs-assert: When connectivity is lost, the offline banner should be visible */}
      <div
        fs-assert="network/offline-banner-shown"
        fs-trigger="offline"
        fs-assert-added="#offline-banner"
        style={{ display: 'none' }}
      />
      {/* fs-assert: When connectivity is restored, the offline banner should be removed */}
      <div
        fs-assert="network/offline-banner-hidden"
        fs-trigger="online"
        fs-assert-removed="#offline-banner"
        style={{ display: 'none' }}
      />
      {!isOnline && (
        <div id="offline-banner" style={styles.offlineBanner}>
          You are offline. Actions are disabled until connectivity is restored.
        </div>
      )}
      <header style={styles.header}>
        <div style={styles.titleRow}>
          <h1
            id="app-title"
            style={{ ...styles.title, cursor: 'pointer' }}
            onClick={handleTitleClick}
            fs-assert="layout/title-visible"
            fs-trigger="invariant"
            fs-assert-visible="#app-title"
          >
            Faultsense Todo Demo
          </h1>
          {/* fs-assert route: clicking logout should navigate back to /login */}
          <button
            style={{
              ...styles.logoutBtn,
              ...(!isOnline ? styles.disabledBtn : {}),
            }}
            onClick={handleLogout}
            disabled={!isOnline}
            fs-assert="auth/logout"
            fs-trigger="click"
            fs-assert-route="/login"
          >
            Logout
          </button>
        </div>
        <p style={styles.subtitle}>
          Every interaction is monitored by Faultsense assertions.
          <br />
          Watch the panel in the bottom-right corner.
          <br />
          <em style={{ fontSize: '0.75rem', color: '#999' }}>
            Try clicking the title above to trigger an invariant violation.
          </em>
        </p>
      </header>
      <main style={styles.main}>
        <GettingStarted />
        <AddTodo disabled={!isOnline} todoCount={todos.length} />
        <div style={styles.demoRow}>
          <span style={styles.demoLabel}>Demos:</span>
          <button
            style={styles.demoBtn}
            fs-assert="demo/gc-timeout"
            fs-trigger="click"
            fs-assert-added=".never-exists"
          >
            GC Demo (no SLA)
          </button>
          <span style={styles.demoHint}>
            Add "SLOW" todo for SLA demo (500ms timeout, 2s server delay)
          </span>
        </div>
        {todos.length > 0 && (
          <>
            <div
              id="todo-count"
              style={styles.count}
              fs-assert="todos/count-updated"
              fs-assert-oob="todos/toggle-complete,todos/add-item,todos/remove-item"
              fs-assert-visible='[text-matches=\d+/\d+ remaining]'
            >
              {uncompleted}/{todos.length} remaining
            </div>
            {/* fs-assert count: After add or remove, verify the actual number of
                .todo-item elements in the DOM matches the expected total. */}
            <div
              fs-assert="todos/item-count-correct"
              fs-assert-oob="todos/add-item,todos/remove-item"
              fs-assert-visible={`.todo-item[count=${todos.length}]`}
              style={{ display: 'none' }}
            />
            {/* fs-assert stable: After toggle, verify the count display doesn't
                flicker or re-render unexpectedly (catches React double-render bugs). */}
            <div
              fs-assert="todos/count-stable-after-toggle"
              fs-assert-oob="todos/toggle-complete"
              fs-assert-stable="#todo-count"
              fs-assert-timeout="500"
              style={{ display: 'none' }}
            />
          </>
        )}
        <TodoList todos={todos} disabled={!isOnline} />
        <ActivityLog />
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 600,
    margin: '0 auto',
    padding: '2rem 1rem',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#1a1a1a',
  },
  header: {
    marginBottom: '2rem',
    textAlign: 'center',
  },
  titleRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '1rem',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 700,
    margin: 0,
  },
  logoutBtn: {
    padding: '0.25rem 0.75rem',
    fontSize: '0.8125rem',
    border: '1px solid #d4d4d8',
    borderRadius: 4,
    backgroundColor: '#fff',
    cursor: 'pointer',
    color: '#52525b',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#666',
    marginTop: '0.5rem',
    lineHeight: 1.5,
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  count: {
    fontSize: '0.875rem',
    color: '#71717a',
    textAlign: 'right' as const,
  },
  demoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 0.75rem',
    background: '#fafafa',
    borderRadius: 6,
    border: '1px dashed #d4d4d8',
  },
  demoLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#71717a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  demoBtn: {
    padding: '0.25rem 0.75rem',
    fontSize: '0.8125rem',
    border: '1px solid #d4d4d8',
    borderRadius: 4,
    backgroundColor: '#fff',
    cursor: 'pointer',
    color: '#52525b',
  },
  demoHint: {
    fontSize: '0.75rem',
    color: '#a1a1aa',
    fontStyle: 'italic' as const,
  },
  offlineBanner: {
    padding: '0.75rem 1rem',
    marginBottom: '1rem',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 6,
    color: '#dc2626',
    fontSize: '0.875rem',
    fontWeight: 500,
    textAlign: 'center' as const,
  },
  disabledBtn: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
}
