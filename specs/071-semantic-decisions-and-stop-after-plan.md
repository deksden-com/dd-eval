# 071 — Shared semantic decisions and bounded EVAL completion

Status: implementation completed on 2026-10-07; local contract, lifecycle,
retained-proof and stop-boundary checks pass. Paired regression verification,
integration and operational pilots are recorded separately in
`runbooks/plan-071-implementation-receipt.md`. User-approved direction:
provider-neutral decision plugins, confidence
threshold **0.93**, initial call plus two bounded retries, native Judge fallback,
and `finished` for successful completion of an explicitly requested `stop_after`.
The first comparison is three Luna runs through SPECIFY only, not full E2E.

Base: dd-eval main `7b4d492886224447bdd83a4ea7abb489129f543a` (plan 070 review).
This document supersedes plan 070's mandatory empirical promotion gate **for the
new opt-in pilot policy only**. Existing policies, certificates and historical
EVAL evidence keep their original meaning. It does not claim either new
classifier has passed semantic qualification or that confidence is accuracy.

## 1. Scope and non-goals

Implement a standard EVAL profile option for semantic decision acceleration,
independent of Subject harness/model and independent of a particular stage.
Connect its first consumer at the shared compact HITL coverage dispatcher, which
already handles permitted interactions across stages. Do not put calls in
Codex/Luna-specific launch code or individual stage prompts.

Implement a separate standard profile option to stop after a selected stage's
successful completion. Preserve the canonical case contour; a bounded execution
does not change what constitutes completion of the complete case.

Do not change product source, canonical product decisions, harness installations,
engine release pins, Subject continuation policies or the legacy atomized Judge.
Do not replace Final Judge, product acceptance, structural validation, commands
or execution permission with a confidence score. No SDK dependency, plugin
marketplace, service, database, voting, generated response or repair loop.

## 2. Facts established before implementation

- `lib/hitl-coverage.mjs` contains the reusable observation/locking/admission,
  receipt and classifier logic, but its request, model, response and identity
  validation are JEV-specific. Copying it for Luna would duplicate lifecycle bugs.
- JEV is currently shadow or certificate-gated cascade. Shadow cannot measure
  actual saved native Judge work. The new opt-in pilot needs an explicit,
  versioned confidence policy, not a fabricated old qualification certificate.
- The Decisions experiment in `dd-eval-jev-plan/lib/luna-decisions.mjs` calls
  OpenAI successfully, but is not connected to EVAL ownership/routing/replay.
  Preserve those user-owned experiment files; reuse their bounded transport.
- `runner.mjs::validateRunProfile` allows no common semantic option or
  `selection.stop_after`; `selectedEntries` gives direct E2E the case terminal.
- `managed-flow-client.mjs` already sends `--stop-after` and recognizes
  `stop_target_reached`. FLOW `run-controller.ts` settles before publishing that
  state and does not request a successor. Reuse this boundary; do not implement
  an external polling-and-kill stop.
- `execution-state.mjs` uses `candidate_ready` as successful technical execution;
  EVAL finalization currently projects `completed`. Terminal state lists also
  exist in cleanup receipt, recovery worker, observation and storage code.
- `storage.mjs` independently classifies active and disposable runs. A new label
  without updating readers would leave finished pilots falsely active or break GC.
- Final Judge has stage rubrics, but `runner.mjs::finalJudgeScope` currently
  returns `e2e` whenever `selection.e2e=true`. This is wrong for a bounded prefix;
  fix the shared scope resolver, not just the three pilot profiles.
- FLOW accepts `done` and `skipped` at its stop boundary, while EVAL's successful
  observation currently accepts only `done`. Resolve this difference explicitly
  without presenting a skipped stage as completed model work.
- EVAL `control-runtime` snapshots the engine, not the dd-eval decision modules.
  A plugin hash in provenance is not an executable snapshot. Check the retained
  decision dependency fingerprint before new dispatch; do not claim that the
  existing engine snapshot freezes these modules.

API references: [OpenAI Decisions](https://developers.openai.com/api/reference/resources/decisions/methods/create)
and [OpenRouter JEV](https://openrouter.ai/docs/guides/community/jev-tutorial).
Both provide a probability of a predicate being true, but their wire formats
and refusal/identity fields differ.

## 3. Single source of launch configuration

Use a new `dd-eval/run-profile@2`, retaining all existing profile fields. New
profiles add `semantic_decisions` and optional `selection.stop_after`.
Keep reading `run-profile@1` with its original rules and behavior.

Example fragment (not a complete runnable profile):

```json
{
  "schema_id": "dd-eval/run-profile@2",
  "semantic_decisions": {
    "enabled": true,
    "provider": "openai-decisions",
    "model": "gpt-6-luna",
    "min_confidence": 0.93,
    "max_retries": 2
  },
  "selection": {
    "focused_stages": [],
    "segment": null,
    "e2e": true,
    "repetitions": 1,
    "stop_after": "specify"
  }
}
```

- Disabled is `{ "enabled": false }`, or absent configuration; no HTTP intent,
  key requirement, provider initialization or paid call is created in this mode.
- Enabled requires a registered provider, its supported model selector, finite
  `0.5 < min_confidence <= 1`, and integer `0 <= max_retries <= 2`.
  Explicit initial profiles use 0.93 and 2. Unknown/invalid settings are a profile
  error, not a silently substituted provider or model.
- Use `openrouter-decisions` with the explicit JEV release `typesafe/jev-1.13`;
  `openai-decisions` with `gpt-6-luna`. Record requested and returned identity,
  including JEV's dated resolution. Validate the provider's documented model
  resolution; do not assume the release alias is an immutable snapshot or invent
  a dated OpenAI snapshot. Initial OpenAI validation accepts exact `gpt-6-luna`;
  initial JEV validation accepts the requested `typesafe/jev-1.13` or its same-
  release dated resolution, with provider `TypeSafe`. Reject another model/release.
  If only an alias is returned, record snapshot identity as unknown, not immutable.
  No automatic latest/snapshot probing or model substitution during a run.
  A future concrete selector requires a verified plugin mapping and explicit
  profile change. Record any resolved-version change between
  attempts/pilots as a comparison limitation, not an invisible model substitution.
- No second `luna_decision` flag, harness override, implicit environment toggle,
  or hardcoded model in the task consumer. Threshold applies to normalized
  confidence in the selected answer, not always to P(true).
- Native fallback uses the existing Judge profile for the calling task. HITL uses
  `interaction_judge.profile_id`; Final Judge retains `judge.profile_id`.
  Do not create a competing fallback profile field with a different default.
  Preflight requires an available, admitted native fallback even when every
  expected question appears fast-path eligible. Enabled semantic configuration
  does not implicitly change the Interaction Judge verdict contract: compact
  coverage is the initial supported task; legacy atomized tasks use native Judge.
- A new profile cannot simultaneously select legacy `interaction_judge.coverage_policy`
  and `semantic_decisions`. Reject this ambiguity. Old profiles still work.
- Preflight validates local settings and ownership inputs without paid calls.
  Missing/invalid decision credentials are reported as optional-filter
  unavailability and lead to Judge fallback, not Subject launch failure.
  Subject/Judge credentials and their existing admission requirements are separate.
- Normalize and freeze effective settings before dispatch. Preserve profile and
  plugin/contract hashes in manifest. Recovery uses the retained configuration,
  not the newest profile, environment model selector or mutable provider registry.
  Fingerprint only the decision request projection/instruction, plugin codec,
  model-resolution rule, shared transport and routing policy dependencies.
  Compare their retained hashes before a new attempt/fallback transition; changed
  proof semantics are a definition-drift error, not a provider outage. Unrelated
  documentation or harness changes do not invalidate native Judge qualification.
  Do not introduce a whole-repository executable snapshot for this feature.
- This iteration uses profiles as the public selector; no parallel set of CLI
  override flags. A later CLI convenience must normalize into this same contract.

## 4. Provider-neutral question contract

Use `dd-eval/semantic-questions@1`: structured JSON `state` plus an ordered array
of questions. Each initial question has unique nonempty `id`, `type: predicate`,
nonempty `instructions`, and explicit `criteria.true` / `criteria.false` strings.
The whole request is frozen before dispatch; no authored expected answers are
included. IDs/order and criteria are part of its identity.

The first HITL question keeps the existing **uncovered** polarity and substantive
instructions to avoid an unnecessary semantic rewrite:

```json
{
  "schema_id": "dd-eval/semantic-questions@1",
  "state": { "question": "...", "responses": [], "context": {} },
  "questions": [{
    "id": "uncovered",
    "type": "predicate",
    "instructions": "Does at least one requested decision remain unresolved by the canonical responses? ...",
    "criteria": {
      "true": "At least one decision or material reference remains unresolved.",
      "false": "Every decision is resolved with unambiguous context."
    }
  }]
}
```

The omitted instruction text is the complete current shared coverage instruction,
not a shortened production prompt. Reuse it, including actor/negation/condition,
reference, conflict and untrusted-input rules, at both plugins. Semantic inputs
come from the existing deterministic `hitlCoverageInput` projection, with all
admitted source roles and unavailable-source markers retained.

Do not use an LLM to translate or compile questions. Implement `predicate` now;
do not implement speculative `choice`/`score` consumers. New types can later be
added through an explicit contract/capability change without changing the caller's
provider-neutral lifecycle. Unsupported tasks go to their native Judge, never
through a lossy predicate or silently guessed question.

## 5. Plugin contract and normalized answer

Two small ordinary modules registered under stable IDs in a static map, not a
dynamic loader. Their interface is `validateModel(model)`,
`encode(request, model) -> wireBody`, and
`decode(rawResponse, model) -> normalizedAnswersAndMetadata`, plus fixed endpoint,
credential environment name and transient-error classification. The common owner
alone dispatches HTTP, tracks attempts, applies confidence and publishes proof.
Neither plugin selects fixtures, calls Judge, retries or owns an EVAL lock.
Together this provides:

1. supported-model/request validation;
2. deterministic common-request to wire-request translation;
3. HTTP dispatch using the shared bounded transport/retry owner;
4. response identity/schema validation and normalization of provider failures.

OpenAI: JSON-serialize shared state into `input`, map `id` to `name` in its
ordered `questions` array with `type=predicate`, and place true/false criteria in deterministic
instruction text. JEV: keep structured `state`, map IDs to `noul` questions and
their criteria. Do not drop semantic distinctions to make requests fit.

Normalized `dd-eval/semantic-answer@1` retains each ID and either:

- answered: Boolean `value = probability_true > 0.5` (excluding the tie below),
  finite `probability_true` in [0,1], and derived
  `confidence = value ? probability_true : 1 - probability_true`;
- uncertain: `value=null`, `probability_true=0.5`, `confidence=0.5`;
- refused: `value=null`, `probability_true=null`, `confidence=null`.

Each answer has `id` and `status=answered|uncertain|refused`; the common owner
derives value/confidence from the validated probability, not a second provider
Boolean or self-reported confidence. The normalized envelope contains schema ID,
ordered answers and allowlisted provider metadata, without arbitrary raw fields.

At exact 0.5 there is no selected confident answer. Verify all expected IDs and
answer types with no duplicates, omissions or extra answers. Bind by explicit ID
and normalize to frozen request order; harmless response object-key/order changes
must not cause failure. Use own-key lookup/prototype-safe maps for provider IDs;
never accept a plausible answer for a different question. A malformed batch is
unusable, not a partially inferred success. HTTP metadata includes provider,
requested/returned model, request ID if supplied, latency and whitelisted usage.
Never fake native Session IDs or charge decision HTTP usage to Subject counters.

Native fallback keeps its native receipt and output contract. Do not fabricate
confidence=1 for Judge outputs that expose no such probability.

Use one request for one task, not a queue/batcher. All questions must be usable
and meet the threshold before the task can use its fast path. Otherwise hand the
whole original task to its native fallback; do not merge partial provider and
Judge answers into a new unreviewed verdict. The initial HITL task has one question.

## 6. Shared routing, independent of harness and stage

One shared semantic resolution function accepts the frozen request, profile,
owned root/admission/cancellation context, and task-native fallback callback.
The task consumer also decides whether a validated confident answer is sufficient
for its operation. That is a task rule, not provider code.

Routing order:

1. Validate/admit task, profile and source scope; honor forbidden HITL before any
   paid work. Frozen input/fixture corruption is an error, not fallback permission.
2. Disabled or unsupported optional decision task: invoke existing native path.
3. Dispatch optional decision request with its bounded retry policy.
4. Refusal, unusable result, low confidence, exhausted retry or unavailable key:
   durable fallback reason, then the same task-native Judge.
5. Confidence >= 0.93 **and** sufficient task result: publish the fast-path proof.
6. All subsequent callers consume that proof read-only, not a second API call.

Initial HITL fast-path rules remain narrow and provider-independent:

- Exactly one canonical response and complete admitted source view. Multiple
  responses/alternatives need native selection; do not blindly concatenate them.
- `uncovered=false` and confidence >= 0.93 means coverage fast path
  (mathematically P(uncovered) <= 0.07). Use consistent inclusive boundary
  comparisons. Allow only a four-`Number.EPSILON` arithmetic tolerance in the
  shared comparison so `1 - 0.07` is not spuriously rejected; no decimal rounding
  or percentage quantization. A genuine value such as 0.9299 still falls back.
- `uncovered=true`, even at high confidence, goes to compact Judge because this
  task needs the actual remaining question list, not just a negative Boolean.
- Unavailable sources or an oversized/unapproved external disclosure skip HTTP
  fast path, preserving the full native packet. Never truncate semantic evidence.
- Deliver the exact canonical bytes selected by the current task contract.
  Neither plugin generates, edits or paraphrases the accepted answer.
- Judge still returns covered/uncovered/ambiguous and existing stopping policy
  applies to unresolved interactions. Fallback is not permission to invent an
  answer or resume an otherwise blocked Subject.

The dispatcher must contain no Subject harness/model conditions. Integration at
shared HITL covers SPECIFY and other already permitted stages; no other semantic
task is automatically migrated without an explicit task adapter.

## 7. Retry, backoff and inactivity

The normal decision path has at most **three HTTP attempts**: initial + 2 retries.
Low confidence and semantic refusal go straight to Judge without another sample.

Retry only transient provider failures: network/connect failure, response
inactivity, transient 408/429, overload and 5xx. Invalid response format can be
retried under the same finite budget when it is a provider response failure.
No retry for invalid input, unsupported model, missing key, 401/403, known billing
or hard quota exhaustion. Generic 429 is bounded transient rate limiting; an
explicit hard-quota error is not. Provider error bodies are sanitized/classified,
not copied into prompts or logs with arbitrary fields.

Backoff defaults: 1s before retry 1, 3s before retry 2, +0..250ms jitter. Honor a
valid `Retry-After` by waiting at least its duration; if it exceeds 10s, fall back
instead of retrying early or waiting for a long quota reset. Persist the chosen
`not_before`; a restart must not skip/reset backoff. No repair/resample prompt.
Accept standard nonnegative delay-seconds or a valid HTTP-date; ignore malformed
values. The chosen delay is `max(default+jitter, Retry-After)`, capped by choosing
fallback, never by retrying early. Zero/past dates do not remove default backoff.
Persist selected delay and timestamp, use a monotonic wait while alive, and bound
recovered remaining waits by that retained delay (maximum 10s). Wall-clock jumps
must not create unlimited waits or a fresh retry budget.

Preserve the current 30s sliding network-inactivity clock and 64KiB request/response
limits. Only observed response headers/nonempty body progress advances the clock.
Host polling, lease renewal, empty chunks and backoff do not manufacture provider
progress. Backoff is a deliberate finite wait, not a total agent-work timeout.
Judge continues using its existing native progress/inactivity and capacity policy.
Host observation loss is retained as unknown observation, not misclassified as a
confirmed provider outage. It uses the fenced unknown-outcome handoff, not another
HTTP sample. Task-native limits/cancellation remain authoritative.

Abort HTTP and backoff on EVAL stop/cancel/fence or generation loss. An abort must
never launch Judge. Provider unavailability, however, is not Subject failure when
the native fallback can resolve the task.

## 8. Durable ownership and recovery

Reuse current locks, owner identity, operation context and immutable packet files;
do not add a second run state registry. Persist intent before each paid dispatch,
including ordinal, request hash, provider fingerprint and not-before value.

Use short prepare/publish locks with owner-token compare-and-set. Never hold a
semantic observation/receipt or event lock across HTTP, backoff or native Judge
execution. Reuse the existing productive EVAL ownership; this does not require
rewriting unrelated lifecycle locks. Stop/control must still be able to fence the
task while its call is pending. Recheck admission
before every dispatch, after backoff, before result publication and before native
fallback. States are `prepared -> attempt_pending -> backoff -> attempt_pending`
or `decision_completed` / `fallback_intended -> native_owned`; abort/fence closes
the operation. Each dispatched attempt keeps its own immutable outcome. Fallback
is single logical task ownership, not a promise that existing native recovery
never needs reconciliation.
Completion of an HTTP observation is not necessarily resolution of the task:
retain a completed low-confidence/insufficient answer unchanged while recording
native fallback intent. Do not overwrite the observation with a fake HTTP failure
or treat its completed state as permission to issue a canonical answer.

- Freeze bounded normalized provider result plus its sanitized transport receipt.
  Never replay a terminal successful observation to seek a more favorable score.
- Retry count belongs to this semantic task, not one controller process lifetime.
  Count dispatched uncertain attempts conservatively; preserve actual outcomes.
- A live owner/pending call cannot be stolen or overlap native fallback.
  An unknown owner-liveness result remains pending/blocking, not presumed dead.
- After dead-owner/unknown HTTP outcome, do not blindly repeat the unknown paid
  attempt. Fence its ownership, retain unknown outcome and choose native fallback
  once the decision owner can no longer publish. This crash path does not claim
  the provider call failed or refund its possible cost.
- Persist fallback intent before native dispatch. Once native fallback owns the
  task, recovery does not redispatch HTTP. Native unknown outcomes use existing
  same-operation/Session reconciliation, never a replacement Judge Session.
- Bind evidence to EVAL, execution generation, task, stage/pause/scope/round as
  applicable, frozen request, fixture and policy. Late results cannot revive a
  cancelled/finished task or overwrite another accepted source.
- Receipt publication/input drift/admission failures remain tooling errors. Do
  not hide them as optional API outages or dispatch Judge around a broken ledger.
- Stored verification does not reread live workspace inputs or call providers.

## 9. Evidence, compatibility and secrets

New common observations use `dd-eval/semantic-observation@1`; new HTTP coverage
routes use `dd-eval/hitl-coverage-route@2` with source `semantic_decision`, provider
identity and immutable normalized answer/attempt anchors. Native routes continue
their existing Judge proof and include the retained filter/fallback summary.

Store `semantic-observation.json` in the existing owned interaction/task directory,
beside the immutable packet, result and native intent, not in a global provider
cache. Its identity contains retained operation/scope binding, request/packet/
fixture/policy/dependency hashes and provider/model selector. Its bounded attempt
array contains ordinal, owner token/PID/start identity, dispatch/finish timestamps,
chosen delay/not-before, outcome, normalized response or sanitized error, request
ID and usage/latency (unknown values null). Every update preserves earlier attempt
outcomes. Reuse current HITL `scope_id`, stage, pause and round, plus EVAL generation
where present; canonical/reference scopes are valid owned bindings, not fake EVAL
IDs. An unbound new decision call must use native-only, never a random cache key.
Route@2 retains these observation anchors, policy/answer hashes and exact response
IDs; verification recomputes value/confidence, eligibility and canonical bytes
without redispatch. No native Session or cleanup proof is fabricated for HTTP.

Keep legacy route@1 `decision_source=jev`, old policy/transport/request hashes and
certificate validation byte-for-byte in meaning. Do not reinterpret an old
P(uncovered) threshold as the new confidence setting. Old samples can be displayed
or compared outside live routing. A new task never adopts another EVAL's route
receipt as authority or uses legacy qualification samples as live answers.
No cross-EVAL response cache in this iteration; never relabel old evidence in place.

New profile/report support must update `hitl-retained`, coverage receipt readers,
answer issuance, replay, reports and status together. Use `dd-eval/report@4` for
new profile@2 output with explicit semantic configuration and completion scope;
retain existing report@2/@3 readers and schema checks for historical profiles.
No classifier call is inferred to be a native Judge Session requiring daemon
cleanup. Preserve failed attempt diagnostics when fallback subsequently succeeds.

Read only explicit decision key environment variables at the EVAL owner:
`OPENROUTER_API_KEY` and `OPENAI_DECISIONS_API_KEY`. No key value in profiles,
manifest, packet, receipt, command arguments, errors or logs. Strip both variables
from native Subject/Judge, hook, maintenance, baseline and product child processes.
Authorized launch setup may read the individual keys from the existing project
env files into memory, but production code must not auto-source whole unrelated
`.env` files. Preserve the regular `OPENAI_API_KEY` behavior of other consumers.
Credential values and credential-derived hashes are not semantic identities;
rotating a key does not invalidate a request or native qualification. Provider
fingerprint means codec/model/endpoint policy, never the Authorization header.

The detached **EVAL owner** in `eval-resume-worker::spawnWorker` is an exception
to native-child stripping: explicitly pass the selected decision credential to
that owner in memory (also preserve the required OpenRouter key for legacy JEV).
Remove unused decision keys there. Applying the native-child environment helper
to this owner would disable every decision call. Never put credentials in worker
intent/arguments; later owner restarts obtain them from their launch environment.
Read the selected key once per in-memory task, not from files between retries.
Missing credentials after a restart still use native fallback, not secret recovery
from retained artifacts. Test both owner retention and native-child removal.

## 10. stop_after selection and completion scope

`selection.stop_after` is optional, lower-case stage ID from the actual case
contour. Derive an effective end for each selected execution and retain both
original case terminal and selected end in its completion scope.

- Direct E2E-prefix starts from the original input checkpoint, not an accepted
  focused-stage entry pack. `stop_after=specify` must therefore work when the case
  has no entry pack; do not mutate case/pack pointers to create an artificial one.
- Segment target must lie between its selected from/to stages; it may shorten,
  never expand the segment. Focused target must equal its single stage.
- For multiple selected executions, validate target against every range. Reject
  inconsistent selection before launching any process; do not silently skip an
  execution or reinterpret the target differently per repetition.
- Without stop_after, preserve existing terminal selection and completion labels.
- With stop_after equal to the natural/case final stage, target completion still
  uses `finished`; full-case coverage is separately true where actually achieved.
- Compare stage ordering against case contour, not an unrelated global stage list.
- Pass the frozen effective end to the existing controller `--stop-after` on
  launch and use it unchanged in status, reconciliation and recovery.
- Do not prepare/provide successor context, start successor Work or send a next
  Subject prompt after the controller has reached its target. Do not stop halfway
  through the target stage or kill the Subject after seeing a report file.
  Existing sealed boundary capture may name the successor's `stage_entry`; it
  freezes the completed stage's output and is not successor execution. Accept
  this unchanged capture contract rather than demanding a new candidate-kind
  engine snapshot at a nonfinal stop boundary.
- Distinguish `done` from a legal controller `skipped` result. A skipped target
  may finish a bounded run only when normal engine/stage/HITL obligations permit
  the skip; retain `stage_outcome=skipped` and `completion_reason=stop_after_skipped`.
  Required-HITL/fixture conflicts remain errors. Do not make a skipped SPECIFY a
  completed-stage speed sample, and never synthesize success from an absent
  timeline/capture. No new skip permission or invented case-option is introduced.
- Apply stop_after to scored executions, not canonical entry-pack authoring.
  Shared HITL decisions can be used by reference/canonical consumers only with
  their own frozen semantic settings and operation scope; these callers must not
  accidentally inherit the scored selection contour.

## 11. finished is a real terminal state, not a display alias

For new explicit stop_after profiles, EVAL state becomes **finished** when:

1. all selected executions have confirmed completion of their targets (`done`,
   or a legal explicitly reported skip as defined above);
2. target stage success is grounded in controller timeline/status and accepted
   stage/boundary capture, not manifest entry-stage or a stale artifact;
3. owned Subject trees and configured assessment cleanup are settled and frozen
   evidence is available, with no outstanding productive operation.

Keep technical execution result `candidate_ready` internally to avoid inventing
another execution protocol. Expose EVAL `state=finished` and per-execution
completion scope/reason `stop_after_reached` (or `stop_after_skipped`). No productive
resume/recover is permitted from that successful terminal state. Cleanup/read-only assessment is
separate and does not advance the Subject to the next stage.

Target completed but cleanup pending: retain a pending run projection with
`target_reached=true` and cleanup diagnostics; do not advertise settled finished.
Cleanup blocked/error preserves its existing distinction. Failure/cancellation
before target remains failure/cancellation, not finished. Generation/event order
continues to determine cancellation races; a late reply cannot override a fence.
Mixed repetitions cannot claim finished if one target failed or was cancelled.

Manifest freezes planned scope: entry stage, requested stop_after, effective
terminal stage and case terminal. Events/candidate/evidence/report add observed
achieved stage, stage_outcome, target_reached, full_case_completed and completion
reason; do not prefill observed success at launch. Full-case completion requires
the case's original entry through its terminal and all mandatory stage obligations,
not merely reaching the last stage from a focused checkpoint.
`finished` is **not** a full-E2E PASS or proof of semantic/product quality.
Assessment outcome stays a separate field, as with current completed runs.

Publish the existing `dev.dd.eval.completed` event with `data.state=finished`;
no new event family is needed. Compute new-profile terminal success only after
settlement/capture/admission and any configured assessment cleanup, not by copying
the current `candidate_ready`-before-pending projection shortcut. Distinguish
assessment quality failure from inability to finish/clean up the assessment.

Keep native controller `stop_target_reached` and FLOW RUN lifecycle untouched.
This is the EVAL run's terminal vocabulary, not a rewriting of engine history.
No engine release is needed solely to rename the public EVAL completion state.

## 12. Terminal consumers and partial assessment

Audit/update every terminal-state consumer, not just status text:

- runner finalization, root completion event, reducer/observation and report;
- cleanup receipt admission and idempotent finalize/reconcile;
- resume worker/control/status/dispatch guards;
- storage active classification, GC planning/apply revalidation and CLI exit;
- test helpers, runbooks and external monitor-facing observation contract.

Use one small shared EVAL-terminal predicate at duplicated state boundaries;
do not conflate root EVAL states, native operation states or execution states.
`finished` is terminal for active inventory. Make its GC eligibility consistent
with successful completed EVALs, but still require a fresh explicit GC plan/apply
and the existing disposal checks; implementing this plan does not delete pilots.
Historical completed/completed_with_failures/cancelled behavior remains unchanged.

Product checks requiring CODE/MERGE are `not_applicable` for a SPECIFY-only result,
not fabricated passes or missing-implementation failures. Reuse existing stage
applicability. Candidate/Final Judge evidence must state the bounded scope.
If Final Judge is explicitly enabled, use its existing scoped assessment and only
applicable rubric criteria; do not silently evaluate a prefix as a complete case.
Resolve rubric scope from the frozen requested range, not the `selection.e2e`
flag; use actual completion evidence for outcome/applicability. Use `e2e` for a
requested whole-case range, not an E2E-prefix selection; otherwise the
effective terminal stage's authored rubric assesses that stage, with the executed
range explicitly attached (no claim that it grades every earlier stage). Missing
authored rubric, or multiple executions requiring different rubric scopes, is a
preflight error when Final Judge is enabled; disable it explicitly or select a
common authored scope. Do not invent a rubric or dispatch one Judge per stage.
A failed whole-case attempt keeps the existing e2e assessment scope without
claiming full_case_completed; failure/unreached-stage evidence stays explicit.
Initial speed profiles explicitly set Final Judge `enabled=false`, while retaining
Interaction Judge for fallback. Post-run review is outside timed SPECIFY and is
reported separately. An explicit later Judge request cannot resume the Subject.
Profile@2 selects report@4 through one shared schema selector, including cleanup
receipt validation; do not leave current report@2/@3 ternaries in other readers.
Keep CLI's existing success/error exit convention. `finished` is a run-state
addition, not an unrelated redesign of CLI exit codes or assessment grades.

## 13. Confidence policy and live-first acceptance

The new pilot uses operational threshold 0.93, **not** plan 070's calibrated
certificate. Add a distinct versioned policy/proof path, without manufacturing
a qualification SHA or relaxing validation of old certified cascades.
No automatic 41-case x3 model campaign or new mandatory paid promotion is required
before these explicitly experimental runs. Do not claim accuracy certification.

Reuse compatible Subject, engine and native Judge qualification/provenance under
existing dependency-based keys. Do not requalify native Judge merely because a
decision plugin, unrelated repo file or Subject harness changed. Existing known
Judge/source admission failures remain real blockers and are not forced to PASS.
Saved negative Judge responses still need an honest semantic review where that
current contract requires it; preserve raw observations and reassess without
replacement model Sessions.

`hitlQualificationInputs` currently binds native tasks to the projected Judge,
question, canonical responses/context and native prompt, not the entire new run
profile. Keep semantic_decisions/stop_after/provider keys out of that native task
key. Extracting the common decision instruction must not alter the native prompt
or old JEV fingerprint. New retry/confidence policy applies only to the new
opt-in path; legacy shadow/certified observations retain their old behavior.
No new plugin certificate is required. A genuinely changed native prompt/model
or an invalid existing native receipt still follows normal qualification rules.
`qualifyHitlDefinition` currently calls `interactionJudge` with
`coveragePolicy=null` to force actual native observations. Explicitly disable the
new semantic_decisions there too; spreading the original profile unchanged would
allow a new plugin to replace the very native Judge being qualified. This is a
purpose-specific native-only call, not a Subject-harness exception. Verify that
qualification makes zero decision HTTP calls for all three profile choices.

User-requested primary behavioral acceptance: real SPECIFY with retained inputs,
decisions, retries and fallback. Do not put an unrelated full suite or large
calibration campaign on the pilot launch critical path. Retain existing regression
checks and use small local, no-paid-call checks for contract/terminal compatibility
as part of implementation review; these are not a replacement for live acceptance
or a new exhaustive qualification gate.

Fallback protects errors and **recognized** uncertainty, not confident mistakes.
Review every fast-path decision of the initial pilots against the retained question,
sources and canonical package after the stage, outside the speed measurement.
Report any wrong acceptance; keep per-task/provider settings and evidence available
for later tuning. One pilot per mode is not statistical proof of reliability.

## 14. Comparison profiles and measurements

Create three explicit SPECIFY-prefix profiles under the existing case:

1. decision disabled + compact native Interaction Judge;
2. explicit JEV release/resolution via openrouter-decisions, threshold 0.93,
   max_retries=2;
3. gpt-6-luna via openai-decisions, threshold 0.93, max_retries=2.

Names: `specify-luna-judge-only.json`, `specify-luna-jev.json`, and
`specify-luna-openai-decisions.json`. All are profile@2, use compact coverage,
omit legacy coverage_policy, and explicitly disable Final Judge.

All use identical checkpoint, canon/context, engine artifact, Subject configuration
and fallback Judge. Initial Subject is `gpt-6-luna / xhigh`; Interaction Judge is
`gpt-6.1-sol / high`. Names should say SPECIFY comparison, not successful full E2E.
No new Luna-special code. Same profile fields are available to AGY/ZCode/Grok.

Launch sequentially, one repetition each, isolated fresh homes and new EVAL IDs.
Keep previous EVALs immutable. Commit profile definitions before the runner's
committed-definition admission; do not bypass its provenance checks.
Use concurrency 1 and the existing authored HITL round cap. Each task adds at most
three optional HTTP attempts, not a new unbounded round or extra comparison call.
Confirm a preceding pilot has settled or has been normally stopped on its blocker
before starting the next; do not create overlapping Subject/Judge duplicates.

Measure separately:

- preparation/baseline time and stage wall time from durable SPECIFY start/finish;
- each HITL pause/resume interval and number of rounds;
- HTTP attempt latency, backoff time, decision total and confidence;
- accepted fast paths, fallback count/reasons and native Judge elapsed time;
- stage outcome, finished/cleanup status and review of decision correctness;
- decision/Judge/Subject usage separately; unknown metrics stay null, not zero.

Do not double-count overlapping intervals or add HTTP usage to native counters.
Three Subject runs may ask different questions; retain packet/request hashes and
publish this limitation. Compare per-packet saved observations where compatible;
do not silently dispatch additional paired experiments or reuse another EVAL's
route receipt as authority. Any extra paid comparison needs a declared run scope.

## 15. Minimal implementation work packages

### A. Profile and shared contracts

- [x] Add profile@2 validation, disabled/default behavior and conflict checks.
- [x] Add semantic request/answer validation and deterministic common instruction.
- [x] Freeze config/task/plugin identity through manifest and recovery.
- [x] Preserve native qualification keys and freeze canonical/reference callers.
- [x] Force native-only dispatch in native Judge qualification, including profile@2.

### B. Provider plugins and bounded retry owner

- [x] Implement one common owner for both plugins, reusing existing lock,
      observation-clock and process ownership utilities. Preserve the separate
      legacy owner/proof semantics instead of migrating historical observations.
- [x] Keep JEV wire/legacy proof behavior; add OpenAI translation/normalization.
- [x] Implement three-attempt chain, backoff, classified errors and cancellation.
- [x] Strip both decision secrets at all productive child boundaries.
- [x] Preserve only the selected secret at detached EVAL owner dispatch.
- [x] Keep network/backoff outside locks; fence unknown owners before fallback.

### C. Shared HITL integration and retained proof

- [x] Connect both plugins before native compact Judge across permitted stages.
- [x] Apply task sufficiency and canonical-byte rules at shared consumer.
- [x] Add versioned pilot routes, native-fallback intent and frozen verification.
- [x] Update issuance, retained replay, reports/status and usage attribution.
- [x] Preserve old profiles/policies/receipts without in-place migration.

### D. Bounded selection and finished

- [x] Resolve/validate effective terminal stage from case contour everywhere.
- [x] Use existing stop-after controller and prohibit successor dispatch.
- [x] Add explicit completion scope and root finished projection.
- [x] Update terminal readers/control/cleanup/storage/exit semantics together.
- [x] Scope acceptance and Final Judge to the executed prefix.
- [x] Handle legal skipped targets without false SPECIFY timing/quality success.

### E. Operational handoff and live pilots

- [x] Update execute-eval/e2e-monitoring with options, fallback and finished.
- [x] Add three comparison profiles with 0.93 and SPECIFY target.
- [x] Review diff, local bounded regression checks and old-evidence reading.
- [ ] Commit/push/PR integration per git-workflow; retain review receipt.
- [ ] Run normal preflight then the three new isolated SPECIFY pilots.
- [ ] Stop an individually blocked pilot with normal scoped control; never repair
      its runtime artifacts or stop other unrelated runs.
- [ ] Publish IDs, settings, measured stage timelines, fallbacks and semantic audit.

## 16. Code audit map for implementation

Primary files: `lib/runner.mjs` (profiles, qualification selection, routing,
finalization/control/report), `lib/hitl-coverage.mjs` (legacy/shared extraction),
`lib/hitl-contract.mjs`, `lib/hitl-retained.mjs`, small semantic/plugin modules,
`lib/managed-flow-client.mjs`, `lib/execution-state.mjs`, `lib/runner-events.mjs`,
`lib/eval-resume-worker.mjs`, `lib/storage.mjs`, `bin/dd-eval.mjs`.

Secret/process boundaries: `lib/process-json.mjs`, `lib/process-snapshot.mjs`,
`lib/runtime-maintenance.mjs` plus every newly introduced provider/native child.
Reuse `observation-clock`, `runner-lock`, `runner-events`, admission and existing
native Judge capacity/cleanup helpers; do not create alternatives.

Profile/case runbooks and definitions: existing `profiles/`, the task-priority
case `run-profiles/`, `runbooks/execute-eval.md`, `runbooks/e2e-monitoring.md`.
Do not copy keys or user experiment output into Git.

Before editing each shared function, find every caller. Recheck all literal
terminal/source/schema comparisons (`jev`, report@2/@3, completed lists), not only
the three named new profiles. FLOW source is a behavior reference; do not edit or
publish that repository unless evidence shows the existing stop boundary fails.

Confirmed extra call sites: `canonicalResumeUnlocked` retains the profile under
`state.reference.coverage_profile`; carry semantic settings/fingerprints there,
not just in scored manifests. `evalRuntimeEnv`, supplemental Judge paths and
derived/fork manifests must preserve the same effective decision policy identity
and completion scope without reselecting current profiles. A fork into a new
generation/root creates new task ownership and evidence; it does not reuse a
source EVAL's completed HTTP answer as its own route authority.
Audit `resultCheckpointMode` and candidate projections with the same case-range
resolver; the native successor-entry capture remains a valid sealed artifact for
a stopped prefix. Do not infer achieved stage or full-case completion from the
snapshot's successor-entry label.

## 17. Edge cases to cover in review / live receipt

| Situation | Required result |
| --- | --- |
| Disabled filter | Native task directly; no HTTP/key dependency |
| Confidence equal to 0.93 | Inclusive acceptance if task result is sufficient |
| Confidence below 0.93 / P=0.5 | Immediate native fallback; no retry sampling |
| Reordered provider answers / unsafe object-key ID | Exact ID binding in request order; no prototype lookup |
| Confident uncovered Boolean | Native HITL Judge lists actual remaining questions |
| Refusal / missing key / auth / hard quota | Immediate fallback with reason |
| Transient failure twice, third success | At most 3 attempts, then use valid result |
| Third transient failure | One native fallback, no decision repair loop |
| Long Retry-After | Fallback; do not hammer early or wait for reset |
| Wrong question/model/answer or nonfinite probability | Never issue canonical answer from it |
| Missing sources / multiple responses | Native task; no guessed bundle |
| Stop during HTTP/backoff | Abort and no fallback/late issuance |
| Dead owner / unknown HTTP response | Retained unknown; fenced handoff, no blind paid replay |
| Restart after fallback intent | Reconcile original native task, no new HTTP call |
| Owner liveness unknown | Pending/blocking; no speculative competing fallback |
| Clock jump / host observation loss | Bounded retained wait / unknown-outcome handoff |
| Receipt/input/generation conflict | Tooling error; do not route around it |
| Target stage paused or failed | Not finished |
| Target success + unsettled tree/capture | Pending with target_reached, not settled finished |
| Target success and settled receipt | finished; no successor stage or productive resume |
| Legal target skip | Explicit skipped outcome/reason, no completed-stage speed claim |
| Stop/cancel races / mixed repetitions | Respect durable ordering; no false finished |
| stop_after absent / historical profile | Existing completion behavior unchanged |
| Partial product / no MERGE | Not full E2E PASS; inapplicable checks remain inapplicable |
| Prefix with selection.e2e=true / Final Judge enabled | Authored terminal-stage scope, not e2e rubric |
| Detached owner / native child environments | Selected credential retained / both decision keys removed |
| Native Judge qualification with semantic option enabled | Native observations only; zero decision calls |
| Finished inventory / GC plan | Terminal, retained until explicit normal GC authorization |

## 18. Completion criteria and ponytail review

Implementation is complete when the opt-in profile and provider-neutral lifecycle
work at all shared call sites; no harness-specific branch controls semantics;
old evidence remains readable; retries/fallback/cancellation are bounded and owned;
and stop_after produces a genuine finished EVAL with correct scope and settlement.

Live pilot acceptance is a separate receipt: three observed SPECIFY outcomes,
their timings and fast-path correctness. A provider outage or a fallback-only
pilot is reported honestly, not converted into a speed/quality PASS. Full E2E and
statistical qualification remain separate future work.

Ponytail decisions: reuse controller stop boundary, current native fallback and
existing file/operation ownership; two small plugins and one request contract;
stdlib fetch and cancellable waits; no generic plugin runtime, new DB, stage fork,
speculative score/choice feature, mandatory large model campaign or product fix.
The plan adds only the abstraction justified by two actual API implementations
and the common profile requirement. Safety checks protect actual proof/ownership
boundaries rather than arbitrary repository/home immutability.

## 19. Implementation readiness review — 2026-10-07

The design choices above are settled; no additional provider, state vocabulary,
fallback-profile or stop-boundary selection is deferred to implementation.
This review is read-only code investigation plus plan edits, not runtime repairs
or evidence that the new options already work.

| Finding in current code / design gap | Decision now captured | Work package |
| --- | --- | --- |
| `finalJudgeScope` selects e2e from a Boolean | Derive scope from selected range; use actual outcomes for applicability; reject incompatible enabled assessment before launch | D |
| FLOW allows skipped stop targets; EVAL only accepts done | Reconcile legal skip and obligations, retain skipped outcome, exclude it from completed SPECIFY measurements | D |
| Root finalization can choose completed before pending cleanup | New finished projection requires capture and settlement before the completion event | D |
| Control runtime is an engine snapshot, not frozen decision executable | Dependency-only decision fingerprint and pre-dispatch drift admission, no whole-repo certificate | A/B |
| Pending HTTP and backoff need durable budget and fencing | Short CAS locks, retained ordinals/delays, live/unknown/dead owner distinction, one-way native handoff | B/C |
| Confidence ties/binary boundary and provider answer ordering unclear | Explicit uncertain/refused values; inclusive arithmetic-only tolerance; ID binding, no partial mixed verdict | A/C |
| Native children currently strip only OpenRouter; detached owner inherits environment | Strip both decision keys from native processes, explicitly retain the selected key in EVAL owner | B |
| Canonical/reference and fork paths retain older coverage configuration | Freeze common semantic identity at every consumer; scored stop_after does not change authoring contour | A/C/D |
| Native qualification and old JEV policy could be invalidated accidentally | Keep existing native task keys/legacy fingerprints; new opt-in policy is not an old certificate | A/C |
| Qualification disables only old coveragePolicy, not the new option | Force native-only qualification; no HTTP filter may qualify its fallback Judge | A/C |
| Partial capture can name the successor stage entry | Retain the sealed capture contract; derive achieved stage from its completed-boundary identity | D |
| Cleanup report readers select only old schemas | Shared report schema selector and terminal predicate, with historical schema semantics retained | C/D |

Implementation order: A before B/C; B before C; D can be built independently after
A's selection contract. E starts only after both C and D are verified and merged
under the normal project workflow. No engine change or new dependency is expected.

Small runnable local checks, using existing test tools and stubbed transports,
must accompany implementation (no keys, provider traffic or paid qualification):

1. Contract/routing: both encoded wire bodies preserve the same shared question;
   keyed response normalization, refusal/tie/boundary cases, low-confidence or
   insufficient-result fallback, disabled no-call path, exact canonical bytes,
   native qualification-key stability/native-only dispatch and old receipt reading.
2. Lifecycle: third-attempt success/exhaustion, Retry-After/date/backoff persistence,
   cancel during call/wait, restart/unknown/dead owner and late publication fencing,
   no HTTP after native intent, owner-secret retention/native-secret removal.
3. Completion: direct prefix without entry pack, invalid selection rejected before
   dispatch, required-HITL conflict on skip, done/skip/failed/cleanup-pending and
   mixed repetition states, no successor/resume from finished, correct Final Judge
   scope and report@4/cleanup/storage compatibility. Preserve old profile behavior.

These bounded checks are the minimum executable regression protection, not a
mandatory comprehensive campaign replacing the user-requested real SPECIFY pilots.
Do not leave critical recovery/cancellation branches entirely unverified merely
because a happy-path live pilot completed.

Remaining operational conditions are explicit: clean committed profiles, current
engine/Subject/native Judge admission, available credentials/provider access and
normal owned cleanup. If any blocks a pilot, report the exact blocker and retain
the failed attempt; never force qualification to PASS. Latency improvement and
confident semantic correctness require the three observed pilots and their
post-run audit; they cannot be guaranteed by this readiness review.
