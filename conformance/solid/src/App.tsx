/**
 * Faultsense conformance harness — Solid (solid-js 1.9+).
 *
 * Solid is the purest fine-grained reactivity target in the matrix:
 * signals drive direct text node updates with no VDOM reconciliation
 * in between. That makes it the cleanest empirical PAT-06 exposure
 * (text-only mutations) — the agent's character-data observer sees
 * the update land on the same node, not on a replacement element.
 *
 * Scenarios (mirror to conformance/drivers/solid.spec.ts):
 *   1. todos/add-item             — conditional mutex (added + emitted)
 *   2. todos/toggle-complete      — updated + classList flip
 *   3. todos/remove-item          — removed from keyed <For>
 *   4. todos/edit-item            — added + focused, <Show> swap
 *   5. todos/char-count-updated   — input trigger + text-matches
 *   6. layout/empty-state-shown   — mount trigger + visible
 *   7. todos/count-updated        — OOB triggered by add/remove/toggle
 *   8. guide/advance-after-add    — `after` sequence trigger
 *   9. actions/log-updated        — custom event (event:action-logged)
 *  10. layout/title-visible       — invariant
 */

import { createSignal, For, Show, createMemo } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type { JSX } from "solid-js";

interface Todo {
  id: number;
  text: string;
  completed: boolean;
  editing: boolean;
}

let nextId = 1;

export default function App(): JSX.Element {
  // createStore gives us fine-grained in-place mutation, which is what
  // <For> needs to preserve element identity across toggle/edit. A
  // plain signal + .map() would produce a new object reference for the
  // changed todo and <For> would re-mount the row, breaking
  // `fs-assert-updated` (which requires the same DOM node to mutate).
  const [todos, setTodos] = createStore<Todo[]>([]);
  const [draft, setDraft] = createSignal("");
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [log, setLog] = createSignal<string[]>([]);

  const uncompleted = createMemo(
    () => todos.filter((t) => !t.completed).length
  );
  const total = createMemo(() => todos.length);

  function logAction(message: string) {
    setLog((prev) => [`${new Date().toISOString()} ${message}`, ...prev]);
    document.dispatchEvent(
      new CustomEvent("action-logged", { detail: { message } })
    );
  }

  function addTodo(e: Event) {
    e.preventDefault();
    const text = draft().trim();
    if (!text) {
      setErrorMessage("Todo text is required");
      return;
    }
    setErrorMessage(null);
    setTodos(
      produce((list) => {
        list.push({ id: nextId++, text, completed: false, editing: false });
      })
    );
    setDraft("");
    document.dispatchEvent(new CustomEvent("todo:added", { detail: { text } }));
    logAction("add:" + text);
  }

  function toggleTodo(id: number) {
    setTodos(
      (t) => t.id === id,
      "completed",
      (c: boolean) => !c
    );
    logAction("toggle:" + id);
  }

  function removeTodo(id: number) {
    setTodos(
      produce((list) => {
        const idx = list.findIndex((t) => t.id === id);
        if (idx !== -1) list.splice(idx, 1);
      })
    );
    logAction("remove:" + id);
  }

  function startEdit(id: number) {
    setTodos((t) => t.id === id, "editing", true);
  }

  function cancelEdit(id: number) {
    setTodos((t) => t.id === id, "editing", false);
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
        Faultsense Solid harness
      </h1>

      <form onSubmit={addTodo}>
        {/* Scenario 5: todos/char-count-updated — input trigger + text-matches. */}
        <input
          id="add-todo-input"
          type="text"
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value.slice(0, 100))}
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
        <span id="char-count">{draft().length}/100</span>
        <Show when={errorMessage()}>
          <div class="add-error">{errorMessage()}</div>
        </Show>
      </form>

      {/* Scenario 6: layout/empty-state-shown — mount trigger + visible. */}
      <Show when={total() === 0}>
        <div
          class="empty-state"
          fs-assert="layout/empty-state-shown"
          fs-trigger="mount"
          fs-assert-visible=".empty-state"
        >
          No todos yet — add one above.
        </div>
      </Show>

      {/* Scenario 7: todos/count-updated — OOB. */}
      <Show when={total() > 0}>
        <div
          id="todo-count"
          fs-assert="todos/count-updated"
          fs-assert-oob="todos/add-item,todos/remove-item,todos/toggle-complete"
          fs-assert-visible="[text-matches=\d+/\d+ remaining]"
        >
          {uncompleted()}/{total()} remaining
        </div>
      </Show>

      <ul class="todo-list">
        <For each={todos}>
          {(todo) => (
            <TodoRow
              todo={todo}
              onToggle={() => toggleTodo(todo.id)}
              onRemove={() => removeTodo(todo.id)}
              onCancelEdit={() => cancelEdit(todo.id)}
            />
          )}
        </For>
      </ul>

      {/* Scenario 4: todos/edit-item — added + focused. */}
      <Show when={total() > 0}>
        <button
          type="button"
          class="edit-first"
          onClick={() => startEdit(todos[0].id)}
          fs-assert="todos/edit-item"
          fs-trigger="click"
          fs-assert-added=".edit-input[focused=true]"
          fs-assert-timeout="500"
        >
          Edit first
        </button>
      </Show>

      {/* Scenario 8: guide/advance-after-add — `after` sequence trigger. */}
      <button
        type="button"
        class="advance-btn"
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
          <For each={log()}>
            {(line) => <li class="log-row">{line}</li>}
          </For>
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

function TodoRow(props: TodoRowProps): JSX.Element {
  // Solid's ref callback runs once on mount — perfect for focusing the
  // edit input as soon as its <Show when={editing}> branch swaps in.
  let editRef: HTMLInputElement | undefined;

  const className = () =>
    `todo-item${props.todo.completed ? " completed" : ""}`;

  return (
    <li class={className()} data-id={props.todo.id}>
      {/*
        Scenario 2: todos/toggle-complete — updated + classlist flip.

        Uses fs-trigger="click" rather than "change" for the same reason
        React does: Solid's onChange handler (wired to the native change
        event) flushes the signal update synchronously inside the event,
        so by the time the agent's change-event capture listener reads
        the fs-assert-updated attribute, it already reflects the new
        state and the expected-next-state snapshot is wrong. Click
        fires before the checkbox toggle handler runs and before any
        signal mutation, so the agent captures the attribute at
        pre-state and the assertion resolves against the flipped class.
      */}
      <input
        type="checkbox"
        checked={props.todo.completed}
        onChange={props.onToggle}
        fs-assert="todos/toggle-complete"
        fs-trigger="click"
        fs-assert-updated={`.todo-item[data-id='${props.todo.id}'][classlist=completed:${!props.todo.completed}]`}
      />
      <Show
        when={!props.todo.editing}
        fallback={
          <input
            ref={(el) => {
              editRef = el;
              // Solid's ref is called synchronously after insertion, so
              // focus() can fire immediately — no effect needed.
              if (el) queueMicrotask(() => el.focus());
            }}
            type="text"
            value={props.todo.text}
            class="edit-input"
            onBlur={props.onCancelEdit}
          />
        }
      >
        <span class="text">{props.todo.text}</span>
      </Show>
      {/* Scenario 3: todos/remove-item — removed. */}
      <button
        type="button"
        class="remove-btn"
        onClick={props.onRemove}
        fs-assert="todos/remove-item"
        fs-trigger="click"
        fs-assert-removed={`.todo-item[data-id='${props.todo.id}']`}
      >
        ✕
      </button>
    </li>
  );
}
