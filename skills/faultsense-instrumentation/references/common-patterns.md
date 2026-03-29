# Faultsense — Common Patterns

Annotated patterns showing how to instrument common UI interactions. Each includes the reasoning behind the assertion choices.

---

## 1. Button Click → DOM Update (Counter)

**Scenario:** A button increments a counter displayed on the page.

**Reasoning:** The counter element already exists — its text content changes. Use `updated` with `text-matches` to verify the new value is a positive number.

```html
<button
  fs-assert="counter/increment"
  fs-trigger="click"
  fs-assert-updated='#counter[text-matches=Count: [1-9]\d*]'>
  Increment
</button>
<div id="counter">Count: 0</div>
```

---

## 2. Form Submit → Element Added (Todo)

**Scenario:** Submitting a form adds a new item to a list.

**Reasoning:** The new item doesn't exist yet — it will be created in the DOM. Use `added`. The trigger is `click` on the button (the user's interaction point).

```html
<button type="submit"
  fs-assert="todo/add-item"
  fs-trigger="click"
  fs-assert-added=".todo-item">
  Add Todo
</button>
```

---

## 3. Modal Open/Close (Dialog)

**Scenario:** A button opens a modal; a cancel button closes it.

**Reasoning:** Opening: the modal overlay already exists in the DOM (hidden). Use `visible` to verify it now has layout dimensions. Closing: the modal content is removed from the DOM entirely. Use `removed`.

```html
<!-- Open trigger -->
<button
  fs-assert="modal/open"
  fs-trigger="click"
  fs-assert-visible=".modal-overlay">
  Open Modal
</button>

<!-- Close trigger (inside modal) -->
<button
  fs-assert="modal/close"
  fs-trigger="click"
  fs-assert-removed=".modal-content">
  Cancel
</button>
```

**Note:** If the modal is conditionally rendered (not in the DOM until opened), use `added` instead of `visible` for the open trigger.

---

## 4. Tab Switching (Tabbed Interface)

**Scenario:** Clicking a tab shows the corresponding content panel.

**Reasoning:** Tab content panels typically exist in the DOM but are hidden. Use `visible` to verify the target panel now has layout dimensions.

```html
<button class="tab-button" data-tab="settings"
  fs-assert="tabs/switch-tab"
  fs-trigger="click"
  fs-assert-visible=".tab-content[data-tab='settings']">
  Settings
</button>
```

---

## 5. Multi-Step Wizard with Sequence Validation

**Scenario:** Clicking "Next" advances to the next wizard step. Each step requires the previous to have completed.

**Reasoning:** Use `fs-assert-after` to validate step ordering. `after` and `visible` are independent assertions — a sequence violation with correct UI is a visible finding.

```html
<!-- Step 1 -->
<button fs-assert="wizard/step-1" fs-trigger="click"
  fs-assert-visible=".wizard-step[data-step='2']">
  Next
</button>

<!-- Step 2: must have completed step 1 -->
<button fs-assert="wizard/step-2" fs-trigger="click"
  fs-assert-after="wizard/step-1"
  fs-assert-visible=".wizard-step[data-step='3']">
  Next
</button>

<!-- Step 3: must have completed step 2 -->
<button fs-assert="wizard/step-3" fs-trigger="click"
  fs-assert-after="wizard/step-2"
  fs-assert-visible=".confirmation">
  Submit
</button>
```

---

## 6. Form Submit → Conditional Assertions

**Scenario:** A contact form that shows a success message, validation errors, or a server error.

**Reasoning:** The outcome depends on what the app renders. Use conditional assertions to branch: the first condition key whose selector matches wins, others dismissed. No server integration needed.

```html
<form
  fs-assert="contact/submit-form"
  fs-trigger="submit"
  fs-assert-added-success=".success-msg"
  fs-assert-added-validation-error=".validation-errors"
  fs-assert-added-server-error=".server-error"
  fs-assert-timeout="2000">
  <input name="email" type="email" />
  <button type="submit">Send</button>
</form>
```

---

## 7. MPA Navigation (Multi-Page App)

**Scenario:** A form submission triggers a full page navigation, and the success message appears on the next page.

**Reasoning:** The assertion must survive the page reload. Use `fs-assert-mpa="true"` to persist it to localStorage. On the next page, the agent picks it up and resolves it.

```html
<button
  fs-assert="mpa-form/submit"
  fs-trigger="click"
  fs-assert-mpa="true"
  fs-assert-visible=".success-message">
  Submit
</button>
```

---

## 8. Data Load → Conditional DOM Update

**Scenario:** Clicking a button fetches data. On success, results update. On error, an error element appears.

**Reasoning:** The results container already exists (use `updated` for the success path). The error element is new (use `added` for the error path). Longer timeout for network operations.

```html
<button
  fs-assert="data/load-posts"
  fs-trigger="click"
  fs-assert-updated-success="#results"
  fs-assert-added-error=".error"
  fs-assert-timeout="2600">
  Load Posts
</button>
<div id="results"></div>
```

---

## 9. OOB Side-Effect Validation (Count Label)

**Scenario:** A count label shows "N/M remaining" and should update whenever a todo is added, toggled, or deleted. The count label is in a different component from the trigger elements.

**Reasoning:** Without OOB, you'd need to prop-drill count data into TodoItem just to compute expected text. OOB lets the count label declare its own assertion triggered by other assertions passing. Use state assertions with OOB.

```html
<!-- Triggers (in various components) -->
<button fs-assert="todos/add-item" fs-trigger="click"
  fs-assert-added=".todo-item">Add</button>

<input type="checkbox" fs-assert="todos/toggle-complete"
  fs-trigger="change"
  fs-assert-updated=".todo-item[classlist=completed:true]" />

<button fs-assert="todos/remove-item" fs-trigger="click"
  fs-assert-removed=".todo-item">Delete</button>

<!-- OOB count label (separate component, no prop drilling) -->
<div id="todo-count"
  fs-assert="todos/count-updated"
  fs-assert-oob="todos/add-item,todos/toggle-complete,todos/remove-item"
  fs-assert-visible="[text-matches=\d+/\d+ remaining]">
  2/3 remaining
</div>
```

---

## 10. Invariant Assertion (Continuous Monitoring)

**Scenario:** The main navigation should always be visible. An error banner should never appear.

**Reasoning:** No user action triggers these — they're page-level contracts. Use `fs-trigger="invariant"` for continuous monitoring.

```html
<!-- Navigation must always be visible -->
<nav
  fs-assert="layout/nav-visible"
  fs-trigger="invariant"
  fs-assert-visible=".main-nav">
</nav>

<!-- Error banner must never appear -->
<div
  fs-assert="layout/no-error-banner"
  fs-trigger="invariant"
  fs-assert-hidden=".global-error-banner">
</div>
```

---

## 11. Custom Event Trigger + Emitted Assertion

**Scenario:** The app dispatches custom events for state changes. Verify both the event and the resulting UI.

**Reasoning:** Use `event:<name>` trigger to activate on custom events. Use `emitted` to assert a custom event fires after a user action. `detail-matches` on triggers uses string equality; on `emitted` it uses regex.

```html
<!-- Trigger assertion when the app dispatches a custom event -->
<div fs-assert="cart/sync-check" fs-trigger="event:cart-updated[detail-matches=action:add]"
  fs-assert-visible="#cart-count[text-matches=\d+]">
</div>

<!-- Assert that clicking Pay causes a payment:complete event to fire -->
<button fs-assert="checkout/payment" fs-trigger="click"
  fs-assert-emitted="payment:complete[detail-matches=orderId:\d+]"
  fs-assert-visible=".confirmation">
  Pay Now
</button>
```

---

## 12. Stable Assertion (No Flickering)

**Scenario:** After adding to cart, the price total should not flicker or update unexpectedly.

**Reasoning:** Use `stable` (inverted `updated`) with OOB to start the stability window after the expected mutation. Any mutation during the timeout window fails the assertion.

```html
<!-- Primary: add to cart -->
<button fs-assert="cart/add-item" fs-trigger="click"
  fs-assert-updated="#cart-total">
  Add to Cart
</button>

<!-- OOB: verify price doesn't flicker after the cart updates -->
<div
  fs-assert="cart/price-stable"
  fs-assert-oob="cart/add-item"
  fs-assert-stable="#cart-total"
  fs-assert-timeout="500">
</div>
```

---

## 13. Count Assertions (Cardinality)

**Scenario:** After a search, verify the correct number of results appear.

**Reasoning:** Use `count`, `count-min`, `count-max` to verify element cardinality. `count` checks `querySelectorAll(selector).length`.

```html
<!-- After search, verify at least 1 result exists -->
<button fs-assert="search/execute" fs-trigger="click"
  fs-assert-added=".result-card[count-min=1]">Search</button>

<!-- OOB: verify total todo count after add/remove -->
<div
  fs-assert="todos/item-count"
  fs-assert-oob="todos/add-item,todos/remove-item"
  fs-assert-visible=".todo-item[count=5]">
</div>
```

---

## Progressive Assertion Example: Todo Delete

Start simple, then layer on more precise assertions as confidence needs grow.

### Level 1: Basic — Did it disappear?

```html
<button
  fs-assert="todos/remove-item"
  fs-trigger="click"
  fs-assert-removed=".todo-item">
  Remove
</button>
```

Catches the basics — the button works, the item disappears.

### Level 2: Branching — Success or error?

```html
<button
  fs-assert="todos/remove-item"
  fs-trigger="click"
  fs-assert-mutex="each"
  fs-assert-removed-success=".todo-item"
  fs-assert-added-error=".error-msg">
  Remove
</button>
```

Now you know which outcome occurred. `fs-assert-mutex="each"` ties the cross-type conditionals together so exactly one resolves.

### Level 3: Multi-check — Did the toast also appear?

```html
<button
  fs-assert="todos/remove-item"
  fs-trigger="click"
  fs-assert-mutex="each"
  fs-assert-removed-success=".todo-item"
  fs-assert-added-error=".error-msg">
  Remove
</button>

<!-- OOB: verify toast appears on successful delete -->
<div class="toast-container"
  fs-assert="todos/remove-item-toast"
  fs-assert-oob="todos/remove-item"
  fs-assert-visible=".toast[text-matches=Item deleted]">
</div>
```

Three things asserted:
- Conditional on the trigger — item removed (success) or error shown (error)
- OOB on the toast — when `todos/remove-item` passes, checks that a confirmation toast appeared
- Each is an independent assertion with its own key, no coupling between components
