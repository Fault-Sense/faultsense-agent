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
        <AddTodo />
        {todos.length > 0 && (
          // fs-assert OOB: when any CRUD assertion passes, verify the count updated correctly.
          // No prop drilling needed — the count label declares its own assertion
          // triggered by the success of toggle/add/delete.
          <div
            id="todo-count"
            style={styles.count}
            fs-assert="todos/count-updated"
            fs-assert-oob-visible="todos/toggle-complete,todos/add-item,todos/remove-item"
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
}
