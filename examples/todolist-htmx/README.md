# todolist-htmx

Faultsense todolist demo ported to **HTMX 2 + Express + EJS**. A line-for-line port of `examples/todolist-tanstack/` — same UI, same copy, same assertion coverage — built to prove Faultsense works identically against server-rendered HTML swaps as it does against React's virtual DOM.

## Why this exists

Faultsense is framework-agnostic in theory. This example is the proof: the same `fs-*` attributes, same assertion keys, same resolvers — but rendered by Express instead of React. If you can read the React version, you can read this one. If you're porting to another stack (Vue, Svelte, Alpine, Hotwire), start from the instrumentation mapping in this example.

## Run it

```bash
cd examples/todolist-htmx
npm install
npm run dev
# http://localhost:3099
```

Log in with `demo` / `demo`.

## What you're looking at

Every interaction is monitored by a Faultsense assertion. Open the panel in the bottom-right to see them fire green as you interact. 17 assertion keys cover the whole flow — add, toggle, edit, cancel, delete, navigation, invariants, and the activity log.

Assertion keys are **identical** to the React example, so you can diff the two apps side by side and see how the same correctness contract expresses in two very different paradigms.

### Demos worth trying

| Action | What happens | Which assertion demonstrates it |
|---|---|---|
| Add a todo | New row appears, count updates, activity log updates | `todos/add-item`, `todos/count-updated`, `activity/log-updated` |
| Add `SLOW` | 2-second server delay trips the 500 ms SLA timeout | `todos/add-item` (timeout branch) |
| Add `FAIL`, then delete it | Server refuses the delete, inline error appears | `todos/remove-item` (error branch via `mutex="each"`) |
| Click "GC Demo" | Assertion targets a never-existing selector; GC sweeps it | `demo/gc-timeout` |
| Click the title | Hidden via inline JS → invariant violation in the panel | `layout/title-visible` (invariant) |
| Toggle offline in devtools | Offline banner appears and disappears | `network/offline-banner-shown` / `hidden` |
| Logout, then log back in | Virtual nav via hx-boost, route assertions fire | `auth/login`, `auth/logout` |

## How it's wired

- **`server.js`** — Express boot, layout helper, static assets.
- **`routes/auth.js`** — login/logout. Uses `HX-Location` (not `HX-Redirect`) so the agent session is preserved across virtual nav.
- **`routes/todos.js`** — CRUD. Every mutation response includes `partials/mutation-oob.ejs` — an OOB bundle that re-renders count displays and assertion attributes whose values depend on the current list length.
- **`views/layout.ejs`** — `<body hx-boost="true">` enables SPA-like nav. Script tags load `faultsense-panel.min.js`, `faultsense-agent.min.js`, and `htmx.min.js`.
- **`views/pages/`** — full-page templates (login, todos) that extend the layout.
- **`views/partials/`** — EJS fragments HTMX swaps in (todo-item, edit variant, error variants, OOB bundles, activity log, getting started).
- **`lib/store.js`** — in-memory todos with `SLOW` / `FAIL` demo behavior. Resets on server restart.
- **`lib/hx.js`** — `renderPage` (full page) and `renderFragment` (partial) helpers.

Faultsense and HTMX are symlinked from the repo-level `dist/`, so a rebuild of the agent immediately updates both examples without a copy step:

```bash
cd ../..
npm run build
# no copy needed — both examples now serve the new bundle
```

## HTMX gotchas surfaced by this port

Writing this port surfaced several HTMX-specific patterns worth knowing about. They're documented in full at `skills/faultsense-instrumentation/references/common-patterns.md` and `skills/faultsense-instrumentation/references/framework-syntax.md`. Short summary:

1. **Use `HX-Location`, not `HX-Redirect`.** HX-Redirect is a hard reload and drops pending assertions; HX-Location is client-side nav via fetch + pushState.
2. **Error responses don't swap by default.** Return 200 with an error fragment and route it via `HX-Retarget` / `HX-Reswap` for `fs-assert-*-error` to fire.
3. **`HX-Trigger` response header is the async dispatch path for `fs-assert-emitted`.** Avoids the synchronous-dispatch footgun.
4. **`fs-assert-oob` is not `hx-swap-oob`.** Same name, orthogonal concepts.
5. **Prefer `hx-swap-oob="innerHTML:#target"` over `outerHTML`** to preserve `fs-*` attributes on long-lived elements.
6. **Interpolate dynamic assertion values with `<%= expr %>` the same way you'd use JSX `{expr}`.** See the toggle checkbox in `views/partials/todo-item.ejs`.
7. **Stale attribute values on long-lived elements require an OOB re-render.** The Add button's `fs-assert-added-success=".todo-item[count=N]"` goes stale after every add/delete; the `mutation-oob.ejs` partial re-renders the button via `hx-swap-oob="outerHTML:#add-todo-button"` on every mutation response.

## Agent fix that shipped with this port

Porting the TanStack example forced a real agent bug into the open: SPA navigation via `history.pushState` (which is what hx-boost uses) never fired the same lifecycle flush as a real page unload. Pending assertions from the old "page" leaked into the next virtual page, invariants never auto-passed, and MPA-mode assertions in localStorage were never reloaded.

The fix is framework-agnostic — it's in the navigation interceptor, not HTMX-specific code. Any SPA router that uses `history.pushState` (React Router, Vue Router, TanStack Router, Solid Router, htmx hx-boost) now gets a clean virtual-nav lifecycle. See the commit `fix(agent): virtual-nav lifecycle for pushState path changes` and `tests/assertions/virtual-nav.test.ts` for the details.
