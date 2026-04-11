/**
 * Faultsense HTMX conformance harness — minimal Express + EJS.
 *
 * HTMX is language-agnostic — the mutation shapes Turbo + Rails emit
 * are specific to Rails, but HTMX's hx-swap variants produce the same
 * shapes regardless of what backend renders the fragments. A Node
 * backend is therefore a faithful harness for HTMX.
 *
 * In-memory store — no database. Restart the process for a clean slate;
 * the driver also hits /todos/reset between tests.
 */
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3400;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// In-memory store, reset via POST /todos/reset.
let todos = [];
let nextId = 1;

app.get("/", (_req, res) => {
  res.render("index", { todos });
});

app.post("/todos", (req, res) => {
  const text = (req.body.text || "").trim();
  if (!text) {
    // Render just the error fragment — HTMX will swap it in via
    // hx-target on the form's .add-error-slot.
    res.status(422).render("_error", { message: "Todo text is required" });
    return;
  }
  const todo = { id: nextId++, text, completed: false };
  todos.push(todo);
  // Render the new <li> fragment — the form's hx-swap="beforeend"
  // appends it to #todo-list, and hx-swap-oob updates the count.
  res.render("_todo_with_oob", { todo, todos });
});

app.patch("/todos/:id/toggle", (req, res) => {
  const id = Number(req.params.id);
  const todo = todos.find((t) => t.id === id);
  if (!todo) return res.status(404).end();
  todo.completed = !todo.completed;
  res.render("_todo_with_oob", { todo, todos });
});

app.delete("/todos/:id", (req, res) => {
  const id = Number(req.params.id);
  todos = todos.filter((t) => t.id !== id);
  // Empty body — HTMX removes the element via hx-swap="outerHTML"
  // on the delete button's target, and the oob count updates via a
  // separate fragment in the Content-Type header. For simplicity we
  // render only the OOB count here; the deleted element is swapped
  // out because HTMX hx-swap="delete" removes the target directly.
  res.render("_count_oob", { todos });
});

// Dev-only reset endpoint used by the Playwright driver in beforeEach.
app.post("/todos/reset", (_req, res) => {
  todos = [];
  nextId = 1;
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Faultsense HTMX harness listening on ${PORT}`);
});
