import { createFileRoute } from '@tanstack/react-router'
import { getTodos } from '../server/todos'
import { TodoList } from '../components/TodoList'
import { AddTodo } from '../components/AddTodo'

export const Route = createFileRoute('/')({
  loader: () => getTodos(),
  component: HomePage,
})

function HomePage() {
  const todos = Route.useLoaderData()
  const uncompleted = todos.filter((t) => !t.completed).length

  const handleTitleClick = (e: React.MouseEvent<HTMLHeadingElement>) => {
    // Simulated bug: clicking the title hides it (CSS regression)
    e.currentTarget.style.display = 'none'
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        {/* fs-assert invariant: title should always be visible.
            Clicking it triggers a simulated CSS regression (hides the element). */}
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
        <AddTodo todoCount={todos.length} />
        <div style={styles.demoRow}>
          <span style={styles.demoLabel}>Demos:</span>
          {/* GC demo: asserts on a selector that never appears. No SLA timeout,
              so it stays pending until the GC sweeps it (default 30s).
              Click to see it sit in the panel as pending, then eventually fail. */}
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
          // fs-assert OOB: when any CRUD assertion passes, verify the count updated correctly.
          // No prop drilling needed — the count label declares its own assertion
          // triggered by the success of toggle/add/delete.
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
  title: {
    fontSize: '1.75rem',
    fontWeight: 700,
    margin: 0,
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
