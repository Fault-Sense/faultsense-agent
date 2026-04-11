# Framework Integration Notes

**Scratch doc.** Running notebook of per-framework findings surfaced while
building Layer 2 conformance harnesses. Entries are mined from real
implementation friction, not guessed. When a framework accumulates enough
entries to stand on its own, promote it to `docs/frameworks/<name>.md`
(or the `.org` docs site) as a proper integration guide.

Convention for new entries:
- **Finding** — what broke or surprised someone (one line)
- **Why** — root cause (1–3 lines)
- **Fix / recommendation** — the canonical pattern users should adopt
- **Source** — commit, file:line, or test that locked it in

---

## React 19 (Vite + hooks + StrictMode)

**Harness:** `conformance/react/`.
**Driver:** `conformance/drivers/react.spec.ts`.

> The TanStack Start section below was preserved from earlier work when `examples/todolist-tanstack/` was temporarily wired into the conformance suite via a `VITE_FS_COLLECTOR` env-var switch. That approach was reverted in favor of a purpose-built minimal harness, and the tanstack example is now demo-only. The TanStack Start findings still apply to anyone running the full-stack example or building a similar SSR app.

### Controlled checkboxes + `fs-trigger="change"` (agent-blind timing)

- **Finding.** A React controlled checkbox (`<input type="checkbox" checked={state} onChange={...}>`) with `fs-trigger="change"` and an expected-next-state modifier (`classlist=completed:${!state}`) silently times out. The agent never sees the "old" attribute value — by the time its capture-phase listener reads `fs-assert-updated`, React has already flipped state, re-rendered, and updated the attribute to the NEW expected-next.
- **Why.** React 18+ re-renders controlled inputs synchronously (or near-synchronously) during the native event dispatch. The attribute is recomputed from the new state before the document-level capture listener runs. Vue 3 doesn't have this issue because its reactive updates defer to the next microtask via `nextTick`.
- **Fix / recommendation.** **Use `fs-trigger="click"` instead of `"change"` on React controlled checkboxes.** Click fires before React processes the input event, so the agent reads the attribute with the correct expected-next snapshot. The assertion still resolves on the mutation observer's class change.
- **Source.** `conformance/react/src/App.tsx:244-261` documents the switch inline; `conformance/drivers/react.spec.ts:58-74` is the regression.

### StrictMode is safe, but expect `nextId` side effects to double-fire

- **Finding.** React 19 StrictMode double-invokes effects AND reducer functions in dev. If your reducer increments a module-level `nextId`, the second invocation runs it again and the first new item ends up with id `2` instead of `1`.
- **Why.** StrictMode intentionally double-invokes to surface impure side effects. A module-level mutable `nextId` IS an impure side effect. The fix is to scope the counter inside component state or move ID generation server-side.
- **Fix / recommendation.** For harness-level ID counters, this is a nuisance, not a bug. Assertion selectors should use `[data-id=${id}]` with the actual rendered id, not hardcoded values. Don't assume IDs start at 1 in StrictMode-enabled builds.
- **Source.** `conformance/react/src/App.tsx:29` — `let nextId = 1` at module level, observed producing `data-id="2"` for the first todo in StrictMode dev.

### JSX types for `fs-*` custom attributes

- **Finding.** React 19's `@types/react` doesn't know about the `fs-*` attribute namespace, so JSX files get type errors on `fs-assert`, `fs-trigger`, etc.
- **Fix / recommendation.** Augment `HTMLAttributes<T>` with a template-literal index signature that accepts any `fs-${string}` key:
  ```ts
  // src/faultsense.d.ts
  import "react";
  declare module "react" {
    interface HTMLAttributes<T> {
      [key: `fs-${string}`]: string | undefined;
    }
  }
  ```
  One 8-line file, no per-attribute boilerplate. Include the file path in your `tsconfig.json` `include` array (or put it under `src/` if that's already included).
- **Source.** `conformance/react/src/faultsense.d.ts`.

### Dynamic `fs-*` bindings via JSX interpolation

- **Finding.** JSX template literals in `fs-assert-updated={\`.todo-item[data-id='${id}'][classlist=completed:${!completed}]\`}` work correctly. React renders the result as a plain HTML attribute, and the agent's parser accepts quoted attribute values (after the e3550f9 fix).
- **Fix / recommendation.** Use template literals for per-item selectors inside `.map()` loops. Both quoted (`[data-id='${id}']`) and unquoted (`[data-id=${id}]`) forms work.
- **Source.** `conformance/react/src/App.tsx:258`.

---

## TanStack Start (React 19 + Vite + TanStack Router, SSR)

**Status:** out-of-scope for conformance. The full-stack example at `examples/todolist-tanstack/` is a marketing/manual demo and no longer driven by the conformance suite — `conformance/react/` handles React coverage. These findings are preserved for anyone instrumenting a real TanStack Start app.

### Agent double-init in Vite dev mode

- **Finding.** In `vite dev`, the agent's IIFE effectively runs twice: once during initial document parse, once after Vite HMR connects. Both inits call `init(config)` and register their own listeners/observers.
- **Why.** TanStack Start's `<Scripts />` component path plus Vite's module graph re-execution during HMR means the classic `<script>` tag runs twice. Each run has its own DOMContentLoaded listener, and both fire.
- **Fix / recommendation.** Non-issue in production builds. For tests against a dev server: a 300–500 ms settle wait in `beforeEach` lets both inits complete before the driver interacts. For real apps: if you're paranoid about dangling listeners in dev, call `window.Faultsense.cleanup?.()` before re-running init, but this isn't a correctness issue.

### Script loading order with `head.scripts`

- **Finding.** TanStack Start's `createRootRoute.head.scripts` array renders the tags in array order inside `<head>`. Correct and robust — no surprises.
- **Fix / recommendation.** Put the collector script BEFORE the agent script in the array so the collector registers on `window.Faultsense.collectors[name]` before the agent's DOMContentLoaded handler resolves `data-collector-url`.
- **Source.** `examples/todolist-tanstack/src/routes/__root.tsx`.

---

## Vue 3 (Composition API + Vite)

**Harness:** `conformance/vue3/`.
**Driver:** `conformance/drivers/vue3.spec.ts`.

### Quoted attribute values in template-literal selectors (agent bug, fixed)

- **Finding.** Writing `:fs-assert-updated="\`.todo-item[data-id='${todo.id}']\`"` in a Vue template silently failed — the assertion stayed pending forever with no error.
- **Why.** The Vue compiler emits the quoted value into the DOM attribute (`[data-id='1']`). The Faultsense agent's `parseTypeValue` preserved the quotes verbatim, so the downstream matcher compared `"'1'"` against `el.getAttribute("data-id")` which returns `"1"` (unquoted). Regex built from the quoted form never matches. Silent timeout.
- **Fix / recommendation.** Upgrade to an agent build that includes commit `e3550f9` (fix: strip outer quotes from modifier values). After the fix, quoted and unquoted forms both work. No user-side workaround needed.
- **Source.** Commit `e3550f9` + regression tests at `tests/assertions/attrs.test.ts` (last 3 `it` blocks).

### `<script type="module">` runs before DOMContentLoaded

- **Finding.** In a hand-written `index.html`, the Vue app's entry point is typically `<script type="module" src="/src/main.ts">` at end of body. Module scripts are implicitly deferred, so `main.ts` executes AFTER body parse but BEFORE DOMContentLoaded.
- **Why.** This means Vue mounts first, then the agent's DOMContentLoaded listener fires. The agent's init-time `querySelectorAll` for `[fs-trigger=mount]` / `[fs-trigger=invariant]` picks up Vue's initially-rendered elements without needing the MutationObserver.
- **Fix / recommendation.** Put the Faultsense collector and agent scripts in `<head>` as synchronous (non-deferred) classic scripts. They run during head parse, before Vue mounts, before DOMContentLoaded. Order: collector first, agent second, Vue main.ts last.
- **Source.** `conformance/vue3/index.html:13-23`.

### Dynamic `fs-*` bindings via `:attr-name`

- **Finding.** Vue's `:fs-assert-updated` binding with a template-literal value propagates to the DOM as a real HTML attribute — the agent reads it via `element.getAttribute` as usual.
- **Why.** Vue's attribute binding for non-standard attributes goes through `setAttribute`, which is exactly what the agent needs.
- **Fix / recommendation.** Both static (`fs-assert="..."`) and dynamic (`:fs-assert="..."`) forms work. Use the dynamic form for per-item selectors inside `v-for` loops — you need the item id in the selector anyway.
- **Source.** `conformance/vue3/src/App.vue:136-160` (toggle/remove bindings).

### Mount triggers with `v-if` conditional rendering

- **Finding.** An element with `fs-trigger="mount"` that starts out NOT rendered (hidden behind `v-if`) correctly fires its mount assertion the first time Vue inserts it.
- **Why.** The agent's MutationObserver catches the `childList` mutation and runs the mount processor on the newly-added element.
- **Fix / recommendation.** Use `fs-trigger="mount"` on `v-if`'d elements that appear in response to state changes (empty states, loading placeholders, flash messages).
- **Source.** Scenario 6 in `conformance/drivers/vue3.spec.ts` (`layout/empty-state-shown`).

### Custom event triggers dispatched after Vue state mutations

- **Finding.** Dispatching a `CustomEvent` via `document.dispatchEvent(...)` immediately after a Vue reactive state mutation works correctly. The agent's `event:<name>` trigger fires, the assertion is created, and the subsequent DOM mutation (from Vue's next tick) resolves it.
- **Why.** Vue batches reactive updates via a microtask. The synchronous `dispatchEvent` fires BEFORE the batch flushes, so the agent's assertion is created first and the DOM mutation that resolves it arrives in a later mutation batch.
- **Fix / recommendation.** Dispatch your domain custom event after the state mutation. Don't wait for `nextTick` — the agent handles the ordering correctly.
- **Source.** `conformance/vue3/src/App.vue:88-95` (logAction function) + Scenario 9 in the driver.

---

## HTMX 2 (Express + EJS)

**Harness:** `conformance/htmx/`.
**Driver:** `conformance/drivers/htmx.spec.ts`.

### For `hx-swap="outerHTML"` toggles, use `fs-assert-updated` with an ID selector

- **Finding.** An HTMX outerHTML swap (`hx-patch`, `hx-put`, etc. with `hx-swap="outerHTML"` on a target like `#todo-1`) produces a childList mutation: old element in `removedElements`, new element in `addedElements`, parent in `updatedElements`. HTMX also applies transient marker classes (`htmx-swapping`, `htmx-added`, `htmx-settling`) during its swap + settle phases (default ~20 ms each), which can make classlist modifier checks fail on the FIRST mutation batch.
- **Why this still works under wait-for-pass.** The `updated` type's matcher in `src/resolvers/dom.ts:17-24` is special — it does `document.querySelector(typeValue)` up-front and then checks both `el.matches(selector)` AND `targetElement?.contains(el)` for every element in `updatedElements`. When HTMX strips its marker classes in a subsequent attribute mutation, the same-ID element lands in `updatedElements` again, the matcher re-resolves `document.querySelector("#todo-1")` to the SAME now-clean element, the classlist check passes, and the assertion resolves. Wait-for-pass (PR #20 / `src/resolvers/dom.ts:158-219`) keeps the assertion pending across the transient batch instead of committing a false fail.
- **Fix / recommendation.** **Use `fs-assert-updated="#todo-<id>[classlist=completed:<expected>]"` instead of `fs-assert-added=".todo-item[...]"` for HTMX outerHTML swaps.** The existing `examples/todolist-htmx/views/partials/todo-item.ejs:32` is the canonical pattern. The `added` type with a class selector silently times out because `added` only re-checks `addedElements`, and the marker-class removal happens as an attribute mutation on an already-inserted element (so the element is in `updatedElements`, not `addedElements`, on the second batch).
- **Source.** `conformance/htmx/views/_todo.ejs` + `examples/todolist-htmx/views/partials/todo-item.ejs:32`. An earlier iteration of this doc incorrectly prescribed `hx-swap="outerHTML swap:0ms settle:0ms"` as the fix — that works but it's a workaround for using the wrong assertion type. Wait-for-pass already handles the transient classes correctly; the real fix is assertion type + selector choice.

### `hx-swap-oob` for multi-region updates pairs naturally with `fs-assert-oob`

- **Finding.** HTMX's `hx-swap-oob` attribute lets one server response update multiple DOM regions (e.g., the new todo + the refreshed count label). Faultsense's `fs-assert-oob` watches for cross-region assertions triggered by primary assertions. The two work together: the server emits a combined fragment, HTMX applies both swaps in one pass, and the agent sees the count-update mutation in the same batch as the main swap.
- **Fix / recommendation.** Declare the OOB assertion on the fragment that will be swapped (`#todo-count` in the harness) and name the primary assertion in `fs-assert-oob="todos/add-item,..."`. The server response for the primary mutation carries both the main fragment and the OOB count fragment; HTMX applies both in one mutation batch; Faultsense's OOB path fires `immediateResolver` against the current DOM state.
- **Source.** `conformance/htmx/views/_count.ejs`, `conformance/htmx/views/_todo_with_oob.ejs`.

### `hx-swap="delete"` + `fs-assert-removed` just works

- **Finding.** HTMX's `hx-swap="delete"` removes the target element on a successful response. Pair it with `fs-assert-removed="<target-selector>"` on the delete button — the `removed` assertion type picks up the outgoing element from `removedElements` and resolves immediately. No transition-class workaround needed because `delete` doesn't run through the settle pipeline.
- **Source.** `conformance/htmx/views/_todo.ejs:32-38`.

### `hx-target-422` + `hx-swap-422` for conditional mutex error variants

- **Finding.** HTMX 2 added `hx-target-<status>` and `hx-swap-<status>` attributes that let you route error responses to a different target with a different swap strategy. This is the natural shape for Faultsense's `fs-assert-mutex="conditions"` — success responses target the main list (append), error responses target a dedicated error slot (innerHTML replace).
- **Fix / recommendation.** The add form in `conformance/htmx/views/index.ejs` uses `hx-target-422="#add-error-slot"` and `hx-swap-422="innerHTML"` alongside the default `hx-target="#todo-list"` + `hx-swap="beforeend"`. The server returns 422 with an error fragment on validation failure; HTMX routes it to the error slot; the error variant of the conditional mutex matches; Faultsense dismisses the success variant.
- **Source.** `conformance/htmx/views/index.ejs:32-41`.

---

## Hotwire (Rails 8 + Turbo 8 + turbo-rails)

**Harness:** `conformance/hotwire/` (runs in a Docker container — macOS system Ruby is too old).
**Driver:** `conformance/drivers/hotwire.spec.ts`.

### Never pass `local: false` to `form_with` in Rails 8

- **Finding.** `form_with url: todos_path, local: false` emits `data-remote="true"` (legacy Rails UJS), NOT a Turbo-handled form. Forms submit without Turbo intercepting, page reloads, assertions never fire.
- **Why.** In Rails 7+, `config.action_view.form_with_generates_remote_forms` defaults to `false`. `form_with` without any `local:` override produces a regular HTML form that Turbo intercepts natively. Explicitly setting `local: false` forces the OLD UJS path, which was deprecated and isn't loaded when `turbo-rails` replaces it.
- **Fix / recommendation.** Drop the `local: false` override. Just `form_with url: ...` is correct. Turbo's client intercepts the form submission, sends the request with `Accept: text/vnd.turbo-stream.html`, and applies the stream response to the DOM.
- **Source.** `conformance/hotwire/app/views/todos/index.html.erb:18-24` (after fix).

### `scope:` keeps form params nested

- **Finding.** `form_with url: todos_path` without a `scope:` or `model:` generates flat field names (`name="text"`). Controllers expecting `params[:todo][:text]` miss the parameter.
- **Fix / recommendation.** Add `scope: :todo` to nest the params: `form_with url: todos_path, scope: :todo`. Now `f.text_field :text` generates `name="todo[text]"`, which matches `params.dig(:todo, :text)` on the controller side.
- **Source.** `conformance/hotwire/app/views/todos/index.html.erb:18-24`.

### Rails route helper naming for member actions

- **Finding.** For `resources :todos do member do patch :toggle end end`, the path helper is `toggle_todo_path(id)`, not `todo_toggle_path(id)`.
- **Why.** Rails puts the action prefix FIRST for member routes.
- **Fix / recommendation.** Trivia, not an agent concern. Flagged here because the bad form renders as a `NoMethodError` on every page load and the traceback is 40 lines of Action Dispatch noise.
- **Source.** `conformance/hotwire/app/views/todos/_todo.html.erb:16`.

### CSRF tokens and Playwright drivers

- **Finding.** Playwright's `page.request.post()` bypasses the form and skips the CSRF token, triggering `ActionController::InvalidAuthenticityToken (Can't verify CSRF token authenticity)` with a 422 response.
- **Why.** Rails CSRF protection checks `X-CSRF-Token` or `authenticity_token` param. Playwright's direct HTTP calls don't include either.
- **Fix / recommendation.** For test-only harnesses running in an isolated container, `skip_before_action :verify_authenticity_token` in the controller is acceptable. In real apps, never do this — let Turbo's form submission handle the token automatically, and have Playwright tests interact via `page.click()` on real buttons, not `page.request.post()`.
- **Source.** `conformance/hotwire/app/controllers/todos_controller.rb:2-5`.

### Turbo Stream `replace` = outerHTML swap (PAT-03 pattern)

- **Finding.** `turbo_stream.replace("todo-1", partial: "todos/todo", locals: { todo: @todo })` produces a childList mutation where the OLD `<li id="todo-1">` is in `removedNodes` and the NEW `<li id="todo-1">` (different identity) is in `addedNodes`. The parent `<ul>` is the mutation target.
- **Why.** Turbo's client uses `element.outerHTML = ...` (or equivalent) to apply replace actions. The new element has the same ID but a new DOM identity, so `updated` assertions on the new element will NOT match — `updatedElements` only contains the parent `<ul>`.
- **Fix / recommendation.** Use `fs-assert-added` for toggle-style scenarios that swap via `turbo_stream.replace`. The `added` modifiers (classlist, data attributes) match against the NEW element. If you want to assert the element's inner state, use `added` with attribute/classlist modifiers targeting the new node. See PAT-03 for the canonical pattern.
- **Source.** `conformance/hotwire/app/views/todos/_todo.html.erb:15-20` (toggle button uses `fs-assert-added`, not `updated`) + `tests/conformance/pat-03-outer-html-replacement.test.ts`.

### Turbo 8 + CDN Turbo client without importmap

- **Finding.** A minimal Rails harness with `--skip-asset-pipeline --skip-javascript` has no importmap. Loading Turbo via a `<script type="module" src="https://cdn.jsdelivr.net/npm/@hotwired/turbo@8.0.13/...">` tag in the layout works perfectly — `turbo-rails` still provides the server-side `turbo_stream.*` helpers regardless of how the client JS loads.
- **Fix / recommendation.** For minimal harnesses and prototype apps, CDN `<script>` loading is simpler than wiring up importmap. For production apps, keep importmap (or Propshaft/esbuild/whatever) for fingerprinting and integrity.
- **Source.** `conformance/hotwire/app/views/layouts/application.html.erb:22-28`.

### Agent bundle distribution in a Rails harness

- **Finding.** Mounting `/dist/faultsense-agent.min.js` into `conformance/hotwire/public/` via a Docker bind mount means rebuilds of the agent (`npm run build:agent`) are picked up without rebuilding the Ruby image.
- **Fix / recommendation.** `docker-compose.yml` has a `volumes:` entry mounting the agent bundle and the shared collector as read-only into the container's `public/` directory. Combined with a bind mount of `app/` and `config/`, dev iteration is fast (no image rebuilds for code or agent changes).
- **Source.** `conformance/hotwire/docker-compose.yml:17-25`.

### Skip Action Cable unless you need Turbo Stream broadcasts

- **Finding.** Rails `--minimal --skip-action-cable` gives you a much leaner harness and the Turbo Stream fetch-response mode (what you want for CRUD) works without Action Cable.
- **Why.** Action Cable is only required for Turbo Stream *broadcasts* (WebSocket-driven updates). Request-scoped stream responses go over the normal HTTP response and need no WebSocket infrastructure.
- **Fix / recommendation.** Default to `--skip-action-cable` unless your feature requires broadcast-based updates.
- **Source.** `conformance/hotwire/Gemfile` + `rails new` scaffold flags in the Phase 5 commit.

---

## Cross-cutting patterns

These apply to every framework, not just one.

### Defensive structured-clone in the custom collector

The conformance collector at `conformance/shared/collector.js` does `JSON.parse(JSON.stringify(payload))` on every settled assertion before pushing to `window.__fsAssertions`. This prevents post-settlement mutations (invariant auto-retry, sibling dismissal) from corrupting the captured snapshot. Any custom collector that buffers payloads for later inspection should do the same.

### `fs-assert-mutex="conditions"` error-variant dismissal

When the success variant of a conditional mutex group wins, the error variant is dismissed and the collector never sees it. Test drivers verifying conditional assertions should explicitly check that the dismissed variant is absent from the captured buffer, not just that the winning variant is present. All three harnesses do this for the `todos/add-item` scenario.

### One-time settle wait in `beforeEach`

Every framework driver has a `page.waitForTimeout(300–500)` in `beforeEach` after `page.goto()`. This covers framework boot variance: TanStack Start's dev-mode double-init, Vue's Vite module graph, Rails's Turbo startup. Non-issue in production builds; essential for deterministic Playwright runs against dev servers.
