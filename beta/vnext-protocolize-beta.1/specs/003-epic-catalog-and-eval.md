---
file: 'beta/vnext-protocolize-beta.1/specs/003-epic-catalog-and-eval.md'
description: 'Epic catalog shelf migration and two-mode PROTOCOLIZE eval proof.'
status: 'DRAFT'
---

# 003 — Epic catalog and eval proof

## Shelf

New beta projects use `.memory-bank/epics/` as the epic and feature catalog.
`plans/` remains for plans, roadmaps and playbooks. Archived documents are not
rewritten. Canonical migration is deferred until beta proof is accepted.

The catalog is active only when project policy or `.memory-bank/epics/index.md`
declares it. PROTOCOLIZE does not create an otherwise absent catalog.

## Eval

`EVAL-003-vnext-protocolize-task-priority` uses one frozen accepted SPECIFY
result, the same checkpoint and same model/reasoning for both modes:

- `same_session`: PROTOCOLIZE continues in the Session that specified the task;
- `new_session`: a fresh Session receives only the materialized handoff.

Both runs must produce one task-priority feature under the existing task
management epic, one PRT, a primary acceptance contract, and a link to
SCN-002. They must not create a PSET, ADR, standalone scenario, worktree or
PLAN/CODE artifact.
