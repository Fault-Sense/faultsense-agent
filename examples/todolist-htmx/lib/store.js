// In-memory store — data is lost on server restart.
// Seeded with example todos so the app isn't empty on first load.
// Mirrors examples/todolist-tanstack/src/server/todos.ts exactly.

const todos = [
  { id: '1', text: 'Try editing this todo', completed: false, createdAt: new Date().toISOString() },
  { id: '2', text: 'Mark this one as complete', completed: false, createdAt: new Date().toISOString() },
  { id: '3', text: 'Delete this todo to see conditional assertions', completed: false, createdAt: new Date().toISOString() },
]

let nextId = 4

export function getTodos() {
  return [...todos]
}

export function findTodo(id) {
  return todos.find((t) => t.id === id)
}

export async function addTodo(text) {
  const trimmed = text.trim()
  if (!trimmed) return { error: 'Todo text cannot be empty' }
  // Simulate slow network for "SLOW" todos (SLA timeout demo)
  if (trimmed === 'SLOW') {
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  const todo = {
    id: String(nextId++),
    text: trimmed,
    completed: false,
    createdAt: new Date().toISOString(),
  }
  todos.push(todo)
  return { todo }
}

export function updateTodo(id, text) {
  const todo = findTodo(id)
  if (!todo) return null
  todo.text = text
  return todo
}

export function toggleTodo(id) {
  const todo = findTodo(id)
  if (!todo) return null
  todo.completed = !todo.completed
  return todo
}

export function deleteTodo(id) {
  const index = todos.findIndex((t) => t.id === id)
  if (index === -1) return { error: 'Todo not found' }
  if (todos[index].text === 'FAIL') {
    return { error: 'Cannot delete this todo' }
  }
  todos.splice(index, 1)
  return { success: true }
}
