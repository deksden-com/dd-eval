# 098 P3 — Native AGY 1.4.6 result

Дата: 2026-10-23. Access restored; the earlier
[account-blocked attempt](098-agy-p3-native-attempt.md) is historical.
Decision: **do not remove the current full-tree qualification blocker**.
This is now a demonstrated contract mismatch, not an authentication failure or
an absence of any live evidence. No EVAL/release/hooks/pins changes.

## Exact identity and execution

AGY1.4.6 before/after every native probe:
`11e51de3d0e3e16ea0a8574c13e730ab415bf95d11ec7af75b5b22eec3a98e3e`.
Native client policy:
`a1b4cc842686c0d28475303e6b77e18a0aaa4cab9567bbdcc75d3da013777769`.

Four disposable native fixtures, one initial root prompt each. Inspection used
only GetConversationMetadata/WaitForConversationFullyIdle; it did not send model
messages. Normal native child/background/timer work may itself call the model.
`model_requests` in raw probe reports counts initial native_dispatch entries,
not the provider's internal generation calls. The first fixture used
gemini-3.8-flash-high; later fixture-only probes used gemini-3.8-flash-low to
reduce setup work. These are not benchmark or scored model comparisons.

| Fixture | Observed result |
| --- | --- |
| SXrGLA / non-daemon background command |68 samples while the native task was running: no idle. Native completion delivered08:08:31Z; idle08:08:47.600Z, aggregate SUCCESS08:08:47.860Z |
| zIgqyI / child + grandchild | Actual native creation edges root→child→grandchild; root answer DONE08:13:20Z, child background08:13:24–44Z, grandchild background08:13:31–46Z. RPC stayed pending during work and delivery; idle08:14:00.272Z, aggregate SUCCESS08:14:00.531Z |
| inBmb8 / one-shot timer + expected tool failure | Native scheduled message delivered, command exit7 observed, model acknowledged; idle/SUCCESS after handling. This is tool-failure drain, NOT a fatal native executor-error test |
| aXDLys / persistent command IsDaemon=true | **Counterexample:** idle and aggregate SUCCESS while native task/process still live; details below |

All times above are UTC as retained by native artifacts. Native local answers
PLANNER_RESPONSE/DONE are distinct from aggregate CLI result SUCCESS. The tree
fixture demonstrates waiting after local answers, not aggregate SUCCESS while
ordinary owned descendants are live. An isolated grandchild-only interval with
all other native pending sources excluded is not claimed fully qualified.

## Decisive negative case

Native run_command used IsDaemon=true, WaitMsBeforeAsync=100 and a120-second
command. Native transcript recorded task
`655bbfa7-2687-4733-b8ff-5d75ff36ded5/task-2` RUNNING, with its task log containing
shell PID75559. Process snapshot verified the PID was live, born10:13:23 local
and descended from this probe's provider PID71334.

- 08:13:26.328Z: gRPC OK, decoded timed_out=false.
- 08:13:26.342Z: native aggregate result SUCCESS (journal position8).
- The same observation cycle still saw the owned task process live; the probe's
  explicit counterexample branch fired. Only then was physical cleanup invoked.
- Cleanup subsequently produced a control-cancellation ERROR; this is not a
  model/provider failure and does not replace the captured SUCCESS-before-cleanup.

Raw receipt SHA256:
`3d91c8a287d8af887782ba56f048232148dd9efbbcda7470ac629172560fdf93`.
Raw journal SHA256:
`64fa52666f78d21f65c1113d0c5f87fb4416b25e180caa83e58f5219924c653f`.
Compact real negative fixture is checked in engine:
`test/fixtures/agy-native-1.4.6-persistent-idle.json`. Deterministic regression
asserts persistent_background=false and qualified=false; no authority receipt
was generated.

This is **not evidence of an AGY bug**. The official SDK
[RunCommandConfig](https://github.com/google-antigravity/antigravity-sdk-python/blob/main/google/antigravity/types.py)
explicitly allows IsDaemon commands to outlive session completion. Our broad
interpretation of native idle and the existing P3 expectation were conflating
required agent work with the lifetime of support services. Raw unary idle cannot
be promoted as proof that every owned background resource has stopped.

## Correct systemic boundary

Keep separate, for every harness:

1. Required native work/message delivery has settled.
2. Work/Stage semantic result and checks are valid (never inferred from idle).
3. Owned physical resources have been retired when cleanup is requested.

Before relaxing the current whole-tree guarantee, explicitly define the native
foreground scope, preserve daemon/service facts as separate owned resources and
qualify their cleanup. Use native IsDaemon/task classification, not command-text
heuristics. Alternatively add a qualified native task inventory/state stream to
supplement unary idle if the contract still requires all background work.
These are different guarantees; this task does not silently replace one with
the other or bypass P3 using manually asserted booleans.

Live fatal executor-error, all late cancel/restart races and the strict isolated
grandchild-only case remain unqualified. Deterministic transport/error/fence
regressions are green, but are not presented as live binary acceptance. The
persistent counterexample already prevents acceptance of the current broader
contract. Further paid cases cannot make that counterexample disappear.

## Tooling and checks

- Added persistent/timer probes and explicit fixture-only model selection.
- Preserve pre-cleanup native outcome; consume fresh positive proof before a
  clean close, rather than contaminating a successful probe with forced cancel.
- Capture native task process ownership/birth and re-observe after cleanup.
- Reuse bounded source-bound captureAgyTranscript for concurrent/partial files.
- Record future probe-script SHA256 for provenance; runtime client policy and
  installed AGY are not modified by the test driver.
- Native transport/fences/qualification/probe regressions16/16 PASS; ordinary
  AGY Vitest wrapper PASS, ESLint/whitespace PASS. No unrelated full gate/CI.

Provider PIDs51096/71334/74251/87576 and persistent task PID75559 were independently
confirmed absent after cleanup. All real probes reported physical_cleanup=true.
Raw reports remain below:
`/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/agy-native-inspection-<suffix>/bootstrap-receipt.json`.

Other raw receipt hashes: SXrGLA
`6280ef81d4559e5f919d1fbbb86d2528cf0468e4a2abb75b610930cd18fc666b`;
zIgqyI `80cc8c2cedecad461eb8eddb7a26ed516d159d2c97d60579aaec611d062edcff`;
inBmb8 `e19e08d668ce5577e474760408fd5e99b280c7021a11eb2235b2849279becb3e`.
