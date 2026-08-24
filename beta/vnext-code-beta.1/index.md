---
file: 'beta/vnext-code-beta.1/index.md'
description: 'Draft beta contract for executing the accepted CODE Work graph, deterministic checks and bounded repair.'
status: 'DRAFT'
---

# vNext CODE beta 1

This bundle extends the accepted `SPECIFY → PROTOCOLIZE → PLAN →
PLAN-REVIEW` contour with CODE. The existing root SDLC orchestrator continues
the flow; CODE does not create a second coordinator agent or coordinator Work.
The accepted PLAN produces child Works, the CLI preserves their complete
execution packets, and the orchestrator schedules the ready graph against the
RUN-level subagent capacity.

The bundle separates four proofs:

1. each Work completed its bounded task and focused checks;
2. the root orchestrator semantically verified the combined implementation
   against the accepted PLAN;
3. the complete CODE graph and project check profile are green after fan-in;
4. later CODE-REVIEW may independently judge implementation quality.

## Included specification

- [001 — CODE execution, verification and repair](specs/001-code-execution-verification-and-repair.md)
- [002 — E2E runtime corrections](specs/002-e2e-runtime-corrections.md)
- [007 — frozen execution profile and CODE completion](../../specs/007-execution-profile-and-code-completion.md)

## Required implementation sequence

1. strengthen PLAN and PLAN-REVIEW so every CODE Work has a sufficient
   fresh-session context packet;
2. preserve the generated packet when CODE Works enter the SQLite registry;
3. continue CODE in the root orchestrator Work and remove the false first-item
   coordinator convention;
4. make `work start` render the complete packet and dependency results;
5. make `work finish` run and record declared Work checks before completion;
6. make CODE stage finish validate graph closure, obligation coverage and the
   selected project check profile;
7. create repair Works from failed aggregate checks without reopening accepted
   historical Work;
8. add deterministic fixtures, a focused CODE eval and only then extend the
   end-to-end suite.
9. close the beta.89 E2E defects as one runtime cutover: preserve check aliases,
   separate infrastructure blockers from HITL, make model selection explicit,
   deduplicate usage by physical Session and enforce capacity-aware review
   packing.

The contract migration is deliberately narrow: reuse `semantic_spine`,
`execution_context`, `verification`, the generated `code-work-batch` and the
existing Work registry. Update their schemas, validators, renderers and tests
in place; do not introduce a parallel authored context document or a second
task store.

CODE-REVIEW semantics continue in
[vNext CODE-REVIEW beta 1](../vnext-code-review-beta.1/index.md). This bundle
does not define MERGE semantics.
