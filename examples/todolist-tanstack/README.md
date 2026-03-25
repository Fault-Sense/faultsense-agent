# Faultsense Todo Demo — TanStack Start

A kitchen-sink demo of [Faultsense](https://faultsense.org) production assertion monitoring, built with TanStack Start (SSR React framework).

Every user interaction is monitored by Faultsense assertions. The panel collector in the bottom-right corner shows pass/fail results in real time.

## Run It

```bash
npm install
npm run dev
```

Open http://localhost:3000. Interact with the todos and watch the Faultsense panel.

## What's Instrumented

| Action | Assertion Key | What It Checks |
|--------|--------------|----------------|
| Add a todo | `todos/add-item` | New `.todo-item` appears in the DOM (`added`) |
| Click Edit | `todos/edit-item` | Edit input appears in the DOM (`added`) |
| Save edit | `todos/save-edit` | Edit input removed (`removed`) + text updates (`updated` with `text-matches`) |
| Toggle checkbox | `todos/toggle-complete` | Todo gets `completed` class (`updated` with `classlist`) |
| Delete a todo | `todos/remove-item` | Response-conditional: removed on 200, error on 4xx (`removed-200`, `added-4xx`) |
| Empty state | `todos/empty-state` | Empty message is visible on mount (`mount` trigger + `visible`) |

This covers 5 of 6 assertion types, 3 trigger types, both modifier types, and response-conditional assertions.

## How Faultsense Loads

The agent and panel collector are loaded as `<script defer>` tags in the document `<head>` via TanStack Start's `head()` API in `src/routes/__root.tsx`. Both use `defer` to guarantee execution in document order before `DOMContentLoaded`. The panel collector script loads before the agent script so it can register before auto-init.

## Faultsense Scripts

The `public/` directory contains symlinks to `../../dist/` — so the example always uses the latest agent build. Run `npm run build` from the agent repo root to update.

## Things to Try

- **Click "Add" with an empty input** — the assertion fails (red in the panel). This is Faultsense catching a silent failure: the user clicked a button that should add a todo, but nothing was added. No error was thrown, no UI feedback was shown — the feature just silently didn't work. This is exactly what Faultsense is built to detect.
- **Delete all todos** — the empty state `mount` assertion fires, proving the empty state rendered.
- **Toggle a checkbox** — the `classlist` modifier verifies the correct todo got the `completed` class, even when React re-renders the entire list.

## Notes

- Todos are stored in-memory on the server — data resets on server restart.
- The app seeds with 3 example todos so it's never empty on first load.
- `fs-*` attributes are standard HTML and survive SSR rendering and React hydration.
