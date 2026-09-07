# Recovery defect-class audit — 2026-09-07

Status: systemic fixes and regression verification are in progress. Published
beta.30 exposed a final AGY terminal-settlement race during qualification; its
historical evidence is retained and the corrective beta.31 is under test.

## Evidence and limits

The beta.28 run EVAL-20260907102527-fd7c221f retained its native AGY
conversation across recovery. PLAN finished in the native tool receipts, but
the terminal provider result remained ERROR and repeated the earlier quota
message. A subsequent recovery failed with recovery_owner_missing before
productive dispatch. These are different failures, not evidence of a newly
exhausted account. Historical engine pins, captures and Judge receipts remain
unchanged.

The audit traced each observation through native adapters, daemon persistence,
runner reconciliation, engine recovery ownership, and immutable Judge input.

| Defect class | Confirmed affected paths | Systemic correction |
| --- | --- | --- |
| Historical state used as current authority | Engine owner lookup excluded completed stage WorkSessions; accepted old recovery bindings survived later generations | Retain the latest coordinator identity at completed boundaries; ACK without reopening accepted Work; reject earlier owners and retired generations |
| Native counters mistaken for globally monotonic turn identity | AGY reused executionNum, causing current Stop hooks to be discarded; actual step_index was ignored | Use local prompt generation and native step boundaries; retain tool identities and observation state across daemon restart |
| Wrong native result scope | AGY could process RUNNING or unsolicited idle results as terminal; OpenCode discarded the current POST response and read the last assistant from history | Validate terminal status, drain earlier AGY stream events before dispatch and retain settled outcomes against unsolicited results; bind OpenCode output to a new assistant message in the requested Session; preserve provider errors in HTTP-200 responses |
| Error provenance lost across transport or concurrent requests | Pretty JSON engine errors flattened to reconciliation failure; ACP Session reads cleared provider errors for a pending prompt | Parse complete structured error envelopes; attach ACP provider detail to the pending prompt itself (ZCode and Grok) |
| Evidence identity overwritten or incompletely compared | Event enrichment overwrote journal sequence; candidate matching ignored changed failure evidence; revision parent always referred to the original | Journal owns sequence; compare full candidate execution evidence; hash-check original and revised inputs; link to the immediately preceding frozen candidate |
| Recovery progress omitted from projection | Recovery at a completed stage skipped ACK/boundary capture; retry allocation ignored pending or completed retries; reports flattened repeated attempts | ACK retained running/paused/completed state before continuation; reuse deterministic boundary captures and durable retry operations; retain per-operation interruption segments |
| Evidence silently dropped during adapter packaging/restart | AGY/OpenCode CLI ignored configured journal; AGY restart dropped tool/descendant state; bundled AGY lacked the fallback hook-denial response | Forward and mirror configured journals with identical event identities; restore accounting completeness and topology; mirror the fail-closed hook response |
| Root settlement was not propagated to previously replaced children | An authoritative AGY root `Stop(fullyIdle=true)` coexisted with earlier child IDs that emitted no individual terminal hook; the adapter released the root result before that Stop | Keep terminal SUCCESS pending until the root Stop settles unknown descendants as `settled_by_root`; retain that evidence distinctly and exclude it from Work reconciliation |

Codex and Droid already bind productive outcomes to native turn/request IDs.
Their existing terminal-identity and late-reply tests were included in the full
runner suite. OpenCode and ACP changes are mirrored in dd-flow's bundled runtime
and dd-eval's fallback adapters.

## Conservative boundaries

- Repeating a previous AGY error is marked as repeated_conversation_error, not
  converted to success. Textual completion is not terminal success evidence.
- AGY Stop notifications may omit native step or turn identity. Local receive
  generation cannot prove that an arbitrarily delayed identity-free
  notification belongs to the current turn. Terminal result and tree settlement
  remain required; this audit does not claim perfect native notification fencing.
- ACP retry notifications have Session identity but no native prompt ID.
  Only a currently pending prompt receives them; this does not manufacture
  native causality for a delayed notification.
- OpenCode malformed, foreign or historical response messages fail closed.
  Losing an observer does not authorize replaying a productive operation.
- Completed Work and historical candidate/Judge artifacts are not rewritten to
  make a recovery pass.

## Controlled qualification evidence

The first controlled provider kill at
`EVAL-20260907122445-13e9d767` occurred only after PLAN and its retained Work
Session had reached `completed`. Its pre-fix cleanup did not use cancel-tree
for `agy_terminal_result_missing`, so capture correctly refused to fabricate a
settlement. The exact owned daemon was subsequently cancelled and observed
clean; that historical run remains unchanged.

The second controlled run,
`EVAL-20260907124625-aecb009f`, used the cleanup correction. It killed only
the verified owned AGY provider after the same PLAN boundary, then sealed
`RCV-3ace1f90-37c6-492f-9bab-76447be6776e` with a clean daemon receipt and
immutable manifest `4d86d6a39bf75a3261f4284038f0b01fcdb5aa7e3bd0ec6d80af088cbe7e6e60`.
Recovery accepted that exact manifest, retained `WRK-002-plan` as completed,
captured its boundary once, and proceeded to PLAN-REVIEW and CODE without a
second PLAN Work or stage start.

During CODE, one direct native child became silent. The configured 600-second
liveness limit did eventually raise `subject_liveness_timeout`, but only after
an avoidable second full timeout window. The recovery bridge then attempted a
normal daemon stop and received `tree_not_settled`, leaving the later capture
correctly unavailable rather than sealing an unconfirmed tree. The daemon was
explicitly cancelled only after its exact owner and active state were checked.
The pinned run and its evidence were not modified. This is a failed
qualification for the next recovery segment, not evidence of a passing full
E2E run.

The correction now polls durable native activity within the bounded interval
and measures the deadline from the last observed activity, preserving
observation-clock gap semantics. A recovery bridge uses cancel-tree for the
same confirmed liveness/identity/provider-exit failure classes as the primary
execution cleanup. Both changes are covered before the next release and fresh
qualification.

The published-artifact run `EVAL-20260907141728-60c82e75` reached PLAN and
PLAN-REVIEW using beta.30. Its root emitted SUCCESS and then
`Stop(fullyIdle=true)`; the Work-backed child had its own terminal Stop, while
two earlier, replaced native child IDs remained individually unobserved. The
adapter had already returned the terminal root result, so the runner attempted
the next prompt and correctly received `tree_not_settled`. This is a
qualification failure, not a claim that those unknown children completed. The
new handling records them as `settled_by_root`, waits for that root evidence
before returning the prompt receipt, and never sends those records to
per-Work fan-out reconciliation.

## Verification

- Full dd-eval suite after the root-settlement correction: 244/244 passed.
- Focused engine snapshot and bundled-runtime suites: 19/19 passed, including
  repeated boundary recovery and prior-generation hook refusal.
- Journal identity, retry-label, superseded-source, and bundled provider-error
  checks passed. Engine typecheck and lint passed. The final latest-owner
  refusal check passed in the 12-test snapshot suite. The full engine suite
  remains pending at this checkpoint.
- The bundled-runtime liveness regression and engine typecheck/lint pass. A
  fresh full engine suite and a new clean qualification remain required before
  asserting the follow-up release or full E2E recovery result.

## Release candidate

Engine source `88b1f0f37ffa205a7ed21b56054849d083707501` was published as
`@deksden-com/dd-flow-cli@0.9.0-beta.30` under npm's `beta` tag and Git tag
`v0.9.0-beta.30`. Its published-artifact checkpoint is cp-082. The next
release, beta.31, will contain the root-settlement ordering correction above.

Checkpoint cp-081 pins the local candidate, not the published tarball. Its engine
snapshot checksum is
`c73de06350815334c079ba68cb540ed91ab4987a1d0e9b02dfbd9c6cea380f59`.
The product baseline and project flow-pack commits are unchanged from cp-080.
Use the documented absolute DD_FLOW_BIN development override for this
qualification. Its historical snapshot remains immutable; a published-artifact
checkpoint must be a new definition rather than an edit to cp-081. That
published definition is now cp-082, pinned to beta.30 source
`88b1f0f37ffa205a7ed21b56054849d083707501` and its independently installed
package snapshot checksum
`427d9afb69f2106bda39058be08e9c900517846f49b017c25b38e247aa239dce`.

## Native counter check

An isolated AGY 1.1.27 check is retained at
`/Users/deksden/.dd-eval/conformance/agy-error-scope.R5nwaq`.
The qualified Session `4ba8bf8a-2e3f-4ceb-86d7-accc2c030ccc` returned
the native unsupported-print-mode error for /fork with num_turns=0.
A subsequent read-only prompt returned SUCCESS/READY with num_turns=1 and no
tools. After clean daemon restart, /fork returned a fresh error with the same
num_turns=1. An immediate subsequent input encountered the provider's exit(2)
and was reported as agy_terminal_result_missing, not success. Owned cleanup
then returned clean/settled. An earlier startup with an unqualified model alias
executed no prompt and was separately stopped cleanly.

This demonstrates that num_turns is not a request ID and that command errors
are not universally sticky. It does not establish the scope of the historical
quota error or qualify full-flow recovery. The adapter must not use a strictly
increasing model-usage counter as its current-response fence.
