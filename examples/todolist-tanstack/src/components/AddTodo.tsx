import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { addTodo } from '../server/todos'

export function AddTodo() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const result = await addTodo({ data: { text } })
    if ('error' in result) {
      setError(result.error)
      return
    }
    setText('')
    router.invalidate()
  }

  return (
    <div>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (error) setError(null)
          }}
          placeholder="What needs to be done?"
          style={styles.input}
        />
        {/* fs-assert: Clicking add should create a new .todo-item.
            Submitting empty text is a silent failure Faultsense catches —
            no error thrown, no UI feedback, the feature just doesn't work.
            Note: json-key response conditions (fs-assert-added-json-todo)
            don't work with framework RPCs like TanStack server functions
            because the transport wraps the response body. Use json-key
            with direct fetch calls where you control the response format. */}
        <button
          type="submit"
          style={styles.button}
          fs-assert="todos/add-item"
          fs-trigger="click"
          fs-assert-added=".todo-item"
        >
          Add
        </button>
      </form>
      {error && (
        <div className="add-error" style={styles.error}>
          {error}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    display: 'flex',
    gap: '0.5rem',
  },
  input: {
    flex: 1,
    padding: '0.625rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid #d4d4d8',
    borderRadius: 6,
    outline: 'none',
  },
  button: {
    padding: '0.625rem 1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#18181b',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  error: {
    marginTop: '0.5rem',
    fontSize: '0.8125rem',
    color: '#dc2626',
  },
}
