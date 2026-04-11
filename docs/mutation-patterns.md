# DOM Mutation Pattern Catalog

This catalog names every distinct class of DOM mutation behavior that the Faultsense agent must handle correctly. Frameworks differ primarily in _how_ they mutate the DOM. Once a mutation shape is characterized here and locked in by a regression test, any framework that uses that shape is supported by transitivity.

## Discovery → lock-in loop

The catalog is populated through a two-step workflow:

1. A real-framework scenario (Layer 2 harness or example app) exposes an agent bug that unit tests did not anticipate.
2. The mutation pattern class is named, a new `PAT-NN` entry is added here, and a regression test is added under `tests/conformance/pat-NN-*.test.ts`. From that point forward, the class of bug cannot recur silently.

New patterns are always appended. Existing IDs are stable — they are referenced from test files, the works-with matrix, and commit history.

## Catalog

| ID | Title | Status | Test |
|---|---|---|---|
| [PAT-01](#pat-01-pre-existing-target) | Pre-existing target | supported | [`tests/conformance/pat-01-pre-existing-target.test.ts`](../tests/conformance/pat-01-pre-existing-target.test.ts) |
| [PAT-02](#pat-02-delayed-commit-mutation) | Delayed-commit mutation | supported | [`tests/conformance/pat-02-delayed-commit-mutation.test.ts`](../tests/conformance/pat-02-delayed-commit-mutation.test.ts) |
| [PAT-03](#pat-03-outerhtml-replacement) | outerHTML replacement | supported | [`tests/conformance/pat-03-outer-html-replacement.test.ts`](../tests/conformance/pat-03-outer-html-replacement.test.ts) |
| [PAT-04](#pat-04-morphdom-preserved-identity) | morphdom preserved-identity | supported | [`tests/conformance/pat-04-morphdom-preserved-identity.test.ts`](../tests/conformance/pat-04-morphdom-preserved-identity.test.ts) |
| [PAT-05](#pat-05-detach-reattach) | Detach-reattach | supported | [`tests/conformance/pat-05-detach-reattach.test.ts`](../tests/conformance/pat-05-detach-reattach.test.ts) |
| [PAT-06](#pat-06-text-only-mutation) | Text-only mutation | supported | [`tests/conformance/pat-06-text-only-mutation.test.ts`](../tests/conformance/pat-06-text-only-mutation.test.ts) |
| [PAT-07](#pat-07-microtask-batching) | Microtask batching | supported | [`tests/conformance/pat-07-microtask-batching.test.ts`](../tests/conformance/pat-07-microtask-batching.test.ts) |
| [PAT-08](#pat-08-cascading-mutations) | Cascading mutations | supported | [`tests/conformance/pat-08-cascading-mutations.test.ts`](../tests/conformance/pat-08-cascading-mutations.test.ts) |
| [PAT-09](#pat-09-hydration-upgrade) | Hydration upgrade | supported | [`tests/conformance/pat-09-hydration-upgrade.test.ts`](../tests/conformance/pat-09-hydration-upgrade.test.ts) |
| [PAT-10](#pat-10-shadow-dom-traversal) | Shadow-DOM traversal | **gap** | [`tests/conformance/pat-10-shadow-dom-traversal.test.ts`](../tests/conformance/pat-10-shadow-dom-traversal.test.ts) |

---

### PAT-01 Pre-existing target

**Status:** supported

**Description.** The selector a trigger asserts against already matches an element in the DOM at the moment the trigger fires. For mutation-observed types (`added`, `removed`), a pre-existing match must _not_ satisfy the assertion — the element was not "added by this trigger." Under `fs-assert-mutex="conditions"`, a false pass on the pre-existing success variant would silently dismiss the error variant, so the bug manifests as missing error telemetry, not a visible failure.

**Representative frameworks.** Any framework that renders the target element on the initial page load and then reuses the same selector for a trigger that is supposed to produce a _new_ element — Turbo/HTMX server-rendered lists, SSR React, Vue SSR, any CMS-driven list with an "add item" button.

**Regression anchor.** Commit [`b9b0fac`](../../commit/b9b0fac) added `added` and `removed` to the `eventBasedTypes` exclusion list in [`src/assertions/manager.ts:56-104`](../src/assertions/manager.ts#L56). Without the fix, `checkImmediateResolved` resolved `added` assertions against the pre-existing DOM state.

**What the test locks in.** Seeding the DOM with a matching element _before_ `init()` and then firing a trigger whose handler creates an error element instead must produce an error-variant collector payload, not a false success. Depends on the Phase 1 helper's `deferInit: true` flag so the `MutationObserver` attaches after the pre-existing element is present.

---

### PAT-02 Delayed-commit mutation

**Status:** supported

**Description.** A transient DOM mutation (a loading class, a spinner element, a placeholder node) fires between the trigger and the final outcome. The agent must keep the assertion pending across the transient state and commit only once a mutation produces an element that satisfies every modifier. The wait-for-pass resolver contract at [`src/resolvers/dom.ts:158-219`](../src/resolvers/dom.ts#L158) returns `null` on negative modifier checks so the assertion stays alive; the exceptions are `stable` (commits on first mutation — inverted) and `invariant` (commits on violation).

**Representative frameworks.** HTMX `hx-swap` with mid-swap classes, React 18 `<Suspense>` fallback, Svelte transitions, CSS animation classes toggled by VDOM diffing, Vue `v-if` plus `<Transition>`.

**Regression anchor.** PR #20 (`301a807`) adopted wait-for-pass semantics after the HTMX todolist example exposed false failures on transient loading classes. The resolver overhaul and the `gcInterval` default (30s → 5s) both landed in the same PR.

**What the test locks in.** Two sub-scenarios per assertion type. (1) Transient that does _not_ match the selector must not disrupt the assertion. (2) Transient that matches the selector but fails a modifier (`data-status="loading"` then `data-status="complete"`) must commit only on the final state. The `stable` and `invariant` counter-cases confirm the exceptions.

---

### PAT-03 outerHTML replacement

**Status:** supported

**Description.** The target node is swapped wholesale: the old node appears in `removedElements`, the new node in `addedElements`, and `updatedElements` contains only the parent (the `childList` mutation target). Assertions over this pattern must use `added` or `removed`, _not_ `updated` — the new node is not the same identity as the old one.

**Representative frameworks.** HTMX `hx-swap="outerHTML"`, Turbo Stream `action="replace"`, any server-rendered partial replacement.

**Regression anchor.** [`tests/assertions/outer-swap-toggle.test.ts`](../tests/assertions/outer-swap-toggle.test.ts) reproduced the HTMX toggle-complete bug where a check-direction swap racy-failed under modifier-constrained assertions. Fixed by wait-for-pass semantics in PR #20.

**What the test locks in.** An HTMX-style `parent.replaceChild(fresh, old)` produces a valid `added` match when the new node has the expected class list. The same mutation sequence must _not_ satisfy an `updated` assertion targeting a node with the new-state class list — that is the known instrumentation gotcha documented in `skills/faultsense-instrumentation/SKILL.md`.

---

### PAT-04 morphdom preserved-identity

**Status:** supported

**Description.** Target node identity is preserved while attributes and/or children are patched in place. The resulting mutation records are `attributes` or `characterData`, not `childList` swaps. The mutation → element fanout at [`src/processors/mutations.ts:7-53`](../src/processors/mutations.ts#L7) promotes these record targets into `updatedElements`.

**Representative frameworks.** Livewire, Turbo 8 morphing (`refresh="morph"`), Alpine `x-html.morph`, any diff-based DOM patcher that prioritizes identity preservation.

**What the test locks in.** Directly mutating attributes on an existing node (`node.setAttribute('class', 'completed')`) satisfies `fs-assert-updated` with classlist or attribute modifiers. When an ancestor is morphed but a nested descendant keeps its identity, the assertion on the descendant still resolves.

---

### PAT-05 Detach-reattach

**Status:** supported

**Description.** A node briefly leaves the DOM and then returns. Two sub-patterns: (a) the node is re-added to the same parent (React keyed reorder, list sort), (b) the node is moved between parents (React Portal, fragment reparenting). React 18 StrictMode double-mount produces the same shape as (a) but across three mutation batches: insert → remove → re-insert.

**Representative frameworks.** React 18 keyed reorder, React 18 StrictMode, Vue `<Teleport>`, Solid stores, any framework that composes and decomposes subtrees during reconciliation.

**What the test locks in.** Synchronous `container.innerHTML = ''` then `container.appendChild(newNode)` in the next microtask still produces a passing `added` / `updated` assertion. The double-mount variant with three batches (insert → remove → insert) passes on the final insert.

---

### PAT-06 Text-only mutation

**Status:** supported

**Description.** The only change is a `textContent` or `characterData` update — no element structure change. Common in fine-grained reactivity systems. The mutation fanout at [`src/processors/mutations.ts:42-43`](../src/processors/mutations.ts#L42) promotes the characterData target's `parentElement` into `updatedElements` so text-matches modifiers work without the author having to target the text node directly.

**Representative frameworks.** Solid, Svelte, Vue 3 reactive text bindings, Lit template expressions, vanilla `element.textContent = value`.

**What the test locks in.** Setting `element.firstChild.nodeValue = '1'` on a previously-"0" element satisfies `fs-assert-updated` with a `text-matches` modifier targeting the parent. A counter-assertion with a non-matching `text-matches` pattern must stay pending until the timeout.

---

### PAT-07 Microtask batching

**Status:** supported

**Description.** Multiple independent mutations arrive in a single `MutationObserver` callback because they were produced synchronously (`queueMicrotask`, `requestAnimationFrame`, React 18 automatic batching, Vue `nextTick`). `handleMutations` at [`src/assertions/manager.ts:249-283`](../src/assertions/manager.ts#L249) must fan out the full record batch through `mutationHandler` so every pending assertion sees every record.

**Representative frameworks.** React 18 automatic batching, Vue 3 `nextTick`, Preact signals, Lit async updates, any code path that uses `queueMicrotask`.

**What the test locks in.** A synchronous trigger that mutates two unrelated elements produces a single `MutationObserver` callback with two records. A primary assertion resolving from record 1 must not prevent a second assertion (on a different element) from resolving from record 2 in the same callback.

---

### PAT-08 Cascading mutations

**Status:** supported

**Description.** A single trigger causes mutations across multiple unrelated subtrees. Out-of-band (OOB) assertions exist to express the sibling case: "when the primary assertion resolves, evaluate these other assertions in different parts of the DOM." OOB assertions intentionally bypass the `b9b0fac` exclusion so they can resolve against current state at `settle()` time — the DOM change has already happened when they fire. See [`src/assertions/manager.ts:340-363`](../src/assertions/manager.ts#L340).

**Representative frameworks.** Any framework where one action triggers distant DOM updates — Redux reducers with multiple slices, Zustand stores, Turbo Stream broadcasts with multiple targets, HTMX `hx-swap-oob`.

**What the test locks in.** A click handler that inserts a child into the button's subtree AND a sentinel into an unrelated subtree resolves both the primary `added` assertion and its OOB companion via `findAndCreateOobAssertions` plus an immediate `immediateResolver` pass.

---

### PAT-09 Hydration upgrade

**Status:** supported

**Description.** SSR-rendered nodes gain attributes, event listeners, or children when the client hydrates. Element identity is preserved across hydration. `mount` triggers must only fire on true insertion; an already-present element does not re-fire its `mount` trigger when its attributes change during hydration. Invariants handle the "assert while hydrated" case naturally because they evaluate perpetually.

**Representative frameworks.** Next.js App Router, Remix, Astro, SvelteKit, Nuxt, any SSR framework with a client hydration pass.

**What the test locks in.** An `invariant`-triggered assertion targeting `button.hydrated` passes after the hydration pass adds the class. A `mount`-triggered assertion on the already-present element does not fire a second time when the hydration mutation happens.

---

### PAT-10 Shadow-DOM traversal

**Status:** **gap** — expected-failure test.

**Description.** The assertion target lives inside an `attachShadow`-created shadow root. The agent creates a single `MutationObserver` rooted at `document.body` with `subtree: true` at [`src/index.ts:67-76`](../src/index.ts#L67), and `MutationObserver` with `subtree: true` does _not_ cross shadow root boundaries. Document-level `querySelector` calls in [`src/resolvers/dom.ts`](../src/resolvers/dom.ts) do not walk `composedPath()` either. Mutations inside shadow trees are therefore invisible to the agent today.

**Representative frameworks.** Lit, Stencil, Salesforce LWC, any web component library that relies on shadow encapsulation.

**What the test locks in.** The test creates a shadow root, places a triggerable element inside it, fires the trigger, and expects the assertion to _not_ resolve. The assertion is written with `it.fails` so the expected-failure outcome is the green state. When shadow DOM support ships in a future plan, flipping the expectation to `it` is a one-line change and the test becomes a positive regression lock.

**Tracking.** Shadow DOM support is a future feature, not covered by this plan.
