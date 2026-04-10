import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authRouter } from './routes/auth.js'
import { todosRouter } from './routes/todos.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3099

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// Expose HX-Request detection to every view.
app.use((req, res, next) => {
  res.locals.isHtmx = req.get('HX-Request') === 'true'
  next()
})

app.get('/', (req, res) => res.redirect('/login'))

app.use('/', authRouter)
app.use('/', todosRouter)

app.listen(PORT, () => {
  console.log(`todolist-htmx listening on http://localhost:${PORT}`)
})
