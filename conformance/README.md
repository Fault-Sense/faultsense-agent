# Layer 2 — Per-framework conformance harnesses

Layer 2 of the cross-stack conformance strategy. Drivers under this directory run real framework apps in a real browser (Chromium via Playwright) and verify that every assertion in the catalog resolves end-to-end. If a driver surfaces a bug Layer 1 didn't predict, the workflow is to extract the mutation pattern class, lock it into Layer 1 as a new `PAT-NN`, and then fix the agent.

See [`docs/mutation-patterns.md`](../docs/mutation-patterns.md) for the pattern catalog and [`CLAUDE.md`](../CLAUDE.md#conformance-strategy) for the overall strategy.

## Running

```bash
# One-time: install the Chromium build Playwright uses.
npm run conformance:install

# One-time per Node harness: install its own devDeps.
(cd conformance/react && npm install)
(cd conformance/vue3  && npm install)
(cd conformance/htmx  && npm install)

# One-time for the Rails harness: build the Docker image. Playwright
# will also auto-build on first run, but doing it upfront keeps the
# first `npm run conformance` from blocking on a 5-minute image build.
docker compose -f conformance/hotwire/docker-compose.yml build

# Run every driver.
npm run conformance

# Run a single framework.
npm run conformance -- --project=react
npm run conformance -- --project=vue3
npm run conformance -- --project=hotwire
npm run conformance -- --project=htmx
```

### Port map

| Harness  | Port | Runtime | Backend |
|----------|------|---------|---------|
| react    | 3100 | vite dev | Node (Vite + React 19 + StrictMode) |
| vue3     | 3200 | vite dev | Node (Vite + Vue 3 Composition API) |
| hotwire  | 3300 | docker compose | Rails 8 + Turbo 8 in `ruby:3.3-slim` |
| htmx     | 3400 | node   | Express + EJS + HTMX 2 from CDN |

### Prerequisites

- **Node.js** for `react`, `vue3`, and `htmx`. No additional setup beyond `npm install` in each harness directory.
- **Docker + Docker Compose** for `hotwire`. No native Ruby or Rails install on the host — everything runs inside `ruby:3.3-slim`. Contributors without Docker can skip the Rails harness with `--project=react --project=vue3 --project=htmx`.

### Suggested CI workflow

The repo does not currently have a `.github/workflows/` directory. When you're ready to wire Layer 2 into CI, the following workflow runs Layer 1 and all four Layer 2 harnesses in parallel jobs with per-toolchain caching:

```yaml
# .github/workflows/conformance.yml
name: conformance
on:
  pull_request:
  push:
    branches: [main]

jobs:
  layer1:
    name: Layer 1 — jsdom unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: "npm" }
      - run: npm ci
      - run: npm run build:agent
      - run: npm test

  layer2:
    name: Layer 2 — Playwright harnesses
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: "npm" }
      - uses: ruby/setup-ruby@v1
        with: { ruby-version: "3.3", bundler-cache: true, working-directory: conformance/hotwire }
      - run: npm ci
      - run: npm run build:agent
      - run: (cd conformance/react && npm ci)
      - run: (cd conformance/vue3 && npm ci)
      - run: (cd conformance/htmx && npm ci)
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ hashFiles('package-lock.json') }}
      - run: npm run conformance:install
      - run: npm run conformance:matrix
      - name: Upload works-with snapshot
        uses: actions/upload-artifact@v4
        with: { name: works-with, path: docs/works-with.md }
      - name: Fail if the committed matrix drifted
        run: git diff --exit-code docs/works-with.md
```

The final step is the interesting one: it fails CI if the regenerated matrix doesn't match the committed snapshot, which forces contributors to re-run `npm run conformance:matrix` whenever they add a scenario or harness. No matrix drift.

### `conformance/` vs `examples/` — who owns what

`conformance/` is where Layer 2 lives. Every harness is purpose-built minimal: one page, one driver, 8–10 focused scenarios, one webServer entry in `playwright.config.ts`. Harnesses are regression infrastructure — they stay stable so the matrix stays meaningful.

`examples/` is where the human-facing demos live. `examples/todolist-tanstack/` is a full TanStack Start + React 19 app with auth, routing, offline banner, activity log, and the panel collector overlay. `examples/todolist-htmx/` is an Express + EJS + HTMX 2 app of similar scope. These exist for marketing, onboarding, and manual exploration. **They are not driven by the conformance suite** — polish them freely, animate them, restyle them; the conformance tests will not break.

When you want to know "how do I instrument a real Vue 3 app?", read `conformance/vue3/src/App.vue` for the minimal form and `docs/framework-integration-notes.md` for the gotchas. When you want to show a prospect what Faultsense looks like in a polished app, point them at `examples/todolist-tanstack/`.

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
