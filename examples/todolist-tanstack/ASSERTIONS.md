# Todo App — Assertion Catalog

Every Faultsense assertion used in the todolist-tanstack example app, organized by feature area. Each entry describes what the user does, what outcome is expected, and how it was instrumented.

---

## CRUD Operations

### 1. Add Todo Item

**Scenario:** User types a todo and clicks Add. On success, a new `.todo-item` appears in the list AND a `todo:added` CustomEvent fires. On failure, a validation error appears.

**Reasoning:** The new item doesn't exist yet — use `added`. The emitted event confirms the app's internal state also updated. `mutex="conditions"` groups the success and error condition keys: if error wins, both success assertions (DOM + event) are dismissed. If success wins, both resolve independently. Count modifier verifies the total item count incremented.

```jsx
<button
  fs-assert="todos/add-item"
  fs-trigger="click"
  fs-assert-mutex="conditions"
  fs-assert-added-success={`.todo-item[count=${todoCount + 1}]`}
  fs-assert-emitted-success="todo:added"
  fs-assert-added-error=".add-error"
  fs-assert-timeout="500">
  Add
</button>
```

**Source:** `AddTodo.tsx:51-67`

---

### 2. Toggle Todo Complete

**Scenario:** User clicks a checkbox to toggle a todo's completed state.

**Reasoning:** The `.todo-item` element already exists — its class and data attributes change. Use `updated` with dynamic modifiers that assert the **expected next state** (classlist flips to the opposite of current). A second assertion on the same trigger verifies the edit button's disabled state updates correctly.

```jsx
<input type="checkbox"
  fs-assert="todos/toggle-complete"
  fs-trigger="change"
  fs-assert-updated={`.todo-item[classlist=completed:${!todo.completed}][data-status=active|completed]`}
  fs-assert-visible={`#edit-btn-${todo.id}[disabled=${!todo.completed}]`} />
```

**Source:** `TodoItem.tsx:57-67`

---

### 3. Delete Todo Item

**Scenario:** User clicks Delete. On success, the `.todo-item` is removed from the DOM. On failure, an error message appears.

**Reasoning:** Success removes an element (`removed`), error adds one (`added`) — different assertion types need cross-type mutual exclusion. `mutex="each"` makes all conditionals race as one group: first to resolve wins, the other is dismissed. 5-second timeout for network operations.

```jsx
<button
  fs-assert="todos/remove-item"
  fs-trigger="click"
  fs-assert-mutex="each"
  fs-assert-removed-success=".todo-item"
  fs-assert-added-error=".error-msg"
  fs-assert-timeout="5000">
  Delete
</button>
```

**Source:** `TodoItem.tsx:125-141`

---

### 4. Edit Todo — Enter Edit Mode

**Scenario:** User clicks the Edit button to enter inline editing mode.

**Reasoning:** The edit input is conditionally rendered — it doesn't exist until the button is clicked. Use `added` with `focused=true` to verify the input both appeared AND received focus.

```jsx
<button
  id={`edit-btn-${todo.id}`}
  fs-assert="todos/edit-item"
  fs-trigger="click"
  fs-assert-added=".todo-edit-input[focused=true]">
  Edit
</button>
```

**Source:** `TodoItem.tsx:108-121`

---

### 5. Edit Todo — Cancel with Escape

**Scenario:** User presses Escape while editing to cancel and close the edit input.

**Reasoning:** The edit input should be removed from the DOM when Escape is pressed. `keydown:Escape` filter ensures only the Escape key creates the assertion — other keystrokes are ignored.

```jsx
<input className="todo-edit-input"
  fs-assert="todos/cancel-edit"
  fs-trigger="keydown:Escape"
  fs-assert-removed=".todo-edit-input" />
```

**Source:** `TodoItem.tsx:73-85`

---

### 6. Character Count Updates While Typing

**Scenario:** As the user types in the add-todo input, the character counter should update to reflect the current length.

**Reasoning:** The counter element already exists — its text content changes. `input` trigger fires on every keystroke. `visible` with `text-matches` verifies the counter shows the expected format (e.g., "15/100").

```jsx
<input id="add-todo-input"
  fs-assert="todos/char-count-updated"
  fs-trigger="input"
  fs-assert-visible="#char-count[text-matches=\d+/100]" />
```

**Source:** `AddTodo.tsx:29-45`

---

### 7. Empty State Visible

**Scenario:** When there are no todos, the empty state message should render.

**Reasoning:** The empty state div is conditionally rendered — it only exists when `todos.length === 0`. `mount` trigger fires when the element enters the DOM. `visible` confirms it has layout dimensions and is actually shown.

```jsx
<div className="empty-state-message"
  fs-assert="todos/empty-state"
  fs-trigger="mount"
  fs-assert-visible=".empty-state-message">
  No todos yet. Add one above!
</div>
```

**Source:** `TodoList.tsx:8-16`

---

## OOB (Out-of-Band) Side Effects

### 8. Count Label Updated After CRUD

**Scenario:** The "N/M remaining" count label should update correctly after any todo is added, toggled, or deleted.

**Reasoning:** The count label is in a different component from the trigger buttons. OOB lets it declare its own assertion without prop drilling. `visible` with self-referencing `text-matches` checks the element itself shows the expected format.

```jsx
<div id="todo-count"
  fs-assert="todos/count-updated"
  fs-assert-oob="todos/toggle-complete,todos/add-item,todos/remove-item"
  fs-assert-visible='[text-matches=\d+/\d+ remaining]'>
  {uncompleted}/{todos.length} remaining
</div>
```

**Source:** `routes/todos.tsx:124-132`, `routes/index.tsx:68-76`

---

### 9. Item Count Matches Expected Total

**Scenario:** After adding or removing a todo, the actual number of `.todo-item` elements in the DOM should match the expected total.

**Reasoning:** This catches list rendering bugs where items get duplicated or silently dropped. OOB triggers after add/remove succeeds. `count` modifier on `visible` checks `querySelectorAll('.todo-item').length` against the expected value.

```jsx
<div
  fs-assert="todos/item-count-correct"
  fs-assert-oob="todos/add-item,todos/remove-item"
  fs-assert-visible={`.todo-item[count=${todos.length}]`}
  style={{ display: 'none' }} />
```

**Source:** `routes/todos.tsx:135-140`

---

### 10. Count Stable After Toggle (No Flickering)

**Scenario:** After toggling a todo's completion state, the count display should NOT flicker or re-render unexpectedly.

**Reasoning:** `stable` is the temporal inverse of `updated` — it passes when NO mutation occurs within the timeout window. OOB triggers after toggle completes. 500ms stability window catches React double-render bugs, optimistic UI rollbacks, and WebSocket duplicate renders.

```jsx
<div
  fs-assert="todos/count-stable-after-toggle"
  fs-assert-oob="todos/toggle-complete"
  fs-assert-stable="#todo-count"
  fs-assert-timeout="500"
  style={{ display: 'none' }} />
```

**Source:** `routes/todos.tsx:143-149`

---

## Custom Events

### 11. Activity Log Updated on Custom Event

**Scenario:** When a `todo:added` CustomEvent fires on `document`, the activity log should show a new log entry.

**Reasoning:** The activity log listens to application events, not DOM clicks. `event:todo:added` trigger activates when the named CustomEvent fires. `visible` confirms a `.log-entry` element appeared in the log.

```jsx
<div id="activity-log"
  fs-trigger="event:todo:added"
  fs-assert="activity/log-updated"
  fs-assert-visible=".log-entry">
</div>
```

**Source:** `ActivityLog.tsx:33-39`

---

## Sequence Assertions (Getting Started Guide)

### 12. Guide Step 1 — Visible on Mount

**Scenario:** The first getting-started step should be visible when the page loads.

**Reasoning:** The step container is conditionally rendered. `mount` trigger fires when it enters the DOM. This is the anchor assertion for the sequence chain — steps 2 and 3 reference it via `fs-assert-after`.

```jsx
<div className="getting-started-step"
  fs-assert="guide/step-1"
  fs-trigger="mount"
  fs-assert-visible=".getting-started-step">
</div>
```

**Source:** `GettingStarted.tsx:61-65`

---

### 13. Guide Step 2 — Requires Step 1

**Scenario:** Clicking "Done" on step 2 should mark it complete, but only if step 1 has already been completed.

**Reasoning:** `fs-assert-after="guide/step-1"` validates the sequence — it passes immediately if step 1 passed, fails otherwise. `added` with `count=2` verifies two steps now have the `.complete` class. The `after` and `added` assertions are independent data points.

```jsx
<button
  fs-assert="guide/step-2"
  fs-trigger="click"
  fs-assert-after="guide/step-1"
  fs-assert-added=".getting-started-step.complete[count=2]">
  Done
</button>
```

**Source:** `GettingStarted.tsx:84-93`

---

### 14. Guide Step 3 — Requires Step 2

**Scenario:** Clicking "Done" on step 3 should mark it complete, but only if step 2 has already been completed.

**Reasoning:** Same pattern as step 2, chained one level deeper. `after` checks only its direct parent (step 2), which itself checked step 1. Count=3 verifies all three steps are complete.

```jsx
<button
  fs-assert="guide/step-3"
  fs-trigger="click"
  fs-assert-after="guide/step-2"
  fs-assert-added=".getting-started-step.complete[count=3]">
  Done
</button>
```

**Source:** `GettingStarted.tsx:84-93`

---

## Invariants

### 15. Title Always Visible

**Scenario:** The page title should always be visible for the entire session.

**Reasoning:** No user action triggers this — it's a page-level contract. `invariant` creates a perpetual assertion that only reports failures and recoveries. Clicking the title triggers a simulated CSS regression (`display: none`), which violates this invariant and demonstrates failure reporting.

```jsx
<h1 id="app-title"
  fs-assert="layout/title-visible"
  fs-trigger="invariant"
  fs-assert-visible="#app-title">
  Faultsense Todo Demo
</h1>
```

**Source:** `routes/todos.tsx:70-77`, `routes/index.tsx:25-34`

---

## Authentication

### 16. Login — Route or Error

**Scenario:** User submits the login form. On success, the app navigates to `/todos`. On failure, a `.login-error` message appears.

**Reasoning:** Success is a route change, error is a DOM change — different assertion types. `mutex="each"` makes them race as one group. Route assertion uses `fs-assert-route-success` to check the URL changed to `/todos`. This also demonstrates `setUserContext` being called on successful login.

```jsx
<button type="submit"
  fs-assert="auth/login"
  fs-trigger="click"
  fs-assert-mutex="each"
  fs-assert-route-success="/todos"
  fs-assert-added-error=".login-error">
  Sign In
</button>
```

**Source:** `routes/login.tsx:54-64`

---

### 17. Logout — Route Navigation

**Scenario:** User clicks Logout and should be redirected to the login page.

**Reasoning:** Logout is a route change — use `fs-assert-route` to verify the URL changed to `/login`. Also demonstrates clearing user context on logout (`setUserContext(undefined)`).

```jsx
<button
  fs-assert="auth/logout"
  fs-trigger="click"
  fs-assert-route="/login">
  Logout
</button>
```

**Source:** `routes/todos.tsx:81-93`

---

## Network Status

### 18. Offline Banner Shown

**Scenario:** When the browser loses connectivity, an offline banner should appear.

**Reasoning:** `offline` trigger fires on the browser's `offline` event. The banner is conditionally rendered — use `added` to verify it appeared in the DOM. The trigger element is a hidden div that exists solely for the assertion.

```jsx
<div
  fs-assert="network/offline-banner-shown"
  fs-trigger="offline"
  fs-assert-added="#offline-banner"
  style={{ display: 'none' }} />
```

**Source:** `routes/todos.tsx:50-55`

---

### 19. Offline Banner Hidden

**Scenario:** When connectivity is restored, the offline banner should be removed.

**Reasoning:** `online` trigger fires on the browser's `online` event. `removed` verifies the banner element is no longer in the DOM.

```jsx
<div
  fs-assert="network/offline-banner-hidden"
  fs-trigger="online"
  fs-assert-removed="#offline-banner"
  style={{ display: 'none' }} />
```

**Source:** `routes/todos.tsx:57-62`

---

## Demos

### 20. GC Timeout Demo

**Scenario:** Clicking the button creates an assertion for a selector that will never appear. Demonstrates GC sweep behavior.

**Reasoning:** `.never-exists` will never appear in the DOM. With no `fs-assert-timeout`, the assertion stays pending until the GC sweep (default 30s) cleans it up and marks it failed. Useful for demonstrating what happens to unresolved assertions.

```jsx
<button
  fs-assert="demo/gc-timeout"
  fs-trigger="click"
  fs-assert-added=".never-exists">
  GC Demo (no SLA)
</button>
```

**Source:** `routes/todos.tsx:110-117`, `routes/index.tsx:52-59`

---

## Summary

| # | Assertion Key | Trigger | Types | Features Demonstrated |
|---|---|---|---|---|
| 1 | `todos/add-item` | click | added, emitted | Conditional (`conditions` mutex), count modifier, custom event emitted |
| 2 | `todos/toggle-complete` | change | updated, visible | Dynamic modifiers, classlist, data-attribute regex, multi-assertion |
| 3 | `todos/remove-item` | click | removed, added | Conditional (`each` mutex), cross-type, SLA timeout |
| 4 | `todos/edit-item` | click | added | Focused modifier |
| 5 | `todos/cancel-edit` | keydown:Escape | removed | Filtered keyboard trigger |
| 6 | `todos/char-count-updated` | input | visible | Input trigger, text-matches |
| 7 | `todos/empty-state` | mount | visible | Mount trigger |
| 8 | `todos/count-updated` | OOB | visible | OOB, self-referencing selector, text-matches |
| 9 | `todos/item-count-correct` | OOB | visible | OOB, count modifier |
| 10 | `todos/count-stable-after-toggle` | OOB | stable | OOB, stability assertion, timeout |
| 11 | `activity/log-updated` | event:todo:added | visible | Custom event trigger |
| 12 | `guide/step-1` | mount | visible | Mount trigger, sequence anchor |
| 13 | `guide/step-2` | click | added, after | Sequence assertion, count modifier |
| 14 | `guide/step-3` | click | added, after | Sequence chain |
| 15 | `layout/title-visible` | invariant | visible | Invariant, simulated CSS regression |
| 16 | `auth/login` | click | route, added | Route assertion, conditional (`each` mutex) |
| 17 | `auth/logout` | click | route | Route assertion |
| 18 | `network/offline-banner-shown` | offline | added | Browser event trigger |
| 19 | `network/offline-banner-hidden` | online | removed | Browser event trigger |
| 20 | `demo/gc-timeout` | click | added | GC sweep demo |
