# Layer 2 — Per-framework conformance harnesses

Layer 2 of the cross-stack conformance strategy. Drivers under this directory run real framework apps in a real browser (Chromium via Playwright) and verify that every assertion in the catalog resolves end-to-end. If a driver surfaces a bug Layer 1 didn't predict, the workflow is to extract the mutation pattern class, lock it into Layer 1 as a new `PAT-NN`, and then fix the agent.

See [`docs/mutation-patterns.md`](../docs/mutation-patterns.md) for the pattern catalog and [`CLAUDE.md`](../CLAUDE.md#conformance-strategy) for the overall strategy.

## Running

```bash
# One-time: install the Chromium build Playwright uses.
npm run conformance:install

# One-time per harness: install its own devDeps.
(cd conformance/vue3 && npm install)
# examples/todolist-tanstack is already installed if you've run the demo.

# Run every driver.
npm run conformance

# Run a single framework.
npm run conformance -- --project=tanstack
npm run conformance -- --project=vue3
```

`npm run conformance` is NOT wired into `npm test`. Layer 1 (jsdom) stays fast; Layer 2 boots real dev servers and takes longer. CI runs both as parallel jobs.

## Directory layout

```
conformance/
├── README.md             # this file
├── playwright.config.ts  # one project per framework, with its own webServer
├── shared/
│   ├── collector.js      # in-page collector — pushes assertions onto window.__fsAssertions
│   └── assertions.ts     # Playwright helpers: waitForFsAssertion, assertPayload, etc.
├── drivers/
│   ├── tanstack.spec.ts  # driver for examples/todolist-tanstack
│   ├── htmx.spec.ts      # Phase 3.x — driver for examples/todolist-htmx
│   ├── vue3.spec.ts      # Phase 4 — driver for conformance/vue3/
│   └── hotwire.spec.ts   # Phase 5 — driver for conformance/hotwire/ (Rails)
├── vue3/                 # Phase 4 — minimal Vue 3 harness app
├── hotwire/              # Phase 5 — minimal Rails + Turbo + Stimulus harness app
└── scripts/
    └── generate-matrix.js  # Phase 6 — post-test works-with matrix generator
```

## How the in-page collector works

Each harness loads `conformance/shared/collector.js` before the Faultsense agent script. The collector registers `window.Faultsense.collectors.conformance`, which the agent resolves by name via `data-collector-url="conformance"` on its own script tag (see [`src/index.ts:151-161`](../src/index.ts#L151)).

Assertions are JSON-cloned on capture so post-settlement mutations (invariant auto-retry, sibling dismissal) don't corrupt the recorded snapshot. Drivers read them with `await page.evaluate(() => window.__fsAssertions)` — the `readCapturedAssertions` / `waitForFsAssertion` helpers wrap that pattern.

## Reusing the existing example apps

The tanstack and htmx harnesses reuse `examples/todolist-*` in place. The only change inside `examples/` is a collector-mode switch driven by a build-time environment variable: the demo default is the panel collector; `VITE_FS_COLLECTOR=conformance npm run dev` flips the root layout to load `collector.js` and set `data-collector-url="conformance"`. Playwright's `webServer` entry sets the env var when it spawns the dev server, so the demo UX is unchanged for humans.

## Adding a new framework harness

1. Scaffold the harness under `conformance/<framework>/` using that framework's natural backend. HTMX and React are language-agnostic; **Hotwire must use Rails, Livewire must use Laravel, LiveView must use Phoenix** — see [the plan's Q6 decision](../docs/plans/2026-04-10-002-feat-cross-stack-conformance-plan.md) for the rationale.
2. Load `../../shared/collector.js` (or a symlink in the harness's public directory) before the agent script tag in the harness's layout. Use `data-collector-url="conformance"` on the agent script.
3. Add a `webServer` entry to `playwright.config.ts` pointing at the harness's dev-server command and a dedicated port.
4. Add a project entry alongside the existing ones in the same file.
5. Add `drivers/<framework>.spec.ts` using the helpers in `shared/assertions.ts`. Reuse test names across drivers so the Phase 6 matrix generator can correlate results.
6. If the harness uses a native toolchain (Ruby for Rails, PHP for Laravel, Elixir for Phoenix), document the prerequisites here and add the corresponding `setup-*` action to the CI workflow.

## Skipping polyglot harnesses locally

Contributors without Ruby / PHP / Elixir can still run Layer 1 and the Node-only harnesses. Skip polyglot projects explicitly:

```bash
npm run conformance -- --project=tanstack --project=htmx --project=vue3
```

CI installs each toolchain on demand so the full matrix always runs there.
