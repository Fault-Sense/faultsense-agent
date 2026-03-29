import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { addTodo } from '../server/todos'

export function AddTodo({ disabled, todoCount }: { disabled?: boolean; todoCount: number }) {
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
    document.dispatchEvent(new CustomEvent('todo:added', { detail: { text: text } }))
  }

  return (
    <div>
      <form onSubmit={handleSubmit} style={styles.form}>
        {/* fs-assert: On each keystroke, verify the character counter updates.
            input trigger fires on every input event; re-trigger re-evaluates
            the visible assertion to confirm the counter reflects the new length. */}
        <input
          id="add-todo-input"
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value.slice(0, 100))
            if (error) setError(null)
          }}
          placeholder="What needs to be done?"
          style={styles.input}
          autoFocus
          disabled={disabled}
          maxLength={100}
          fs-assert="todos/char-count-updated"
          fs-trigger="input"
          fs-assert-visible="#char-count[text-matches=\d+/100]"
        />
        {/* fs-assert: Clicking add should create a new .todo-item AND emit
            todo:added on success, or show a validation error on failure.
            mutex="conditions" means success/error condition keys compete —
            if error wins, both success assertions (added + emitted) are dismissed.
            If success wins, both success assertions resolve independently. */}
        <button
          type="submit"
          style={{
            ...styles.button,
            ...(disabled ? styles.disabledBtn : {}),
          }}
          disabled={disabled}
          fs-assert="todos/add-item"
          fs-trigger="click"
          fs-assert-mutex="conditions"
          fs-assert-added-success={`.todo-item[count=${todoCount + 1}]`}
          fs-assert-emitted-success="todo:added"
          fs-assert-added-error=".add-error"
          fs-assert-timeout="500"
        >
          Add
        </button>
      </form>
      <span
        id="char-count"
        style={{
          ...styles.charCount,
          ...(text.length >= 90 ? styles.charCountWarn : {}),
        }}
      >
        {text.length}/100
      </span>
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
  disabledBtn: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  charCount: {
    fontSize: '0.75rem',
    color: '#a1a1aa',
    marginTop: '0.25rem',
    display: 'block',
    textAlign: 'right' as const,
  },
  charCountWarn: {
    color: '#dc2626',
  },
}
