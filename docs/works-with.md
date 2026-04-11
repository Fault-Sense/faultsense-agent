# Works with

Generated from Layer 2 conformance test runs. This matrix is the source of truth — do not hand-edit it. Re-run `npm run conformance:matrix` after adding a scenario or harness.

_Last updated: 2026-04-11 · 34 tests across 4 frameworks_

## Per-framework coverage

| Framework | Passing | Total |
|---|---|---|
| **hotwire** ✓ | 7 | 7 |
| **htmx** ✓ | 7 | 7 |
| **react** ✓ | 10 | 10 |
| **vue3** ✓ | 10 | 10 |

## Scenario coverage

| Scenario | hotwire | htmx | react | vue3 |
|---|---|---|---|---|
| `actions/log-updated` | ○ | ○ | ✓ | ✓ |
| `guide/advance-after-add` | ○ | ○ | ✓ | ✓ |
| `layout/empty-state-shown` | ✓ | ✓ | ✓ | ✓ |
| `layout/title-visible` | ✓ | ✓ | ✓ | ✓ |
| `todos/add-item` | ✓ | ✓ | ✓ | ✓ |
| `todos/char-count-updated` | ✓ | ✓ | ✓ | ✓ |
| `todos/count-updated` | ✓ | ✓ | ✓ | ✓ |
| `todos/edit-item` | ○ | ○ | ✓ | ✓ |
| `todos/remove-item` | ✓ | ✓ | ✓ | ✓ |
| `todos/toggle-complete` | ✓ | ✓ | ✓ | ✓ |

**Legend:** ✓ passing · ✗ failing · ○ not exercised by this harness

## Mutation-pattern (PAT-NN) coverage

Layer 1 locks every PAT in synthetically via the jsdom conformance suite under `tests/conformance/`. The table below shows which PATs each framework **additionally** exercises empirically through its Layer 2 harness — the more ✓ cells here, the more real-framework evidence backs up the Layer 1 regression lock. An empty row means no scenario in any harness currently exercises that pattern empirically.

| Pattern | hotwire | htmx | react | vue3 |
|---|---|---|---|---|
| [PAT-01](mutation-patterns.md#pat-01-pre-existing-target) | ○ | ○ | ○ | ○ |
| [PAT-02](mutation-patterns.md#pat-02-delayed-commit-mutation) | ✓ | ✓ | ✓ | ✓ |
| [PAT-03](mutation-patterns.md#pat-03-outerhtml-replacement) | ✓ | ✓ | ✓ | ✓ |
| [PAT-04](mutation-patterns.md#pat-04-morphdom-preserved-identity) | ○ | ○ | ○ | ○ |
| [PAT-05](mutation-patterns.md#pat-05-detach-reattach) | ✓ | ✓ | ✓ | ✓ |
| [PAT-06](mutation-patterns.md#pat-06-text-only-mutation) | ✓ | ✓ | ✓ | ✓ |
| [PAT-07](mutation-patterns.md#pat-07-microtask-batching) | ✓ | ✓ | ✓ | ✓ |
| [PAT-08](mutation-patterns.md#pat-08-cascading-mutations) | ✓ | ✓ | ✓ | ✓ |
| [PAT-09](mutation-patterns.md#pat-09-hydration-upgrade) | ○ | ○ | ○ | ○ |
| [PAT-10](mutation-patterns.md#pat-10-shadow-dom-traversal) | ○ | ○ | ○ | ○ |

**Legend:** ✓ empirically exercised by this harness · ○ not exercised at Layer 2 (Layer 1 still covers it)

## How to add a framework to this matrix

1. Scaffold a minimal harness under `conformance/<framework>/` following the vue3 / react / htmx / hotwire examples.
2. Add a Playwright project + `webServer` entry in `conformance/playwright.config.ts`.
3. Write `conformance/drivers/<framework>.spec.ts` mirroring the scenario names in the other drivers (so the matrix rows line up).
4. Run `npm run conformance:matrix` — the generator updates this file automatically from the new results.
5. If your harness exercises a new mutation pattern not in the catalog, add a `PAT-NN` test under `tests/conformance/` first and update the `SCENARIO_TO_PAT` map in `conformance/scripts/generate-matrix.js` so the PAT coverage table reflects it.
