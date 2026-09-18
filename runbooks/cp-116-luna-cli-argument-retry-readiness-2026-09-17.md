# CP-116 — CLI argument correction, hooks observe only

Status: prepared, not started. This is a local-development engine experiment,
not a new npm release or a claimed live E2E PASS.

## Fix and evidence

- All six hook adapters retain native identity/receipt observations without
  validating CLI arguments, decoding payload files, binding logical RUN/Work
  state, or issuing retry commands. Native proof, storage and identity failures
  still propagate as infrastructure failures, without retry.
- Codex proof resolves the workspace from the owning daemon, not the model's
  project argument. Incorrect paths leave observable native evidence but no
  match key that could conflict with a corrected non-rewriting invocation.
- CLI routes managed invocations using retained scope and validates arguments
  before execution. Issued/observed rejection atomically records no-effect and
  its single exact successor; old IDs replay the retained result. Executing,
  committed or unknown-effect attempts do not receive argument-correction retries.
- Session registration consumes native receipt identity in CLI; RUN existence
  is checked before binding. Native profile/parent and A→B→A segment history
  survive the responsibility change.
- Shared worker instructions permit only explicit CLI no-effect retries and
  forbid retrying hook/transport failures. Droid reuses the same instruction.
- Existing native probe now injects a real storage failure; an unknown CLI
  invocation ID is no longer mislabelled as a native hook failure. The changed
  live probe was syntax-checked, not executed during preparation.

Verification: core admission/hook/delegation suite 81 passed; focused Session
history and invalid-RUN registration checks both passed. Wider affected suites
passed after correcting the old hook-driven Session fixture. The final
non-rewriting receipt correction passed all 11 affected tests across six
adapters and CLI. Build, typecheck, targeted ESLint and whitespace checks passed.
No full release gate, product quality/browser gate or live E2E was repeated.

## Prepared experiment

- EVAL: `EVAL-20260917203539-669583e5`.
- Root: `/Users/deksden/.dd-eval/qualification/cp-116-luna/runs/EVAL-cp116-luna`.
- Request: `cp116-luna-code-review-fork-001`.
- Source: CP-113 sealed CODE checkpoint
  `code-4b9cc39ee6a7a8ae6a46e10d3e3127e64da701cd2716c9dc0e7196ce88add8d4`.
- Start at CODE-REVIEW, then MERGE; earlier five stages and accepted source
  baseline are inherited through the normal checkpoint fork API.
- Engine: `0.9.0-beta.75`, local immutable snapshot checksum
  `95370cf8afc1a2d8b3abcae9a3ee7bb3c10780fdc86bb216cacee563c94d118d`.
- Subject: Codex 0.154.0, Luna xhigh, capacity 6. Judge: Sol high, same native
  Codex runtime. Installed configuration agrees with retained profiles.
- Exact installed adapter doctor passed. Receipt:
  `/Users/deksden/.dd-eval/qualification/cp-116-luna/evidence/codex-doctor.json`.
- PostgreSQL loopback port 55433 accepted connections during preparation.
- MERGE target Git checkout is clean. Feature checkout preserves the expected
  task-priority source/docs/test edits and migration from the sealed CODE state;
  no reset or cleanup was applied.
- Status is `planned`, fork receipt `ready`; process, provider-turn and runner-
  attempt inventories are empty. No monitoring automation is needed yet.

CP-115 was an unstarted intermediate preparation before the final receipt-key
correction. It remains untouched for evidence and must not be launched. CP-116
is the selected next experiment. Original CP-113/CP-114 evidence was not changed.

## Launch only after authorization

```sh
DD_FLOW_CONFIG_HOME=/Users/deksden/.dd-eval/qualification/cp-116-luna/engine-config \
DD_FLOW_RESOURCE_HOME=/Users/deksden/.dd-eval/qualification/cp-110-luna/resources \
node bin/dd-eval.mjs runner fork \
  --eval /Users/deksden/.dd-eval/qualification/cp-113-luna/runs/EVAL-cp113-luna \
  --execution e2e \
  --from code-4b9cc39ee6a7a8ae6a46e10d3e3127e64da701cd2716c9dc0e7196ce88add8d4 \
  --output /Users/deksden/.dd-eval/qualification/cp-116-luna/runs/EVAL-cp116-luna \
  --engine-version 0.9.0-beta.75 \
  --integrity-checksum 95370cf8afc1a2d8b3abcae9a3ee7bb3c10780fdc86bb216cacee563c94d118d \
  --request-id cp116-luna-code-review-fork-001 --start true
```

Run from the dd-eval repository. Once started, monitor controller stage, Work
receipts, native outcomes and terminal cleanup. A CLI correction should remain
in the same Session and start the intended Work once. A real hook error must
stop the owned tree and retain its original diagnostic. Create a heartbeat only
after launch, notifying on meaningful change, failure or completion.
