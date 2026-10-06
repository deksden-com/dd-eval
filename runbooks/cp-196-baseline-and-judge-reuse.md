# CP-196: baseline ownership and reusable Judge evidence

Historical Luna `EVAL-20261006154813-12176465` in
`/Users/deksden/.dd-eval/qualification/cp-196-luna.wLeaDy` failed before baseline
commands or Subject dispatch. Its primary error was
`process_maintenance_receipt_invalid`: registration omitted the expected exact
home binding. The subsequent unregistered-project Judge error was secondary.
Do not resume, edit or repair that historical run.

## Root causes and fixes

1. `launchEvalExecution` paired the control-runtime wrapper (which pins its own
   `DD_FLOW_HOME`) with execution-runtime ownership expectations. Baseline now
   uses the execution wrapper and execution home together, in both E2E and
   focused paths. Exact ownership/admission checks remain unchanged.
2. A real-wrapper regression exposed macOS `/var` and `/tmp` aliases: relative
   adapter links were computed from lexical rather than physical directories.
   Shim installation now computes the relative link between physical paths;
   its portable alias and explicit home identity remain intact.
3. Qualification@3 conflated native generation, oracle evaluation and whole
   repository provenance. Qualification@4 retains per-task native observations
   and evaluates them under current oracle/validator inputs. Harness repairs do
   not cause new Judge calls. See [launch policy](execute-eval.md#before-launch).

No source-product, canonical-answer, model or pinned engine artifact is changed.
Native attempts are not repeated to obtain PASS. Legacy receipts and failed
EVALs remain immutable. All matching settled native answers, including prior
semantic failures, must satisfy the current assessment.

## Verification and acceptance

The runnable regressions in `test/eval.test.mjs` cover repository/harness
provenance independence, per-question/context/canonical-answer invalidation,
model-wide invalidation, corpus composition, deterministic oracle changes,
legacy read-only import, checkout-path independence, negative native evidence,
and unconfirmed-task fencing. Existing omission regressions continue to reject
incomplete or forged Judge answers.

`test/baseline-admission.test.mjs` exercises the real pinned wrapper: the wrong
control/exec pair must fail before its command, and the correct pair must pass,
renew ownership, cancel safely, and retain source integrity. The shared caller
selection is additionally guarded by the E2E dispatch test.

Use the [paired test environment](flow-test-suite-verification.md#paired-eval-checks)
where applicable. A
fresh Luna launch requires baseline PASS, an actual native Subject Session and
SPECIFY in RUN controller/timeline; a dispatch receipt alone is not acceptance.
Full scored E2E completion remains separate from startup acceptance.

Local development checks: the paired full selection passed 584/584 with no
skips; after the final review changes, the affected selection passed 169/169
with no skips. Before live dispatch, repeat the full selection against the
frozen committed candidate. Read-only rehearsal against the real qualification
archive found 20/20 cases covered by 44 native finals, all passing current
assessment, with zero missing tasks and zero new provider calls.
