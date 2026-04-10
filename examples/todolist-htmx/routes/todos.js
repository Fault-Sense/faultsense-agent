import { Router } from 'express'
import { renderPage, renderFragment } from '../lib/hx.js'
import {
  getTodos,
  findTodo,
  addTodo,
  updateTodo,
  toggleTodo,
  deleteTodo,
} from '../lib/store.js'

export const todosRouter = Router()

/**
 * Render the main swap body and the mutation-oob bundle together.
 * Used by endpoints that mutate the todo list — add, delete.
 */
function renderWithMutationOob(res, view, locals) {
  res.render(view, locals, (err, main) => {
    if (err) return res.status(500).send(err.message)
    res.render('partials/mutation-oob', { todos: getTodos() }, (err2, oob) => {
      if (err2) return res.status(500).send(err2.message)
      res.send(main + oob)
    })
  })
}

todosRouter.get('/todos', (req, res) => {
  renderPage(res, 'pages/todos', { todos: getTodos() })
})

todosRouter.post('/todos', async (req, res) => {
  const result = await addTodo(req.body.text || '')
  if (result.error) {
    // Retarget to the error slot without swapping the form.
    res.set('HX-Retarget', '#add-error-slot')
    res.set('HX-Reswap', 'innerHTML')
    renderFragment(res, 'partials/add-todo-error', { error: result.error })
    return
  }
  // Async dispatch so fs-assert-emitted's listener is already registered.
  // HX-Trigger-After-Settle fires the CustomEvent on body after the swap settles.
  res.set(
    'HX-Trigger-After-Settle',
    JSON.stringify({ 'todo:added': { text: result.todo.text } })
  )
  renderWithMutationOob(res, 'partials/todo-list', { todos: getTodos() })
})

todosRouter.patch('/todos/:id/toggle', (req, res) => {
  const todo = toggleTodo(req.params.id)
  if (!todo) return res.status(404).send('not found')
  res.render('partials/todo-item', { todo }, (err, item) => {
    if (err) return res.status(500).send(err.message)
    // Toggle doesn't change todos.length, only uncompleted count.
    // Ship just the count OOB span.
    res.render('partials/count-oob', { todos: getTodos() }, (err2, oob) => {
      if (err2) return res.status(500).send(err2.message)
      res.send(item + oob)
    })
  })
})

todosRouter.delete('/todos/:id', (req, res) => {
  const todo = findTodo(req.params.id)
  if (!todo) return res.status(404).send('not found')
  const result = deleteTodo(req.params.id)
  if (result.error) {
    // Re-render the row with an inline .error-msg. outerHTML swap replaces
    // the row with this error-bearing row. fs-assert-added-error matches
    // the .error-msg inside.
    renderFragment(res, 'partials/todo-item-with-error', {
      todo,
      error: result.error,
    })
    return
  }
  // Successful delete: outer swap with empty main content removes the row,
  // plus OOB bundle updates count + add button + item-count sentinel.
  res.render('partials/mutation-oob', { todos: getTodos() }, (err, oob) => {
    if (err) return res.status(500).send(err.message)
    res.send(oob)
  })
})

todosRouter.get('/todos/:id/edit', (req, res) => {
  const todo = findTodo(req.params.id)
  if (!todo) return res.status(404).send('not found')
  renderFragment(res, 'partials/todo-item-edit', { todo })
})

todosRouter.get('/todos/:id/cancel-edit', (req, res) => {
  const todo = findTodo(req.params.id)
  if (!todo) return res.status(404).send('not found')
  renderFragment(res, 'partials/todo-item', { todo })
})

todosRouter.post('/todos/:id', (req, res) => {
  const todo = findTodo(req.params.id)
  if (!todo) return res.status(404).send('not found')
  const trimmed = (req.body.text || '').trim()
  if (trimmed) updateTodo(req.params.id, trimmed)
  renderFragment(res, 'partials/todo-item', { todo })
})
