# Plan 071 implementation receipt

## Implementation and review

Profile@2 exposes optional provider-neutral semantic decisions and `stop_after`.
The first shared compact HITL consumer supports OpenRouter JEV and OpenAI
Decisions; the same native fallback profile remains authoritative. No Subject
harness/model special case, SDK dependency, product change or engine release.
Old profile@1, JEV route@1 and qualification keys retain their semantics.

New HTTP observations bind exact packet, fixture, EVAL, execution generation,
request, policy and dependency hashes. Cancellation never enters fallback;
unknown paid outcomes never resample. Two bounded transient retries use retained
backoff; low-confidence/refusal/unavailability uses native Judge directly.
Native children lose both decision secrets, while the detached owner retains
only the selected one. HTTP evidence never invents a native Session/cleanup.

Bounded completion reuses the engine stop target and requires capture/settlement.
It records `finished`, explicit scope and done/skipped outcome without claiming
full E2E PASS. Report@4 and candidate@3 preserve strict old schemas; candidate@3
is necessary because candidate@2 forbids the new completion-scope field.

Independent review found and fixed: undefined cancellation signal for canonical
callers; insufficient pre-publication packet/fixture/generation binding; invalid
relative JSON-schema references; scored stop target leaking into canonical
qualification; terminal publication preceding current Judge cleanup validation.

## Verification

Targeted shared routing, provider lifecycle, retained evidence, completion,
controller fork and storage checks: **48 PASS, zero failures/skips**.
They include real fake-engine managed stop captures (done and skipped), no
successor dispatch, finished resume rejection, canonical HTTP issuance/replay,
native qualification-key stability, and both plugin codecs. No paid calls.
`git diff --check` passed.

Full paired regression on the committed tree: **675 PASS, zero failures,
skips or cancellations**, 544.3 seconds. Command: `node --test
--test-concurrency=1`, with `DD_FLOW_SOURCE_ROOT` naming dd-flow-cli and both
`DD_EVAL_TEST_FLOW_CLI` / `DD_EVAL_TEST_OPERATIONAL_RUNTIME` naming the immutable
checkpoint engine beta.125 captured by CP-199. The first run used the unrelated
source checkout's CLI and encountered its missing local `semver` dependency;
it is not a regression result for the pinned engine. No dependencies or source
files in that checkout were modified.

Final independent read-only review found no blocking findings; its supplemental
completion/routing/fork checks passed **27/27**, zero skips.

Native compact Judge qualification key
`16ffa91a7a836d3c9dae4e7ff895d82ed3fb05ce19f0a091822fcb8ed96e61f3`
passed through the normal `runner definition qualify` entrypoint: **41 reused
cases, zero native calls**. Twenty negative observations received separate
hash-bound semantic review sidecars after main-agent and independent review of
the original questions, verdicts and source contexts. Original native outcomes
were not rewritten and no repeated calls were made to obtain PASS.

Implementation commit: `d6ccdb4`, pushed to `feat/071-semantic-decisions`;
integration PR: [#57](https://github.com/deksden-com/dd-eval/pull/57).

Operational acceptance is separate: three sequential
SPECIFY-only profiles use Subject gpt-6-luna/xhigh, Interaction Judge
gpt-6.1-sol/high, threshold 0.93, max_retries 2, Final Judge disabled.
Normal preflight must admit the native fallback before any scored run.
No live speed or classifier-accuracy claim is made by this receipt.

## Operational preparation after integration

PR #57 was squash-merged as `eb7b64b39d5769ced82c6be6ff80bf958938569f`.
The first CP-201 preflight stopped before any Subject Session because installed
Codex CLI was 0.161.0 while the two selected profiles retained 0.160.0. The normal
`harness compatibility qualify` command then passed one isolated native smoke
for each profile and settled both daemon trees. Their runtime pins were updated
by that command, not manually forced. Receipts in CP-201 conformance:

- `harness-compatibility/20261007215709881/codex-desktop-gpt-5-6-luna-xhigh-dd-flow-0-9-0-beta-11/receipt.json`
- `harness-compatibility/20261007215755758/codex-desktop-gpt-6-1-sol-high/receipt.json`

The Subject's old fanout-capacity measurement was cleared by the update command.
SPECIFY does not fan out and does not require it. A future full E2E must perform
normal capacity qualification; this receipt does not restore the old grant.
The 41 native semantic Judge tasks keep their identities: model, reasoning,
question, prompt and source semantics did not change.

## Live SPECIFY comparison — 2026-10-07 UTC

Each profile passed normal preflight with zero Sessions created there. Scored
attempts ran sequentially in fresh homes, with concurrency 1 and the same case,
canonical answer, Subject gpt-6-luna/xhigh, fallback gpt-6.1-sol/high and immutable
engine beta.125 (checkpoint commit `b74ba81f88cbb2fe3b752eb4579baac6b2244d6a`).
Final Judge was explicitly disabled; all profiles requested `stop_after=specify`.
Decision confidence threshold stayed 0.93 and max_retries stayed 2.

| Mode / EVAL | Published outcome | Completed SPECIFY wall time | Registered HITL interval | Optional decision |
| --- | --- | ---: | ---: | --- |
| Judge-only / `EVAL-20261007215922-3f305c54` | finished, cleanup settled | 497.314 s | 35.971 s | Disabled; native Judge directly |
| JEV / `EVAL-20261007221049-f5a5fbce` | finished, cleanup settled | 488.692 s | 70.316 s | Three failed HTTP attempts, then native fallback |
| OpenAI / `EVAL-20261007222514-8f0a65c9` | completed_with_failures, cleanup settled | Not completed | 61.020 s | One successful call, confidence 0.89; native fallback |

Homes are `/Users/deksden/.dd-eval/qualification/cp-201-luna-judge-only`,
`cp-201-luna-jev` and `cp-201-luna-openai-decisions`. Under each home, the exact
run's `reports/report.json`, FLOW `timeline.jsonl`, and owned
`executions/e2e/interaction-judge/specify-691d4030140e8fcce0e7/` directory retain
the packet, native receipt, cleanup, and optional HTTP observation. UTC stage
boundaries were 22:01:25.185–22:09:42.499 and 22:12:17.735–22:20:26.427 for the
two completed stages. Third start was 22:26:27.405; no completion boundary exists.
Execution wall times, including preparation and settlement, were 625.005,
596.194 and 387.538 s. They are not completed-stage latency measurements.
The completed runs took 119.022 and 85.240 s from execution start to stage attach;
the third took 69.833 s. Those intervals include baseline/runtime preparation,
not just model latency. Isolated baseline command timing is not separately
published here and remains unknown; baseline PASS is retained for all three.

JEV spent 19.499 s in HTTP, 4.188 s observed backoff (4.348 s scheduled),
24.383 s total. All three original errors were `transport_or_response_invalid`;
their precise phase cannot be recovered from the retained old diagnostics.
No successful response/confidence/usage was observed there: usage is unknown,
not zero. OpenAI took 1.983 s HTTP / 2.348 s total, no backoff, returned
`gpt-6-luna`, P(uncovered)=0.11/confidence=0.89. Usage: 7,386 input/total tokens,
zero output tokens. Below-threshold success was not resampled.

All three native Judges returned a semantically defensible `covered` verdict
for their respective original questions. Their model Turns took 8.717,
10.082 and 10.291 s; native Judge token usage is not in these route receipts
and remains unreported, rather than invented or mixed into Subject usage.
Subject total tokens were 1,818,604 / 1,601,185 / 1,051,965 respectively;
these native session counters include cache/reasoning context and are not cost
estimates. Optional HTTP usage was kept separate.

Independent read-only audit and main-agent checks confirmed exact canonical
answer bytes (SHA256 `73a356907343343e42f97e7b8410508f2502916f0528378843365a43e7807f10`),
packet/fixture/receipt binding and native Judge cleanup. Both completed targets
had captured boundaries, stopped Subject Sessions, `stop_target_reached` and
no successor Stage. The failed third correctly had target_reached=false and
no candidate/stage boundary. No pilot had a confident fast-path acceptance;
therefore the comparison demonstrates fallback/completion safety, **not**
acceleration or classifier accuracy. Questions and Subject execution differ
between attempts, so their whole-stage durations are not paired causal estimates.

## Operational findings and bounded follow-up

After the terminal JEV attempt, two explicitly declared standalone diagnostic
requests were made outside scored routing: one tiny predicate and one retained
packet. Both decoded normally (0.958 / 1.189 s). The real packet returned
confidence 0.62, which would also require native fallback. These are not scored
proof, do not explain the original three failures, and are excluded from the
comparison. No original observations or route receipts were modified.

Follow-up `f756ed4` replaces the broad error label with fixed failure phases,
observed HTTP status and allowlisted native network codes. It does not retain
messages, arbitrary bodies or credentials, change retry budgets, or reinterpret
old evidence. Targeted routing/profile/HTTP checks passed 14/14; independent
read-only review found no blocking issues.

The third attempt exposed a separate existing engine blocker: after receiving
the canonical answer, Subject wrote Q-004 about creating a task immediately
closed and made a second `stage pause` using the same question-input path.
At 22:31:02.420, the CLI returned successful `paused` with the **old HITL-001 and
old Q-001–Q-003 text**, with no new pause timeline event. The native final at
22:31:38.397 reported the stale result and stopped; controller correctly required
recovery with `incomplete_subject_turn`. SQLite retained only one settled pause
invocation, `df9ddd78-f71b-43db-83da-0b88976baa38`, in generation 0. Inspection of
the retained engine's lifecycle code confirms public command fingerprint reuse;
rendering reuses the settled assignment rather than issuing a fresh pause.
The original question verdict remains correct: Q-004 was not in that packet.
Possible ambiguity about closed-at-create needs its own canon review; it is not
permission to manufacture a new product decision here.

Engine pause authority/renewal is outside plan071's engine-change non-goal.
Its systemic follow-up should issue a new pause assignment after settled resume,
while preserving replay of the same invocation/intent, with a two-pause regression
including changed bytes at the same input path. Do not fix it by replaying/resuming
this historical attempt or weakening the incomplete-Turn check. No engine or
product changes, extra scored attempts or repairs were made in this task.

A secondary EVAL bug occurred after failed-terminal publication at 22:31:53.840:
`case_acceptance_receipt_invalid`. The v4 checker correctly emitted
`not_applicable` before any product check gate and omitted checkpoint identity;
the reuse validator incorrectly required that field to equal the recovery hash.
This is fixed at the shared receipt-reuse boundary: retain immutable hash/case
validation and recompute the **complete** checker receipt, removing the redundant
incompatible field check. Applicable checks still validate sealed manifest,
ownership and payload hashes. A no-provider regression reproduces failure before
the fix, verifies byte-stable repeated finalization afterward, and rejects a
forged self-hashed `passed` receipt. Independent review confirms no weakened
applicable checkpoint validation. Historical report/failure events remain intact.

Final affected regression after both follow-ups: **98/98 PASS**, no failures,
skips or cancellations, 114.375 s, using the same immutable beta.125 pair.
Suites: runner-recovery, case-acceptance, runner-fork, completion-scope,
semantic-decisions, semantic-routing and semantic-pilot-profiles. The new receipt
regression failed with the exact live error before the shared validator fix.
`git diff --check` passed. The earlier full 675-check result belongs to the core
implementation; this is the final affected verification, not a claimed rerun of
the whole suite. Independent reviews covered the follow-up code and all three
retained semantic/HITL outcomes. No paid reruns were needed for native Judge
qualification, or to prove the receipt reuse correction.
