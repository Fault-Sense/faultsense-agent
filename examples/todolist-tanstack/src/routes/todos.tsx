import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { getTodos } from '../server/todos'
import { TodoList } from '../components/TodoList'
import { AddTodo } from '../components/AddTodo'

export const Route = createFileRoute('/todos')({
  loader: () => getTodos(),
  component: TodosPage,
})

function TodosPage() {
  const navigate = useNavigate()
  const todos = Route.useLoaderData()
  const uncompleted = todos.filter((t) => !t.completed).length

  const handleTitleClick = (e: React.MouseEvent<HTMLHeadingElement>) => {
    e.currentTarget.style.display = 'none'
  }

  const handleLogout = () => {
    navigate({ to: '/login' })
  }

  return (
    <div style={styles.container}>
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
            style={styles.logoutBtn}
            onClick={handleLogout}
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
        <AddTodo />
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
          <div
            id="todo-count"
            style={styles.count}
            fs-assert="todos/count-updated"
            fs-assert-oob="todos/toggle-complete,todos/add-item,todos/remove-item"
            fs-assert-visible='[text-matches=\d+/\d+ remaining]'
          >
            {uncompleted}/{todos.length} remaining
          </div>
        )}
        <TodoList todos={todos} />
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
}
