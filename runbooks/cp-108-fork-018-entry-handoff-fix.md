# CP-108 fork-018: Stage entry bypassed the controller handoff

## Evidence and root cause

Failed EVAL: `/Users/deksden/.dd-eval/qualification/cp-108-zcode/forks/EVAL-20260916110000-code-review-fix-fork-018`.
Controller: `DRV-541c5688-010f-4bcd-ac39-ae63cdefbcca`.
Read its `turn-00001.md`, `code-review-1.stage-start-response.json`, and
`session-1/adapter.events.jsonl` together.

1. The entry prompt required the exact `stage start`, then told the model to
   read and execute the whole Stage packet. Its generic “Work-graph boundary”
   wording did not identify when to yield.
2. The packet returned `orchestration.kind: work_fanout` and told the coordinator
   to list ready Works and start them in fresh child Sessions. Its example
   `work ls --ready` inherited the managed invocation scope.
3. Ready Work start commands had not been issued yet: `nextControllerFanout`
   runs only after the entry Turn returns. Read-only listing cannot issue them,
   so the literal example failed with `invocation_command_unprepared`.
4. After trying help and an unscoped command, the model attempted `work start`
   itself, received `trusted_session_binding_required`, and improvised a UUID
   using `INV=$(uuidgen ...)` and `--invocation-id "$INV"`.
5. The CLI rejected the expanded UUID; the native observation path also saw
   literal `$INV`. Neither value was issued by runtime. The controller failed
   with `harness_adapter_failed` / `invocation_unknown` before any reviewer ran.

The dollar sign was a downstream symptom. Shell interpolation alone would not
fix this failure. The underlying defect was inconsistent ownership of the
entry Turn and child-command preparation, reinforced by an unactionable error.

## Implemented behavior

The shared RUN controller now renders an explicit entry handoff for every
Stage. The agent executes the supplied command verbatim and reads the complete
packet. If it contains `work_fanout`, it acknowledges entry and ends the Turn.
Graph creation, native child dispatch and Stage finish instructions in the
packet are scoped to later controller continuations. A non-fanout Stage keeps
its existing semantic execution behavior.

The controller then follows its existing graph decision:

1. Inspect the graph in its writable runtime context and issue retained start
   commands. If graph materialization is required, request only that work.
2. Apply the frozen delegation policy and capacity. For native delegation,
   supply each exact issued command to a direct child; for external delegation,
   use the existing external launcher.
3. Observe accepted child results and return semantic decision/finish control
   to the coordinator.

The prompt explicitly forbids inventing/reusing invocation IDs or replacing
them with shell variables. A missing prepared command now instructs the model
to end the Turn and await the controller's exact assignment. No new dispatch
mechanism, ID generator, retry loop or writable diagnostic command was added.

Regression coverage uses real SQLite Work/invocation records for PLAN-REVIEW,
CODE and CODE-REVIEW: reproduce inspection before issuance, obtain the native
assignment from `nextControllerFanout`, verify its issued ID/scope and verify
read-only listing reuses the same command without starting the Work.

## Preparation and remaining qualification

Prepare fork-019 from fork-017's sealed `code-review` entry checkpoint:
`code-ac58c02c5d5e4c0a3f6527003d7578f8c63cc988bb7583cdfced40e3324dc490`.
Use the rebuilt engine artifact with its exact checksum and `runner fork`
without `--start true`. The prepared fork's `fork.json` records the exact
launch command. Preserve fork-018 and the source checkpoint as evidence.

Live model compliance is not proven by deterministic tests. During the next
authorized run, inspect the entry acknowledgment and the next controller Turn:
the first child must receive the issued standalone `work start` command.

Prepared on 2026-09-16:

- Root: `/Users/deksden/.dd-eval/qualification/cp-108-zcode/forks/EVAL-20260916-entry-handoff-fork-019`.
- EVAL: `EVAL-20260916113736-3c21d3de`; status `ready`, not started.
- Local engine: `0.9.0-beta.74`, checksum
  `31ed3944da3c31c4cd4b62e6259132dcc5bc38fa06edd11dc035739c6613b780`.
- Preparation config: `/tmp/dd-e2e-fork019-config.HX32h1`; the engine is also
  copied into the prepared fork. Use its retained `fork.json` next_command.
- Non-generative doctor: compatible, lifecycle qualified; native ZCode
  `0.16.5`, ACP `0.13.1`, commit `60af0d31e13076a313d9770f10aa70f7c94742cf`,
  contract `dd-zcode-harness@1`.
- Validation: 7 fanout/storage tests, 8 real controller-stage tests,
  42 lifecycle-invocation tests (41 passed initially; the assertion for the
  deliberately changed error text was updated and its focused rerun passed),
  typecheck, changed-source lint and build. No full product baseline/E2E was run.

## Shutdown and cancellation fixes

The same incident exposed two additional defects, now fixed:

1. `AcpBridge.close()` replayed an earlier productive lifecycle error after
   physically stopping the provider. Close now drains notifications and reports
   physical shutdown/persistence failures only. Productive `flush()` still
   reports the original error, including on the normal direct-operation path.
2. Closed-session inspection discarded confirmed settlement by querying the
   already closed native transport. The daemon now retains complete, settled
   evidence for the matching closed Session, including evidence obtained by a
   later tree observation. Incomplete evidence still requires observation;
   physical provider termination remains a separate required step.
3. Eval cancellation collided with the RUN's existing fatal stop. It now reads
   the existing control receipt, requires the same current stop ID, and reuses
   it. A failed worker is reconciled using the existing idempotent request ID.
   Foreign controls and non-stop controls are not accepted as successful stops.

Execution order: productive error remains visible → native cancellation records
settlement → daemon inspection reuses terminal evidence → provider process exits
→ physical settlement is persisted → eval observes/reconciles that same stop.
No second stop owner or new retry mechanism is introduced. Fork-018 evidence
remains untouched; this does not retroactively seal or repair that failed RUN.

Validation: 27 adapter tests passed; the strengthened real-process fatal-error
shutdown test also passed separately. The cross-process daemon/tree cancellation
integration passed; all 5 eval cancellation tests passed. Node syntax checks,
engine build and diff whitespace checks passed. The native-timeout test now
expects the existing non-retryable unknown-outcome contract, not a blind retry.

## Complete replacement preparation

Fork-019 contains only the entry fix; use fork-020 for the complete fix set:

- Root: `/Users/deksden/.dd-eval/qualification/cp-108-zcode/forks/EVAL-20260916-stop-settlement-fork-020`.
- EVAL: `EVAL-20260916115920-1afe904c`; status `ready`, not started.
- Same sealed fork-017 checkpoint and `code-review` entry as above.
- Engine `0.9.0-beta.74`, checksum
  `539af3d74f0f3d2ae2f147a5ee3cd36360696673357deb4c51c1abbeca78c29a`.
- Preparation config: `/tmp/dd-e2e-fork020-config.lgL6jS`.
- Non-generative doctor passed with the same qualified native tuple above.
- Launch through the current dd-eval checkout using the retained `fork.json`
  `next_command`; do not use an older installed eval without the cancellation fix.

Live E2E qualification is still pending. On the next authorized run verify both
the controller/child handoff and, if cancellation occurs, settled native and
physical shutdown receipts. Do not substitute an old fork's engine or rewrite
its runtime records.
