---
title: "feat: Attribute Regex Matching"
type: feat
status: completed
date: 2026-03-28
origin: docs/brainstorms/2026-03-28-attribute-regex-matching-requirements.md
---

# feat: Attribute Regex Matching

Replace exact-match attribute checks with regex evaluation in the `attrs-match` modifier, consistent with how `text-matches` and `value-matches` already work.

## Acceptance Criteria

- `[data-state=loaded|ready]` matches either value
- `[data-status=success-\d+]` matches dynamic suffixes
- `[data-state=active]` (exact values) still pass (backward compatible)
- Invalid regex warns and falls back to exact string match
- No parser changes in `elements.ts`

## Context

`text-matches` and `value-matches` already use `new RegExp(value).test(...)`. The `attrs-match` modifier is the only one still using strict equality. This is a one-location change in `src/resolvers/dom.ts` (line 94).

## MVP

Single change in `src/resolvers/dom.ts`, `modifiersMap["attrs-match"]`:

```diff
  "attrs-match": (el: HTMLElement, modValue: string) => {
    let attrs;
    try {
      attrs = JSON.parse(modValue);
    } catch (e) {
      return [false, "attrs-match"];
    }
    return [
      Object.entries(attrs).every(([key, value]) => {
-       return el.getAttribute(key) === value;
+       try {
+         return new RegExp(value as string).test(el.getAttribute(key) || "");
+       } catch {
+         console.warn(`[Faultsense]: Invalid regex in attrs-match: "${value}". Falling back to exact match.`);
+         return el.getAttribute(key) === value;
+       }
      }),
      "attrs-match",
    ];
  },
```

No new files, no config changes, no parser changes.

## Sources

- `src/resolvers/dom.ts` - attrs-match modifier (line 83-98)
- `src/processors/elements.ts` - resolveInlineModifiers (unchanged)
- `docs/brainstorms/2026-03-28-attribute-regex-matching-requirements.md`
