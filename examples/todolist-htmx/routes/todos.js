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
  res.set('HX-Trigger-After-Settle', JSON.stringify({ 'todo:added': { text: result.todo.text } }))
  // Re-render the full list (simple + correct for count-based assertions).
  // The count display is updated via an OOB span.
  const todos = getTodos()
  res.render('partials/todo-list', { todos }, (err, list) => {
    if (err) return res.status(500).send(err.message)
    res.render('partials/count-oob', { todos }, (err2, oob) => {
      if (err2) return res.status(500).send(err2.message)
      res.send(list + oob)
    })
  })
})

todosRouter.patch('/todos/:id/toggle', (req, res) => {
  const todo = toggleTodo(req.params.id)
  if (!todo) return res.status(404).send('not found')
  const todos = getTodos()
  res.render('partials/todo-item', { todo }, (err, item) => {
    if (err) return res.status(500).send(err.message)
    res.render('partials/count-oob', { todos }, (err2, oob) => {
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
    // Return the row re-rendered with an inline error. Outer swap replaces
    // the row with this error-bearing row. fs-assert-added-error matches
    // the .error-msg inside.
    renderFragment(res, 'partials/todo-item-with-error', { todo, error: result.error })
    return
  }
  // Successful delete: return empty content (outerHTML swap removes the row),
  // plus OOB count update.
  const todos = getTodos()
  res.render('partials/count-oob', { todos }, (err, oob) => {
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
