import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { updateTodo, toggleTodo, deleteTodo } from '../server/todos'
import type { Todo } from '../types/todo'

export function TodoItem({ todo }: { todo: Todo }) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(todo.text)
  const [error, setError] = useState<string | null>(null)

  const handleToggle = async () => {
    await toggleTodo({ data: { id: todo.id } })
    router.invalidate()
  }

  const handleDelete = async () => {
    setError(null)
    try {
      await deleteTodo({ data: { id: todo.id } })
      router.invalidate()
    } catch {
      setError('Failed to delete')
    }
  }

  const handleEdit = () => {
    setEditText(todo.text)
    setIsEditing(true)
  }

  const handleSave = async () => {
    const trimmed = editText.trim()
    if (!trimmed) return
    await updateTodo({ data: { id: todo.id, text: trimmed } })
    setIsEditing(false)
    router.invalidate()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') setIsEditing(false)
  }

  return (
    <div
      className={`todo-item${todo.completed ? ' completed' : ''}`}
      data-status={todo.completed ? 'completed' : isEditing ? 'editing' : 'active'}
      style={{
        ...styles.item,
        ...(todo.completed ? styles.completed : {}),
      }}
    >
      {/* fs-assert: Dynamic assertion — checks the EXPECTED next state.
          classlist verifies the CSS class toggled. data-status verifies
          the status attribute is a valid state (regex alternation). */}
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={handleToggle}
        style={styles.checkbox}
        fs-assert="todos/toggle-complete"
        fs-trigger="change"
        fs-assert-updated={`.todo-item[classlist=completed:${!todo.completed}][data-status=active|completed]`}
        fs-assert-visible={`#edit-btn-${todo.id}[disabled=${!todo.completed}]`}
      />

      {isEditing ? (
        <div style={styles.editRow}>
          {/* fs-assert: Saving hides the input and updates the displayed text.
              Dynamic assertion — verifies the rendered text matches what was typed.
              Trigger is blur (not click on Save) because onBlur fires handleSave,
              and the blur event fires before click when clicking the Save button.
              Escapes regex special chars in the edit text to avoid false failures. */}
          <input
            className="todo-edit-input"
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            autoFocus
            style={styles.editInput}
            fs-assert="todos/save-edit"
            fs-trigger="blur"
            fs-assert-removed=".todo-edit-input"
            fs-assert-updated={`.todo-text[text-matches=${editText.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`}
          />
          <button
            onClick={handleSave}
            style={styles.saveBtn}
          >
            Save
          </button>
        </div>
      ) : (
        <>
          <span
            className="todo-text"
            style={{
              ...styles.text,
              ...(todo.completed ? styles.textCompleted : {}),
            }}
          >
            {todo.text}
          </span>
          <div style={styles.actions}>
            {/* fs-assert: Clicking edit creates the inline input (conditionally rendered).
                Edit is disabled when the todo is completed — the toggle checkbox
                asserts this via fs-assert-visible with [disabled] modifier. */}
            <button
              id={`edit-btn-${todo.id}`}
              onClick={handleEdit}
              disabled={todo.completed}
              style={{
                ...styles.actionBtn,
                ...(todo.completed ? styles.disabledBtn : {}),
              }}
              fs-assert="todos/edit-item"
              fs-trigger="click"
              fs-assert-added=".todo-edit-input[focused=true]"
            >
              Edit
            </button>
            {/* fs-assert: Delete removes the todo item on success, or shows an
                error message on failure. fs-assert-grouped links the two
                conditional types (removed + added) as mutually exclusive outcomes. */}
            <button
              onClick={handleDelete}
              style={{ ...styles.actionBtn, ...styles.deleteBtn }}
              fs-assert="todos/remove-item"
              fs-trigger="click"
              fs-assert-grouped=""
              fs-assert-removed-success=".todo-item"
              fs-assert-added-error=".error-msg"
              fs-assert-timeout="5000"
            >
              Delete
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="error-msg" style={styles.error}>
          {error}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem',
    borderRadius: 6,
    border: '1px solid #e4e4e7',
    flexWrap: 'wrap',
  },
  completed: {
    backgroundColor: '#fafafa',
  },
  checkbox: {
    width: 18,
    height: 18,
    cursor: 'pointer',
    flexShrink: 0,
  },
  text: {
    flex: 1,
    fontSize: '1rem',
  },
  textCompleted: {
    textDecoration: 'line-through',
    color: '#a1a1aa',
  },
  actions: {
    display: 'flex',
    gap: '0.375rem',
  },
  actionBtn: {
    padding: '0.25rem 0.625rem',
    fontSize: '0.8125rem',
    border: '1px solid #d4d4d8',
    borderRadius: 4,
    backgroundColor: '#fff',
    cursor: 'pointer',
    color: '#52525b',
  },
  deleteBtn: {
    color: '#dc2626',
    borderColor: '#fecaca',
  },
  disabledBtn: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  editRow: {
    flex: 1,
    display: 'flex',
    gap: '0.5rem',
  },
  editInput: {
    flex: 1,
    padding: '0.375rem 0.5rem',
    fontSize: '1rem',
    border: '1px solid #a1a1aa',
    borderRadius: 4,
    outline: 'none',
  },
  saveBtn: {
    padding: '0.25rem 0.75rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#18181b',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  error: {
    width: '100%',
    fontSize: '0.8125rem',
    color: '#dc2626',
    marginTop: '0.25rem',
  },
}
