# Recovery defect-class audit — 2026-09-07

Status: implementation and regression verification in progress; release and
live interrupted-flow qualification are not yet complete.

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

## Verification

- Full dd-eval suite after all runner and adapter corrections: 243/243 passed.
- Focused engine snapshot and bundled-runtime suites: 19/19 passed, including
  repeated boundary recovery and prior-generation hook refusal.
- Journal identity, retry-label, superseded-source, and bundled provider-error
  checks passed. Engine typecheck and lint passed. The final latest-owner
  refusal check passed in the 12-test snapshot suite. The full engine suite
  remains pending at this checkpoint.
- No new release or live qualification result is asserted here.

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
