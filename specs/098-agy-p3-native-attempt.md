# 098 P3 — Native acceptance attempt, 2026-10-23

Current status after access repair/update:
[AGY1.4.6 native result](098-agy-p3-native-146-result.md). The account failure
below is historical, not the current blocker.

Outcome: **BLOCKED, not qualified**. New EVAL were not launched. This attempt
does not replace the [review receipt](098-review-report.md) or promote AGY.

## Actual native attempts

1. Disposable bootstrap `agy-native-inspection-4CGhCq`: authenticated metadata
   and idle RPC succeeded on binary
   `0c5ecd1f69c06d57178cc3e9c7be08b84f00207a6182b937243f743576798570`.
   A probe-only admission mistake prevented productive dispatch; its old
   model_requests=1 was an attempted count, not a native model request. Journal
   contains init only, no native_dispatch. Raw receipt preserved unchanged.
2. Background attempt `agy-native-inspection-7pha9M`: native provider refused
   before init with `agy_provider_account`:
   "Eligibility check failed: Your current account is not eligible for Antigravity,
   because it is not currently available in your location."
   Native num_turns=0, all usage counters=0; actual dispatch count=0.
3. Fresh no-model bootstrap `agy-native-inspection-i5mtGb` after observing a
   changed installed binary: same account/location refusal before init.
   Before/after SHA256 both
   `cab004f3c5c6cb7dc8b8712d3bc30431bd4480b17ff38a07eb1865abeffd2f27`.
   CLI version still 1.4.5. Exact binary identity matters, not version text alone.

All three real probes report physical_cleanup=true. Independent process
snapshot confirms their provider PIDs55076/55767/60653 are absent. Existing
EVAL, provider accounts/settings, installed binaries/hooks/pins were not changed
by this task. No account-denial productive retries were issued; the last probe
was a no-model bootstrap for the changed binary, not overload continuation.

Raw receipts remain under:
`/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/agy-native-inspection-<suffix>/bootstrap-receipt.json`.
These are investigation artifacts, not reusable qualification authority.

## Tooling defects corrected

- Raw candidate inspection in a probe no longer grants runtime tree settlement.
  Fresh no-model admission still uses the actual native bootstrap RPC; forcing
  every observer call negative would prevent the fixture's initial dispatch.
- Report counts native_dispatch journal entries, not intended prompts. A failed
  admission is reported immediately instead of polling200 times with no work.
- Added explicit --background probe: one initial prompt requests a120-second
  native non-daemon run_command, then ends the model response without polling.
  Native RUNNING/completion transcript records are retained, not replaced by
  marker-file guesses. This scenario is implemented but **not live validated**:
  the native account rejection happened before its prompt.
- Failed-init evidence now retains binary identity; identity is checked again
  after cleanup. Cleanup uncertainty remains explicit, not a physical success.
- Added deterministic account-rejection regression. A synthetic short-lived
  provider can return kill EPERM during cleanup racing natural exit: the probe
  retains that uncertainty/primary account error; an independent process read
  verifies that the synthetic process is absent. No production cleanup guard was
  weakened or EPERM treated as proof of exit.

Checks: native transport/fences/qualification + probe accounting **15/15 PASS**,
ESLint on changed script/test PASS, git diff --check PASS. These are deterministic
checks, not live P3 acceptance. Runtime adapter/native client policy was unchanged.

## Remaining acceptance

Root terminal/live child, terminal child/live background, running grandchild,
queued completion delivery, persistent/timer tasks, native executor-error and
native cancel/restart still lack complete reviewed evidence. Previous idle
samples on another binary do not fill those cases. Deterministic timeout/fence
checks remain green but do not prove native whole-tree semantics.

Safe decision: **do not remove the qualification blocker**. Restore native AGY
eligibility in this execution environment first. Then create the missing states
on the stable exact binary, retain source-bound native facts and verify no
inspection-originated productive dispatch. Only complete validated evidence may
be finalized; missing cases must not be marked PASS manually.
