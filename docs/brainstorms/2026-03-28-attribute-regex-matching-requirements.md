---
date: 2026-03-28
topic: attribute-regex-matching
---

# Attribute Regex Matching

## Problem Frame

The `attrs-match` modifier in `src/resolvers/dom.ts` uses strict equality (`el.getAttribute(key) === value`) to check attribute values. This means `[data-state=loaded]` fails if the actual value is `loaded-v2` or `loaded-123`. There is no way to match patterns, enums, or partial values in attribute checks. `text-matches` already uses `new RegExp(value).test(...)` — attribute matching should offer the same capability.

## Current Flow

```
fs-assert-updated="#card[data-state=loaded]"
  → parseTypeValue → { selector: "#card", modifiers: { "data-state": "loaded" } }
  → resolveInlineModifiers → { "attrs-match": '{"data-state":"loaded"}' }
  → modifiersMap["attrs-match"] → el.getAttribute("data-state") === "loaded"  (EXACT)
```

## Design Decision: Regex-by-Default vs Explicit Operator

### Option A: Make all attribute checks regex (recommended)

Change the single comparison line in `modifiersMap["attrs-match"]` (`src/resolvers/dom.ts:94`):

```diff
- return el.getAttribute(key) === value;
+ return new RegExp(value as string).test(el.getAttribute(key) || "");
```

**Pros:**
- Zero new syntax, zero parser changes
- Consistent with `text-matches` behavior
- Exact values still work: `new RegExp("active").test("active")` is `true`

**Cons:**
- Subtle breaking change: `.` becomes a metacharacter. `[data-state=foo.bar]` now matches `fooXbar`. In practice, attribute values rarely contain regex metacharacters, and anyone using dots in attribute values is unlikely to be bitten — `foo.bar` still matches the literal `foo.bar`.
- Users must escape regex metacharacters if they want literal matching (e.g., `foo\\.bar`). This is the same tradeoff `text-matches` already makes.

**Verdict:** The `text-matches` precedent makes this acceptable. Both modifiers behave the same way — values are regex patterns.

### Option B: Explicit `~=` operator

Add a new bracket syntax: `[data-state~=loaded|ready]` for regex, `[data-state=active]` stays exact.

**Pros:**
- No breaking change
- Explicit intent

**Cons:**
- Requires parser changes in `resolveInlineModifiers` to detect `~=` and route differently
- Two mental models for attribute matching
- Inconsistent with `text-matches`, which is always regex

**Verdict:** Not worth the parser complexity for a modifier that handles a narrow set of values where metacharacter collision is rare.

## Requirements

- R1. **Regex evaluation** — Replace `el.getAttribute(key) === value` with `new RegExp(value).test(el.getAttribute(key) || "")` in `modifiersMap["attrs-match"]` (`src/resolvers/dom.ts:94`). ~1 line changed.

- R2. **Invalid regex fallback** — If `new RegExp(value)` throws, catch the error, warn via the logger, and fall back to exact string equality (`el.getAttribute(key) === value`). This prevents a malformed pattern from silently failing the entire attrs-match check.

- R3. **No parser changes** — `resolveInlineModifiers` in `src/processors/elements.ts` remains unchanged. The regex behavior is entirely in the resolver.

- R4. **Backward compatibility** — Existing exact-match patterns continue to work. The only edge case is values containing regex metacharacters (`.`, `*`, `+`, `?`, `(`, `)`, `[`, `]`, `{`, `}`, `^`, `$`, `|`, `\`). This is the same tradeoff `text-matches` already makes and is documented as expected behavior.

## Usage Examples

```html
<!-- Match any of several states -->
fs-assert-updated="#card[data-state=loaded|ready|complete]"

<!-- Match dynamic suffix -->
fs-assert-visible=".badge[data-status=success-\d+]"

<!-- Match enum values -->
fs-assert-visible="#theme-root[data-theme=dark|light]"

<!-- Partial match on aria labels -->
fs-assert-visible="#settings-btn[aria-label=.*Settings.*]"

<!-- Exact match still works identically -->
fs-assert-updated="#panel[data-state=active]"
```

## Scope

~3-5 lines changed in `src/resolvers/dom.ts`. No new files, no config changes, no new modifier registration.
