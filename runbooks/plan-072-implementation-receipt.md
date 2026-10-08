# Plan 072 implementation receipt

Implementation date: 2026-10-08. Task branches: dd-eval
`fix/072-hitl-transport` (base `5f5879c`), dd-flow-cli
`fix/072-hitl-renewal` (base `2ba2ce2`). User-owned source checkouts and
historical EVALs were not changed. No release, installation, merge or new EVAL
was performed.

dd-flow implementation commit: `e61fd67`.

## Changes

- A: shared managed HITL resume renews a pause assignment in the same writer
  transaction and retains its cycle linkage. A fresh native question cannot
  inherit an old settled pause; exact identity replay remains immutable.
  The two-cycle regression also exposed stale resume-command reuse (answer-file
  is excluded from its fingerprint). Resume authority is renewed at the new
  accepted pause boundary, not by inspection or replay.
  Independent review additionally found retry/recovery successor-link gaps.
  Authorized successor paths now atomically retarget pause authority while
  retaining the exact origin resume receipt; Work/attempt/root/generation
  fences and unknown-effect barriers remain checked. Final independent A
  review found no remaining substantial issue.
- B: both optional decision transports use one bounded HTTP reader with sliding
  inactivity and safe diagnostics. Successful HTTP with invalid JSON/schema
  falls back without resampling. Transient HTTP/network failures retain the
  existing bounded retry owner; legacy qualification remains single-shot.
  Independent review found missing diagnostics on owner-level early refusals;
  those now expose additive metadata without fabricating an HTTP attempt.
- C: retained CP-201 Q-004 and the original canonical answer as a frozen negative
  regression. After explicit user choice, synchronized SPECIFY/PLAN canon:
  absence of state or explicit `open` creates an open task; `closed`/invalid
  values reject creation without a write. Closing is a later update. Priority
  rules and archived-project read-only boundaries remain unchanged. This is
  fixture authoring, not a manual product repair or reassessment of old runs.
  Added literal positive proof at both stages and negative opposite-policy and
  independent-question regressions. Existing corpus/context hashes and accepted
  historical descriptors do not reference changed authoring bytes, so they
  were not rewritten; runner hashes each current stage fixture at planning.
- D: existing not-applicable acceptance receipt repair remains unchanged and
  covered by the runner recovery regression.

## Verification

dd-eval:

- Targeted semantic/routing/coverage/recovery/corpus tests: **106 PASS**.
- Full `DD_FLOW_SOURCE_ROOT=<built dd-flow worktree> node --test
  --test-concurrency=1`: **671 PASS, 10 skipped, 0 failures** (681 tests).
  An initial run without the required source-root fixture setting failed;
  the configured full rerun passed. No paid provider calls were made.
- Independent B/D review and `git diff --check` passed. The early-owner
  diagnostic gap identified by review was corrected and tested.

dd-flow:

- Final lifecycle suite: **131 PASS**; SPECIFY suite: **22 PASS**.
- Stage attachment regression: **2 PASS**; a new attempt drops the previous
  attempt's cycle linkage rather than inheriting stale authority.
- `pnpm typecheck` and `pnpm lint`: PASS.
- Managed regressions cover new/same question bytes, immutable replay,
  no-successor rejection, rollback, unknown settlement, packet binding,
  read-only rendering, malformed-input correction, stale attempt/Work and
  recovery generation with retained origin resume.
- Final `pnpm build`: PASS. Controller suite: 32 PASS, one ZCode failure during
  a concurrent build's asset recopy (`ERR_MODULE_NOT_FOUND`). Its isolated
  rerun after final build is recorded below; no build runs alongside it.
- Isolated final-built ZCode full-cycle rerun: **1 PASS, 6 filtered/skipped**,
  53.64 s. Thus all 33 selected controller cases passed across the initial
  run and the corrected sequential rerun; this is not a claim that a single
  full controller invocation passed.

## Canon follow-up after user choice

User selected open-only creation on 2026-10-08. Corpus regression: **24 PASS**.
Affected corpus/contract/entry-pack/coverage/EVAL tests with
`DD_FLOW_SOURCE_ROOT` set to the built runtime: **145 PASS, 0 failures**.
Final corpus recheck after the opposite-policy assertion: **24 PASS**.
Initial affected-test invocation omitted the required source-root setting and
failed that fixture assertion; the configured rerun passed.
No new live qualification or EVAL was launched. Previously retained answers and
model receipts were not rewritten. Ponytail: existing canonical fixtures and
validators reused, with no new parser, API field or runtime mechanism.

Source correctness does not prove a new scored run or decision-model speedup.
All implementation packages are complete; live operational acceptance and merge
remain separate actions.
