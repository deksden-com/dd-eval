---
file: 'beta/vnext-plan-beta.1/specs/007-plan-review-gate-and-observability.md'
description: 'Optional independent PLAN review gate with one orchestrator level, proportional fresh reviewers, atomic CODE opening and truthful observability.'
status: 'DRAFT'
---

# 007 — PLAN review gate and truthful observability

## Goal

Separate authoring a plan from independently challenging it without adding a
second orchestration level or forcing review on every task.

The normal flow becomes:

```text
SPECIFY → PROTOCOLIZE → PLAN → PLAN-REVIEW → CODE
```

`plan-review` is a first-class stage, not a PLAN sub-step and not the separate
project-level `mb-sdlc-review` flow. Its selected mode is `off`, `standard`
or `deep`:

- `off` performs no model review and deterministically opens CODE;
- `standard` launches at least one fresh reviewer Session and prefers one
  compatible grouped wave;
- `deep` launches narrower fresh reviewer assignments and may use several
  waves when dependencies or available capacity require them.

The agent Session that owns PLAN remains the PLAN-REVIEW orchestrator. Fresh
Sessions are required only for reviewer Works. Reviewers never create
subagents, never mutate the plan and never become orchestration parents. The
orchestrator evaluates their findings, changes the plan and proposed CODE
graph when justified, and retries only affected groups.

This specification also replaces ambiguous report counters with one
deterministic Work / Session / Agent Turn / token-usage projection and requires
the HTML report to present that projection accurately.

## Why this is a flow correction

EVAL-010 proved that PLAN routing and parallel Work execution can be
mechanically correct while a fresh API reviewer still returns `pass` for a
materially ambiguous plan. The missed detail itself is not a new task-specific
rule: the canonical gap methods and aspect catalog already contain the
necessary decision-table and API-contract guidance. Adding a special PATCH or
priority rule to SPECIFY would overfit one eval.

The systemic gap is role separation:

1. PLAN currently authors the plan, launches its own short aspect checks,
   reduces their verdicts and registers CODE in one stage.
2. The vNext reviewer packet does not provide the full canonical fresh-session
   aspect-review role and adversarial review contract.
3. A `pass` result can therefore mean "the plan looks plausible" rather than
   "I tried to falsify the plan against its requirements and project facts".
4. There is no separately visible gate showing whether independent review was
   skipped, performed proportionally or requested in deep mode.

The correction reuses the existing aspect catalog, Work registry, Agent Turn
records, hook binding and targeted retry mechanism. It introduces no judge
agent, scheduler, queue, second coverage graph or model-authored HTML.

## Supersession boundary

This specification supersedes the PLAN-owned review execution and immediate
CODE registration described by specifications 001, 003, 005 and section 2 of
006. It preserves from 006:

- one live RUN across non-terminal stages;
- portable `run://` references;
- one-time Work launch tokens and trusted Desktop adapter binding;
- proportional capacity-aware packing;
- retry of only rejected units;
- terminal RUN events only at legal Flow exits.

PLAN still writes the aspect map and proposed CODE batch. PLAN-REVIEW now
executes independent review and is the only stage allowed to register that
batch as live CODE Work.

## 1. Flow graph and stage ownership

### PLAN responsibilities

PLAN must:

1. write one executable `plan.json` per PRT;
2. write one RUN-local aspect map per PRT;
3. write one proposed `code-work-batch.json` for the plan/PSET;
4. classify every catalog aspect and recommend review mode, grouping and
   reasons;
5. validate the plan, maps and proposed batch structurally and semantically;
6. finish with `next_action: start_plan_review`.

The plan's `code_handoff` still describes the eventual CODE contract. PLAN's
stage report and flow transition point to PLAN-REVIEW; CODE must not read the
proposed entry directly until PLAN-REVIEW publishes the accepted mapping.

PLAN must not:

- launch independent reviewer Works;
- claim independent reviewer evidence;
- register the proposed CODE batch in `flow_works`;
- return a CODE Work as ready;
- claim `ready_for_code` when PLAN-REVIEW has not completed.

PLAN self-checks remain useful during authoring. Applicable rows may retain
`coverage_mode: self_check` and their PLAN-author verdict, but that evidence is
not independent PLAN-REVIEW evidence.

### PLAN-REVIEW responsibilities

PLAN-REVIEW owns:

1. resolving the effective review mode;
2. validating that the PLAN snapshot and proposed CODE batch are the exact
   artifacts being reviewed;
3. launching fresh reviewer Works when mode is not `off`;
4. collecting structured aspect findings;
5. having the existing orchestrator accept, reject, defer or repair findings;
6. targeted reviewer retries after material changes;
7. final plan/map/batch validation;
8. atomic registration of the accepted CODE Work graph;
9. deterministic JSON, Markdown and HTML reporting;
10. returning the exact CODE stage command while leaving CODE unstarted.

### CODE opening invariant

Only successful PLAN-REVIEW finish registers CODE Work.

- In `off`, PLAN-REVIEW start performs the deterministic finish path atomically:
  validate the candidate artifacts, record that independent review was
  skipped, register CODE Work, render reports and return the CODE command.
- In `standard` or `deep`, CODE registration is forbidden until every required
  latest reviewer Work/Turn/result is terminal and the orchestrator has
  resolved every material finding.
- A failed or blocked PLAN-REVIEW leaves the proposed batch as a file only. It
  must not leave a partially registered CODE graph.
- Registration and report finalization are one transaction boundary from the
  caller's perspective. A retry is idempotent and returns the already accepted
  CODE entry instead of duplicating Work.

### Flow transitions

The vNext definition must expose these stage-entry transitions:

```text
plan.planned                 → plan-review.default
plan-review.review_required  → plan-review.agent
plan-review.off              → code.default
plan-review.accepted         → code.default
plan-review.needs_changes    → plan-review.correction
plan-review.waiting_for_user → plan-review.answer
plan-review.blocked          → terminal.blocked
plan-review.failed           → terminal.failed
plan-review.cancelled        → terminal.cancelled
```

`plan-review.off` and `plan-review.accepted` are distinct report outcomes but
both open the same CODE graph. Neither outcome completes the RUN.

This stage is the PLAN acceptance gate inside the current SDLC RUN. It is not
the separate on-demand `flow_kind: mb-sdlc-review` project audit. The explicit
stage ID and workspace name provide the distinction; no extra `review_kind`
discriminator is needed.

The flow definition uses explicit entries rather than conditional logic in one
action list:

```json
{
  "plan-review.default": {
    "actions": [{ "handler": "plan-review.prepare" }],
    "transitions": {
      "off": "plan-review.off",
      "review_required": "plan-review.agent"
    }
  },
  "plan-review.off": {
    "actions": [{ "handler": "plan-review.accept-off" }],
    "transitions": { "accepted": "code.default" }
  },
  "plan-review.agent": {
    "actions": [
      { "agent": { "prompt": "plan-review.md", "result_format": "files" } },
      { "handler": "plan-review.accept" }
    ],
    "transitions": {
      "accepted": "code.default",
      "needs_changes": "plan-review.correction",
      "waiting_for_user": "plan-review.answer",
      "blocked": "terminal.blocked",
      "failed": "terminal.failed",
      "cancelled": "terminal.cancelled"
    }
  },
  "plan-review.correction": {
    "actions": [
      { "agent": { "prompt": "plan-review.md", "result_format": "files" } },
      { "handler": "plan-review.accept" }
    ],
    "transitions": {
      "accepted": "code.default",
      "needs_changes": "plan-review.correction",
      "waiting_for_user": "plan-review.answer",
      "blocked": "terminal.blocked",
      "failed": "terminal.failed",
      "cancelled": "terminal.cancelled"
    }
  },
  "plan-review.answer": {
    "actions": [
      { "handler": "plan-review.record-answer" },
      { "agent": { "prompt": "plan-review.md", "result_format": "files" } },
      { "handler": "plan-review.accept" }
    ],
    "transitions": {
      "accepted": "code.default",
      "needs_changes": "plan-review.correction",
      "waiting_for_user": "plan-review.answer",
      "blocked": "terminal.blocked",
      "failed": "terminal.failed",
      "cancelled": "terminal.cancelled"
    }
  }
}
```

`stage start` traverses consecutive deterministic entries until it reaches an
agent action, a terminal outcome or the next stage boundary. Therefore `off`
finishes in one CLI call, while `standard`/`deep` stop at the agent boundary
and return the rendered PLAN-REVIEW prompt.

`plan-review.prepare` must resolve whether review runs before any agent action:

- `off`: return transition `off`; do not render `stage-prompt.md`, create a
  PLAN-REVIEW Agent Turn or create reviewer Work;
- `standard` / `deep`: return `review_required`, materialize the complete
  startup packet and stop at the `plan-review.agent` boundary.

The PLAN finish response always tells the current agent to invoke PLAN-REVIEW
start and branch only on its result. The agent contract is: for
`review_required`, follow the returned prompt; for `review_off`, perform no
review work and follow the returned CODE entry command. An unused review
prompt is never generated and never needs to be "ignored" semantically.

## 2. Orchestrator and Session topology

The PLAN owner remains the PLAN-REVIEW orchestrator.

- The normal local/Desktop path continues in the same Session with a new
  PLAN-REVIEW Agent Turn.
- There is no fresh judge Session.
- The orchestrator alone creates reviewer Works through the harness/CLI.
- Every reviewer runs in a fresh, clean Session and receives only its rendered
  packet and referenced files.
- A reviewer must not call agent/thread/subagent creation tools.
- A reviewer writes only its own result and cannot edit `plan.json`, aspect
  maps, the proposed CODE batch or product files.
- The orchestrator owns finding reduction and every plan/batch mutation.

If a harness must rotate the orchestration Session for an operational reason,
it resumes the same parent PLAN-REVIEW Work from a generated context packet.
That is Session continuation, not a new judge or a second orchestration level.

Structured concurrency remains strict: the PLAN-REVIEW parent Work cannot
finish while a required reviewer child Work is `created` or `running`.

## 3. Review policy and routing

### Configuration

Review policy is a RUN setting:

```text
plan_review.mode: auto | off | standard | deep
```

Every new RUN starts with `plan_review.mode: auto`. A project or cloud
orchestrator may choose the initial value when it creates the RUN, but the
resolved value belongs to that RUN; there is no project-level policy lookup at
PLAN-REVIEW start.

The setting is stored in the RUN record in SQLite and projected into
`run.json` under `settings.plan_review`. Do not add a second config file or a
separate policy table. Its projection includes:

```json
{
  "settings": {
    "plan_review": {
      "mode": "auto",
      "source": "default | user_instruction | controller",
      "reason": "...",
      "updated_at": "..."
    }
  }
}
```

The live agent or controller normalizes an explicit user instruction exactly
once. For example, "без ревью плана" becomes `off`; "сделай глубокое ревью"
becomes `deep`. It records the value through:

```bash
dd-flow run config set <RUN> --key plan_review.mode --value off \
  --reason "Explicit user instruction: без ревью плана" \
  --project-root <root> --json
```

`dd-flow run config status <RUN> --project-root <root> --json` returns the
saved value and provenance. Setting the same value is idempotent. Changing it
is permitted only before `plan-review.default` starts; after that the setting
is frozen for the stage attempt. A later change requires a new full stage
attempt, not hand-editing SQLite or `run.json`.

The CLI never parses the intake or reinterprets the user's prose. If no
explicit instruction was normalized, `auto` remains the honest value.
`plan-review.prepare` reads this RUN setting. The effective runtime mode it
produces is always one of:

```text
off | standard | deep
```

The existing aspect-map routing object is extended rather than replaced:

```json
{
  "requested_review_mode": "auto | off | standard | deep",
  "effective_review_mode": "off | standard | deep",
  "selected_route": "none | single_wave_grouped | multi_wave_grouped",
  "reason": "...",
  "groups": []
}
```

For `off`, groups are empty and applicable rows retain explicit PLAN
`self_check` coverage. For enabled review, every delegated row belongs to
exactly one group, uses delegated coverage and remains `pending` until its
latest required reviewer result is reduced. `pending` is added to the aspect
verdict schema for this pre-review state; it cannot pass PLAN-REVIEW finish.

For explicit `off`, `standard` or `deep`, the requested value is the effective
value. Only `auto` invokes deterministic routing over the accepted structured
PLAN assessment and aspect map. Therefore PLAN-REVIEW start has no precedence
chain and no late command-line override.

### Auto routing

`auto` selects `off` only when all of the following are true:

- one genuinely small semantic unit and short source scope;
- low failure impact and low uncertainty;
- no durable-data migration, public/legacy contract, permission/trust,
  irreversible operation, cross-PRT integration or external delivery concern;
- PLAN self-checks cover all applicable aspects without an unknown or material
  watch item.

`auto` selects `standard` when independent review has useful value but no deep
trigger exists, including multi-surface vertical slices, compatibility
requirements, user-visible acceptance behavior or several independent
substantive aspects.

`auto` selects `deep` for a concrete high-risk trigger such as:

- new or changed trust/authorization boundary;
- destructive or hard-to-reverse data behavior;
- intentionally breaking or migrated public contract;
- high failure impact or unresolved high uncertainty;
- several PRTs with material integration semantics;
- external release/deploy/publish gate whose incorrect plan has material
  operational impact.

Merely preserving an existing access regression, touching several layers or
using a database does not by itself force `deep`.

### Reviewer count and packing

If selected mode is `standard` or `deep`, at least one fresh reviewer Work is
mandatory even for one simple review unit.

`standard`:

- groups compatible read-only aspects against one plan snapshot;
- packs at most three compatible aspects per reviewer;
- prefers one wave and the fewest reviewers that preserve useful independent
  verdicts;
- separates only hard dependencies, incompatible snapshots and genuinely
  independent trust boundaries.

`deep`:

- assigns one high-risk/trust/irreversible aspect per reviewer;
- packs at most two other compatible aspects when doing so does not weaken the
  requested focus;
- honours user-requested focused aspects as separate assignments;
- may use more than one wave only for hard predecessor evidence or capacity;
- for a PSET includes a final integration reviewer after required member
  reviews when cross-protocol consistency is material.

Capacity changes packing and wave count only. It does not change aspect
applicability, selected review mode or acceptance criteria. The same bounded
capacity/probe rules used by PLAN apply; probe attempts remain ephemeral.

## 4. Reviewer packet and adversarial contract

The same canonical plan-aspect catalog is used for PLAN and PLAN-REVIEW. Do not
create a second aspect catalog.

The rendered PLAN-REVIEW worker packet must include:

- `session_mode: fresh_empty_session_required`;
- Work, RUN, PRT/PSET and exact immutable plan revision/checksum;
- accepted SPECIFY and PROTOCOLIZE references;
- the full `aspect-worker.md` role prompt;
- the selected leaf aspect prompt(s);
- bounded project grounding paths from the plan and aspect catalog;
- exact result path and `work finish` command;
- explicit prohibition on mutations and subagent creation.

The PLAN-REVIEW role differs from PLAN authoring. For every assigned aspect the
reviewer must:

1. identify the plan claims relevant to that aspect;
2. try to falsify them against accepted requirements and current project
   facts;
3. look for contradictions, missing branches, ambiguous defaults, unstated
   ownership, impossible checks and evidence that cannot prove the claim;
4. distinguish missing plan detail from missing implementation evidence;
5. cite the exact plan/source evidence for every material finding;
6. return separate verdict and findings for each aspect even when grouped.

Universal semantic rule: when behavior changes by operation, actor, object
state, supplied/omitted input, legacy/new data or success/error branch, the
reviewer must test whether the plan makes those combinations unambiguous. It
may use the canonical decision-table method; this is not a task-specific
requirement.

Reviewers do not repair. Their structured result conforms to one new compact
`dd-flow/plan-review-result@1` schema:

```json
{
  "schema_id": "dd-flow/plan-review-result@1",
  "work_id": "WORK-...",
  "plan_revision": 1,
  "overall_verdict": "pass | watch | needs_changes | blocked",
  "aspect_results": [
    {
      "aspect_id": "api_contract_design_review",
      "verdict": "pass | watch | needs_changes | blocked",
      "confidence": "high | medium | low",
      "sources_read": ["..."],
      "findings": [
        {
          "finding_id": "F-001",
          "severity": "blocker | high | medium | low | info",
          "claim": "...",
          "evidence_refs": ["..."],
          "impact": "...",
          "recommended_change": "..."
        }
      ]
    }
  ]
}
```

Agent-authored timestamps, Session IDs, Turn IDs, token counts, hashes and HTML
are forbidden in this result. The CLI adds runtime identity and provenance.

## 5. Orchestrator reduction, correction and retry

The existing orchestrator reads every reviewer result and decides each finding
by evidence and impact, not by majority vote or number of `pass` verdicts.

For each finding it records one decision:

```text
accepted_fix | rejected | deferred_as_DEF | requires_user | duplicate
```

Decision guidance:

- `blocker` / `high`: repair the plan/batch, create a precise DEF or ask the
  user when no safe default exists;
- `medium`: repair when the finding affects an accepted requirement,
  invariant, feasibility or verification strength;
- `low` / `info`: normally keep as a non-blocking note; do not churn the plan
  for style preferences or speculative improvements;
- reject a finding whose evidence is wrong, outside scope, already covered or
  only restates a personal implementation preference.

The orchestrator may add its own evidence-backed finding while reducing
reports. It remains accountable for final acceptance even when all reviewers
return `pass`.

When an accepted finding changes `plan.json`, the aspect map or the proposed
CODE graph:

1. increment the plan revision;
2. update affected aspect rows and CODE batch together;
3. preserve prior reviewer results as immutable Work/Turn history;
4. dispatch a new Work only for affected review groups;
5. validate the latest plan revision in every retry packet;
6. accept only the latest result for each required group.

Accepted sibling groups are not re-run unless the change invalidates their
reviewed claims. A repeated identical material finding after one targeted
correction/retry stops PLAN-REVIEW as `blocked` with a precise explanation
instead of creating an unbounded loop.

## 6. Artifact and workspace contract

The stable RUN layout reserves PLAN-REVIEW whether its mode is off or enabled:

```text
01-specify/
02-protocolize/
03-plan/
04-plan-review/
05-code/
```

PLAN-REVIEW writes only:

```text
04-plan-review/
  work-context.json
  stage-prompt.md                 # only for standard/deep
  decision.json                   # orchestrator output; standard/deep only
  stage-report.json               # semantic + mechanical SSOT
  stage-report.md                 # deterministic projection
  stage-report.html               # deterministic projection
  work/<WORK>/<TURN>/
    prompt.md
    result.json
```

Agents always write to the current `04-plan-review/` workspace. Before a retry
of the entire failed stage, the CLI moves its contents next to it under
`04-plan-review-attempts/try-NNN/` and creates a clean current workspace. A
targeted reviewer retry stays in the current stage and is preserved through
immutable Work/Turn history. An agent never selects or writes an attempt path
itself.

No separate overall `summary.md`, reviewer aggregate memo, judge report,
trace Markdown or duplicated review-plan graph is introduced.

For enabled review, `decision.json` is the only model-authored stage-level
input. The `off` path does not create it. Its enabled-mode contract is compact:

```json
{
  "schema_id": "dd-flow/plan-review-decision@1",
  "plan_revision": 1,
  "outcome": "accepted | needs_changes | waiting_for_user | blocked | failed | cancelled",
  "summary": "...",
  "finding_decisions": [
    {
      "finding_id": "F-001",
      "decision": "accepted_fix | rejected | deferred_as_DEF | requires_user | duplicate",
      "reason": "..."
    }
  ],
  "invalidated_groups": []
}
```

The stage-start response and rendered prompt include this schema, field
descriptions and one short valid example. The model does not supply hashes,
paths, timestamps, Work/Session/Turn IDs, usage or CODE Work IDs; the CLI
derives them. `stage-report.json` deterministically copies the validated
semantic fields and adds lifecycle, topology, provenance and observability.

The authoritative semantic sources remain:

- protocol-owned `plan.json`;
- RUN-local aspect map(s);
- proposed CODE batch until PLAN-REVIEW accepts it;
- immutable reviewer Work results;
- PLAN-REVIEW `stage-report.json` for reduction decisions and final gate outcome.

The proposed CODE batch is an import artifact, not a second runtime authority.
Successful PLAN-REVIEW consumes and removes it only after the Work transaction
and portable projection commit. The report retains its checksum and the
resulting key-to-Work-ID mapping. On validation/registration failure the batch
remains in place for correction and retry.

Project sources use repository-relative references. RUN sources use exactly
`run://<RUN-ID>/<relative-path>`. `run:/...`, arbitrary absolute paths and
missing required references fail validation before reviewer dispatch or CODE
registration.

## 7. Deterministic CLI actions

### PLAN-REVIEW start

```bash
dd-flow stage start <RUN> --stage plan-review \
  --project-root <root> --json
```

The command deterministically returns:

- requested RUN mode, effective mode and saved source/reason;
- current plan revision/checksum and proposed batch checksum;
- stage/workspace paths and aliases;
- applicable aspect groups and known capacity;
- exact dispatch, worker-start/finish, retry and PLAN-REVIEW-finish commands;
- current Git/compatibility/permission facts;
- the rendered orchestrator prompt from
  `.memory-bank/dd-flow/vnext/plan-review.md` for `standard`/`deep`.

Its top-level `outcome` is exactly `review_required` or `review_off`. For
`review_required`, `next` names dispatch/finish actions and includes the
rendered prompt. For `review_off`, `next` contains only the CODE entry; review
dispatch/finish instructions and prompt content are absent.

For `off`, this one command performs the atomic no-model gate, registers CODE,
renders all reports and returns the exact CODE start command. It does not
create a PLAN-REVIEW Agent Turn or reviewer Work.

The JSON response extends the shared stage-start response with one compact
`plan_review` object containing `requested_mode`, `effective_mode`,
`policy_source`, `reason`, immutable plan/batch checksums, capacity and groups.
It also returns the current stage workspace, prompt path/content when
applicable, and exact permitted next commands. The agent is not required to
discover schemas or CLI help.

### Reviewer dispatch

Use one stage-owned command family:

```bash
dd-flow plan-review dispatch <RUN> --project-root <root> --json
dd-flow plan-review dispatch <RUN> --retry-needs-changes \
  --project-root <root> --json
```

The old beta-only `dd-flow plan reviews dispatch` surface is removed rather
than retained as an alias. These commands require an active PLAN-REVIEW stage
and use its parent Work; they cannot execute inside PLAN.

### PLAN-REVIEW finish

```bash
dd-flow stage finish <RUN> --stage plan-review \
  --project-root <root> --json
```

Finish validates current plan/map/batch, latest reviewer requirements,
orchestrator finding decisions and structured concurrency. It then, in one
idempotent operation:

1. rejects unfinished required reviewer children and stale plan revisions;
2. validates every result and finding decision;
3. validates corrected `plan.json`, aspect maps and proposed CODE batch;
4. registers the accepted CODE graph and stable key-to-Work-ID mapping;
5. removes the consumed proposed batch only after the transaction commits;
6. checkpoints associated usage once;
7. writes `stage-report.json` and deterministically renders Markdown/HTML;
8. returns `code.default`, the CODE workspace and exact CODE start command.

No model writes the final report projections. A repeated finish returns the
same accepted CODE mapping rather than creating duplicate Work.

## 8. Truthful observability projection

SQLite remains the authority. JSON/Markdown/HTML are deterministic
projections. Reporting must never use the number of snapshots as Session or
coverage count.

Every PLAN-REVIEW report and RUN status exposes:

```json
{
  "work": {
    "total": 0,
    "non_root": 0,
    "created": 0,
    "running": 0,
    "completed": 0,
    "failed": 0,
    "cancelled": 0,
    "plan_review_children": 0
  },
  "sessions": {
    "registered": 0,
    "orchestrators": 0,
    "workers": 0,
    "active": 0,
    "stopped": 0
  },
  "agent_turns": {
    "total": 0,
    "completed": 0,
    "active": 0,
    "failed": 0
  },
  "usage": {
    "coverage": "complete | partial | unavailable | not_applicable",
    "sessions_expected": 0,
    "sessions_measured": 0,
    "total_tokens": 0,
    "input_tokens": 0,
    "cache_read_input_tokens": 0,
    "cache_write_input_tokens": 0,
    "uncached_input_tokens": 0,
    "output_tokens": 0,
    "reasoning_output_tokens": 0,
    "snapshots": 0,
    "observed_at": "timestamp"
  }
}
```

Aggregation rules:

1. Work counts come from all `flow_works` in the RUN;
   `plan_review_children` counts direct reviewer children of the PLAN-REVIEW
   parent.
2. Session counts use distinct registered Session IDs associated with the RUN;
   repeated registration/segments do not increase the count.
3. Agent Turn counts use `flow_agent_turns` belonging to RUN Work.
4. Usage chooses the latest measured snapshot per expected Session at the
   report checkpoint, then sums those latest cumulative totals once.
5. `total_tokens = input_tokens + output_tokens` when both are known.
6. `reasoning_output_tokens` is a subset of `output_tokens`; it is displayed
   separately and never added to total a second time.
7. `cache_write_input_tokens` is nullable/optional when a provider does not
   report it; missing provider data does not become zero evidence.
8. `snapshots` is a diagnostic count only.
9. `complete` means every Session expected by the current stage gate has a
   measured latest snapshot. Future CODE Work does not make PLAN-REVIEW Session
   coverage partial.
10. `off` PLAN-REVIEW has Session/usage coverage `not_applicable` for reviewer
    Sessions, while the RUN aggregate may still report prior Sessions.

PLAN-REVIEW finish checkpoints every associated expected Session once before this
aggregation. Rendering is read-only and must not create another usage
snapshot.

Stage coverage explicitly lists:

- PLAN-REVIEW orchestrator Session/Turn when mode is enabled;
- expected reviewer Work IDs;
- observed reviewer Session and Turn IDs;
- missing expected reviewer Works/Sessions/Turns;
- pending future CODE Work separately from current-stage coverage.

The current empty `expected/observed/missing` plus
`expected_worker_units_missing` result is invalid when reviewer Work and Agent
Turns are registered. Projection must derive the expected units from the
accepted PLAN-REVIEW routing and Work graph, not from optional manually populated
`coverage_units_json` alone.

## 9. HTML and human report

`stage-report.json` is the single overall report source. The CLI always renders
`stage-report.md` and `stage-report.html` from it. Agents never author or edit
those projections.

The HTML template must visibly present:

1. RUN, PRT/PSET, PLAN revision and PLAN-REVIEW mode/policy source;
2. overall gate outcome: `off`, `accepted`, `needs_changes`, `blocked` or
   `waiting_for_user`;
3. review topology: aspect group → Work → Session → Turn → latest verdict;
4. findings ordered by severity, with evidence, orchestrator decision and
   decision reason;
5. plan/batch revisions, accepted fixes and targeted retry lineage;
6. CODE graph summary and whether it is registered/startable;
7. Work, Session, Agent Turn and token-usage totals with coverage status;
8. timing and artifact links using portable/project-relative labels.

The versioned template is tested once against valid/invalid report fixtures.
Each RUN only validates JSON and renders the deterministic projection. It does
not run a model-authored DOM/JS smoke, create an equality evidence file or
write a second data object into the HTML. If data is embedded for interactive
display, it is the same validated report object serialized by the renderer.
Reuse the existing deterministic stage-report renderer shell and shared styles;
do not introduce a UI framework or a second report application for this view.

## 10. State and acceptance invariants

- PLAN-REVIEW exists in every vNext RUN, including mode `off`.
- Mode `off` creates zero reviewer Work and zero reviewer Agent Turns.
- Any enabled PLAN-REVIEW creates at least one fresh reviewer Session/Work/Turn.
- The PLAN-REVIEW orchestrator is the existing PLAN owner; no judge agent exists.
- Reviewer workers never spawn children and never mutate plan/product files.
- CODE Work is absent before successful PLAN-REVIEW completion.
- CODE registration is atomic and idempotent.
- Review findings are prioritized by evidence/impact; low-level preferences do
  not block CODE.
- A corrected plan increments revision and re-runs only invalidated groups.
- All required latest reviewer results target the accepted plan revision.
- The RUN remains non-terminal after PLAN-REVIEW and points to `start_code`.
- Reports count Works, Sessions, Turns and tokens from SQLite without snapshot
  double counting.
- `run://` syntax and target existence are validated before dispatch/finish.

## 11. Required implementation changes

### `dd-flow-cli`

- add a dedicated `vnext-plan-review` module owning prepare, off acceptance,
  enabled acceptance, dispatch and retry; do not grow the PLAN module with
  PLAN-REVIEW branches;
- register `plan-review` as a first-class stage in the state machine, generic
  `stage start`/`stage finish` dispatch and help output;
- add `plan-review.prepare`, `plan-review.accept-off` and
  `plan-review.accept`, `plan-review.record-answer` handlers and the
  deterministic-entry traversal rule;
- make `plan-review.prepare` resolve policy before the agent boundary and
  omit all model-review artifacts/commands on the `off` path;
- add minimal `run config status/set` support for `plan_review.mode`, stored in
  the existing RUN record and `run.json` projection with source/reason;
- freeze that RUN setting when PLAN-REVIEW starts and reject late mutation;
- move reviewer dispatch ownership from PLAN Work to PLAN-REVIEW Work;
- replace the beta-only `plan reviews dispatch` command with
  `plan-review dispatch`, without an alias;
- defer CODE batch registration from PLAN finish to PLAN-REVIEW finish;
- resolve explicit RUN modes directly and apply auto-routing only to `auto`;
- extend aspect-map routing with review policy/mode, `none` route and pending
  delegated verdicts;
- render canonical fresh reviewer packets and validate
  `plan-review-result@1`;
- validate `plan-review-decision@1` as the sole model-authored stage-level
  finish input;
- add orchestrator finding decisions and revision-aware targeted retry;
- make CODE registration transactional/idempotent;
- derive stage coverage from the Work/Turn graph;
- aggregate latest-per-Session usage totals and expose snapshots separately;
- make `stat usage` and stage/HTML reports call the same aggregation function,
  so operator CLI totals and rendered totals cannot diverge;
- reject malformed `run:/` references;
- render the deterministic PLAN-REVIEW Markdown/HTML reports from one
  validated `stage-report.json` using the shared renderer shell;
- update CODE entry lookup to consume the accepted PLAN-REVIEW report/mapping
  and use the reserved `05-code` workspace.

### `dd-tasks` beta flow pack

- insert PLAN-REVIEW between PLAN and CODE in the vNext flow graph;
- update prime/SPECIFY/PLAN instructions so an explicit user review preference
  is normalized once into RUN config; omitted preference leaves `auto`;
- change PLAN instructions to prepare review routing and a proposed CODE graph,
  then stop at `start_plan_review`; the returned instruction must branch on
  `review_required` versus `review_off` without guessing the policy;
- add `.memory-bank/dd-flow/vnext/plan-review.md`, the PLAN-REVIEW
  orchestrator prompt, and the fresh reviewer role contract;
- document `auto|off|standard|deep`, grouping, severity reduction and retry;
- update lifecycle guards, indexes and CODE entry to require accepted/off
  PLAN-REVIEW evidence;
- add/update review-result and stage-report schemas/examples/template.

### `dd-eval`

- retain EVAL-010 as evidence of mechanically successful review with a
  semantic false negative and broken coverage projection;
- add one `off` case proving zero reviewer Work and atomic CODE opening;
- add one `standard` case proving at least one fresh reviewer and one wave;
- add one `deep` case proving narrow assignments and user-selected focus;
- add one `needs_changes → correction → targeted retry → accepted` case;
- record parent/reviewer Session and Turn IDs plus deterministic usage totals.

## 12. Acceptance checks

| ID | Proof |
| --- | --- |
| R-01 | PLAN finishes with proposed artifacts and `start_plan_review`, with no registered CODE Work |
| R-02 | `review-mode off` creates no reviewer Work/Turn and atomically registers the proposed CODE graph |
| R-03 | `standard` creates at least one fresh reviewer Session and groups compatible aspects in the minimum wave count |
| R-04 | `deep` separates user-focused/high-risk aspects and honours capacity without nested subagents |
| R-05 | reviewer packets include canonical fresh-session role, leaf aspect prompts, immutable plan revision and exact lifecycle commands |
| R-06 | reviewer workers cannot mutate plan/product files or create child agents |
| R-07 | the original orchestrator records an evidence-backed decision for every finding and ignores non-material preferences without blocking CODE |
| R-08 | accepted material findings update plan/map/batch together, increment revision and retry only invalidated groups |
| R-09 | repeated unchanged material finding after targeted correction blocks rather than looping forever |
| R-10 | CODE registration occurs exactly once after `off` or accepted PLAN-REVIEW and returns one stable entry Work ID |
| R-11 | PSET review preserves per-PRT verdicts and adds a final integration reviewer only when cross-PRT consistency is material |
| R-12 | stage/RUN reports show truthful Work, Session and Turn counts derived from SQLite |
| R-13 | usage totals use one latest measured snapshot per expected Session and show snapshot count separately |
| R-14 | reasoning output is not double-counted and missing cache-write data stays unknown rather than fabricated zero |
| R-15 | enabled PLAN-REVIEW coverage is complete only when every expected reviewer Work has a bound Session and completed Turn/result |
| R-16 | future unstarted CODE Work is reported as pending and does not make PLAN-REVIEW coverage partial |
| R-17 | JSON, Markdown and HTML expose the same gate outcome, topology, findings, decisions, CODE readiness and observability totals |
| R-18 | malformed `run:/`, missing `run://` targets and unsafe absolute semantic references fail before dispatch or CODE registration |
| R-19 | `plan-review.prepare` selects `off` before the agent boundary and returns no prompt, reviewer Work or review commands |
| R-20 | enabled start returns the complete decision schema, current workspace, rendered prompt and exact lifecycle commands without help/schema discovery |
| R-21 | an explicit user preference is stored once in RUN config with source/reason, while omitted preference remains `auto` |
| R-22 | PLAN-REVIEW reads only the frozen RUN setting; it neither parses intake nor accepts a late `--review-mode` override |

## Non-goals

- no fresh judge or critic orchestrator;
- no reviewer-created subagents;
- no second aspect catalog;
- no model-generated Markdown/HTML telemetry;
- no new scheduler, queue, Job entity or probe database;
- no mandatory independent review for every trivial plan;
- no automatic acceptance by reviewer vote count;
- no CODE execution inside PLAN-REVIEW.
