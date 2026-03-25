import { TodoItem } from './TodoItem'
import type { Todo } from '../types/todo'

export function TodoList({ todos }: { todos: Todo[] }) {
  if (todos.length === 0) {
    return (
      // fs-assert: Mount trigger — validates empty state renders correctly
      <div
        className="empty-state-message"
        style={styles.empty}
        fs-assert="todos/empty-state"
        fs-trigger="mount"
        fs-assert-visible=".empty-state-message"
      >
        No todos yet. Add one above!
      </div>
    )
  }

  return (
    <div style={styles.list}>
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  empty: {
    textAlign: 'center',
    padding: '2rem',
    color: '#a1a1aa',
    fontSize: '0.9375rem',
  },
}
