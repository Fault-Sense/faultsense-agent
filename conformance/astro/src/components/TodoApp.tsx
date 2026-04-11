/**
 * Astro conformance harness — React island component.
 *
 * Rendered on the server (Astro re-runs this component per request in
 * dev mode) and again on the client under `client:load`. The SSR pass
 * emits HTML containing the fs-* attributes; the agent's init-time
 * scan reads them from the parsed DOM before React hydrates. After
 * hydration, the island is fully interactive and the agent's
 * MutationObserver picks up reactive updates the same way it does in
 * the plain React harness.
 *
 * Scope: the full 10-scenario SPA set plus `hydration/island-mount`,
 * a scenario unique to this harness that asserts a mount trigger on an
 * SSR-rendered marker fires exactly once across the hydration boundary.
 */

import { useEffect, useMemo, useReducer, useRef, useState } from "react";

// Post-hydration marker used by the Playwright driver's beforeEach.
// React's `client:load` hydration runs the island's main script, walks
// the SSR DOM, and attaches event listeners — but there's no
// externally-visible signal that the island is *done*. Without a
// marker, `standardBeforeEach`'s fixed settle wait races React's
// hydration on slower machines, and the first `click()` in a test can
// land before onClick is attached (the handler never runs, the todo
// never appears, and the assertion times out). Setting this flag from
// a top-level `useEffect` runs exactly once after hydration completes,
// so the driver can block on `window.__faultsenseIslandHydrated`
// instead of guessing a duration.
declare global {
  interface Window {
    __faultsenseIslandHydrated?: boolean;
  }
}

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
      return [
        ...state,
        { id: nextId++, text: action.text, completed: false, editing: false },
      ];
    case "toggle":
      return state.map((t) =>
        t.id === action.id ? { ...t, completed: !t.completed } : t
      );
    case "remove":
      return state.filter((t) => t.id !== action.id);
    case "startEdit":
      return state.map((t) =>
        t.id === action.id ? { ...t, editing: true } : t
      );
    case "cancelEdit":
      return state.map((t) =>
        t.id === action.id ? { ...t, editing: false } : t
      );
  }
}

export default function TodoApp() {
  const [todos, dispatch] = useReducer(reducer, []);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  // Flip the marker on the first post-hydration render. The empty
  // deps array guarantees this runs exactly once per page load, right
  // after React finishes attaching event listeners to the SSR DOM.
  useEffect(() => {
    window.__faultsenseIslandHydrated = true;
  }, []);

  const uncompleted = useMemo(
    () => todos.filter((t) => !t.completed).length,
    [todos]
  );
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
      {/* Scenario 10: layout/title-visible — invariant. Renders on both
          the server and the client. */}
      <h1
        id="app-title"
        fs-assert="layout/title-visible"
        fs-trigger="invariant"
        fs-assert-visible="#app-title"
      >
        Faultsense Astro SSR harness
      </h1>

      {/*
        Scenario 11: hydration/island-mount — unique PAT-09 probe.
        A mount trigger on an SSR-rendered marker inside the hydrating
        island. Because this element exists in the initial HTML, the
        agent's init-time scan fires the mount assertion BEFORE React
        hydrates. The driver then verifies exactly one `mount` payload
        for this key lands in the buffer (no double-fire, no loss).
      */}
      <div
        className="hydration-marker"
        fs-assert="hydration/island-mount"
        fs-trigger="mount"
        fs-assert-visible=".hydration-marker"
      >
        SSR marker — hydrated
      </div>

      <form onSubmit={addTodo}>
        {/* Scenario 5: todos/char-count-updated. */}
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
        {/* Scenario 1: todos/add-item. */}
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

      {/* Scenario 6: layout/empty-state-shown — mount trigger + visible.
          SSR-rendered on initial load when todos is empty. */}
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

      {/* Scenario 4: todos/edit-item — added + focused. */}
      {todos.length > 0 && (
        <button
          type="button"
          className="edit-first"
          onClick={() =>
            dispatch({ type: "startEdit", id: todos[0].id })
          }
          fs-assert="todos/edit-item"
          fs-trigger="click"
          fs-assert-added=".edit-input[focused=true]"
          fs-assert-timeout="500"
        >
          Edit first
        </button>
      )}

      {/* Scenario 8: guide/advance-after-add. */}
      <button
        type="button"
        className="advance-btn"
        fs-assert="guide/advance-after-add"
        fs-trigger="click"
        fs-assert-after="todos/add-item"
      >
        Next step
      </button>

      {/* Scenario 9: actions/log-updated. */}
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
            <li key={idx} className="log-row">
              {line}
            </li>
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

  useEffect(() => {
    if (todo.editing) editRef.current?.focus();
  }, [todo.editing]);

  const className = `todo-item${todo.completed ? " completed" : ""}`;

  return (
    <li className={className} data-id={todo.id}>
      {/* Scenario 2: todos/toggle-complete — updated + classlist flip.
          Same click-vs-change constraint as the plain React harness. */}
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
      {/* Scenario 3: todos/remove-item. */}
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
