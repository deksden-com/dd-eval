# Task Priority eval baseline audit — 2026-09-06

There is one product task: add task priority. Its active definition is
`cases/sdlc-eval-2026-summer-task-priority/case.json` (`case@7`). EVAL-001,
EVAL-002, EVAL-003 and EVAL-005 contain historical definitions in the old
schema; EVAL-004 retains historical PLAN results. They are not additional
current runner cases. `sdlc-eval-2026-summer-recovery` is a separate technical
recovery campaign using the same task, not a second product benchmark.

The active run profile selects Subject, Judge, concurrency and seven-stage
E2E contour: SPECIFY → PROTOCOLIZE → PLAN → PLAN-REVIEW → CODE → CODE-REVIEW
→ MERGE. The case pins the initial request and checkpoint by SHA-256.
`assessment.json` defines outcome/flow criteria; the private interaction
fixture supplies one required clarification. Neither that answer nor golden
decisions are initial Subject context.

## Correct source and preparation

Remote tag `dd-tasks:eval/cp-068-source` resolves to
`44939e95060a65e80571acdcbf42609b80621e63` (verified with `git ls-remote`).
This is the pre-feature source, also used by CP-070. E2E clones that source,
then overlays only `.memory-bank/dd-flow` from the separately pinned flow
commit. CP-073 retains Memory Bank 4.0.6 at `f4d613d5` and engine beta.19 at
`02648aa2`, while restoring the tagged product baseline. The runner verifies
the tag/commit pair and the project flow-pack manifest before opening a Session.

CP-071 accidentally used `f4d613d5` for both source and flow. That product
already implemented three priorities, default Medium, and archive read-only.
The eval fixture instead specifies four priorities, default no_priority, and
an archive priority-edit exception. Its scored Droid attempts cannot establish
a Subject failure. CP-071 and their receipts remain unchanged historical data.
CP-072 inherits this source and must not be used as a scored Task Priority
baseline; its read-only native recovery smoke results remain separate evidence.

`entry_pack: null` means focused/segment runs are not ready: they require a
new accepted canonical entry pack. E2E needs no canonical Session or pack.
Use `runner eval preflight` for E2E, not `fixtures validate`.

## Installed contour at audit

- Global published engine: `@deksden-com/dd-flow-cli` beta.19; npm beta tag
  also beta.19. Local source beta.20 exists but was not published.
- Droid: 0.212.0, profile protocol 1.201.0, Sol 5.6 high, auto-high;
  profile records previously qualified native child capacity 15.
- Codex Judge/Interaction Judge: CLI 0.153.4, Sol 5.6 high. The beta.11 suffix
  in its profile ID is historical; the checkpoint selects the actual engine.
- Harness configuration names explicit adapter and native executable paths.
  The repeat uses a dedicated copy pointing to its committed adapter checkout.

Version checks and preflight establish setup readiness only. Live execution,
native children, cleanup and the scored outcome require their own evidence.
