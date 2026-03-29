---
title: "feat: User Context on Assertions"
type: feat
status: active
date: 2026-03-28
origin: docs/brainstorms/2026-03-28-user-context-requirements.md
---

# feat: User Context on Assertions

Add a `userContext` configuration option and `Faultsense.setUserContext()` API method so developers can attach arbitrary context (user ID, plan tier, A/B test group) to all assertion payloads (see origin: `docs/brainstorms/2026-03-28-user-context-requirements.md`).

## Acceptance Criteria

- [ ] `userContext: Record<string, any>` accepted in init config
- [ ] `Faultsense.setUserContext(context)` exposed as a public API method on `window.Faultsense`
- [ ] All assertion payloads (pass and fail) include `user_context` when set
- [ ] `user_context` omitted from payload when no context has been set
- [ ] `setUserContext` replaces the existing context (not merge — see deferred question resolution below)
- [ ] Panel collector displays user context when present
- [ ] Docs updated (CLAUDE.md, llms-full.txt)

## Deferred Question Resolution

The brainstorm asked whether `setUserContext` should merge or replace. **Decision: replace.** Merge adds ambiguity (what about removing a key?). Replace is simpler and predictable — the developer passes the complete context each time. If they want to add a field, they spread the existing context: `Faultsense.setUserContext({ ...existing, newField: "value" })`.

## MVP

### Step 1: Add `userContext` to Configuration

**File:** `src/types.ts`

Add to `Configuration` interface:
```typescript
userContext?: Record<string, any>;
```

Add to `window.Faultsense` interface:
```typescript
setUserContext?: (context: Record<string, any>) => void;
```

### Step 2: Add `user_context` to ApiPayload

**File:** `src/types.ts`

Add to `ApiPayload`:
```typescript
user_context?: Record<string, any>;
```

### Step 3: Store and expose userContext

**File:** `src/assertions/manager.ts`

Store `userContext` as a mutable variable in `createAssertionManager`:
```typescript
let userContext: Record<string, any> | undefined = config.userContext;
```

Expose a `setUserContext` method:
```typescript
const setUserContext = (context: Record<string, any>): void => {
  userContext = context;
};
```

Add to the return object.

### Step 4: Include in payload

**File:** `src/assertions/server.ts`

In `toPayload()`, accept `userContext` and conditionally include it:
```typescript
if (userContext) {
  payload.user_context = userContext;
}
```

The `sendToCollector` function passes config to `toPayload`. Since `userContext` lives on the manager (not config), either:
- Pass it alongside config, or
- Add it to the config object via `setUserContext`

Simplest: store on config directly. `config.userContext = context` in `setUserContext`. Then `toPayload` reads `config.userContext`.

### Step 5: Wire up the global API

**File:** `src/index.ts`

After creating the assertion manager, expose `setUserContext` on `window.Faultsense`:
```typescript
window.Faultsense.setUserContext = assertionManager.setUserContext;
```

Also handle `data-user-context` on the script tag for declarative init (JSON string):
```typescript
const userContextAttr = script.getAttribute("data-user-context");
if (userContextAttr) {
  try { config.userContext = JSON.parse(userContextAttr); } catch {}
}
```

### Step 6: Panel collector display

**File:** `src/collectors/panel.ts`

When `payload.user_context` is present, render it below the assertion detail (similar to error_context display). Show as `key=value` pairs or JSON.

### Step 7: Tests

- Config accepts `userContext` and includes it in payload
- `setUserContext` updates context for subsequent assertions
- `user_context` omitted when not set
- `setUserContext` replaces (doesn't merge)
- Script tag `data-user-context` parsed as JSON

### Step 8: Docs

Update CLAUDE.md and llms-full.txt:
- Add `userContext` to Configuration options
- Document `Faultsense.setUserContext()` API
- Add `user_context` to Event Payload
- Add to Quick Reference

## Sources

- **Origin document:** `docs/brainstorms/2026-03-28-user-context-requirements.md` — key decisions: all assertions (not just failures), updatable via API method (not callback), replace semantics (not merge)
- Configuration interface: `src/types.ts:4-11`
- Global API: `src/types.ts:129-139`, `src/index.ts:171-174`
- Payload construction: `src/assertions/server.ts:5-31`
- Panel collector: `src/collectors/panel.ts`
