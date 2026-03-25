---
title: "feat: Faultsense AI Skill and TanStack Start Todolist Demo"
type: feat
status: completed
date: 2026-03-25
---

# feat: Faultsense AI Skill and TanStack Start Todolist Demo

## Overview

Build two interconnected deliverables: (1) a distributable Claude Code plugin containing a framework-agnostic skill that teaches any AI coding agent how to instrument web applications with Faultsense `fs-*` assertion attributes, and (2) a TanStack Start SSR todolist demo app that serves as both a "kitchen sink" showcase and proof that the skill works in a fresh context. The demo app uses the panel collector for visual feedback, demonstrating the full assertion lifecycle from user interaction to pass/fail display.

## Problem Statement / Motivation

Faultsense has zero demo infrastructure — no example pages, no playground, no way to experience the product without instrumenting your own HTML and setting up a collector. The `llms-full.txt` API reference exists but is locked inside the repo with no distribution mechanism. Developers who want AI-assisted instrumentation need to manually paste the reference into their context.

This plan solves three problems:
1. **No demo app** — Prospects and developers can't see Faultsense in action without building something themselves.
2. **No AI distribution** — The `llms-full.txt` knowledge needs to be packaged as a portable skill that works in any Claude Code session.
3. **No proof the AI workflow works** — The claim "your AI writes the assertions" needs a concrete demonstration end-to-end.

## Proposed Solution

### Deliverable 1: Faultsense Claude Code Plugin

A Claude Code plugin (separate repo: `faultsense-plugin`) containing:
- A skill (`faultsense-instrumentation`) that auto-activates when users ask to add monitoring, assertions, or feature health checks to web components
- Bundled reference files with the full API, common patterns, and framework-specific syntax

### Deliverable 2: TanStack Start Todolist Demo

A complete SSR todo application (`examples/todolist-tanstack/`) with:
- Full CRUD operations (add, edit, complete, delete)
- In-memory server storage via TanStack Start server functions
- Comprehensive Faultsense instrumentation covering all assertion types
- Panel collector visible on-page for immediate visual proof
- Progressive assertion complexity (basic DOM → response-conditional → modifiers)

## Technical Approach

### Architecture

```
# Deliverable 1: Separate repo (github.com/Fault-Sense/faultsense-plugin)
faultsense-plugin/
├── .claude-plugin/
│   └── plugin.json                       # Plugin manifest
├── skills/
│   └── faultsense-instrumentation/
│       ├── SKILL.md                      # ~250 lines: workflow + quick ref + guardrails
│       └── references/
│           ├── api-reference.md          # Full API (from llms-full.txt)
│           ├── common-patterns.md        # 8 annotated patterns
│           └── framework-syntax.md       # React/Vue/Svelte/HTML examples
└── README.md

# Deliverable 2: Inside faultsense-agent repo
faultsense-agent/
├── examples/                             # Demo apps directory
│   └── todolist-tanstack/
│       ├── src/
│       │   ├── routes/
│       │   │   ├── __root.tsx            # Root layout, Faultsense script injection
│       │   │   └── index.tsx             # Todo app page
│       │   ├── components/
│       │   │   ├── TodoList.tsx           # List container
│       │   │   ├── TodoItem.tsx           # Individual todo with edit/complete/delete
│       │   │   └── AddTodo.tsx            # Add form
│       │   ├── server/
│       │   │   └── todos.ts              # Server functions + in-memory store
│       │   ├── types.ts                  # Todo interface
│       │   └── router.tsx                # Router factory
│       ├── public/
│       │   ├── faultsense-agent.min.js   # Agent IIFE bundle
│       │   └── faultsense-panel.min.js   # Panel collector bundle
│       ├── package.json
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── README.md
```

### Implementation Phases

#### Phase 1: Faultsense Skill (Plugin)

**Goal:** A working Claude Code plugin that can instrument any web component in a fresh context.

**Tasks:**

- [ ] Create `faultsense-plugin` repo with `.claude-plugin/plugin.json` marketplace metadata
- [ ] Write `SKILL.md` with progressive disclosure architecture:
  - Layer 0: Context Detection — scan for framework, existing `fs-*` attributes, component patterns
  - Layer 1: Reasoning Process — how to think about what to assert (the "E2E test mindset")
  - Layer 2: Decision Tree — which assertion type for which scenario
  - Layer 3: Quick Reference Table — compact attribute lookup
  - Layer 4: Common Mistakes — the 6 documented gotchas as first-class guardrails
  - Layer 5: Pointers to References — when to load the full API or pattern examples
  - Guard clause: "This skill instruments web applications that render to browser DOM"
- [ ] Create `references/api-reference.md` — adapted from `llms-full.txt` (full API, installation, configuration)
- [ ] Create `references/common-patterns.md` — the 8 annotated patterns with reasoning commentary
- [ ] Create `references/framework-syntax.md` — React JSX, Vue SFC, Svelte, plain HTML examples with TypeScript augmentation guidance
- [ ] Write plugin `README.md` with installation and usage instructions
- [ ] Initialize git repo for the plugin
- [ ] Validate skill loads correctly in a local Claude Code session

**SKILL.md Content Architecture:**

The SKILL.md body (~250 lines) contains the reasoning framework and guardrails. Reference files contain the lookup material. This keeps context usage efficient — the skill provides the "how to think" while references provide the "what to look up."

```
SKILL.md body (~250 lines):
├── Context detection (scan for framework, existing fs-* attrs, component patterns)
├── Reasoning workflow (trigger → outcome → type → modifiers)
├── Decision tree (added vs updated vs visible)
├── Quick reference table
├── Common mistakes (6 guardrails)
├── Assertion key naming convention
├── Placement rules (7 rules)
└── Pointers to reference files

references/api-reference.md (~400 lines):
├── Complete attribute API
├── Trigger table with typical elements
├── Assertion type details
├── Inline modifier syntax
├── Network association (fs-resp-for)
├── Installation methods
└── Configuration options

references/common-patterns.md (~200 lines):
├── 8 patterns with full HTML + reasoning
└── Progressive complexity examples

references/framework-syntax.md (~80 lines):
├── React JSX (+ TypeScript HTMLAttributes extension)
├── Vue SFC
├── Svelte
└── Plain HTML
```

**Plugin Manifest (`plugin.json`):**

```json
{
  "name": "faultsense",
  "version": "1.0.0",
  "description": "Instrument web apps with Faultsense production assertion monitoring",
  "author": {
    "name": "Faultsense",
    "url": "https://faultsense.org"
  },
  "repository": "https://github.com/Fault-Sense/faultsense-plugin",
  "license": "MIT",
  "keywords": ["monitoring", "assertions", "testing", "production", "feature-health"]
}
```

**Skill Description (the trigger mechanism):**

```
This skill should be used when instrumenting web applications with Faultsense
production assertion monitoring. Use when asked to "add assertions", "add
monitoring", "instrument this component", "add faultsense", "add fs-* attributes",
or when building features that need production correctness validation. Also
activates when reviewing or modifying existing fs-* instrumentation.
```

**Success criteria:**
- A developer installs the plugin, opens a project with zero Faultsense knowledge, and asks "instrument my checkout form" — Claude produces correct, well-reasoned `fs-*` attributes
- The skill distinguishes between `added` and `updated`, `visible` and `added`
- The skill warns about `fs-resp-for` when response-conditional assertions are needed
- The skill does not activate on non-web files

#### Phase 2: TanStack Start Todolist App (Scaffold + CRUD)

**Goal:** A working SSR todolist with all CRUD operations and in-memory persistence.

**Tasks:**

- [ ] Scaffold TanStack Start project in `examples/todolist-tanstack/`
  ```bash
  npm create @tanstack/start@latest examples/todolist-tanstack
  ```
- [ ] Define `Todo` type interface:
  ```typescript
  // src/types.ts
  interface Todo {
    id: string;
    text: string;
    completed: boolean;
    createdAt: string;
  }
  ```
- [ ] Implement in-memory server store with server functions:
  ```typescript
  // src/server/todos.ts
  import { createServerFn } from '@tanstack/react-start'

  const todos: Todo[] = [
    // Seed with 2-3 example todos for demo purposes
  ]

  export const getTodos = createServerFn({ method: 'GET' }).handler(...)
  export const addTodo = createServerFn({ method: 'POST' }).handler(...)
  export const updateTodo = createServerFn({ method: 'POST' }).handler(...)
  export const deleteTodo = createServerFn({ method: 'POST' }).handler(...)
  export const toggleTodo = createServerFn({ method: 'POST' }).handler(...)
  ```
- [ ] Build `__root.tsx` with HTML shell and Faultsense script tags (detailed in Phase 3)
- [ ] Build `index.tsx` route with loader calling `getTodos()`
- [ ] Build `AddTodo.tsx` — text input + submit button, calls `addTodo` server function
- [ ] Build `TodoItem.tsx` — displays todo with edit, complete, and delete controls
- [ ] Build `TodoList.tsx` — maps over todos, renders `TodoItem` components
- [ ] Implement inline editing: click edit → input appears → save on Enter/blur
- [ ] Handle empty state: show message when no todos exist
- [ ] Seed store with 2-3 example todos so the app isn't empty on first load

**Key TanStack Start patterns:**
- Route loaders call server functions for SSR data
- `router.invalidate()` after mutations to re-fetch data
- `useServerFn` hook for calling mutations from event handlers
- `head()` on root route for script injection

**Success criteria:**
- All CRUD operations work (add, edit, complete, delete)
- Page renders server-side with pre-populated todos
- Client-side navigation doesn't lose state
- Clean, minimal UI (no CSS framework needed — inline styles or a small CSS file)

#### Phase 3: Faultsense Instrumentation + Panel Collector

**Goal:** The todolist is fully instrumented with Faultsense, with the panel collector showing live results.

**Tasks:**

- [ ] Copy built dist files into `examples/todolist-tanstack/public/`:
  - `faultsense-agent.min.js`
  - `faultsense-panel.min.js`
- [ ] Inject scripts in `__root.tsx` via `head()`:
  ```typescript
  export const Route = createRootRoute({
    head: () => ({
      scripts: [
        { src: '/faultsense-panel.min.js' },
        {
          src: '/faultsense-agent.min.js',
          id: 'fs-agent',
          'data-release-label': '1.0.0',
          'data-collector-url': 'panel',
          'data-debug': 'true',
        },
      ],
    }),
    component: RootComponent,
  })
  ```
  **Critical: Panel script must appear before agent script** to ensure `window.Faultsense.collectors.panel` is registered before auto-init resolves it. Verify during implementation that TanStack Start's `head()` scripts render as `<script defer>` tags in document order — if not, use explicit `<script>` tags in the root component body instead.

- [ ] Add TypeScript JSX augmentation for `fs-*` attributes:
  ```typescript
  // src/types/jsx.d.ts
  declare namespace React {
    interface HTMLAttributes<T> {
      'fs-assert'?: string
      'fs-trigger'?: string
      'fs-assert-added'?: string
      'fs-assert-removed'?: string
      'fs-assert-updated'?: string
      'fs-assert-visible'?: string
      'fs-assert-hidden'?: string
      'fs-assert-loaded'?: string
      'fs-assert-timeout'?: string
      'fs-assert-mpa'?: string
      'fs-resp-for'?: string
    }
  }
  ```

- [ ] Instrument **Add Todo** flow:
  ```html
  <!-- AddTodo submit button -->
  <button type="submit"
    fs-assert="todos/add-item"
    fs-trigger="click"
    fs-assert-added=".todo-item">
    Add Todo
  </button>
  ```
  Asserts: clicking add creates a new `.todo-item` in the DOM.

- [ ] Instrument **Edit Todo** flow (multiple assertions):
  ```html
  <!-- Edit button on TodoItem -->
  <button
    fs-assert="todos/edit-item"
    fs-trigger="click"
    fs-assert-visible=".todo-edit-input">
    Edit
  </button>

  <!-- Save button (or form submit) -->
  <button
    fs-assert="todos/save-edit"
    fs-trigger="click"
    fs-assert-hidden=".todo-edit-input"
    fs-assert-updated='.todo-text[text-matches=.+]'>
    Save
  </button>
  ```
  Asserts: clicking edit shows the input; saving hides it and updates the text.

- [ ] Instrument **Complete Todo** flow:
  ```html
  <!-- Checkbox on TodoItem -->
  <input type="checkbox"
    fs-assert="todos/toggle-complete"
    fs-trigger="change"
    fs-assert-updated='.todo-item[classlist=completed:true]'>
  ```
  Asserts: toggling the checkbox adds the `completed` class.

- [ ] Instrument **Delete Todo** flow (progressive, from marketing.md):
  ```html
  <!-- Level 2: Response-conditional deletion -->
  <button
    fs-assert="todos/remove-item"
    fs-trigger="click"
    fs-assert-removed-200=".todo-item"
    fs-assert-added-4xx=".error-msg"
    fs-assert-timeout="2000">
    Delete
  </button>
  ```
  Asserts: on 200, todo is removed; on 4xx, error message appears. This is the progressive example from marketing.md, demonstrating Faultsense's most compelling capability.

- [ ] Add `fs-resp-for` header to the delete server function's fetch call:
  ```typescript
  // In the client-side delete handler
  await deleteTodo({
    data: { id: todo.id },
    headers: { 'fs-resp-for': 'todos/remove-item' }
  })
  ```
  **Note:** Verify TanStack Start's server function RPC mechanism supports custom headers. If not, use the query parameter method: append `?fs-resp-for=todos/remove-item` to the request.

- [ ] Instrument **Empty State** (mount trigger):
  ```html
  <div
    fs-assert="todos/empty-state"
    fs-trigger="mount"
    fs-assert-visible=".empty-state-message">
    No todos yet. Add one above!
  </div>
  ```
  Demonstrates the `mount` trigger — the least obvious trigger type, valuable for page-load validation.

- [ ] Verify assertions settle correctly and panel renders pass/fail results
- [ ] Verify panel's Shadow DOM doesn't interfere with app styles
- [ ] Verify `fs-*` attributes survive SSR rendering and React hydration without warnings

**Assertion Coverage Matrix:**

| CRUD Operation | Assertion Key | Trigger | Type | Modifiers | Response-Conditional |
|---|---|---|---|---|---|
| Add todo | `todos/add-item` | `click` | `added` | — | No |
| Start edit | `todos/edit-item` | `click` | `visible` | — | No |
| Save edit | `todos/save-edit` | `click` | `hidden` + `updated` | `text-matches` | No |
| Toggle complete | `todos/toggle-complete` | `change` | `updated` | `classlist` | No |
| Delete todo | `todos/remove-item` | `click` | `removed-200` + `added-4xx` | — | Yes |
| Empty state | `todos/empty-state` | `mount` | `visible` | — | No |

This covers 5 of 6 assertion types (`added`, `removed`, `updated`, `visible`, `hidden`), 3 trigger types (`click`, `change`, `mount`), both modifier types (`text-matches`, `classlist`), and response-conditional assertions. The only uncovered type is `loaded` (media-specific).

**Success criteria:**
- All assertions settle as expected (visible in panel)
- Panel shows pass (green) for all happy-path operations
- Delete with simulated 4xx shows the error assertion triggering
- Panel doesn't interfere with the app's layout or styles
- The demo works on first load — no manual configuration needed

#### Phase 4: Integration Validation + Polish

**Goal:** Verify the skill produces correct instrumentation and polish the demo.

**Tasks:**

- [ ] Test the skill in a fresh Claude Code session:
  1. Install the plugin locally
  2. Open a blank project with a simple React component
  3. Ask Claude to instrument it
  4. Verify the output matches Faultsense conventions
- [ ] Write `examples/todolist-tanstack/README.md` with:
  - What this demo shows
  - How to run it (`npm install && npm run dev`)
  - What each assertion demonstrates
  - Screenshot or description of the panel in action
- [ ] Write `faultsense-plugin/README.md` with:
  - Installation instructions
  - What the skill does
  - Example usage
  - Link to full Faultsense docs
- [ ] Update repo `.gitignore` to allow the `examples/` directory (currently gitignored)
- [ ] Add a build script or npm command to copy dist files to the example's `public/` directory
- [ ] Verify the complete flow: install skill → ask to build a todo app with Faultsense → get working instrumented app

**Success criteria:**
- A fresh Claude Code session with only the plugin installed can produce a correctly instrumented component
- `npm install && npm run dev` in the example directory runs the demo
- Panel collector shows assertion results immediately on interaction
- No console errors, no hydration warnings, no missing scripts

## Alternative Approaches Considered

**1. Plugin inside the agent repo instead of a separate repo**
Rejected: The existing pattern is separate repos (agent, .org, .com). A separate plugin repo is independently versioned, easier to submit to marketplaces, and doesn't couple plugin releases to agent releases.

**2. Demo app in Next.js instead of TanStack Start**
Rejected: TanStack Start is the requested framework. It also demonstrates that Faultsense works with modern SSR frameworks beyond the mainstream ones — a stronger signal than "works with Next.js."

**3. Full database persistence (SQLite, JSON file)**
Rejected: Over-engineering for a demo. In-memory storage keeps the example simple, zero-dependency, and focused on Faultsense rather than data layer setup. The tradeoff (data lost on server restart) is acceptable for a demo.

**4. ESM import of Faultsense instead of script tags**
Rejected: No ESM build exists yet (IIFE only). Script tag injection is the documented integration pattern and works universally. Adding ESM is a separate initiative (ranked #1 in open ideation but out of scope here).

**5. Embed full `llms-full.txt` in SKILL.md body**
Rejected: At 396 lines, this would consume most of the recommended ~500 line budget, leaving no room for the reasoning framework and guardrails that make the skill effective. Progressive disclosure (condensed body + reference files) is the established best practice.

## System-Wide Impact

### Interaction Graph

- Faultsense agent script loads → registers global `window.Faultsense` → auto-init reads `data-*` attributes → resolves collector name to `panel` function → starts MutationObserver + event listeners
- User interacts with instrumented element → capture-phase event listener fires → element processor parses `fs-*` attributes → assertions enqueued → MutationObserver detects DOM changes → resolver matches mutations to assertions → settled assertions dispatched to panel collector → panel renders row in Shadow DOM
- TanStack Start server functions handle CRUD → `router.invalidate()` triggers loader re-fetch → React re-renders with new data → MutationObserver picks up DOM changes → resolvers check pending assertions

### Sync Points

- The plugin's `references/api-reference.md` must stay in sync with `llms-full.txt`. Note in the plugin README to update references when the agent API changes.
- The demo app's `public/` dist files must match the agent repo's built output. A copy script ensures this.

## Acceptance Criteria

### Functional Requirements

- [ ] Plugin installs in Claude Code and skill activates on relevant prompts
- [ ] Skill produces correct `fs-*` attributes for at least 3 different component types (form, button, list) in a fresh context
- [ ] TanStack Start app renders server-side with pre-populated todos
- [ ] All CRUD operations work: add, edit, complete, delete
- [ ] Panel collector displays assertion results in real-time
- [ ] All happy-path assertions pass (green dots in panel)
- [ ] Response-conditional delete assertion demonstrates status-gated behavior
- [ ] Demo runs with `npm install && npm run dev` — no additional setup

### Non-Functional Requirements

- [ ] Skill SKILL.md body is under 300 lines
- [ ] Reference files total under 700 lines
- [ ] Demo app has no external dependencies beyond TanStack Start and React
- [ ] Panel collector doesn't cause layout shifts or style conflicts
- [ ] No TypeScript errors or React hydration warnings

### Quality Gates

- [ ] Skill tested in a fresh Claude Code session (no prior Faultsense context)
- [ ] Demo manually exercised through all CRUD flows with panel visible
- [ ] All assertion types in the coverage matrix verified
- [ ] Script loading order verified (panel before agent)

## Success Metrics

1. **Skill effectiveness:** In a fresh context, the skill produces instrumentation that is functionally correct (assertions settle as expected) for 3+ component patterns
2. **Demo time-to-value:** `git clone` → `npm install` → `npm run dev` → see assertions in panel in under 60 seconds
3. **Coverage breadth:** Demo exercises 5 of 6 assertion types, 3 trigger types, both modifier types, and response-conditional assertions

## Dependencies & Prerequisites

- **Panel collector is built and merged** — Confirmed (commit `695e6df`)
- **`llms-full.txt` is current** — Confirmed (396 lines, comprehensive)
- **TanStack Start v1.x stable** — Current RC (`@tanstack/react-start@1.166.16`), API considered stable
- **No ESM build needed** — Script tag injection from `public/` directory works with IIFE bundles
- **`.gitignore` change needed** — `examples/` is currently gitignored in the agent repo; must be un-ignored
- **New GitHub repo needed** — `Fault-Sense/faultsense-plugin` for the Claude Code plugin

## Risk Analysis & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| `fs-*` attributes cause React hydration mismatch | Demo broken | Low | React passes unknown attrs through on native elements; verify during Phase 2 |
| Script loading order fails in TanStack Start | Assertions silently dropped | Medium | Use `head()` scripts array with explicit ordering; verify panel registers before agent init |
| TanStack Start server functions don't support custom headers for `fs-resp-for` | Response-conditional demo broken | Medium | Fall back to query parameter method (`?fs-resp-for=key`) |
| Skill context too large, slows Claude responses | Poor UX | Low | Progressive disclosure: 250-line body + reference files loaded on demand |
| Skill triggers on non-web files | User trust damage | Medium | Guard clause in SKILL.md + narrow description targeting web apps |
| In-memory store resets during HMR in dev | Confusing during development | High | Seed data ensures app always has content; document the behavior |

## Future Considerations

- **Additional example apps:** Vue, Svelte, plain HTML examples to demonstrate framework-agnostic instrumentation
- **ESM build integration:** When the agent ships ESM output, update the demo to use `import` instead of script tags
- **Live hosted demo:** Deploy the TanStack Start app to a public URL for the faultsense.org landing page

## Documentation Plan

- `faultsense-plugin` repo `README.md` — Plugin installation and skill usage
- `examples/todolist-tanstack/README.md` — Demo setup, what each assertion demonstrates
- Update agent repo root `README.md` to link to the examples directory and plugin repo

## Sources & References

### Internal References

- `llms-full.txt` — The complete API reference, primary source for skill reference files
- `CLAUDE.md` — Instrumentation guide, placement rules, common mistakes
- `marketing.md:103-154` — Progressive todo delete example (Level 1-3 assertions)
- `src/collectors/panel.ts` — Panel collector implementation, Shadow DOM, self-registration
- `src/index.ts:114-163` — Auto-init and collector name resolution
- `src/config.ts` — Supported events, assertion types, `fs-resp-for` header key
- `docs/plans/2026-03-24-001-feat-assertion-panel-collector-plan.md` — Panel collector architecture decisions
- `AGENT_PAYLOAD_SPEC.md` — Collector payload interface

### External References

- [TanStack Start Docs](https://tanstack.com/start/latest/docs/framework/react/overview) — Framework documentation
- [TanStack Start Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions) — createServerFn API
- [TanStack Router Head Management](https://tanstack.com/router/latest/docs/guide/document-head-management) — Script injection via head()
- [Claude Code Skill Development](https://docs.anthropic.com/en/docs/claude-code) — Plugin and skill format
- [npm: @tanstack/react-start](https://www.npmjs.com/package/@tanstack/react-start) — Current version 1.166.16

### Institutional Knowledge

- **Manual instrumentation is the moat** — The skill should help developers reason about correctness, not auto-generate heuristic assertions
- **Panel collector is a debug tool, not the production experience** — The demo should communicate the full assertion lifecycle, not just the panel
- **Script loading order matters** — Collector scripts must register before `DOMContentLoaded`; both scripts need `defer` or placement in document order
- **`fs-resp-for` is required for response-conditional assertions** — Without it, assertions silently time out
- **Pipeline architecture** — New features flow through existing `parsing → processing → resolving → settling` pipeline
