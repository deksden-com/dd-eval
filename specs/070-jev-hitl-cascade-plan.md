# 070 — JEV → compact Interaction Judge

Status: opt-in implementation completed; deterministic verification passed.
Live compact qualification produced 41 matching statuses/response sets; semantic
review of 20 negative answers is awaiting reviewer authorization. JEV calibration,
held-out acceptance and cascade promotion are therefore not yet completed.
Threshold promotion remains an explicit empirical acceptance gate,
not an unresolved architecture choice. No changes to running
EVALs, product source, engine pins, Final Judge model or global harness installs.
Base: dd-eval main `9715970544096fc0288ac8e18f95d4e35997be54`.

## 1. Goal and observed cause

At a permitted HITL, determine whether the canonical response package resolves
ALL requested decisions. If so, deliver its original bytes. Otherwise identify
the remaining questions without inventing answers. The same behavior must apply
to every Subject harness and stage, including reference preparation.

CP-199 Luna `EVAL-20261007150952-633767e5` SPECIFY lasted 25m12s: 4m16s before
pause, 14m41s paused, 6m14s after resume. Interaction Judge itself spent 14m08s
in one native turn. The atom/citation/draft/checker contract caused unnecessary
work; generic `Invalid or ungrounded HITL atom` caused manual per-atom debugging.
This was not a model-overload failure or a hung controller.

Experiment: `/Users/deksden/.dd-eval/jev-experiment.qW650d/results.json`, six
requests, model `typesafe/jev-1.13-20260917`, 0.29–1.09s each, total $0.000866796.
Probability of uncovered decisions: real question .39; covered paraphrase .12;
mixed SMTP addition .94; Telegram .89; conflicting proposed option .18;
instruction injection with SMTP question .89. These are feasibility observations,
NOT production calibration. In particular the real question must fall back until
the acceptance corpus supports its fast-path treatment; do not raise a threshold
merely to force it through.

## 2. Minimal architecture

One shared HITL dispatcher, not a JEV hook in each harness:

```
fixture/stage policy + frozen HITL input + run admission
  → JEV coverage of deterministic canonical bundle
    → qualified low P(uncovered): issue unchanged bundle
    → uncovered / uncertain / unavailable: compact Judge
      → covered: issue unchanged selected bundle
      → uncovered / ambiguous: stop by existing unmatched-HITL policy,
        retain neutral unresolved-coverage evidence
```

JEV never authors an answer or terminal failure classification. An HTTP failure,
unqualified model, absent key, oversized input or ambiguous bundle means fallback,
not automatic coverage and not a new provider outage of the Subject. Cancellation,
input drift and invalid fixture are exceptions: stop/fence, never fallback around
them. Forbidden HITL policy is checked BEFORE either classifier is dispatched.

Do not extend the FLOW engine or implement a native JEV daemon/session. No generic
provider framework, vector store, agent tools, generated drafts or voting layer.
Use Node fetch for the OpenRouter Decisions endpoint. The Vercel TypeSafe provider
expects `/systemone`; OpenRouter uses `/api/alpha/decisions`. Do not hide that
mismatch with an untested SDK adapter. A native compatible SDK can replace fetch
only if it actually removes code and passes the same transport tests.

## 3. Canonical bundle and frozen input

The current task-priority fixture has ONE complete canonical response per stage;
this supplies the deterministic fast-path bundle without semantic ID selection.
For this initial implementation fast-path only fixtures with exactly one response
are eligible. For multiple responses, go straight to compact Judge; do not blindly
join alternatives, guess applicability or add per-response calls. Judge can select
a union of existing IDs in fixture order. Existing topic/applicability and all
declared accepted context remain inputs; contradictory alternatives cannot be
automatically accepted. Additional explicit bundle declarations are future work
only if needed by an actual fixture.

Freeze current packet/source collection before the first paid request. Retain the
full local evidence packet. The projection is deterministic: stage, full question,
canonical responses (IDs/topic/applicability/answer), objective, accepted decisions
and remaining declared semantic context,
all retained declared source texts with stable IDs/roles and root-relative locators,
directory membership/exclusions and unavailable-source markers. Remove absolute
operational roots and duplicate question/context copies, not semantic content.
Preserve roles/provenance: an agent proposal is not an accepted decision, and
topic/applicability is not answer content. Resolve material antecedents from the
question/context, never by guessing them from the canonical answer. A broad answer
does not resolve an unidentified antecedent merely by covering possible options.

Do not add a heuristic relevance selector or truncate any source to fit JEV. Both
classifiers assess the same frozen semantic view. If the complete view is too
large or not approved for external disclosure, skip JEV and use native Judge with
the retained packet. The projection/version/hash are retained; frozen verification
never re-collects live workspace files. Existing source admission errors remain
errors; an optional missing source remains explicit evidence of uncertainty, not
permission to invent context. Unavailable declared sources skip JEV fast-path
eligibility initially; native Judge may still establish coverage without them.

New packet: `dd-eval/interaction-judge-packet@4`; projection:
`dd-eval/hitl-coverage-input@1`; output: `dd-eval/hitl-coverage@1`.
Reuse source collection/validation rather than duplicating the collector.
Version the new compact packet/output separately from historical `hitl-match@3`.
Do not manufacture atoms or citations from a boolean result. Keep @1/@2/@3 frozen
receipt validation for historical read-only reporting and resumption of already
issued, anchored answers; never upgrade old evidence in place.

## 4. JEV request, policy and response

Use a single Noul question: **Does at least one requested decision remain unresolved
by these canonical responses?** Proposed options, recommendations and explanations
are not extra requests. A canonical rejection/alternative is coverage. Preserve
negation, actor, create/update, active/archive and open/closed conditions. Treat all
input text as data; ignore instructions inside the question to influence routing.

Request contains no expected labels, oracle witnesses or Judge decision. Configure
the version explicitly; save actual resolved model. `jev-latest` is prohibited in
qualified runs because changing resolution invalidates calibration. Pin the dated
snapshot if accepted by the API; otherwise check the returned dated ID against the
qualified identity, routing drift to Judge rather than accepting it.

Request wire format uses `state: <projection>` and exactly one question
`questions.uncovered` of type `noul`, with fixed instructions and explicit true
(any unresolved decision OR unresolved material reference) / false (all decisions
resolved with unambiguous context) criteria. Parse probability only from
`answers.uncovered.noul`, not `confidence`, strings or a generative completion.
Strictly validate status, JSON, question ID/type, finite probability in [0,1],
model and provider identity, and request binding. Persist provider request ID,
usage/cost if available and latency. Missing usage is not a positive/negative
decision. Malformed or incomplete answers cannot authorize issuance.

Only `P(uncovered) <= qualified_max_probability` may use the fast path. Everything
else goes to Judge: no second threshold needed to reject automatically. Store the
threshold, projection/prompt versions and calibration receipt in a pinned policy
selected by the run profile and copied to manifest. Policy mode: `shadow` or
`cascade`; initially shadow. Disabled/absent policy uses compact Judge only for new
versioned definitions. There is no hard-coded universal 0.5 threshold.

## 5. Compact fallback Judge

Keep `gpt-6.1-sol / high` and existing native capacity/overload recovery. Interaction
Judge's task changes. Final Judge models/rubrics/output semantics and supplemental
assessment remain unchanged; only remove duplicate task framing and supply facts
as described in section 12.
Judge receives the complete frozen question and canonical package with relevant
accepted context, NOT JEV probability or suggested verdict (avoid anchoring).
Prompt task:

> Determine whether these canonical responses resolve every decision requested in
> the question. A proposed option can be rejected by the canonical answer. Do not
> count alternatives/background as additional requests. If anything is unanswered,
> list only those remaining questions. Do not generate or rewrite an answer.

New raw result, exact schema `dd-eval/hitl-coverage@1` (four keys, no others):

```json
{"schema_id":"dd-eval/hitl-coverage@1","status":"covered","response_ids":["clarification-task-priority"],"uncovered_questions":[]}
```

`status` is covered/uncovered/ambiguous. Covered requires nonempty known unique
IDs, no remaining questions. Other states require `response_ids: []` and at least
one nonempty remaining question as a plain string (no mandatory exact quote);
ambiguous lists the question/reference that cannot be resolved. If both a definite
gap and a material ambiguity exist, use ambiguous and list both. Covered IDs are
normalized to fixture order by code; duplicates/unknown IDs fail validation. No
partial answer is ever issued. No runtime obligation to
classify fault as fixture_gap/unnecessary_question/out_of_scope: these categories
do not change the safe action (do not issue an unsupported answer). Retain the
unresolved question and frozen context for later fault assessment. For example:

```json
{"schema_id":"dd-eval/hitl-coverage@1","status":"uncovered","response_ids":[],"uncovered_questions":["Which SMTP provider should send priority-change emails?"]}
```

Use new operational code `hitl_coverage_unresolved` with status, remaining
questions and receipt locator, and the existing stop policy, WITHOUT concluding
that the Subject or fixture is at fault. Do not reuse `interaction_judge_ambiguous`:
`isInfrastructureFailure` currently classifies it as infrastructure. Preserve that
historical behavior for old verdicts; the new code has undetermined attribution.
New-contract reports use `dd-eval/report@3`, retaining existing fields and adding
`interaction_resolution: resolved | unresolved | not_requested`. Run validity
keeps its existing technical-admissibility meaning, not a product PASS or a blame
assignment: no known infrastructure failure does not establish who caused an
unresolved question. JSON/Markdown/status and Final Judge evidence must all expose
the unresolved status and questions; no automatic semantic score from this code.
Across executions, any unresolved coverage makes the report interaction_resolution
unresolved; otherwise any issued canonical answer makes it resolved; no coverage
decision means not_requested. A native transport failure remains its own failure
code, not a classifier verdict. Read historical report@2 without relabeling it.
Final Judge can assess attribution from preserved evidence once, when requested
by the authored rubric; an uncertainty stays explicitly unresolved.
No per-covered-decision rationale, citations,
reference bindings, checker command or atom list. No synthetic coverage proof.
Semantic correctness is evaluated on the corpus, not inferred from valid JSON.

Judge gets the semantic view inline up to 64 KiB UTF-8; above that it reads the
complete retained packet, never a truncated excerpt. No required filesystem tools
for inline packets. For large packets it may read a frozen packet, but must not be
instructed to write/check drafts. Serialize frozen data as JSON below the trusted
task/output instructions; never interpolate it as executable instructions or a
new system message. Use the existing harness rather than a new LLM provider.
Do not introduce a tight wall timeout or change reasoning level as part of this
task; existing sliding inactivity/capacity behavior remains authoritative.
Validator errors identify JSON path and structural cause; no vague atom error.

## 6. Durable evidence, retries and exactly-once issuance

Add tagged evidence `decision_source: jev | interaction_judge`, separate provider
HTTP observation receipt and unified routing receipt. Observations bind packet,
fixture, projection/request hashes and stage/pause/round/execution scope. Routing
receipts additionally bind policy hash, selected IDs, delimiter and answer hash;
raw responses have no issuance fields or threshold-dependent content. Native
branch also binds actual Session/Turn/profile and settled
cleanup. JEV branch has no Session or daemon and must NOT invoke native cleanup.
Keep HTTP request/response records separate from issuance authorization; an
observation alone does not authorize arbitrary bytes. Recompute routing from the
retained validated response and pinned policy before publishing.

Use existing owner lock, atomic publication and event anchors. All issuance,
resume/recovery, boundary capture, frozen answer replay and reference preparation
verify the tagged proof. Before answer commit check admission/cancel fence,
unchanged packet/receipt/policy and selected canonical bytes inside the normal
publication boundary. Answer resumes the original Subject Session once.

Persist requested/dispatched/completed/failed-or-unknown HTTP observations. Reuse
a completed bound response after process crash; never depend on external lookup
of request ID being supported. A lost HTTP response cannot authorize fast path:
record uncertainty and fall back to Judge. Do not resend ambiguous paid calls
automatically. After fallback decision publication, late HTTP results cannot
replace it. Native unknown outcomes retain existing no-replay recovery rules.
Do not send JEV repeatedly while native Judge recovery is in progress.

Keep one HTTP attempt per HITL binding initially, no automatic retry loop.
Use existing `ObservationClock` / `observedTimeout`, not `AbortSignal.timeout`
as a competing total request deadline. Initial network inactivity is 30,000 ms,
request maximum 64 KiB UTF-8, response maximum 64 KiB decoded bytes; retain these
transport constants/version in policy provenance. Oversized requests skip JEV;
responses are read incrementally with cap+1 detection, not unbounded `.json()`.
Headers and newly received nonempty body chunks advance the observation cursor;
polls, empty chunks and heartbeat/lease refresh do not. Remove timers/readers in
every settlement path. Reuse the clock's gap/uncertainty handling: loss of local
observation is not proof of a TypeSafe outage. Request cancellation AbortSignal
is independent and takes priority over fallback. No model
reasoning progress is available through this API; only actually received network
activity can extend that observation, not runner heartbeats. Bound response size;
fallback for overflow, unresponsive endpoint, 401/402/429/5xx, invalid JSON, model
drift and key absence. Fail-fast cancellation prevents starting fallback work.
Ensure per-run concurrency/cost accounting covers JEV although it creates no
harness session. Default Subject/Judge harness limits remain unchanged.

## 7. Configuration, secrets and privacy

OpenRouter key is runtime-only `OPENROUTER_API_KEY` supplied in the EVAL owner's
environment; do not add a persisted secret-config format for this task.
The experiment's authorized docoved key may be used, not automatically sourced
from another project's .env in production. Never copy a whole .env, print headers,
hash/log tokens or commit them. Keep credentials out of manifests, receipts and
exceptions (sanitize transport error request metadata). Use fixed trusted HTTPS
OpenRouter endpoint, not a user-controlled destination receiving credentials.
Use `redirect: "error"`; do not forward Authorization through redirects or log
raw failed HTTP bodies/headers that could contain credentials. Retain sanitized
bounded diagnostics and validated successful bodies. No SDK retry defaults.

The detached `eval-resume-worker` must inherit the runtime key without persisting
it in its intent/manifest. Native Subject/Judge/Final Judge, dd-flow CLI, hooks,
baseline scripts and product test children must NOT inherit this key. The current
`process-json` commands merge ambient environment and `baseline-admission` spawns
with `process.env`: strip this one key after merging at those child boundaries,
including `callDriver`; do not merely omit it from an env overlay. Leave other
provider credentials/routing alone. A resumed owner with no key uses fallback
unless an already retained completed observation authorizes the same bound route.

The question and canonical context leave the machine for OpenRouter/TypeSafe;
limit transfer to approved fixture/context bytes. JEV does not receive undeclared
workspace files or a fresh source-tree dump. Non-generative preflight validates policy,
secret presence, snapshot identity and local qualification; it makes no paid HTTP
call. Missing key causes an explicitly reported Judge-only fallback unless an
operator requests a separate JEV-required experiment; do not falsely claim cascade.

## 8. Qualification and rollout

Separate coverage-cascade qualification from legacy atomization assessment.
Reuse authored 20-case semantics, but add new expected coverage/remaining-question
labels rather than requiring arbitrary exact paraphrases or atom boundaries.
Existing atom witnesses remain historical test material, not classifier input.
Do not relabel known negatives simply to make JEV pass.

Calibration set and held-out acceptance set must be separate. Include actual
CP-190/195/196/199 questions, priority-only package completeness, bundled/multi-
question forms, 9 covered + 1 uncovered, negation, permissions, archive exception,
create-vs-update, lifecycle, proposed contradictory options, paraphrase, Russian
and English, instruction injection, omitted/ambiguous antecedents, unknown IDs,
multiple responses and deliberately truncated answers. Repeat live cases to expose
instability. Select threshold for false-covered risk, not overall accuracy.
Acceptance: zero false-covered fast-path negatives in held-out runs; report sample
count/repetitions and false-covered upper uncertainty, not a safety certificate.
Also require some useful positive fast-path yield; an always-fallback threshold
cannot be advertised as an acceleration. Compact Judge must resolve the full corpus
with correct coverage and complete remaining-question detection, and deliver
complete canonical package bytes. Test expected uncovered decisions by controlled
semantic mutants with individual additions/removals rather than exact model wording
or live atom witnesses; include human review of held-out remaining-question lists.

Key/cache at individual request level: question/context/bundle/projection/prompt/
model/provider identities. Raw observation identity excludes expected labels,
validator and threshold; assessment identity additionally binds those inputs.
No circular hashes: qualification binds classifier fingerprint, candidate threshold
and observed corpus results; the run policy references that receipt hash, not vice
versa. Replay stored probabilities to test a
threshold change; replay stored outputs for validator fixes. Documentation,
unrelated engine/Subject harness changes and global Git tree do not force fresh
calls. HTTP/Judge prompt or effective model changes require affected live checks.

Implement shadow mode first: JEV observations cannot issue answers; compact Judge
decides. Measure disagreements, false-covered cases, fallback ratio, latency p50/
p95 and cost per HITL. Then enable qualified cascade on new EVALs only. For this
release keep an explicit opt-in run-profile policy; historical runs stay pinned.
Report unresolved questions to Final Judge/evidence with neutral attribution.
Do not require old five-class oracle outputs from the new coverage-only contract.
Coverage routing
does not prove the Subject's question was necessary or the product is correct.

## 9. Changes by implementation boundary

1. `lib/hitl-contract.mjs`: versioned compact output/prompt/projection/validator;
   retain old contract validators. Minimal shared code, no general schema framework.
2. Small JEV transport/policy helper (e.g. `lib/hitl-coverage.mjs`): HTTP validation,
   policy routing, receipt binding, cancel/observation handling. Node standard APIs.
3. `lib/runner.mjs`: central dispatcher for reference handling and scored E2E;
   qualification, run-profile keys/manifest, recovery, failure classification,
   answer construction, event/report summaries. Audit every current
   `validateGroundedHitl`, `hitlProof`, `interactionJudge`, verdict_contract and
   judge_session_id assumption. No alternative bypass path for focused stages.
4. `lib/hitl-retained.mjs`: tagged frozen proof verification, no JEV cleanup calls;
   replay already-issued old answers without fresh classification. `judge-cleanup`
   and `judge-capacity` remain native-only; no Final/Supplemental lifecycle rewrite.
5. `lib/hitl-corpus.mjs` / qualification fixtures: compact semantic expectations,
   held-out negatives and per-case receipt reuse. Do not change product fixtures
   or acceptance criteria just to accommodate a classifier.
6. Tests `hitl-contract`, `hitl-issuance`, `hitl-retained`, `hitl-corpus`, runner
   qualification/recovery/control; small transport mock tests. Audit final evidence
   candidate assembly and model attribution for tagged HTTP results, no invented
   native token totals. Runbooks execute-eval/e2e-monitoring document configuration,
   fallback, secrets, calibration and timing.
7. `lib/process-json.mjs`, `lib/baseline-admission.mjs` and native dispatch env:
   exclude the OpenRouter key from non-owner children; worker inherits it only in
   memory. Reuse `lib/observation-clock.mjs`; do not introduce another clock or
   change Subject inactivity policy.

## 10. Verification and finish criteria

- Deterministic mock HTTP: valid/invalid range/schema/question ID/model, malformed
  JSON, status failure, output limit, missing secret, inactivity, abort, drift.
- No native Judge create/prompt/cleanup on qualified fast path; no JEV request for
  forbidden HITL/multiple-response initial fallback. Uncertain/unavailable creates
  exactly one native task; classification never accepts a partial bundle.
- Crash witnesses at dispatch/result/route/answer/event/resume: no duplicate answer,
  no switched result, same Subject Session; corrupt/foreign receipts fail closed.
- Canonical bytes/order/delimiter remain exact. Future round/foreign scope/changed
  fixture or threshold cannot reuse receipt. Empty input/empty bundle invalid.
- Legacy EVALs stay readable and resumable from anchored answers; historical paid
  turns/cleanup not rewritten. No failed cleanup fence bypass for native Judge.
- Test missing scope context: cannot silently assign fault or auto-cover.
- End-to-end mock cascade exercises reference, scored and focused paths; full
  installed-runtime EVAL tests zero unexpected skips. Secret redaction checked.
- Live corpus test and shadow acceptance before cascade; test real CP-199 input
  against compact Judge and JEV (possibly fallback) and confirm complete package.
- New scored Luna smoke after explicit launch authorization verifies actual HITL
  issue/resume. Do not mutate/replace currently running CP-199 as a test vehicle.
- Commit/push/PR review/merge via project workflow; record exact policy, prompt,
  model, test results and calibration before advertising fast-path qualification.

Implementation order: contracts/bundle → transport+receipts → shared dispatcher+
issuance/recovery → qualification/reporting → deterministic tests → live shadow →
threshold acceptance → opt-in cascade. A failed live acceptance leaves Judge-only
operation usable; it must not weaken tests to unlock the rollout.

## 11. Ponytail / prompting review

Simplification removes atomization, quote micromanagement, draft files and checker
calls from new HITL decisions. One boolean JEV request, one threshold, one fallback,
existing native Judge/capacity recovery, unchanged answer assembler. The six-call
experiment justifies feasibility, not extra infrastructure or arbitrary cutoffs.
Prompting separates trusted task from untrusted question/context and requests only
the minimal routing output. Correctness is tested externally, not outsourced to
another self-review task. Do not simplify away negative cases, evidence binding,
canonical-byte identity, cancellation or recovery.

References:
- https://openrouter.ai/docs/guides/community/jev-tutorial
- https://openrouter.ai/~typesafe/jev-latest
- https://ai-sdk.dev/providers/ai-sdk-providers/typesafe-ai

## 12. Top-down Judge responsibility audit (user-requested addition)

Every task must have a consumer and a concrete EVAL purpose. A model-generated
field is not useful solely because an old schema requires it.

| Responsibility | Consumer / purpose | Decision |
| --- | --- | --- |
| Determine full canonical coverage | Authorize a fixture answer without making new product decisions | JEV first, compact Judge fallback |
| Select existing response IDs | Exact answer assembly; needed only when bundle selection is not deterministic | Code for single response, fallback Judge for multiple |
| Enumerate covered atoms and prove every literal citation | Previously oracle/output witnesses; no additional routing action | Remove from new online HITL contract |
| Write draft, invoke checker, diagnose checker failures | Workaround for model-authored complex JSON | Remove; code validates the compact final JSON |
| Produce missing questions | Operator investigation and safe refusal to invent an answer | Keep ONLY on uncovered/ambiguous branch |
| Decide fixture_gap vs unnecessary question vs out_of_scope | Fault attribution, not answer authorization | Remove from Interaction Judge; preserve raw evidence for requested final assessment |
| Judge whether Subject questions were necessary/material | Assess flow quality against accepted context | Final Judge only when selected flow rubric contains HITL; not a second gate before answering |
| Check canonical bytes, IDs, hashes, pause scope, native cleanup | Deterministic custody / replay / safety facts | Code only; never ask model to certify transport correctness |
| Verify full product quality and semantic proof adequacy | Final outcome rubric beyond deterministic checks | Keep Final Judge; JEV coverage does not substitute for it |
| Attribute model vs tooling/provider failure | Prevent incorrect blame and misleading scores | Keep evidence-based Final Judge inference, uncertainty allowed; code supplies known facts |
| Score only authored applicable criteria | Comparable quality assessment | Keep; unreached stages N/A, no invented requirements |
| Supplemental assessment | Correct an identified evidence omission without mutating history | Explicit operator request only, not routine second opinion |

Code observations supporting this split:

- `interactionGroundedPrompt` in `lib/hitl-contract.mjs` requires independent
  atoms, exact citations, reference bindings, scope evidence, rationales, a draft
  file and checker execution. All of this currently happens even for covered HITL.
- `resolveHitlJudgment` uses status and selected IDs to assemble the canonical
  answer. The richer categories only choose failure codes; they do not enable an
  additional safe answer. `projectHitlAtoms` merely derives the summary.
- `hitl-corpus.mjs` currently requires witnesses/obligations and compares atom
  signatures. This oracle architecture makes formatting work necessary to pass
  qualification rather than to answer the Subject. Replace that gate for the new
  contract; keep its historical regression records.
- `hitlProof` and `verifyRetainedHitl` bind every answer to native Judge cleanup;
  those are code-level safeguards, not reasoning tasks. Tagged receipts remove
  this unnecessary native lifecycle only for actual HTTP decisions, not as a bypass.
- `finalJudgePrompt` already asks for outcome/flow quality, keeps provider failures
  distinct and unreached stages N/A. These are useful semantic jobs and must remain.
- Current task-priority `assessment.json` has real golden outcomes, alternatives
  and risks: do not remove the golden comparison as allegedly useless merely
  because it is not a runtime routing gate. It defines meaningful expected quality.
  Empty golden arrays alone do not prove a slow or unnecessary task.

For Final Judge, prevent duplicate work without inventing another evaluation:
provide mechanically established status/check results and evidence locators once;
ask the Judge to examine semantic adequacy and material gaps, not re-run installs,
tests, integrity hash checks or PID/lease probes. Reuse observations across outcome,
flow and golden conclusions; do not request a separate analysis pass for each.
Golden comparison applies only to authored nonempty expectations; novel/alternative
findings are optional, never a quota that forces invention. Retain existing
`dd-eval/judge-result@2`: empty golden arrays already express no applicable
findings, so no new Final Judge schema is needed. Update only task framing and
evidence assembly; criterion N/A uses the existing contract. The report's
technical validity and Final Judge's semantic findings remain separate fields.

Implementation acceptance additionally checks prompts for the removed duties and
that new online verdicts contain no atom/citation/draft fields. The compact Judge
cannot create new product answers, execute repairs, determine permission to resume,
change fixtures or claim checks passed without their evidence. Final Judge uses
its existing selected rubric and scope; no compulsory extra audit is added to
compensate for removing the old HITL report.

This amendment supersedes the earlier proposal to retain five-way negative
classification on the critical HITL path. The operational question is coverage;
fault and quality are a separate assessment, not another reason to delay an answer.

## 13. Implementation decisions closed by readiness review

### 13.1 Explicit opt-in and policy binding

Extend the current run-profile validator's strict `interaction_judge` key list
with `verdict_contract` and `coverage_policy`. Absent contract keeps legacy @3;
new definitions explicitly select `dd-eval/hitl-coverage@1`. `coverage_policy`
is a definition-relative JSON file with containment/checksum validation, not an
arbitrary URL or runtime env override. A policy on a legacy verdict contract is an
admission error. Compact without a policy is native Judge-only. A selected invalid
or tampered policy is an admission error, not a silent downgrade. A structurally
valid shadow policy may be unqualified; unqualified cascade fails preflight.
Unavailable JEV credentials/HTTP/model drift during an admitted run is fallback.

Policy `dd-eval/hitl-coverage-policy@1` has exact keys: `schema_id`, `mode`,
`requested_model`, `resolved_model`, `provider`, `projection_version`,
`prompt_sha256`, `transport_version`, `max_uncovered_probability`,
`qualification_sha256`. Transport version binds the fixed limits in section 6;
do not add unnecessary endpoint/secret/timeout knobs. Shadow permits null
threshold/qualification. Cascade requires finite threshold in [0,1] and a locally
verified immutable qualification receipt matching model, projection, prompt,
transport and threshold. Requested alias may resolve only to the pinned dated
model; missing/mismatched resolved identity is ineligible, even with a low score.

Copy the policy and compact contract identity to the prepared definition/manifest
before launch. Subsequent policy edits do not change an active EVAL. CLI status and
report distinguish requested mode, actual decision source, eligibility/fallback
reason and local observation/route references. No fake Judge profile/Session for
an HTTP result. Changing the Subject harness does not invalidate coverage semantics;
changing the classifier's actual inputs, prompt or model does.

Keep the existing operator entry points: `node bin/dd-eval.mjs runner definition
qualify --profile <profile>` dispatches legacy or compact qualification according
to the selected contract, and includes JEV calibration/acceptance when a shadow
policy is selected. Store the candidate qualification receipt independently;
promotion is a new checked-in cascade policy referencing it, not an in-place
mutation of an active policy or manifest. `runner eval preflight --profile
<profile>` validates local receipts without paid calls; `runner eval run --profile
<profile>` starts only after the selected contract's admission. No new parallel
qualification CLI or automatic live qualification inside scored execution.

### 13.2 HTTP settlement and replay state machine

Use the existing per-pause Judge operation directory, owner lock and atomic JSON
publication. Add three small record kinds, with explicit schema IDs:
`dd-eval/jev-observation@1`, `dd-eval/hitl-coverage-route@1` and
`dd-eval/hitl-coverage-qualification@1`. No separate DB, service or global runtime
cache. Record binding contains EVAL/execution identity, stage/pause/scope/round,
packet/fixture/projection hashes, with policy hash on routing; owner/generation
fencing governs writes. Intent/state transition publication is atomic under the
lock; completed evidence and committed routes are immutable.
Request body hash binds local response provenance; the API does not need to echo
our hashes. Never treat provider request ID alone as a proof.

| Crash / retained state | Required continuation |
| --- | --- |
| No dispatch intent | Under owner lock, start the one permitted HTTP attempt |
| Intent persisted, response not durably completed | Dispatch outcome may be unknown; close local observation as unknown and use native fallback, never resend HTTP |
| Full bounded response durably completed | Revalidate stored body/identity/hash and reconstruct routing without HTTP |
| Native fallback already dispatched | Recover its existing Session/Turn via current native machinery; no new JEV or replacement Judge task |
| Route already committed | Read the same route; late HTTP results cannot supersede it |
| Answer file exists but matched event absent | Verify exact bytes; publish the missing anchor once under the normal fence, not a second answer |
| Matched event exists, resume reply lost | Use existing Subject pause/native operation reconciliation; do not send a second productive resume |
| Cancelled/superseded owner, changed packet or bad retained hash | Do not publish/fallback; preserve diagnostics and stop/fence |

Persist dispatch intent BEFORE fetch; persist completed response body/hash/status/
validated identity BEFORE the observation transitions to completed. Atomic JSON
contains the bounded body, so a completed marker cannot outlive its evidence file.
A crash between response arrival and local completion sacrifices fast path, not
correctness. Ownership takeover first fences the old writer; old pending work
cannot publish a late route. Existing generation/admission guards must also run
after classifier completion, immediately before answer publication. Do not hold
a publication lock across HTTP/native model work.

The route binds source observation/native receipt, covered result, ordered selected
IDs, delimiter contract and answer hash. Only a committed, verified route plus the
normal matched-event anchor authorizes issuance/replay. JEV does not generate a
fictional Judge JSON result; code builds the normalized covered routing result.
Corrupt retained evidence is not transport unavailability and cannot be bypassed
by fresh classification. Native cleanup failure continues to block native answer
issuance; JEV transport abort settlement creates no fake daemon cleanup obligation.

Runtime reuse is limited to the same frozen HITL intent. Qualification observations
may be content-addressed across qualification runs, but they cannot authorize a
different EVAL/pause answer. New scopes/rounds always obtain their own bound proof.
Absent usage/cost is unknown, not zero. Record HTTP and native costs separately,
including failed/unknown dispatches; never add HTTP usage to native Session counters.

### 13.3 Qualification procedure and safe failure

Freeze labeled calibration and held-out corpus manifests before paid checks.
Start from the 20 authored cases plus observed regressions; add a distinct held-out
set of at least 20 new cases (at least 10 covered and 10 uncovered/ambiguous),
covering the adversarial categories in section 8. A paraphrase of a calibration
case is a correlated variant, not an independent statistical sample. Store stable
expected missing-decision IDs/descriptions in test metadata only, never in prompts.
Semantic labels/remaining-question adjudication are authored and human-reviewed;
JSON validation cannot establish completeness. Runtime has no second model oracle.

Run JEV three times per eligible calibration/held-out case and retain all raw
probabilities. Compact Judge must pass each case once with correct full coverage
and all expected gaps/ambiguities; reuse retained unchanged native observations,
including Session/Turn and settled cleanup. Repeats are JEV-specific instability
probes, not mandatory repetitions of every expensive native Judge call.

Select threshold only on calibration data: candidate values are observed covered-
case probabilities. Reject every candidate accepting any uncovered/ambiguous
calibration observation. Among remaining candidates maximize covered-observation
fast-path yield; ties choose the smallest threshold. If no candidate has positive
yield, retain Judge-only mode. Freeze the chosen value, then test held-out data
once as an acceptance batch (all three repetitions). Any false-covered result
fails promotion; do not retune against that same held-out set. A changed classifier
requires a new, distinct held-out batch before another promotion attempt.

Held-out acceptance requires zero false-covered results and at least one eligible
covered case accepted in all three repetitions. Report yield on unique cases and
observations, disagreement/fallback causes, HTTP time, native fallback time and
whole pause-to-resume time. Do not advertise end-to-end acceleration based only on
HTTP latency. For finite-corpus uncertainty report 0/N with unique-case N, not 0/(3N)
as independent trials. Any binomial bound must state its independence assumption;
these curated correlated cases do not certify real-world error probability.

Shadow always uses compact native Judge for issuance, even when JEV looks covered.
Compare JEV against authored labels in corpus qualification and against native
verdicts in runtime telemetry: disagreement alone does not prove which model erred.
No second Judge call to break a tie. A failed compact-Judge acceptance blocks new
compact scored definitions; a failed JEV acceptance leaves qualified compact
Judge-only operation available, not legacy atomization disguised as compact.
Calibration/validator fixes replay saved outputs first; only changed effective
requests require new paid calls. No full-repository Git-tree qualification key.

### 13.4 Caller / evidence / test completion checklist

Before removing assumptions, enumerate callers with `rg`: `interactionJudge`,
`resolveHitlJudgment`, `hitlProof`, `verifyRetainedHitl`, `validateGroundedHitl`,
`verdict_contract`, `judge_session_id`, `assertHitlQualification`,
`isInfrastructureFailure`. Verify each by contract branch, not by replacing a
global old-contract constant with the new one.

| Surface | Required new behavior / regression witness |
| --- | --- |
| Reference preparation, focused/segment/scored E2E | Same dispatcher, fixture policy/max-round checks and exact answer assembler |
| Packet/source builder | Same frozen context/provenance for both classifiers; no semantic truncation, missing-reference guessing or live re-read |
| Native Judge/capacity/recovery | Compact output/prompt only; current same-Session continuation and cleanup barriers unchanged |
| Issuance, retained replay, stage boundary capture | Verify both tagged sources; foreign/corrupt proofs cannot authorize bytes |
| Qualification cache/admission | Old and compact qualifications cannot substitute for each other; raw observations separate from oracle/policy assessment |
| Final evidence, diagnostics, JSON/Markdown/status | Preserve unresolved questions and actual decision source, no invented Session or infrastructure attribution |
| Detached owner and all non-owner spawn paths | Runtime key reaches owner only; fake child asserts key absence after ambient env merge |

Add mock failures at every row of the replay table, simultaneous owner/cancel
tests, redirect rejection, stalled headers/body, chunk progress vs empty polls,
clock gap, response overflow and model/provider drift. SDK/module substitution
must pass the same tests without hidden automatic retries. Test semantic context
mutants: same words but changed actor/negation/archive/lifecycle/antecedent,
single missing decision in an otherwise covered bundle, and conflict among
multiple selected responses (must not classify their union as coherent coverage).

Runnable verification after implementation: targeted `node --test` for existing
`test/hitl-contract.test.mjs`, `test/hitl-issuance.test.mjs`,
`test/hitl-retained.test.mjs`, `test/hitl-corpus.test.mjs`,
`test/hitl-sources.test.mjs`, `test/process-json.test.mjs` and new transport tests;
then `npm test` including recovery/control/cancel/resume tests. Native mocks must
assert absence of create/prompt/cleanup on fast path, not merely inspect a label.
Include historical @1/@2/@3 receipt fixtures and report@2 reader regressions.

Finish is staged and honest: (1) code + deterministic tests + compact live
qualification, (2) JEV calibration/held-out + shadow validation, (3) opt-in cascade
promotion and newly authorized scored smoke. Mark each separately in the plan
and commit evidence. Neither mock PASS nor the six-call experiment completes live
qualification. No new EVAL launch is authorized by this readiness review.

### 13.5 Readiness verdict

Architecture, wire/output contracts, eligibility, configuration, transport limits,
recovery, cancellation, secrets, report attribution, cache separation and acceptance
procedure are decided above. Implementation need not invent semantic selectors,
retry policy, thresholds or a new Final Judge schema. The numerical threshold and
measured benefit are deliberately outputs of the specified live procedure; until
then fast-path qualification and rollout remain incomplete. No production runtime
or running EVAL was changed during this review.
