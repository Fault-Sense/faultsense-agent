---
title: Port TanStack todolist example to HTMX + Express + EJS
type: feat
status: completed
date: 2026-04-10
---

# Port TanStack todolist example to HTMX + Express + EJS

## Overview

Port `examples/todolist-tanstack/` to a sibling `examples/todolist-htmx/` using HTMX 2.0.8 + Express + EJS. The UI, CSS, copy, and assertion coverage must be apples-to-apples with the React version. The goal is to prove Faultsense works identically against a fundamentally different rendering paradigm (server-rendered HTML fragments + hx-swap) and to surface any agent bugs or documentation gaps that HTMX exposes.

Audit already surfaced three real agent bugs that must be fixed as part of this work. Learnings researcher and HTMX docs researcher confirmed the rest of the port should "just work" because discovery piggybacks on MutationObserver and all HTMX lifecycle events bubble to `document`.

## Problem Statement

Faultsense's public positioning is "works in any framework that renders to DOM." Today we only prove that with a React example. HTMX is the highest-leverage second target because:

- It is the polar opposite of React: server-authored HTML, no virtual DOM, no JSX, no hydration.
- It exercises agent code paths the React example never does: body-level DOM swaps, `HX-Trigger` → CustomEvent, SPA navigation via raw `history.pushState` without any router library.
- If it works here, the same pattern extends to Hotwire, Unpoly, Datastar, Alpine.js + swap extensions, and the broader HTML-over-the-wire family.

The HTMX port doubles as a forcing function for three known agent bugs and for documentation gaps that only become visible outside React.

## Proposed Solution

Build a standalone sibling example at `examples/todolist-htmx/`:

- Express + EJS server on a separate port.
- HTMX 2.0.8 loaded from `public/`.
- `hx-boost="true"` on `<body>` to get SPA-like navigation between `/login` and `/todos` via `history.pushState` (apples-to-apples with TanStack Router). Per user answer: hx-boost path, not hard MPA nav.
- Fully standalone — its own `package.json`, its own in-memory store, its own SLOW/FAIL demo logic. No code sharing with `todolist-tanstack`.
- Identical CSS, layout, copy, and assertion keys.

In parallel with the port:

1. Fix three agent bugs surfaced by the audit (virtual-nav lifecycle).
2. Add an HTMX section to `skills/faultsense-instrumentation/references/framework-syntax.md`.
3. Add HTMX-specific gotchas to `skills/faultsense-instrumentation/references/common-patterns.md`.

## Technical Approach

### Directory layout

```
examples/todolist-htmx/
├── package.json
├── server.js                   # Express entry; port 3001
├── public/
│   ├── faultsense-agent.min.js
│   ├── faultsense-panel.min.js
│   └── htmx.min.js             # v2.0.8, pinned
├── views/
│   ├── layout.ejs              # <html>, <head>, <body hx-boost="true">, scripts
│   ├── pages/
│   │   ├── login.ejs           # extends layout
│   │   └── todos.ejs           # extends layout
│   └── partials/
│       ├── todo-item.ejs       # single <div class="todo-item"> with all fs-* / hx-*
│       ├── todo-item-edit.ejs  # inline-edit variant
│       ├── todo-list.ejs       # empty-state or list wrapper
│       ├── add-todo-form.ejs
│       ├── add-todo-error.ejs  # returned for validation failures
│       ├── count-oob.ejs       # hx-swap-oob="innerHTML:#todo-count" fragment
│       ├── offline-banner.ejs
│       └── getting-started.ejs
├── routes/
│   ├── auth.js                 # POST /login, POST /logout
│   └── todos.js                # GET /todos, POST /todos, PATCH /todos/:id/toggle, DELETE /todos/:id, GET /todos/:id/edit, GET /todos/:id/cancel-edit, POST /todos/:id
├── lib/
│   ├── store.js                # In-memory todos + nextId (seeded with same 3 rows)
│   └── hx.js                   # isHtmx middleware + renderFragment helper
└── README.md
```

### Request flow

- Full page GET (`HX-Request` header absent) → render `pages/*.ejs` extending `layout.ejs`.
- HTMX request (`HX-Request: true`) → render the fragment that's being swapped in.
- Login success → respond with `HX-Location: /todos` (client-side fetch + pushState, preserves the agent session).
- Logout → respond with `HX-Location: /login` on POST /logout.
- Add success → return the new `todo-item` partial, set `HX-Trigger: {"todo:added": {"text": "..."}}` on the response so HTMX fires a CustomEvent on body (which bubbles to document, matches the existing `fs-assert-emitted="todo:added"` and the Activity Log listener).
- Add failure (empty or "FAIL" text) → return 200 with `add-todo-error.ejs` partial, retargeted via `HX-Retarget: #add-error-slot`.
- Delete failure ("FAIL" todo) → return 200 with the todo-item + a nested `.error-msg`, `hx-swap="outerHTML"` replaces the row with the error-bearing row.

**HX-Redirect is deliberately NOT used** — it causes a hard reload, which would defeat hx-boost SPA semantics and break the route assertion on login. HX-Location is the correct choice for preserving agent session + history integrity.

### Instrumentation mapping (React → HTMX)

Every assertion key stays the same. Placement and dynamic value expression change per row:

| Key | Placement | Dynamic value approach | HTMX wiring |
|---|---|---|---|
| `todos/add-item` | submit button | `[count=<%= todos.length + 1 %>]` server-interpolated at form render | `hx-post=/todos hx-target=#todo-list hx-swap=beforeend` + `HX-Trigger: todo:added` response header |
| `todos/char-count-updated` | `#add-todo-input` | static regex | `hx-on::input` updates `#char-count` inline |
| `todos/toggle-complete` | checkbox | `[classlist=completed:<%= !todo.completed %>]` (server-rendered negation, same semantics as React's `!todo.completed`) | `hx-patch=/todos/:id/toggle hx-target=closest .todo-item hx-swap=outerHTML` |
| `todos/remove-item` | Delete button | conditional mutex="each" | `hx-delete=/todos/:id hx-target=closest .todo-item hx-swap="outerHTML swap:300ms"` |
| `todos/edit-item` | Edit button | `.todo-edit-input[focused=true]` | `hx-get=/todos/:id/edit hx-target=closest .todo-item hx-swap=outerHTML` — returned partial has `autofocus` on input (see Gotcha 6) |
| `todos/cancel-edit` | edit input | `fs-trigger=keydown:Escape` + `fs-assert-removed=.todo-edit-input` | `hx-get=/todos/:id/cancel-edit hx-trigger="keyup[key=='Escape']" hx-target=closest .todo-item hx-swap=outerHTML` |
| `todos/count-updated` | `#todo-count` | OOB on add/toggle/remove | Server returns `count-oob.ejs` with `hx-swap-oob="innerHTML:#todo-count"` (preserves the element's fs-* attributes) |
| `todos/item-count-correct` | hidden sentinel | OOB | Same |
| `todos/count-stable-after-toggle` | hidden sentinel | OOB + stable + timeout | Same |
| `todos/empty-state` | empty-state div | `fs-trigger=mount` | Rendered by server when list is empty |
| `activity/log-updated` | `#activity-log` | `fs-trigger=event:todo:added` | Inline JS listens to `todo:added`, prepends `.log-entry` |
| `layout/title-visible` | `<h1 id=app-title>` | `fs-trigger=invariant` | Depends on Agent Fix 1 for hx-boost lifecycle |
| `network/offline-banner-shown|hidden` | div sentinels | online/offline triggers | Pure client-side, same as React |
| `auth/login` | Sign In button | `mutex=each` + `fs-assert-route-success=/todos` + `fs-assert-added-error=.login-error` | Response with `HX-Location: /todos` on success (updates pushState → route resolver fires) |
| `auth/logout` | Logout button | `fs-assert-route=/login` | Response with `HX-Location: /login` |
| `guide/step-1..3` | getting-started steps | `fs-trigger=mount` + `fs-assert-after` chain | Inline JS tracks completed state (mirrors React useState) |
| `demo/gc-timeout` | GC demo button | static | Same as React — no server roundtrip needed |

**Dynamic assertion values in EJS** — this is the key "how does dynamic assertion look outside JSX" pattern that the docs currently don't cover. Example:

```ejs
<input type="checkbox" <%= todo.completed ? 'checked' : '' %>
  hx-patch="/todos/<%= todo.id %>/toggle"
  hx-target="closest .todo-item"
  hx-swap="outerHTML"
  fs-assert="todos/toggle-complete"
  fs-trigger="change"
  fs-assert-updated=".todo-item[classlist=completed:<%= !todo.completed %>][data-status=active|completed]"
  fs-assert-visible="#edit-btn-<%= todo.id %>[disabled=<%= !todo.completed %>]">
```

EJS `<%= expr %>` interpolates `true`/`false` into the attribute the same way JSX `{!todo.completed}` does. This is the document-ready pattern we'll put into `framework-syntax.md`.

### Agent fixes (required for Phase 3)

The audit found that HTMX hx-boost exercises three code paths that are currently broken. None of these are HTMX-specific — they apply to any SPA that uses `history.pushState` without a full page load. The HTMX port is the forcing function, but the fix belongs in the agent core.

**Fix 1: Virtual-nav lifecycle on pushState URL-path change.**

Current state: `src/interceptors/navigation.ts:4-17` intercepts pushState/replaceState/popstate and calls a handler. `src/assertions/manager.ts:285` runs the route resolver on the handler. No cleanup of the previous "page" runs. `src/assertions/manager.ts:406` runs only on real `pagehide`, which hx-boost does not fire.

Proposed behavior: extend `handleNavigation` to detect URL-path changes (not any pushState — must compare old vs new pathname). When path changes:

1. Fail pending non-MPA, non-invariant, non-route assertions whose age > `config.unloadGracePeriod` — mirrors the real-unload path (`manager.ts:406` branch).
2. Auto-pass pending invariants from the old page as "all-clear" signal — mirrors the real-unload invariant handling.
3. Call `loadAssertions()` from `src/assertions/storage.ts` to reload any MPA assertions persisted from storage so they can resolve against the new DOM.
4. Run the route resolver against the new URL (already happens).

This fix is framework-agnostic — it fixes hx-boost, React Router, Vue Router, and any other SPA that uses pushState.

**Regression risk:** the existing TanStack example uses pushState via TanStack Router and relies on route assertions firing on nav. The existing behavior (route resolver fires on nav) must be preserved. The new behavior only ADDS lifecycle cleanup — it must not fail assertions that the TanStack example expects to stay pending across a route change. Verify by running the existing TanStack example end-to-end after the fix.

**Fix 2: MPA + SPA footgun — document, don't runtime-check.**

`fs-assert-mpa="true"` is incompatible with hx-boost because MPA assertions persist to localStorage and reload on `DOMContentLoaded`, which hx-boost never re-fires. Fix 1 (`loadAssertions()` on virtual nav) partially resolves this — MPA assertions will now reload. But the semantics get fuzzy: MPA is supposed to mean "I expect this to happen on the NEXT page, not this one." In a virtual nav there's no clear boundary.

Decision: ship Fix 1's `loadAssertions()` call (which handles the common case) and document the nuance in `common-patterns.md` — MPA mode is designed for hard nav, and in SPA routing the assertion resolves as soon as the virtual nav lands. No runtime warning needed.

**Fix 3: OOB stale-element reference — already safe.**

Audit confirmed OOB firing uses `document.querySelectorAll()` at fire time, not cached element refs. No fix needed. Noted here to close the audit loop.

### Documentation updates

**`skills/faultsense-instrumentation/references/framework-syntax.md`** — add a new section:

```markdown
## HTMX + server templates (EJS / Handlebars / Nunjucks / ERB)

fs-* attributes are plain HTML — server templates render them unchanged. The
React JSX pattern for dynamic assertion values translates directly to
server-side interpolation.

<input type="checkbox"
  <%= todo.completed ? 'checked' : '' %>
  fs-assert="todos/toggle-complete"
  fs-trigger="change"
  fs-assert-updated=".todo-item[classlist=completed:<%= !todo.completed %>]">

Interpolate the EXPECTED NEXT STATE into the attribute — the same pattern as
React JSX. The server already knows the current state, so compute the negation
in the template.

**HX-Trigger header for emitted assertions.** HTMX reads the `HX-Trigger`
response header and dispatches a CustomEvent on body after the swap settles:

    HX-Trigger: {"todo:added": {"text": "buy milk"}}

The event bubbles to document, so `fs-assert-emitted="todo:added"` works
without any client-side dispatch code. This is the recommended async dispatch
path for HTMX apps — it avoids the "synchronous dispatch in the click handler"
footgun.

**hx-swap-oob is NOT fs-assert-oob.** `hx-swap-oob` is HTMX's mechanism for
out-of-band DOM delivery. `fs-assert-oob` is Faultsense's mechanism for
assertion routing. They share a name but are orthogonal — you can use one,
both, or neither.

**Preserve instrumentation across OOB swaps.** Prefer
`hx-swap-oob="innerHTML:#target"` over `hx-swap-oob="true"`. innerHTML replaces
only the children, leaving the target element and its fs-* attributes intact
across swaps. outerHTML replaces the element and loses any fs-* not
re-rendered.
```

**`skills/faultsense-instrumentation/references/common-patterns.md`** — add an "HTMX-specific gotchas" section:

1. **Use HX-Location, not HX-Redirect, for SPA nav.** HX-Redirect triggers a hard reload — agent re-initializes, pending assertions are lost. HX-Location does a client-side fetch + pushState, preserving the agent session and letting `fs-assert-route` resolve naturally.
2. **Error responses don't swap by default.** HTMX drops 4xx/5xx response bodies. For `fs-assert-*-error` to fire, either (a) return 200 with an error fragment, (b) use the `response-targets` extension + `hx-target-error`, or (c) set `htmx.config.responseHandling` to swap error statuses.
3. **Focus is not automatic on swap.** For `[focused=true]` modifiers on swapped inputs, add `autofocus` on the input or use `hx-on::after-settle="this.querySelector('input').focus()"`.
4. **Form submit still fires under HTMX.** HTMX calls `preventDefault()` on the submit event AFTER listeners have run. `fs-trigger="submit"` and `fs-trigger="click"` on a boosted form both work unchanged.
5. **MPA mode is for hard nav, not hx-boost.** In an hx-boost app, MPA assertions will resolve immediately on the virtual nav (after Fix 1 lands). For cross-page persistence with hx-boost, skip MPA — the agent session persists naturally.
6. **Scope stable assertions carefully.** `fs-assert-stable="#foo"` fails if any swap touches `#foo`. If `#foo` is inside `hx-target`, stable will fail on every swap. Use `fs-assert-stable` on elements OUTSIDE the swap target.

### Phasing

**Phase 1: scaffold.**

- `package.json`, `server.js`, `layout.ejs`, route stubs, static assets.
- Copy `faultsense-agent.min.js` + `faultsense-panel.min.js` from `dist/` to `public/`. Pin HTMX 2.0.8.
- Placeholder `/login` and `/todos` pages rendering minimal HTML.
- Smoke test: boot, verify hx-boost works, verify Faultsense panel initializes and shows zero assertions, verify navigation doesn't error.

**Phase 2: CRUD + UI parity (no fs-\* yet).**

- `lib/store.js` — port the in-memory store, seeds, SLOW + FAIL logic from `examples/todolist-tanstack/src/server/todos.ts`.
- Implement all CRUD routes with EJS partials.
- Port all CSS inline styles. UI must be visually identical to TanStack example.
- Verify: add, toggle, edit, delete, SLOW, FAIL all work without fs-* attributes.

**Phase 3: instrumentation port.**

- Add `fs-*` attributes one assertion at a time, verifying each fires in the panel.
- Follow the instrumentation mapping table above.
- Record any gotcha that appears but isn't in the plan — compound into a `docs/solutions/` file at the end.

**Phase 4: agent fixes.**

- Implement Fix 1 (virtual-nav lifecycle) in `src/interceptors/navigation.ts` + `src/assertions/manager.ts`.
- Regression-test the existing TanStack example end-to-end.
- Verify the three broken assertions in the HTMX example (invariant across nav, MPA nuance, pending assertion cleanup) now behave correctly.
- Run `npm test` — no vitest regressions.
- Run `npm run build` and `npm run build:size`. If the gzipped bundle size shifts, update `README.md` and `SKILL.md` per the feedback rule.

**Phase 5: documentation.**

- Extend `framework-syntax.md` with the HTMX section above.
- Extend `common-patterns.md` with the HTMX gotchas section above.
- Write `examples/todolist-htmx/README.md`: run instructions, what the demo shows, how it compares to the TanStack example, a pointer to the gotchas doc.
- Cross-link from the root `README.md` examples section to both todolist variants.

**Phase 6: compound.**

- After the port lands and works end-to-end, run `/ce:compound` to codify any new institutional knowledge (gotchas discovered during Phase 3, any new resolver behavior from Fix 1, template-interpolation pattern for dynamic values).

## System-wide impact

### Interaction graph

User clicks Add → native submit event fires → Faultsense capture-phase listener creates the `todos/add-item` assertion → HTMX `preventDefault`s, POSTs → server returns 200 with `todo-item.ejs` partial + `HX-Trigger: todo:added` header → HTMX swaps into `#todo-list` (`beforeend`) → `htmx:afterSettle` → HTMX dispatches `todo:added` CustomEvent on body → event bubbles to document → Faultsense emitted resolver fires (`todos/add-item` success branch completes) → added resolver fires (new `.todo-item` detected, count matches expected) → `todos/add-item` completes → OOB processor fires the queued OOB assertions (`count-updated`, `item-count-correct`) → server's `hx-swap-oob` partial updates `#todo-count` innerHTML → OOB resolvers verify → Activity Log inline JS also receives the bubbled CustomEvent → prepends `.log-entry` → `activity/log-updated` resolver fires.

### Error propagation

- Server 500 on any HTMX request → HTMX drops the body (default `responseHandling`), fires `htmx:responseError` on the trigger element → Faultsense sees no mutation → pending assertions time out via SLA or GC. This is why we deliberately return 200 with error fragments instead of 500 on expected error paths (FAIL delete, empty add).
- Hard nav via HX-Redirect would re-init the agent and drop pending assertions. Avoided by using HX-Location for login/logout.
- `hx-swap` error during swap → `htmx:swapError` fires → no DOM mutation → assertions time out. Deferred — not a demo case.

### State lifecycle risks

- In-memory store resets on server restart. Acceptable for a demo — matches the TanStack example.
- No persistent state crosses processes. No migration concerns.
- Cross-page assertion leak is the real lifecycle risk, addressed by Fix 1.

### API surface parity

- REST endpoints: POST /login, POST /logout, GET /todos, POST /todos, PATCH /todos/:id/toggle, POST /todos/:id (update text), DELETE /todos/:id, GET /todos/:id/edit (partial), GET /todos/:id/cancel-edit (partial).
- The TanStack example uses TanStack Server Functions (a POST RPC style). The HTMX example uses a proper REST surface. This difference is intentional — HTMX is idiomatic REST.
- Assertion keys are 1:1 with the TanStack example. Every assertion key in the React version exists in the HTMX version with equivalent semantics.

### Integration test scenarios

1. **Happy-path loop.** Add → toggle → edit → save → delete → add. Every assertion fires green in the panel. Count display updates after each change. No stale pending assertions.
2. **SLOW todo.** Add "SLOW" — server delays 2s, fs-assert-timeout=500 fails. Panel shows timeout failure with the expected reason.
3. **FAIL delete.** Delete a "FAIL" todo — server returns 200 + error fragment → `fs-assert-added-error` wins the mutex, `fs-assert-removed-success` dismissed. Panel shows the conditional error branch.
4. **Full nav loop.** Login → todos → logout → login → todos (via hx-boost twice). Before Fix 1: assertion leak, invariants hang, MPA assertions orphaned. After Fix 1: every loop is clean, no cruft in localStorage, no leaked pending assertions.
5. **Rapid interactions.** Mash the Add button 5 times fast. Re-trigger tracking records attempts; no assertion overlap or loss.
6. **Title invariant violation.** Click the title to hide it. Invariant fails and shows in the panel, same as TanStack example. Recovers if the title becomes visible again via dev tools.
7. **Offline toggle.** Use dev tools to simulate offline — offline banner assertion fires. Go back online — banner-hidden assertion fires.
8. **Regression on TanStack example.** After Fix 1 lands, re-run the TanStack example end-to-end. Every assertion still fires, no new failures.

## Acceptance criteria

### Functional (example)

- [ ] `npm install && npm run dev` in `examples/todolist-htmx/` boots on port 3001
- [ ] Login with `demo`/`demo` navigates to `/todos` via hx-boost (no full reload)
- [ ] UI is visually indistinguishable from `examples/todolist-tanstack/` (same fonts, spacing, colors, copy)
- [ ] Every fs-* assertion in the TanStack example has a semantic equivalent in the HTMX example
- [ ] Every assertion resolves green in the happy path with `debug: true`
- [ ] SLOW todo triggers the 500ms SLA timeout failure
- [ ] FAIL todo delete triggers the conditional error branch
- [ ] GC demo button triggers a GC-timeout failure for `.never-exists`
- [ ] Logout returns to `/login` without full reload
- [ ] No console errors in the happy path
- [ ] `hx-boost="true"` is set on `<body>` and works on all links/forms

### Agent fixes

- [ ] `src/interceptors/navigation.ts` — URL-path change detection (compare old vs new pathname before invoking handler)
- [ ] `src/assertions/manager.ts` — `handleVirtualNav()` runs the unload-style flush for non-invariant/non-route assertions
- [ ] Pending invariants auto-pass on virtual nav as "all-clear"
- [ ] `loadAssertions()` runs on virtual nav to reload MPA assertions from localStorage
- [ ] Existing TanStack example still passes end-to-end (regression check)
- [ ] `npm test` — no vitest regressions
- [ ] New vitest coverage for the virtual-nav lifecycle path

### Documentation

- [ ] `skills/faultsense-instrumentation/references/framework-syntax.md` — HTMX section added
- [ ] `skills/faultsense-instrumentation/references/common-patterns.md` — HTMX gotchas section added (6 items)
- [ ] `examples/todolist-htmx/README.md` — run, demo, and cross-link to TanStack example
- [ ] Root `README.md` examples list updated to mention both variants
- [ ] If bundle size shifts, update gzipped size in README.md and SKILL.md per feedback rule

### Quality gates

- [ ] `npm run build` produces valid `dist/faultsense-agent.min.js`
- [ ] `npm run build:size` — record any delta in plan completion notes
- [ ] All three audit bugs (virtual nav leak, invariant-across-nav, MPA + hx-boost) are fixed or documented
- [ ] Compound doc written in `docs/solutions/` capturing any new gotcha surfaced during Phase 3

## Success metrics

- Every assertion in the HTMX example passes green in manual testing of the happy path.
- Conditional failure paths (SLOW timeout, FAIL delete) trigger the expected error branches.
- After Fix 1, navigating login → todos → logout → login three times leaves zero orphaned assertions in the panel or localStorage.
- HTMX section of the framework syntax doc makes porting to a third framework (Vue, Svelte, plain HTML) a mechanical exercise, not a research project.

## Dependencies & risks

**Dependencies:**
- HTMX 2.0.8 (current stable) — https://cdn.jsdelivr.net/npm/htmx.org@2.0.8/dist/htmx.min.js
- Express 4 or 5 + EJS 3
- Agent Fix 1 must land before the HTMX example's nav flow fully validates. Acceptable sequence: port lands with a known issue flag → Fix 1 lands → port flag removed.

**Risks:**

- **Agent Fix 1 regresses TanStack example.** Virtual-nav flush changes behavior on pushState. Must preserve TanStack auth/login and auth/logout route assertions. Mitigation: explicit regression test after the fix, run the existing example end-to-end before shipping.
- **HX-Location subtleties.** HTMX's HX-Location re-issues a boosted fetch to the new URL. If the backend sends the full page HTML for the target, HTMX swaps `body` innerHTML — which must not break the script tags (Faultsense + panel must be loaded once, in the layout, and survive the swap). Mitigation: layout renders scripts in `<head>` with `defer`; body innerHTML swap preserves head → scripts stay loaded.
- **OOB partial collisions.** If both a primary swap (e.g., outerHTML on a todo-item) and an OOB swap (innerHTML:#todo-count) arrive in the same response, HTMX applies both. Faultsense's OOB processor queues off parent assertion resolution, which happens after both swaps settle. Order is fine — but worth watching during Phase 3 testing.
- **Focus timing on edit.** `[focused=true]` on the edit input may race with HTMX's autofocus handling. Fallback: `hx-on::after-settle="this.querySelector('input').focus()"`.
- **React-version's `fs-assert-visible` on stable-lifetime elements could translate to a race.** The TanStack version uses `visible` for elements that persist across renders; in HTMX these are rendered fresh on swap — `visible` checks query the live DOM, fine. No fix needed, just verify during Phase 3.

## Sources & references

**Origin:** No brainstorm — direct feature request from user with explicit clarification on navigation mode (hx-boost), backend (Express + EJS), and sharing (fully standalone) via AskUserQuestion.

**Research agents used during planning:**

1. **Repo audit (Explore)** — `/Users/mitch/src/faultsense-agent/src/` HTMX risk audit. Identified 3 high-risk bugs (hx-boost unload leak, invariant across boost, MPA + boost), 3 medium-risk (event/mutation timing, form submit timing, stale OOB refs), 2 low-risk (custom event bubbling, mutation firehose). File:line evidence captured in the audit.
2. **HTMX 2.x docs researcher** — canonical docs for hx-boost semantics, event lifecycle, swap modes, error handling defaults, form submission, hx-push-url, hx-swap-oob, focus/scroll preservation, event listener lifecycle on swapped content, idiomatic Express + EJS + HTMX patterns. Key URLs captured in the doc section below.
3. **Learnings researcher** — found two directly-applicable past solutions.

**Past learnings applied:**

- `docs/solutions/logic-errors/gc-timeout-refactor-and-instrumentation-patterns.md` — Problem 5: use `fs-assert-updated` (not `added`) for in-place list item updates. Directly applies to the HTMX port because server-rendered partials swap in identical structures. Problem 6: blur fires before click, put assertions on the element whose event actually fires the server call, not on a button that gets swapped away.
- `docs/solutions/logic-errors/assertion-pipeline-extension-ui-conditional-and-invariant-triggers.md` — Problem 2: discovery piggybacks on MutationObserver's existing fs-* scan, no parallel path. Means the port needs zero framework glue for assertion discovery.

**Internal references:**

- React example to port: `examples/todolist-tanstack/src/routes/todos.tsx`, `src/routes/login.tsx`, `src/components/{TodoList,TodoItem,AddTodo,GettingStarted,ActivityLog}.tsx`, `src/server/todos.ts`
- Agent source touched by Fix 1: `src/interceptors/navigation.ts:4-17`, `src/assertions/manager.ts:285` (handleNavigation), `src/assertions/manager.ts:406` (handlePageUnload), `src/assertions/storage.ts:7` (loadAssertions), `src/processors/mutations.ts:3-32`, `src/processors/elements.ts:201-219`
- Skills to update: `skills/faultsense-instrumentation/SKILL.md`, `skills/faultsense-instrumentation/references/framework-syntax.md`, `skills/faultsense-instrumentation/references/common-patterns.md`

**External references:**

- HTMX docs: https://htmx.org/docs/
- HTMX events: https://htmx.org/events/
- HTMX reference (headers, config): https://htmx.org/reference/
- `hx-boost`: https://htmx.org/attributes/hx-boost/
- `hx-swap`: https://htmx.org/attributes/hx-swap/
- `hx-swap-oob`: https://htmx.org/attributes/hx-swap-oob/
- `hx-push-url`: https://htmx.org/attributes/hx-push-url/
- Response handling / error handling: https://htmx.org/docs/#response-handling
- response-targets extension (optional): https://htmx.org/extensions/response-targets/
- Express template engines: https://expressjs.com/en/guide/using-template-engines.html
- HTMX 2.0.8 CDN: https://cdn.jsdelivr.net/npm/htmx.org@2.0.8/dist/htmx.min.js
