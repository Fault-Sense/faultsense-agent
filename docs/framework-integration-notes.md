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

## TanStack Start (React 19 + Vite + TanStack Router)

**Harness:** `examples/todolist-tanstack/` (reused via `VITE_FS_COLLECTOR=conformance` env-var switch).
**Driver:** `conformance/drivers/tanstack.spec.ts`.

### Agent double-init in Vite dev mode

- **Finding.** In `vite dev`, the agent's IIFE runs twice: once during initial document parse, once after Vite HMR connects. Both inits call `init(config)` and register their own listeners/observers.
- **Why.** TanStack Start's `<Scripts />` component path plus Vite's module graph re-execution during HMR means the classic `<script>` tag effectively runs twice. Each run has its own DOMContentLoaded listener, and both fire.
- **Fix / recommendation.** Non-issue in production builds. For tests: a 300–500 ms settle wait in `beforeEach` lets both inits complete before the driver interacts. For real apps: if you're paranoid about dangling listeners in dev, call `window.Faultsense.cleanup?.()` before re-running init, but this isn't a correctness issue.
- **Source.** `conformance/drivers/tanstack.spec.ts:23-34` documents the settle wait inline.

### Switching between panel and conformance collectors

- **Finding.** One example app needs to serve two audiences: humans (panel overlay) and CI (conformance payloads on `window.__fsAssertions`).
- **Why.** Extracting a second minimal "conformance page" duplicates maintenance — every new assertion type has to land in both copies.
- **Fix / recommendation.** Use a Vite env var (`VITE_FS_COLLECTOR`) to switch the collector script tag and the `data-collector-url` attribute at build/dev time. Default = `panel` (demo UX), override = `conformance` (test harness). Playwright's `webServer` entry sets the env var when spawning the dev server.
- **Source.** `examples/todolist-tanstack/src/routes/__root.tsx:8-41`.

### Script loading order with `head.scripts`

- **Finding.** TanStack Start's `createRootRoute.head.scripts` array renders the tags in array order inside `<head>`. This is correct and robust — no surprises.
- **Fix / recommendation.** Put the collector script BEFORE the agent script in the array so the collector registers on `window.Faultsense.collectors[name]` before the agent's DOMContentLoaded handler resolves `data-collector-url`.
- **Source.** Works correctly across 18 conformance runs; no quirks.

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
