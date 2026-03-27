import { createServerFn } from '@tanstack/react-start'
import type { Todo } from '../types/todo'

// In-memory store — data is lost on server restart.
// Seeded with example todos so the app isn't empty on first load.
const todos: Todo[] = [
  {
    id: '1',
    text: 'Try editing this todo',
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    text: 'Mark this one as complete',
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: '3',
    text: 'Delete this todo to see conditional assertions',
    completed: false,
    createdAt: new Date().toISOString(),
  },
]

let nextId = 4

export const getTodos = createServerFn({ method: 'GET' }).handler(
  async () => {
    return [...todos]
  },
)

export const addTodo = createServerFn({ method: 'POST' })
  .inputValidator((data: { text: string }) => data)
  .handler(async ({ data }) => {
    if (!data.text.trim()) {
      return { error: 'Todo text cannot be empty' }
    }
    // Simulate slow network for "SLOW" todos (SLA timeout demo)
    if (data.text.trim() === 'SLOW') {
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    const todo: Todo = {
      id: String(nextId++),
      text: data.text.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    }
    todos.push(todo)
    return { todo }
  })

export const updateTodo = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string; text: string }) => data)
  .handler(async ({ data }) => {
    const todo = todos.find((t) => t.id === data.id)
    if (!todo) throw new Error('Todo not found')
    todo.text = data.text
    return todo
  })

export const toggleTodo = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const todo = todos.find((t) => t.id === data.id)
    if (!todo) throw new Error('Todo not found')
    todo.completed = !todo.completed
    return todo
  })

export const deleteTodo = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const index = todos.findIndex((t) => t.id === data.id)
    if (index === -1) throw new Error('Todo not found')
    if (todos[index].text === 'FAIL') {
      throw new Error('Cannot delete this todo')
    }
    todos.splice(index, 1)
    return { success: true }
  })
