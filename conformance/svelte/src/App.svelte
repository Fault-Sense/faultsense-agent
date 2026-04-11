<!--
  Faultsense conformance harness — Svelte 5 (runes mode).

  Exercises the agent against Svelte 5's signal-based fine-grained reactivity
  model. Mirrors conformance/vue3/src/App.vue scenario-for-scenario so the
  works-with matrix rows line up exactly.

  Scenarios:
    1. todos/add-item             — conditional mutex (added + emitted)
    2. todos/toggle-complete      — updated + classlist via class: directive
    3. todos/remove-item          — removed
    4. todos/edit-item            — added + focused modifier, {#if} swap
    5. todos/char-count-updated   — input trigger + text-matches
    6. layout/empty-state-shown   — mount trigger + visible
    7. todos/count-updated        — OOB triggered by add/toggle/remove
    8. guide/advance-after-add    — `after` sequence trigger
    9. actions/log-updated        — custom event (event:action-logged)
   10. layout/title-visible       — invariant
-->

<script lang="ts">
  interface Todo {
    id: number;
    text: string;
    completed: boolean;
    editing: boolean;
  }

  let todos = $state<Todo[]>([]);
  let draft = $state("");
  let errorMessage = $state<string | null>(null);
  let activityLog = $state<string[]>([]);
  let nextId = 1;

  // $derived computed values — Svelte 5's equivalent of Vue's computed().
  const uncompleted = $derived(todos.filter((t) => !t.completed).length);
  const total = $derived(todos.length);

  function addTodo() {
    errorMessage = null;
    const text = draft.trim();
    if (!text) {
      errorMessage = "Todo text is required";
      return;
    }
    todos.push({ id: nextId++, text, completed: false, editing: false });
    draft = "";
    // Domain event the add-item assertion's success variant listens for.
    document.dispatchEvent(new CustomEvent("todo:added", { detail: { text } }));
    logAction("add:" + text);
  }

  function toggleTodo(todo: Todo) {
    todo.completed = !todo.completed;
    logAction((todo.completed ? "complete:" : "reopen:") + todo.id);
  }

  function removeTodo(id: number) {
    todos = todos.filter((t) => t.id !== id);
    logAction("remove:" + id);
  }

  function startEdit(todo: Todo) {
    todo.editing = true;
  }

  function cancelEdit(todo: Todo) {
    todo.editing = false;
  }

  function logAction(message: string) {
    activityLog = [`${new Date().toISOString()} ${message}`, ...activityLog];
    document.dispatchEvent(
      new CustomEvent("action-logged", { detail: { message } })
    );
  }

  // Svelte action — Svelte's built-in lifecycle hook for a single node.
  // Runs once on mount, so the edit input gets focus the moment the
  // {#if editing} branch swaps in. Same role as Vue's `@vue:mounted`
  // callback in the vue3 harness.
  function focusOnMount(node: HTMLInputElement) {
    node.focus();
  }
</script>

<main>
  <!-- Scenario 10: layout/title-visible — invariant trigger. -->
  <h1
    id="app-title"
    fs-assert="layout/title-visible"
    fs-trigger="invariant"
    fs-assert-visible="#app-title"
  >
    Faultsense Svelte harness
  </h1>

  <!-- Scenario 5: todos/char-count-updated + Scenario 1: todos/add-item. -->
  <form onsubmit={(e) => { e.preventDefault(); addTodo(); }}>
    <input
      id="add-todo-input"
      type="text"
      maxlength="100"
      placeholder="What needs to be done?"
      bind:value={draft}
      fs-assert="todos/char-count-updated"
      fs-trigger="input"
      fs-assert-visible="#char-count[text-matches=\d+/100]"
    />
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
    {#if errorMessage}
      <div class="add-error">{errorMessage}</div>
    {/if}
  </form>

  <!-- Scenario 6: layout/empty-state-shown — mount trigger. -->
  {#if todos.length === 0}
    <div
      class="empty-state"
      fs-assert="layout/empty-state-shown"
      fs-trigger="mount"
      fs-assert-visible=".empty-state"
    >
      No todos yet — add one above.
    </div>
  {/if}

  <!-- Scenario 7: todos/count-updated — OOB + text-matches. -->
  {#if total > 0}
    <div
      id="todo-count"
      fs-assert="todos/count-updated"
      fs-assert-oob="todos/add-item,todos/remove-item,todos/toggle-complete"
      fs-assert-visible="[text-matches=\d+/\d+ remaining]"
    >
      {uncompleted}/{total} remaining
    </div>
  {/if}

  <!-- Scenario 8: guide/advance-after-add — `after` sequence trigger. -->
  <button
    type="button"
    class="advance-btn"
    fs-assert="guide/advance-after-add"
    fs-trigger="click"
    fs-assert-after="todos/add-item"
  >
    Next step
  </button>

  <ul class="todo-list">
    {#each todos as todo (todo.id)}
      <li
        class="todo-item"
        class:completed={todo.completed}
        data-id={todo.id}
      >
        <!-- Scenario 2: todos/toggle-complete — updated + classlist.
             Template literal encodes the expected NEXT state because
             `change` fires before Svelte flips the class. -->
        <input
          type="checkbox"
          checked={todo.completed}
          onchange={() => toggleTodo(todo)}
          fs-assert="todos/toggle-complete"
          fs-trigger="change"
          fs-assert-updated={`.todo-item[data-id='${todo.id}'][classlist=completed:${!todo.completed}]`}
        />
        {#if !todo.editing}
          <span
            class="text"
            role="button"
            tabindex="0"
            onclick={() => startEdit(todo)}
          >
            {todo.text}
          </span>
        {:else}
          <!-- Scenario 4: todos/edit-item target. focusOnMount runs on
               insertion so the `focused=true` modifier matches. -->
          <input
            type="text"
            class="edit-input"
            value={todo.text}
            use:focusOnMount
            onblur={() => cancelEdit(todo)}
          />
        {/if}
        <!-- Scenario 3: todos/remove-item. -->
        <button
          type="button"
          class="remove-btn"
          onclick={() => removeTodo(todo.id)}
          fs-assert="todos/remove-item"
          fs-trigger="click"
          fs-assert-removed={`.todo-item[data-id='${todo.id}']`}
        >
          ✕
        </button>
      </li>
    {/each}
  </ul>

  <!-- Marker button for the edit assertion. Clicking this toggles the
       first todo's editing state; the {#if} branch swaps in the
       <input.edit-input>. The assertion asserts that the newly-added
       input exists and has focus. -->
  {#if todos.length > 0}
    <button
      type="button"
      class="edit-first"
      onclick={() => startEdit(todos[0])}
      fs-assert="todos/edit-item"
      fs-trigger="click"
      fs-assert-added=".edit-input[focused=true]"
      fs-assert-timeout="500"
    >
      Edit first
    </button>
  {/if}

  <!-- Scenario 9: actions/log-updated — custom event + added. -->
  <section
    id="activity"
    fs-assert="actions/log-updated"
    fs-trigger="event:action-logged"
    fs-assert-added=".log-row"
    fs-assert-timeout="500"
  >
    <h2>Activity</h2>
    <ul>
      {#each activityLog as line, idx (idx + ":" + line)}
        <li class="log-row">{line}</li>
      {/each}
    </ul>
  </section>
</main>

<style>
  main { max-width: 520px; margin: 1rem auto; font-family: sans-serif; }
  .todo-item { list-style: none; display: flex; gap: 0.5rem; }
  .todo-item.completed .text { text-decoration: line-through; }
</style>
