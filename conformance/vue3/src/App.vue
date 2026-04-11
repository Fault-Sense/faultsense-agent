<!--
  Faultsense conformance harness — Vue 3 (Composition API, <script setup>).

  Exercises the agent against Vue 3's fine-grained reactivity and nextTick
  microtask batching. Mirrors a focused subset of the scenarios from
  examples/todolist-tanstack/ASSERTIONS.md — the ones that specifically
  test Vue-unique mutation patterns. Auth/routing/offline ceremony is
  intentionally out of scope for this harness.

  Scenarios:
    1. todos/add-item             — conditional mutex (added + emitted)
    2. todos/toggle-complete      — updated + classlist via :class
    3. todos/remove-item          — removed
    4. todos/edit-item            — added + focused modifier, v-if
    5. todos/char-count-updated   — input trigger + text-matches
    6. layout/empty-state-shown   — mount trigger + visible
    7. todos/count-updated        — OOB triggered by add/toggle/remove
    8. guide/advance-after-add    — `after` sequence trigger
    9. actions/log-updated        — custom event (event:action-logged)
   10. layout/title-visible       — invariant
-->

<script setup lang="ts">
import { computed, ref } from "vue";

interface Todo {
  id: number;
  text: string;
  completed: boolean;
  editing: boolean;
}

const todos = ref<Todo[]>([]);
const draft = ref("");
const errorMessage = ref<string | null>(null);
const activityLog = ref<string[]>([]);
let nextId = 1;

const uncompleted = computed(() => todos.value.filter((t) => !t.completed).length);
const total = computed(() => todos.value.length);

function addTodo() {
  errorMessage.value = null;
  const text = draft.value.trim();
  if (!text) {
    errorMessage.value = "Todo text is required";
    return;
  }
  todos.value.push({ id: nextId++, text, completed: false, editing: false });
  draft.value = "";
  // Emit the domain event the add-item assertion listens for.
  document.dispatchEvent(new CustomEvent("todo:added", { detail: { text } }));
  logAction("add:" + text);
}

function toggleTodo(todo: Todo) {
  todo.completed = !todo.completed;
  logAction((todo.completed ? "complete:" : "reopen:") + todo.id);
}

function removeTodo(id: number) {
  todos.value = todos.value.filter((t) => t.id !== id);
  logAction("remove:" + id);
}

function startEdit(todo: Todo) {
  todo.editing = true;
}

function cancelEdit(todo: Todo) {
  todo.editing = false;
}

function logAction(message: string) {
  activityLog.value.unshift(`${new Date().toISOString()} ${message}`);
  // Dispatch a custom event so the event:action-logged assertion fires.
  document.dispatchEvent(
    new CustomEvent("action-logged", { detail: { message } })
  );
}
</script>

<template>
  <main>
    <!-- Scenario 10: layout/title-visible — invariant trigger.
         The title must always be visible. If the invariant is violated,
         the agent reports a failure payload via the OOB path. -->
    <h1
      id="app-title"
      fs-assert="layout/title-visible"
      fs-trigger="invariant"
      fs-assert-visible="#app-title"
    >
      Faultsense Vue 3 harness
    </h1>

    <!-- Scenario 5: todos/char-count-updated — input trigger + text-matches.
         Every keystroke re-fires the assertion, which verifies the counter
         span shows "<len>/100". Fine-grained Vue reactivity test. -->
    <form @submit.prevent="addTodo">
      <input
        id="add-todo-input"
        v-model="draft"
        type="text"
        maxlength="100"
        placeholder="What needs to be done?"
        fs-assert="todos/char-count-updated"
        fs-trigger="input"
        fs-assert-visible="#char-count[text-matches=\d+/100]"
      />
      <!-- Scenario 1: todos/add-item — conditional mutex.
           success variant: both ".todo-item" appearing AND "todo:added"
           event firing must pass. error variant: ".add-error" appearing
           wins and dismisses both success siblings. -->
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
      <span id="char-count">{{ draft.length }}/100</span>
      <div v-if="errorMessage" class="add-error">{{ errorMessage }}</div>
    </form>

    <!-- Scenario 6: layout/empty-state-shown — mount trigger.
         The empty-state div is v-if'd, so Vue inserts/removes it as
         `todos.length` crosses zero. The mount trigger fires when the
         element is first inserted into the DOM, which exercises the
         agent's mutation-observer-driven mount path. -->
    <div
      v-if="todos.length === 0"
      class="empty-state"
      fs-assert="layout/empty-state-shown"
      fs-trigger="mount"
      fs-assert-visible=".empty-state"
    >
      No todos yet — add one above.
    </div>

    <!-- Scenario 7: todos/count-updated — OOB + text-matches.
         The count label declares its own assertion, triggered out-of-band
         whenever any CRUD assertion passes. The text must match
         "<n>/<n> remaining" — Vue's reactive text must update before the
         OOB immediateResolver runs. -->
    <div
      v-if="total > 0"
      id="todo-count"
      fs-assert="todos/count-updated"
      fs-assert-oob="todos/add-item,todos/remove-item,todos/toggle-complete"
      fs-assert-visible="[text-matches=\d+/\d+ remaining]"
    >
      {{ uncompleted }}/{{ total }} remaining
    </div>

    <!-- Scenario 8: guide/advance-after-add — `after` sequence trigger.
         Clicking "Next step" only passes if todos/add-item has already
         passed in this session. Before adding a todo, the click fails.
         Uses the sequence resolver at src/resolvers/sequence.ts. -->
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
      <li
        v-for="todo in todos"
        :key="todo.id"
        :class="['todo-item', { completed: todo.completed }]"
        :data-id="todo.id"
      >
        <!-- Scenario 2: todos/toggle-complete — updated + classlist.
             Flipping the checkbox flips the li's `completed` class via
             :class binding. The classlist modifier asserts the expected
             NEXT state. -->
        <input
          type="checkbox"
          :checked="todo.completed"
          @change="toggleTodo(todo)"
          fs-assert="todos/toggle-complete"
          fs-trigger="change"
          :fs-assert-updated="`.todo-item[data-id=${todo.id}][classlist=completed:${!todo.completed}]`"
        />
        <span v-if="!todo.editing" class="text" @click="startEdit(todo)">
          {{ todo.text }}
        </span>
        <!-- Scenario 4: todos/edit-item — added + focused modifier + v-if.
             Clicking the span toggles todo.editing → Vue renders the
             input via v-if. The agent's `added` assertion with `focused`
             must match an input that exists AND has focus. -->
        <input
          v-else
          ref="editInput"
          type="text"
          :value="todo.text"
          class="edit-input"
          @blur="cancelEdit(todo)"
          @vue:mounted="(vnode: any) => vnode.el?.focus?.()"
        />
        <!-- Scenario 3: todos/remove-item — removed.
             Clicking the delete button filters the todo out of the v-for
             list, removing its li from the DOM. -->
        <button
          type="button"
          class="remove-btn"
          @click="removeTodo(todo.id)"
          fs-assert="todos/remove-item"
          fs-trigger="click"
          :fs-assert-removed="`.todo-item[data-id=${todo.id}]`"
        >
          ✕
        </button>
      </li>
    </ul>

    <!-- Marker node for the edit assertion. The click on the span above
         cannot carry the edit assertion itself because the span is
         replaced by v-if. Instead we wire the assertion to a dedicated
         edit button that stays in the DOM across renders. The first
         todo (if present) is the target. -->
    <button
      v-if="todos.length > 0"
      type="button"
      class="edit-first"
      @click="startEdit(todos[0])"
      fs-assert="todos/edit-item"
      fs-trigger="click"
      fs-assert-added=".edit-input[focused=true]"
      fs-assert-timeout="500"
    >
      Edit first
    </button>

    <!-- Scenario 9: actions/log-updated — custom event + added.
         The "action-logged" custom event fires on every mutation. The
         event:action-logged trigger creates an assertion on each fire;
         the `added` modifier checks that a new .log-row exists matching
         the latest action. -->
    <section
      id="activity"
      fs-assert="actions/log-updated"
      fs-trigger="event:action-logged"
      fs-assert-added=".log-row"
      fs-assert-timeout="500"
    >
      <h2>Activity</h2>
      <ul>
        <li v-for="(line, idx) in activityLog" :key="idx" class="log-row">
          {{ line }}
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
/* Minimal styling — this is a conformance harness, not a demo. The
   visual form doesn't matter; only the DOM structure the agent sees. */
main { max-width: 520px; margin: 1rem auto; font-family: sans-serif; }
.todo-item { list-style: none; display: flex; gap: 0.5rem; }
.todo-item.completed .text { text-decoration: line-through; }
</style>
