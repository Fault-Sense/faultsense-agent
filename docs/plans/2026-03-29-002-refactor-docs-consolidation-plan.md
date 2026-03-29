---
title: "refactor: Consolidate documentation into single repo"
type: refactor
status: completed
date: 2026-03-29
origin: docs/brainstorms/2026-03-29-docs-consolidation-requirements.md
---

# Consolidate Documentation into Single Repo

## Overview

Documentation is spread across 10 files in 2 repos with the API reference duplicated 4 times at varying levels of staleness. Merge the Claude Code plugin into the agent repo, make SKILL.md the single canonical LLM-facing document, strip CLAUDE.md to project context only, fix README.md, and delete the redundant files.

## Problem Statement / Motivation

Every API change requires editing content in multiple places — CLAUDE.md, llms-full.txt, and the plugin repo's SKILL.md + references all contain overlapping API reference material. Several docs are already stale: README.md still references the removed response-conditional API (`fs-assert-added-201`), the plugin's SKILL.md uses `fs-assert-grouped` (replaced by `fs-assert-mutex`), and the OOB syntax in the plugin (`fs-assert-oob-{type}="keys"`) doesn't match the actual agent API (`fs-assert-oob="keys"` + separate `fs-assert-{type}`). (see origin: docs/brainstorms/2026-03-29-docs-consolidation-requirements.md)

## Proposed Solution

Collapse to 4 files in 1 repo, each serving a distinct audience:

| File | Audience | Content |
|---|---|---|
| `skills/.../SKILL.md` + `references/` | AI agents (Claude Code skill users) | Complete API reference, instrumentation guide, patterns, mistakes |
| `CLAUDE.md` | Contributors working on agent source | Project context, value props, architecture notes, dev commands |
| `README.md` | Humans (GitHub/npm) | Intro, install, quick start, config, link to full API |
| `AGENT_PAYLOAD_SPEC.md` | Backend/collector integrators | Collector endpoint spec (updated) |

## Implementation Phases

### Phase 1: Add Plugin Structure to Agent Repo

Create the Claude Code plugin scaffolding in the agent repo.

**Files to create:**

`.claude-plugin/plugin.json`:
```json
{
  "name": "faultsense",
  "version": "1.0.0",
  "description": "Instrument web apps with Faultsense production assertion monitoring",
  "author": {
    "name": "Faultsense",
    "url": "https://faultsense.org"
  },
  "repository": "https://github.com/Fault-Sense/faultsense-agent",
  "license": "FSL-1.1-ALv2",
  "keywords": ["monitoring", "assertions", "production", "feature-health"]
}
```

**Directory structure:**
```
skills/
  faultsense-instrumentation/
    SKILL.md
    references/
      common-patterns.md
      framework-syntax.md
```

Decision: Keep `references/` as separate files rather than folding everything into SKILL.md. Rationale: SKILL.md is already ~350 lines of instructional content (decision tree, reasoning framework, context detection). The API reference (~700 lines) and patterns (~300 lines) are reference material best kept separate so Claude Code can load them as needed without bloating the skill prompt. The current plugin structure already works this way.

**Acceptance criteria:**
- [ ] `.claude-plugin/plugin.json` exists with correct metadata
- [ ] `skills/faultsense-instrumentation/SKILL.md` exists
- [ ] `skills/faultsense-instrumentation/references/common-patterns.md` exists
- [ ] `skills/faultsense-instrumentation/references/framework-syntax.md` exists
- [ ] Plugin is installable via `claude plugin add Fault-Sense/faultsense-agent`

### Phase 2: Rewrite SKILL.md (Canonical LLM Document)

This is the largest phase. The new SKILL.md replaces the plugin's stale SKILL.md and absorbs the role of `llms-full.txt` as the authoritative API reference.

**Source material:** Use `llms-full.txt` (708 lines, most current and complete) as the primary source for API content. Merge in the instructional framing from the plugin's current SKILL.md (decision tree, reasoning framework, context detection, dynamic assertion values, progressive examples).

**Critical fixes from plugin's stale SKILL.md:**
- [ ] Fix OOB syntax: `fs-assert-oob-{type}="keys"` → `fs-assert-oob="keys"` + separate `fs-assert-{type}="selector"`. The agent uses `fs-assert-oob` and `fs-assert-oob-fail` as trigger replacements (like `fs-trigger`), with assertion types declared normally.
- [ ] Fix conditional grouping: `fs-assert-grouped` → `fs-assert-mutex` with all four modes (`type`, `each`, `conditions`, `"key1,key2"` selective)
- [ ] Add `fs-assert-emitted` assertion type with `detail-matches` regex matching
- [ ] Add `fs-trigger="event:<name>"` custom event triggers with `detail-matches` string equality
- [ ] Add `fs-assert-after` sequence assertions
- [ ] Add `fs-assert-stable` (inverted `updated`)
- [ ] Add `fs-assert-oob-fail` (trigger on parent fail)
- [ ] Add missing modifiers: `value-matches`, `checked`, `disabled`, `focused`, `focused-within`, `count`/`count-min`/`count-max`, `attr` with regex full-match
- [ ] Fix modifier semantics: `text-matches` and `value-matches` are partial match (unanchored); `attr` is full match (auto-anchored `^(?:value)$`)

**SKILL.md structure (keep from current plugin SKILL.md):**
- Frontmatter with name, description, activation triggers
- Guard clause (browser DOM only)
- Context detection instructions
- "How to Think About Instrumentation" reasoning framework
- Decision tree for assertion type selection (updated with `stable`, `emitted`)
- Quick reference tables
- Assertion key convention
- Dynamic assertion values section
- Timeout model
- Placement rules
- Common mistakes (expanded to match llms-full.txt's 17 items)

**Acceptance criteria:**
- [ ] Every attribute in `src/config.ts` is documented in SKILL.md or its references
- [ ] All four `fs-assert-mutex` modes documented with examples
- [ ] OOB syntax matches `src/config.ts` (`oobAttr` = `fs-assert-oob`, `oobFailAttr` = `fs-assert-oob-fail`)
- [ ] Custom event triggers and emitted assertions documented
- [ ] Sequence assertions (`fs-assert-after`) documented
- [ ] All inline modifiers documented with correct match semantics
- [ ] Decision tree updated for new assertion types

### Phase 3: Update Reference Files

**`references/common-patterns.md`** — Port from plugin, update all examples:
- [ ] Fix OOB examples to use `fs-assert-oob="keys"` syntax
- [ ] Fix conditional examples to use `fs-assert-mutex` instead of `fs-assert-grouped`
- [ ] Add patterns for: custom event triggers, emitted assertions, sequence assertions, stable assertions
- [ ] Ensure all 11+ patterns use current API syntax

**`references/framework-syntax.md`** — Port from plugin, minor updates:
- [ ] Keep HTML, React (with TS augmentation), Vue, Svelte sections
- [ ] Update TS type augmentation to include newer attributes (`fs-assert-mutex`, `fs-assert-stable`, `fs-assert-emitted`, `fs-assert-after`, `fs-assert-oob`, `fs-assert-oob-fail`)
- [ ] Note React boolean attribute caveat for `fs-assert-mutex`

**Acceptance criteria:**
- [ ] No reference file uses `fs-assert-grouped` or `fs-assert-oob-{type}` syntax
- [ ] Pattern examples compile against the current attribute parser

### Phase 4: Strip CLAUDE.md to Project Context

Remove all API reference content from CLAUDE.md. What stays is contributor context that helps someone working on the agent source code.

**Keep:**
- Core value props and differentiators (the "why" — guides scope decisions)
- "How Faultsense Differentiates" comparison table
- Instrumentation Guide header with pointer: "The full API reference is in `skills/faultsense-instrumentation/SKILL.md`. The quick reference table below covers the most common attributes."
- Quick reference table (the compact table, not the full API)
- Assertion key convention (brief)
- Key mistakes to avoid (brief list, not the full 17-item version)
- Project context section
- Notes section (queue/storage refactor, cross-type mutex)
- Timeout model
- Error context
- Configuration table and API methods
- Development commands

**Remove:**
- Detailed inline modifier reference (→ SKILL.md)
- Full conditional assertions section with all mutex mode examples (→ SKILL.md)
- Full OOB section with multi-check patterns (→ SKILL.md)
- Full invariant section (→ SKILL.md)
- Sequence assertions section (→ SKILL.md)
- Custom event assertions section (→ SKILL.md)
- Self-referencing selectors section (→ SKILL.md)
- Placement section (→ SKILL.md)

**Acceptance criteria:**
- [ ] CLAUDE.md is under 200 lines
- [ ] No assertion type documentation beyond the quick reference table
- [ ] Contains a pointer to SKILL.md for full API reference
- [ ] All project context, architecture notes, and dev commands preserved

### Phase 5: Fix README.md

Update to reflect the current API and link to the skill for full reference.

**Fix stale content:**
- [ ] Remove response-conditional examples (`fs-assert-added-201`, `fs-resp-for`) — replace with UI-conditional examples
- [ ] Update event payload interface to include `condition_key`, `attempts`, `error_context`, `user_context`; remove `status_reason`
- [ ] Update assertion types table to include `stable`, `emitted`
- [ ] Update quick reference to include `fs-assert-mutex`, `fs-assert-oob`, `fs-assert-oob-fail`, `fs-assert-after`
- [ ] Add `userContext` to configuration table
- [ ] Add link to full API: "For the complete API reference, see the [instrumentation guide](skills/faultsense-instrumentation/SKILL.md)."

**Acceptance criteria:**
- [ ] No references to `fs-assert-added-{statusCode}` or `fs-resp-for`
- [ ] Payload interface matches what the agent actually sends
- [ ] Configuration table matches CLAUDE.md's table
- [ ] Links to SKILL.md for full reference

### Phase 6: Update AGENT_PAYLOAD_SPEC.md

The spec serves backend integrators and needs to reflect the current agent output accurately.

- [ ] Add missing assertion types to `assertion_type` enum: `stable`, `emitted`
- [ ] Add missing modifiers to modifier table: `count`, `count-min`, `count-max`, `checked`, `disabled`, `focused`, `focused-within`, `value-matches`
- [ ] Fix modifier match semantics documentation (partial vs full match)
- [ ] Update auth section: remove `X-Faultsense-Api-Key` header reference, confirm POST body auth
- [ ] Add `user_context` field to payload schema
- [ ] Add `condition_key` field documentation
- [ ] Clarify `status_reason` — the agent does NOT generate failure reason strings; the collector derives them

**Acceptance criteria:**
- [ ] Every assertion type the agent can emit is listed
- [ ] Every modifier the agent can include is listed
- [ ] Auth method matches actual implementation

### Phase 7: Delete Redundant Files and Archive Plugin Repo

**In agent repo:**
- [ ] Delete `llms.txt`
- [ ] Delete `llms-full.txt`
- [ ] Delete `marketing.md`

**Plugin repo (`faultsense-plugin`):**
- [ ] Update README.md to say the plugin has moved to `Fault-Sense/faultsense-agent` with install instructions
- [ ] Archive the repo on GitHub (or mark deprecated)

**Acceptance criteria:**
- [ ] Agent repo has no `llms.txt`, `llms-full.txt`, or `marketing.md`
- [ ] Plugin repo README redirects to agent repo
- [ ] `claude plugin add Fault-Sense/faultsense-agent` works

## System-Wide Impact

- **npm package:** The `.claude-plugin/` and `skills/` directories are not in `package.json`'s `files` field and don't need to be — `claude plugin add` references the GitHub repo, not the npm package. No npm publish changes needed.
- **Existing plugin users:** Anyone with `Fault-Sense/faultsense-plugin` installed gets a stale skill. The archived repo's README will instruct them to switch. No automatic migration path exists for Claude Code plugins.
- **`llms.txt` convention:** Removing `llms.txt` means tools that look for this well-known file won't find it. The skill serves the same purpose for Claude Code specifically. If broader LLM discoverability matters later, a stub `llms.txt` pointing to the skill can be added — but this is not needed now.

## Key Decisions Carried Forward

- **SKILL.md is the single source of truth for the API** — chosen over llms-full.txt because the skill is the primary consumer (see origin)
- **Monorepo over thin-plugin** — eliminates cross-repo sync entirely (see origin)
- **CLAUDE.md is contributor context, not API docs** — prevents the largest source of duplication (see origin)
- **Keep separate reference files** — SKILL.md stays focused on instructional content (~350 lines), API reference and patterns stay in `references/` (~1,000 lines). This matches how Claude Code loads skill context.
- **OOB syntax uses `fs-assert-oob="keys"`** — confirmed against `src/config.ts:48`. The plugin's `fs-assert-oob-{type}` syntax is wrong and must be fixed.
- **Update AGENT_PAYLOAD_SPEC.md** — despite R5 saying "stays as-is", the spec is stale and will cause backend integration bugs. Small delta, high value.

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-29-docs-consolidation-requirements.md](docs/brainstorms/2026-03-29-docs-consolidation-requirements.md) — Key decisions: SKILL.md as canonical doc, monorepo approach, CLAUDE.md scoped to contributor context.

### Internal References

- OOB attribute definition: `src/config.ts:48`
- Current plugin structure: `/Users/mitch/src/faultsense-plugin/.claude-plugin/plugin.json`
- Most complete API reference: `llms-full.txt` (708 lines)
- Current SKILL.md (stale): `/Users/mitch/src/faultsense-plugin/skills/faultsense-instrumentation/SKILL.md`
