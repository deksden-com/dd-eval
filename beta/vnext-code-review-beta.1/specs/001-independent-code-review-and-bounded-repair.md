---
file: 'beta/vnext-code-review-beta.1/specs/001-independent-code-review-and-bounded-repair.md'
description: 'Independent aspect-based review of verified code, materiality filtering, strict deferrals and bounded repair.'
status: 'DRAFT'
---

# 001 — Independent CODE-REVIEW and bounded repair

## Goal

Add an optional semantic quality gate after CODE without duplicating CODE
verification or importing the much broader project-level `mb-sdlc-review`
flow.

The target path is:

```text
CODE Work-local verification
  -> CODE graph fan-in
  -> mandatory semantic verification against accepted PLAN
  -> aggregate deterministic checks
  -> code_completed
  -> optional independent CODE-REVIEW
  -> orchestrator finding decisions
  -> bounded repair Works when required
  -> aggregate deterministic checks after repair
  -> code_review_completed
  -> MERGE or configured stop
```

The stage optimizes for meaningful defects. It must not turn style preference,
cosmetic polish or speculative refactoring into repair work.

## 1. Two different proofs

### 1.1 CODE owns implementation verification

CODE answers:

> Did the produced implementation fulfil the accepted plan, requirements and
> acceptance criteria?

Every implementation Work performs its focused checks at `work finish`. After
the graph fans in, the root orchestrator performs one mandatory semantic
verification against the complete accepted `plan.json` set. The CLI supplies a
deterministic traceability projection from accepted obligations to plan items,
CODE Works, changed paths, checks and receipts.

The orchestrator verifies at least:

- every accepted `R-*` and current-gate `AC-*` is implemented;
- every accepted plan item and required document update is complete;
- the combined Works form one coherent result;
- invariants, non-goals and must-preserve behavior remain true;
- planned negative cases and acceptance scenarios have the required evidence;
- no unplanned scope expansion is hidden in the diff;
- declared proof limits are honest and compatible with the current gate.

The CLI can validate links and receipts; it cannot claim semantic correctness.
CODE finish therefore consumes one small orchestrator-authored
`code-verification.json`:

```json
{
  "schema_id": "dd-flow/code-verification@1",
  "verdict": "passed",
  "summary": "The combined implementation fulfils the accepted plan.",
  "unresolved": [],
  "deviations": [],
  "evidence_refs": ["run://RUN-ID/05-code/checks/CHECK-ID.json"]
}
```

Allowed verdicts are `passed`, `needs_repair` and `blocked`. The model does not
repeat the complete obligation list: the CLI owns that projection. CODE cannot
finish while `unresolved` is non-empty, the semantic verdict is not `passed`,
or deterministic checks fail. A repairable issue creates or continues a CODE
repair Work before CODE finish.

### 1.2 CODE-REVIEW owns independent quality review

CODE-REVIEW answers:

> What material defects remain in the verified implementation?

Reviewers still read the accepted requirements and plan because quality cannot
be judged without intent. They do not rebuild or own the formal CODE
traceability matrix. If independent review finds an omitted accepted
obligation, that is a material CODE-verification escape and is repaired inside
CODE-REVIEW without reopening the historical CODE stage.

The CODE report owns `plan_conformance`. The CODE-REVIEW report owns review
findings, decisions, repairs and deferrals. Neither stage duplicates the other
stage's semantic verdict.

## 2. Stage mode and routing

The frozen RUN execution profile adds:

```text
code_review.mode = auto | off | standard | deep
```

The project profile supplies the default. An explicit RUN override is allowed
before CODE-REVIEW starts and is then frozen.

- `off`: no reviewer is launched;
- `standard`: at least one fresh reviewer Session and preferably one grouped
  wave;
- `deep`: narrower fresh reviewer assignments for independent high-risk
  boundaries; more than one wave is allowed only when capacity or a real hard
  dependency requires it;
- `auto`: select `off` for a result with no executable or otherwise
  review-worthy change, `standard` for ordinary implementation, and `deep`
  only for an explicit high-impact, security, privacy, irreversible data,
  concurrency or similarly independent-risk trigger.

`auto` is resolved once from accepted task metadata and the actual diff. It is
not repeatedly reinterpreted by each reviewer.

CODE ends in the durable state `code_completed`. The flow router then either
opens CODE-REVIEW or follows the configured stop/merge path. Successful
CODE-REVIEW ends in `code_review_completed` and later opens MERGE when that
stage exists.

## 3. Ownership and topology

The existing root SDLC Work remains the orchestrator. CODE-REVIEW creates no
coordinator Work.

When review is enabled:

- every reviewer runs in a fresh child Session;
- every reviewer is represented by a registered read-only Work;
- reviewers never edit files and never create nested agents;
- the root orchestrator evaluates findings and creates repair Works;
- repair workers use fresh Sessions and normal CODE Work lifecycle checks;
- a quiet reviewer or repair worker remains active until the harness reports a
  terminal turn state;
- completed disposable agents are closed so they do not consume RUN capacity.

Review and repair are separate responsibilities. A reviewer reports a defect;
it does not silently implement its preferred solution.

## 4. Deterministic review preparation

`stage start <RUN> --stage code-review` must fail closed unless CODE completed
with passing semantic and deterministic verification.

The start handler freezes one review target:

- accepted workspace route and protocol/PSET identity;
- base revision, reviewed head revision and diff checksum;
- changed paths and diff statistics;
- accepted SPECIFY requirements and acceptance criteria;
- accepted protocols and final plan revisions;
- plan aspect maps and PLAN-REVIEW decisions;
- selected design-aspect defaults, deviations, overrides and verification
  seeds;
- CODE Work packets, results, dependencies and repair lineage;
- focused and aggregate check receipts;
- active named deferrals and declared proof limits;
- project engineering, documentation and operational rule references;
- the already observed RUN subagent capacity.

The CLI returns these facts as one structured stage packet with exact reviewer
start, pause/resume and finish commands. Agents do not rediscover CLI help,
Git state, schemas or stage paths.

The packet is evidence, not a semantic verdict. Reviewers must inspect the
actual changed code, tests and relevant durable rules rather than trust Work
summaries alone.

## 5. Aspect selection and one-wave packing

CODE-REVIEW reuses the existing plan/readiness aspect catalog. It creates no
second aspect catalog and does not mutate the historical PLAN aspect map.

For any material code change, the baseline review covers:

- `goal_traceability`;
- `coding_standards_design_review`;
- `verification_evidence_review`.

Conditional aspects come from:

- applicable PLAN aspect rows;
- PLAN-REVIEW `watch`, accepted correction and DEF evidence;
- selected SPECIFY design aspects;
- plan proof limits and expected evidence;
- actual changed surfaces;
- unexpected diff surfaces not represented in the accepted plan.

An unexpected changed surface is itself scope-drift evidence and may activate
the corresponding conditional aspect.

Compatible aspects are packed two or three per reviewer with one section and
verdict per aspect. The preferred topology is one wave using at most the stored
RUN capacity. Security/trust, irreversible data, concurrency and true hard
output dependencies remain separate when independent judgment would otherwise
be lost.

CODE-REVIEW reuses the one-shot RUN capacity observation. It never launches a
new probe when an accepted RUN value exists and never fills unused slots with
reviewers that have no semantic assignment.

The current PLAN fields, aspect map, expected evidence and proof limits are
sufficient review-focus sources. This beta adds no speculative
`code_review_hints` field. Add one only after an observed task cannot express
necessary focus through the existing contract.

## 6. Reviewer contract

Each reviewer receives one immutable packet containing:

- assigned aspects;
- review target revision and checksum;
- exact project and RUN sources to read;
- relevant requirements, plan items and CODE Work results;
- exact changed paths and bounded discovery rules;
- project rules applicable to its aspects;
- a compact result schema and finish command.

The result is deliberately small:

```json
{
  "schema_id": "dd-flow/code-review-result@1",
  "verdict": "pass",
  "summary": "No material defects found in the assigned aspects.",
  "aspects": [
    {
      "aspect_id": "goal_traceability",
      "verdict": "pass",
      "summary": "The implementation realizes the accepted behavior.",
      "evidence_refs": ["src/example.ts", "test/example.test.ts"]
    }
  ],
  "findings": []
}
```

Finding shape:

```json
{
  "finding_id": "FIND-code-001",
  "aspect_id": "verification_evidence_review",
  "priority": "p1",
  "problem": "The negative authorization path is not enforced.",
  "impact": "A user can observe data outside the accepted boundary.",
  "evidence_refs": ["src/example.ts:42", "test/example.test.ts:18"],
  "obligation_refs": ["R-004", "AC-003"]
}
```

Allowed reviewer verdicts are `pass`, `findings` and `blocked`. `blocked`
means the reviewer cannot reach a conclusion because required evidence or
access is missing. It is not a defect priority.

A reviewer reports required outcomes, not speculative redesigns. It must not
report cosmetic polish, subjective naming/style preference or abstractions for
possible future use as defects.

## 7. Materiality and priority

A candidate is a finding only when it states all of:

1. the violated accepted obligation, plan decision or objective project rule;
2. a concrete failure mode or plausible material risk;
3. direct file, diff, test or receipt evidence;
4. user, security, data, operational or maintainability impact;
5. the minimum required outcome of repair.

Priority reflects impact, not repair effort:

- `p0`: catastrophic security, data-loss, irreversible corruption or total
  critical-path failure;
- `p1`: an accepted requirement, current acceptance criterion, major public
  contract, security boundary or primary scenario is broken;
- `p2`: a real but bounded correctness, resilience, accessibility,
  maintainability or evidence defect with plausible impact;
- `p3`: a low-impact, non-blocking improvement that does not affect current
  acceptance, safety or operability.

P0 and P1 always block progression until repaired. P2 is repaired by default
when the correction is bounded and safe. P3 never creates an automatic repair
Work or DEF. Pure cosmetic or taste findings are rejected as `non_finding`,
not preserved as P3 debt.

## 8. Orchestrator decisions

Reviewer findings are evidence, not votes. After all reviewer Works settle,
the root orchestrator:

- deduplicates findings;
- rejects unsupported or non-material preference;
- corrects priority based on impact;
- identifies shared root causes;
- selects `fix`, `defer`, `reject` or `duplicate`; when no reasonable
  selection exists, it pauses for the user before recording a final decision;
- groups accepted fixes into the fewest safe repair Works.

The final `decision.json` is compact:

```json
{
  "schema_id": "dd-flow/code-review-decision@1",
  "outcome": "accepted",
  "summary": "All material findings were resolved.",
  "findings": [
    {
      "finding_id": "FIND-code-001",
      "disposition": "fix",
      "reason": "The finding violates AC-003.",
      "closure": "resolved",
      "closure_summary": "The authorization guard and negative test now cover AC-003.",
      "evidence_refs": ["src/example.ts:42", "test/example.test.ts:18"]
    }
  ]
}
```

Allowed closure values are `resolved`, `deferred`, `rejected` and `unresolved`.
Allowed outcomes are `accepted`, `accepted_with_DEF`, `blocked`, `failed` and
`cancelled`. `fix` requires `resolved` before an accepted outcome; `defer`
requires `deferred` plus a durable `DEF-*` reference; `reject` and `duplicate`
require `rejected`. An `unresolved` material finding forbids acceptance.
The CLI derives reviewer Work ids, repair Work ids, receipts and Session facts.
The orchestrator supplies only the semantic closure summary and direct evidence
references; it does not manually copy mechanical lineage into the decision.

If no reasonable default exists, the orchestrator pauses this same stage,
asks the user and resumes it. It never finishes CODE-REVIEW as waiting and
never returns to SPECIFY, PLAN or CODE.

## 9. Strict DEF policy

A named deferral (`DEF`) is not a synonym for `won't fix`. It transfers one
specific unresolved material obligation to a named future gate.

DEF is allowed only when every condition is true:

1. the finding is not P0 or P1;
2. no current-gate accepted criterion becomes false;
3. the reason is objective and belongs to an allowed class;
4. a target gate or triggering condition is named;
5. the future owner and closure evidence are named;
6. the deferral does not hide unfinished current protocol scope;
7. the user explicitly accepts it when it changes the promised result.

Allowed reason classes are:

- `external_dependency`: required external access/system is unavailable;
- `later_declared_gate`: evidence is intentionally owned by an already
  accepted later deploy/release/external gate;
- `unauthorized_scope_expansion`: repair is separable but exceeds the accepted
  task authority;
- `repair_risk`: a currently attempted bounded repair has a demonstrated
  higher risk than the bounded defect.

An obligation already assigned by PLAN to a later gate is ordinary pending
evidence, not a new DEF. Time, token budget, inconvenience, reviewer
uncertainty, unexpected effort, failing tests, cosmetic work and an unnamed
`later` are invalid deferral reasons.

P2 may be deferred only under the complete policy above. P3 is ignored or sent
to an ordinary backlog when objectively useful; it does not create a DEF. An
unrepairable P0/P1 or unavailable evidence needed to rule it out makes the
stage `blocked`.

## 10. Repair Works

Every accepted repair is registered. The root orchestrator never changes
product files invisibly.

The CLI composes a repair packet from:

1. accepted finding ids and reviewer evidence;
2. the complete original CODE Work packet(s), results and receipts responsible
   for the affected surface;
3. accepted requirements, plan items and invariants;
4. current changed paths and final review snapshot;
5. a concise orchestrator repair objective;
6. the union of relevant write scopes and checks.

Several findings with one root cause and compatible write scope should share
one repair Work. Independent non-overlapping repairs may run concurrently.
Every repair Work keeps exact finding links in its CLI-owned payload.

`work finish` runs focused checks. A failing focused check keeps the same
repair Work running. The worker reports only its semantic summary, deviations
and blockers; the CLI owns changed paths, receipts and finding linkage.

## 11. Closure without automatic re-review

After repair Works settle, the orchestrator inspects each accepted finding
against the repair result, final diff and evidence and classifies it as:

- `resolved`;
- `deferred` under the strict policy;
- `rejected` after reconsideration;
- `unresolved`.

The CLI verifies that every final disposition has valid lineage and that no
P0/P1 or impermissibly deferred P2 remains. It reruns the aggregate CODE check
profile after all mutation fans in.

The stage does not automatically launch a second full reviewer wave. A second
targeted review is allowed only by explicit user request or when a repair
materially expands the reviewed surface or introduces a new independent trust,
irreversible-data or concurrency boundary. In that case the old review
snapshot cannot honestly prove the new surface.

CODE is not reopened. CODE-REVIEW owns its repair history and reaches its own
terminal stage outcome.

## 12. Artifacts and reporting

Do not create an authored CODE-REVIEW aspect map or a separate review database.
The authorities are:

- existing PLAN aspect maps, read-only;
- reviewer and repair Work rows/results in SQLite with normal RUN projections;
- one compact orchestrator `decision.json`;
- immutable check receipts and Git facts.

The CLI deterministically renders:

```text
<RUN>/06-code-review/
  stage-prompt.md
  decision.json
  stage-report.json
  stage-report.md
  stage-report.html
```

The report contains:

- review target base/head/checksum;
- effective review mode and aspect routing;
- reviewer Work/Session counts and one-wave efficiency;
- findings by priority and disposition;
- rejected noise separately from accepted defects;
- repair lineage and final closure;
- DEF policy evidence;
- final focused and aggregate check receipts;
- initial and final changed paths;
- timing and separately collected Session usage/tool statistics;
- exact next flow action.

The model does not hand-author Markdown, HTML, telemetry or Git facts.

## 13. Flow transitions

The vNext graph must support:

```text
code.verified                    -> code-review.default | configured stop/merge
code-review.off                 -> configured stop/merge
code-review.review_required     -> code-review.agent
code-review.findings_classified -> code-review.repair | code-review.finish
code-review.repair_completed    -> code-review.finish
code-review.waiting_for_user    -> code-review.answer
code-review.accepted            -> configured stop/merge
code-review.blocked             -> terminal.blocked
code-review.failed              -> terminal.failed
code-review.cancelled           -> terminal.cancelled
```

Waiting for the user pauses the running root Work and stage; it does not finish
either. Repairs remain inside CODE-REVIEW. Backward stage transitions are
forbidden.

Until MERGE exists, the configured beta stop target after successful review is
`code_review_completed`.

## 14. Required implementation changes

### dd-flow CLI

1. Extend the execution profile and RUN config with `code_review.mode` and a
   `code_review_completed` stop target.
2. Add the `code-verification@1`, `code-review-result@1` and
   `code-review-decision@1` schemas and return exact minimal examples in stage
   and Work prompts.
3. Change CODE finish to consume semantic verification, keep repairable
   conformance failures inside CODE and route successful CODE according to the
   frozen review mode/stop target.
4. Extract aggregate project verification into one reusable service callable
   by CODE finish and CODE-REVIEW finish after repairs.
5. Add a modular `vnext-code-review` service owning prepare, reviewer dispatch,
   finding validation, repair composition, closure and reporting. Do not add
   CODE-REVIEW branches to an already-large generic lifecycle module.
6. Generate reviewer Works from accepted aspects, actual diff and RUN capacity
   without mutating the PLAN map.
7. Extend existing `work repair add` with repeatable `--from-finding` input;
   when present, it derives origin Works, review evidence, scope and checks
   from the same RUN instead of requiring a separate repair command family.
8. Validate DEF eligibility, finding lineage, closure, review snapshot
   freshness and final checks before acceptance.
9. Reuse existing hook/session binding and usage collection; add no manual
   Session ids or CODE-REVIEW telemetry store.
10. Render JSON, Markdown and HTML reports through the existing deterministic
    report path.

### vNext flow pack / dd-tasks beta

1. Add `.memory-bank/dd-flow/vnext/code-review.md` with the complete generated
   packet contract, materiality gate, priority policy, reviewer isolation,
   repair and closure instructions.
2. Update `code.md` so CODE owns mandatory semantic plan verification and
   returns the exact CODE-REVIEW/stop command.
3. Add CODE-REVIEW entries and legal transitions to the vNext flow graph.
4. Reuse existing plan/readiness aspect prompts; add only a small common
   CODE-REVIEW reviewer wrapper when the current aspect worker remains too
   plan-authoring-specific.
5. Reuse `.memory-bank/mbb/named-deferrals-guide.md` and the durable
   `.memory-bank/defs/DEF-*.md` layer; do not create a CODE-REVIEW-only deferral
   format.
6. Update project execution profile examples and indexes.
7. Preserve current project coding standards, check profile, worktree policy
   and context-selection rules in generated reviewer/repair packets rather
   than asking agents to rediscover them.

### dd-eval

1. Add `code-review` to supported stage lists, checkpoint schemas, case
   candidate files and session registries.
2. Add a focused CODE-REVIEW checkpoint created from an accepted CODE state.
3. Add golden defects covering plan-conformance escape, meaningful
   architecture/correctness/test evidence, P2 deferral and cosmetic noise.
4. Judge CODE separately for mandatory plan verification and CODE-REVIEW for
   independent discovery, materiality calibration, evidence, repair closure
   and efficiency.
5. Add one focused stage eval and one complete chain run before replacing
   canonical starter checkpoints.

## 15. Verification matrix

Minimum engine tests:

- CODE cannot finish without a passing semantic verification artifact;
- CODE `needs_repair` remains in CODE and creates no CODE-REVIEW state;
- `off`, `standard`, `deep` and resolved `auto` routing;
- review cannot start from stale or unverified CODE;
- enabled review launches at least one genuinely fresh reviewer Session;
- compatible aspects fit one wave when capacity permits;
- reviewer result schema and deterministic evidence-reference syntax/existence
  validation; semantic evidence quality remains the orchestrator's judgment;
- P0/P1 cannot defer;
- P2 deferral succeeds only with every required field and approval rule;
- P3 creates neither repair nor DEF;
- taste/cosmetic finding may be rejected without blocking;
- accepted findings compose one or more bounded repair Works with origin
  context;
- failed repair checks keep the Work active;
- unresolved accepted findings block stage finish;
- aggregate checks rerun after repair;
- no automatic second review wave;
- reports and next action are deterministic and truthful.

Minimum flow-pack tests:

- generated CODE and CODE-REVIEW prompts include exact commands and schemas;
- reviewers remain read-only and fresh-session-only;
- all stage paths use the immutable feature workspace;
- no backward transition to CODE exists;
- Memory Bank selected-file lint passes for changed flow documents.

## 16. Evaluation criteria

The CODE judge measures:

- Work-local verification quality;
- combined plan-conformance accuracy;
- requirement/acceptance completeness;
- integration and aggregate evidence;
- truthful deviations and proof limits.

The CODE-REVIEW judge measures:

- discovery of seeded material defects;
- false-positive rate and rejection of taste/cosmetic noise;
- priority calibration;
- aspect and risk coverage;
- direct evidence quality;
- repair rootness and scope discipline;
- strict DEF decisions;
- closure without unnecessary re-review;
- one-wave routing and total cost/time.

Formatting errors remain execution-discipline findings. They must not outweigh
missed material defects or incorrect implementation semantics.

## 17. Non-goals

This beta does not add:

- a separate implementation-verification stage;
- a second CODE or CODE-REVIEW coordinator;
- project-wide `mb-sdlc-review` inside every delivery;
- a second aspect catalog or authored review coverage map;
- one repair Work per finding;
- automatic repair of P3 or cosmetic findings;
- automatic repeated full review;
- backward transitions to CODE;
- a generic workflow scheduler;
- merge semantics.

## 18. Acceptance

1. CODE cannot reach `code_completed` until the orchestrator verifies the
   combined implementation against the accepted plan and all deterministic
   checks pass.
2. CODE-REVIEW, when enabled, uses at least one fresh independent reviewer and
   reviews the actual frozen diff.
3. The existing aspect catalog drives proportional, preferably one-wave
   review without a duplicate map or catalog.
4. Only evidence-backed material findings enter repair decisions.
5. P0/P1 always block until repaired; P2 follows the strict repair/DEF policy;
   P3 and cosmetic preference do not generate automatic work.
6. Every accepted repair is a registered Work with original context, finding
   lineage, bounded scope and focused checks.
7. CODE-REVIEW finishes only after accepted findings are resolved or validly
   deferred and aggregate checks pass on the final code.
8. No automatic second full review occurs and CODE is never reopened.
9. Reports are deterministic, stage ownership is unambiguous and the next
   action follows the frozen RUN profile.
