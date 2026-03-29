---
date: 2026-03-29
topic: docs-consolidation
---

# Documentation Consolidation

## Problem Frame

Documentation is spread across 10 files in 2 repos. Every API change requires updating content in multiple places — CLAUDE.md, llms-full.txt, and the plugin repo's SKILL.md + references all contain overlapping API reference material. The plugin repo's SKILL.md is already stale (uses `fs-assert-grouped` instead of the current `fs-assert-mutex` API). This maintenance burden will only grow as the API surface expands.

## Requirements

- R1. Merge the Claude Code plugin into the agent repo. Add `.claude-plugin/plugin.json` and a `skills/` directory to `faultsense-agent` so it serves as both the npm package and the Claude Code plugin.
- R2. The skill's `SKILL.md` becomes the single canonical LLM-facing document — the complete API reference, instrumentation guide, decision tree, common patterns, and common mistakes. It replaces `llms.txt`, `llms-full.txt`, and the plugin repo's duplicated content.
- R3. `CLAUDE.md` is stripped down to project-level contributor context only: core value props/positioning, project context, architecture notes (timeout model, error context, queue/storage notes), configuration table, API methods, and dev commands. No API reference duplication — it references the skill for that.
- R4. `README.md` remains the human-facing introduction: what Faultsense is, installation, quick start, configuration, basic examples, and a link to the full API in the skill.
- R5. `AGENT_PAYLOAD_SPEC.md` stays as-is — it serves a distinct audience (backend/collector integrators) and doesn't overlap with the other docs.
- R6. Remove `llms.txt`, `llms-full.txt`, and `marketing.md` from the agent repo.
- R7. Archive the `faultsense-plugin` repo (or mark it deprecated with a pointer to the agent repo).
- R8. The SKILL.md must be updated to reflect the current API — fix `fs-assert-grouped` → `fs-assert-mutex` with all four modes, add custom event triggers (`event:<name>`), add `fs-assert-emitted`, add `fs-assert-after` (sequence assertions), add `fs-assert-stable`, add missing modifiers (`value-matches`, `checked`, `disabled`, `focused`, `focused-within`, `count-*`, `attr`), and add `fs-assert-oob-fail`.

## Success Criteria

- A single API change requires editing exactly one file (SKILL.md)
- `faultsense-plugin` repo is no longer needed for distribution
- No content is duplicated across files — each doc file has a distinct audience and purpose
- The skill is installable via `claude plugin add Fault-Sense/faultsense-agent`
- SKILL.md covers the complete, current API surface

## Scope Boundaries

- NOT restructuring the source code or tests — docs only
- NOT changing the npm package structure or build
- NOT creating new documentation formats (e.g., a docs site) — that's a separate effort
- NOT changing the collector/payload spec
- The event payload table currently in the plugin's SKILL.md can move to AGENT_PAYLOAD_SPEC.md or stay in SKILL.md — decide during planning

## Key Decisions

- **SKILL.md is the single source of truth for the API**: Chosen over llms-full.txt because the skill is the primary consumer of API docs (instrumentation agents), and it eliminates the need for a separate LLM-readable file.
- **Monorepo over thin-plugin**: Merging the plugin into the agent repo eliminates cross-repo sync entirely, rather than just minimizing it.
- **CLAUDE.md is contributor context, not API docs**: Prevents the largest source of duplication. Contributors working on the agent codebase need project context; they can reference SKILL.md for API details.

## Dependencies / Assumptions

- Claude Code supports plugins where `.claude-plugin/` coexists with other project infrastructure (package.json, src/, etc.) in the same repo
- The `faultsense-plugin` repo on GitHub can be archived or have its README updated to redirect

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Needs research] What is the exact directory structure Claude Code expects for a plugin with skills? Verify `.claude-plugin/plugin.json` schema and `skills/` directory conventions.
- [Affects R2][Technical] Should the skill have separate reference files (like the current `references/api-reference.md`, `references/common-patterns.md`, `references/framework-syntax.md`) or consolidate everything into a single SKILL.md?
- [Affects R3][Technical] Exact list of what stays in CLAUDE.md vs what gets cut — needs a line-by-line pass during planning.
- [Affects R8][Technical] Full diff of current SKILL.md vs current API to identify all gaps that need updating.

## Next Steps

→ `/ce:plan` for structured implementation planning
