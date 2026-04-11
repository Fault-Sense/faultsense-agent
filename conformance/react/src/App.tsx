/**
 * Faultsense conformance harness — React 19 + hooks + StrictMode.
 *
 * Mirrors the vue3 harness scenario-for-scenario so the Phase 6
 * works-with matrix can report identical coverage across frameworks.
 * This harness is plain React 19 — no router, no SSR, no TanStack
 * Start. TanStack Start-specific quirks (HMR double-init, SSR
 * hydration) are out of scope; see examples/todolist-tanstack for
 * the full-stack showcase.
 *
 * Scenarios (mirror to conformance/drivers/react.spec.ts):
 *   1. todos/add-item             — conditional mutex (added + emitted)
 *   2. todos/toggle-complete      — updated + classlist via className
 *   3. todos/remove-item          — removed (React key-driven reconciliation)
 *   4. todos/edit-item            — added + focused, conditional JSX
 *   5. todos/char-count-updated   — input trigger + text-matches
 *   6. layout/empty-state-shown   — mount trigger + visible
 *   7. todos/count-updated        — OOB triggered by add/toggle/remove
 *   8. guide/advance-after-add    — `after` sequence trigger
 *   9. actions/log-updated        — custom event (event:action-logged)
 *  10. layout/title-visible       — invariant
 */

import { useMemo, useReducer, useRef, useState, useEffect } from "react";

interface Todo {
  id: number;
  text: string;
  completed: boolean;
  editing: boolean;
}

type Action =
  | { type: "add"; text: string }
  | { type: "toggle"; id: number }
  | { type: "remove"; id: number }
  | { type: "startEdit"; id: number }
  | { type: "cancelEdit"; id: number };

let nextId = 1;

function reducer(state: Todo[], action: Action): Todo[] {
  switch (action.type) {
    case "add":
      return [...state, { id: nextId++, text: action.text, completed: false, editing: false }];
    case "toggle":
      return state.map((t) =>
        t.id === action.id ? { ...t, completed: !t.completed } : t
      );
    case "remove":
      return state.filter((t) => t.id !== action.id);
    case "startEdit":
      return state.map((t) => (t.id === action.id ? { ...t, editing: true } : t));
    case "cancelEdit":
      return state.map((t) => (t.id === action.id ? { ...t, editing: false } : t));
  }
}

export default function App() {
  const [todos, dispatch] = useReducer(reducer, []);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const uncompleted = useMemo(() => todos.filter((t) => !t.completed).length, [todos]);
  const total = todos.length;

  function logAction(message: string) {
    setLog((prev) => [`${new Date().toISOString()} ${message}`, ...prev]);
    document.dispatchEvent(
      new CustomEvent("action-logged", { detail: { message } })
    );
  }

  function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) {
      setErrorMessage("Todo text is required");
      return;
    }
    setErrorMessage(null);
    dispatch({ type: "add", text });
    setDraft("");
    document.dispatchEvent(new CustomEvent("todo:added", { detail: { text } }));
    logAction("add:" + text);
  }

  function toggleTodo(id: number) {
    dispatch({ type: "toggle", id });
    logAction("toggle:" + id);
  }

  function removeTodo(id: number) {
    dispatch({ type: "remove", id });
    logAction("remove:" + id);
  }

  return (
    <main>
      {/* Scenario 10: layout/title-visible — invariant. */}
      <h1
        id="app-title"
        fs-assert="layout/title-visible"
        fs-trigger="invariant"
        fs-assert-visible="#app-title"
      >
        Faultsense React 19 harness
      </h1>

      <form onSubmit={addTodo}>
        {/* Scenario 5: todos/char-count-updated — input trigger + text-matches. */}
        <input
          id="add-todo-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 100))}
          maxLength={100}
          placeholder="What needs to be done?"
          fs-assert="todos/char-count-updated"
          fs-trigger="input"
          fs-assert-visible="#char-count[text-matches=\d+/100]"
        />
        {/* Scenario 1: todos/add-item — conditional mutex (added + emitted). */}
        <button
          type="submit"
          fs-assert="todos/add-item"
          fs-trigger="click"
          fs-assert-mutex="conditions"
          fs-assert-added-success=".todo-item"
          fs-assert-emitted-success="todo:added"
          fs-assert-added-error=".add-error"
          fs-assert-timeout="500"
        >
          Add
        </button>
        <span id="char-count">{draft.length}/100</span>
        {errorMessage && <div className="add-error">{errorMessage}</div>}
      </form>

      {/* Scenario 6: layout/empty-state-shown — mount trigger + visible. */}
      {todos.length === 0 && (
        <div
          className="empty-state"
          fs-assert="layout/empty-state-shown"
          fs-trigger="mount"
          fs-assert-visible=".empty-state"
        >
          No todos yet — add one above.
        </div>
      )}

      {/* Scenario 7: todos/count-updated — OOB. */}
      {total > 0 && (
        <div
          id="todo-count"
          fs-assert="todos/count-updated"
          fs-assert-oob="todos/add-item,todos/remove-item,todos/toggle-complete"
          fs-assert-visible="[text-matches=\d+/\d+ remaining]"
        >
          {uncompleted}/{total} remaining
        </div>
      )}

      <ul className="todo-list">
        {todos.map((todo) => (
          <TodoRow
            key={todo.id}
            todo={todo}
            onToggle={() => toggleTodo(todo.id)}
            onRemove={() => removeTodo(todo.id)}
            onCancelEdit={() => dispatch({ type: "cancelEdit", id: todo.id })}
          />
        ))}
      </ul>

      {/* Scenario 4: todos/edit-item — added + focused, triggered by a
          stable button outside the v-for-equivalent list. */}
      {todos.length > 0 && (
        <button
          type="button"
          className="edit-first"
          onClick={() => dispatch({ type: "startEdit", id: todos[0].id })}
          fs-assert="todos/edit-item"
          fs-trigger="click"
          fs-assert-added=".edit-input[focused=true]"
          fs-assert-timeout="500"
        >
          Edit first
        </button>
      )}

      {/* Scenario 8: guide/advance-after-add — `after` sequence trigger. */}
      <button
        type="button"
        className="advance-btn"
        fs-assert="guide/advance-after-add"
        fs-trigger="click"
        fs-assert-after="todos/add-item"
      >
        Next step
      </button>

      {/* Scenario 9: actions/log-updated — custom event trigger + added. */}
      <section
        id="activity"
        fs-assert="actions/log-updated"
        fs-trigger="event:action-logged"
        fs-assert-added=".log-row"
        fs-assert-timeout="500"
      >
        <h2>Activity</h2>
        <ul>
          {log.map((line, idx) => (
            <li key={idx} className="log-row">{line}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

interface TodoRowProps {
  todo: Todo;
  onToggle: () => void;
  onRemove: () => void;
  onCancelEdit: () => void;
}

function TodoRow({ todo, onToggle, onRemove, onCancelEdit }: TodoRowProps) {
  const editRef = useRef<HTMLInputElement>(null);

  // When edit mode opens, focus the input so the `focused=true`
  // modifier on the edit-item assertion can match.
  useEffect(() => {
    if (todo.editing) editRef.current?.focus();
  }, [todo.editing]);

  const className = `todo-item${todo.completed ? " completed" : ""}`;

  return (
    <li className={className} data-id={todo.id}>
      {/*
        Scenario 2: todos/toggle-complete — updated + classlist flip.

        Uses fs-trigger="click" instead of "change" because React
        re-renders controlled checkboxes synchronously enough that by
        the time the agent's document-level capture listener sees the
        change event, the fs-assert-updated attribute has already been
        recomputed from the NEW state — the expected-next-state idiom
        breaks. Click fires before React's state flip, so the agent
        reads the attribute with the correct expected-next-state
        snapshot. See docs/framework-integration-notes.md.
      */}
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={onToggle}
        fs-assert="todos/toggle-complete"
        fs-trigger="click"
        fs-assert-updated={`.todo-item[data-id='${todo.id}'][classlist=completed:${!todo.completed}]`}
      />
      {!todo.editing ? (
        <span className="text">{todo.text}</span>
      ) : (
        <input
          ref={editRef}
          type="text"
          defaultValue={todo.text}
          className="edit-input"
          onBlur={onCancelEdit}
        />
      )}
      {/* Scenario 3: todos/remove-item — removed. */}
      <button
        type="button"
        className="remove-btn"
        onClick={onRemove}
        fs-assert="todos/remove-item"
        fs-trigger="click"
        fs-assert-removed={`.todo-item[data-id='${todo.id}']`}
      >
        ✕
      </button>
    </li>
  );
}
