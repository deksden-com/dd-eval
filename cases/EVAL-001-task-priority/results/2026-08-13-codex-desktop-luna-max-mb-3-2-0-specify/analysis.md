# EVAL-001 SPECIFY: Memory Bank 3.2.0 incident analysis

## Verdict

This run is **invalid for quality comparison**. The product questions were
useful, but the flow contract and session observability did not provide a
valid controlled execution. The run was closed as
`cancelled / invalid_infrastructure_flow`; no PLAN or CODE stage was started.

- checkpoint: `cp-002-mb-3-2-0`
- project: `PRJ-029-codex-desktop-gpt-5-6-luna-max-mb-3-2-0-specify-01`
- protocol: `PRT-007-eval-001-task-priority`
- run: `RUN-001-eval-001-task-priority`
- Codex Desktop thread: `019ffc1b-e2f4-70b3-9ce0-189e3c51aea9`
- stage duration: `539,987 ms` (`8:59.987`)
- run duration: `3,870,274 ms` (`1:04:30.274`)

## Material shortcomings

### 1. The stop-state contract is contradictory — **critical**

The rendered SPECIFY prompt says that unresolved product questions require a
`waiting_for_user` outcome. Its completion command only permits
`--outcome done`, while the CLI help exposes `done|blocked|failed`. The agent
therefore tried `waiting_for_user` repeatedly, received rejection, and then
tried `blocked` repeatedly before the stage was recorded as blocked.

This is a deterministic contract defect, not a reasoning failure. The stage
prompt, CLI enum, and controller runbook use different state vocabularies and
never define the mapping `waiting_for_user -> blocked` (or a dedicated CLI
outcome). Fix the contract at one source of truth and give the agent one
valid command.

### 2. Stage completion did not close the RUN — **critical**

The agent finished the SPECIFY stage but did not call `dd-flow run complete`.
The run consequently stayed `running/pending` until operator intervention.
The controller goal required stopping at the stage boundary, but the rendered
stage completion contract contained only `stage finish`; it did not state who
closes the enclosing RUN or what command is mandatory after a blocked/waiting
stage.

The cause is a lifecycle gap: stage, protocol, RUN, and Codex session have
separate terminal transitions, while the prompt treats stage finish as the
whole stop operation. RUN closure should be a deterministic controller gate,
not something the model has to infer.

### 3. Session binding and coverage are not trustworthy — **critical**

The real Codex thread was not bound in `dd-flow`. The agent registered a
logical orchestrator session (`PRT-007-eval-001-task-priority`) and a stray
ephemeral session, but no `codex_session_bindings` record connected either to
the actual thread. The stage bootstrap itself reported
`session_binding: not_bound`.

At the same time, the run report claimed `session_coverage.status=complete`
with both `expected=[]` and `observed=[]`, while global session diagnostics
reported `expected_worker_units_missing`. Usage coverage was unavailable.

The cause is missing harness/session identity at bootstrap: the controller
said to register a session “normally” but did not pass the actual Codex
session ID, and the hook path did not bind it. The coverage reducer also
incorrectly treats an empty set as complete. Bootstrap must receive/bind the
harness ID and an empty expected/observed set must be `unavailable` or
`partial`, never `complete`.

### 4. The stage report is mechanically valid but semantically under-specified — **high**

`stage-report.json` contains a long free-form `result`, but empty
`acceptance`, `changed_files`, `checks`, and `evidence` arrays. For a
SPECIFY result this loses the question list, rationale, source locations, and
proof that only the intended scope was inspected. Earlier controlled runs
retained structured evidence and checks.

The cause is a prompt/schema mismatch. The new prompt asks for a “semantic
result” without a required field-by-field example, and the CLI accepts a
sparse report instead of rejecting it. The stage contract should require a
structured question record and a minimal evidence/check entry (or have the
CLI deterministically derive those fields).

### 5. Required context is too narrow for a reliable SPECIFY pass — **high**

The bootstrap packet listed only the SPECIFY flow rule as required context.
The agent primed the Memory Bank and then mostly read the generated prompt and
that one rule; the report contains no concrete paths to the application's
domain, schema, API, or UI facts. It nevertheless made claims about the
current task/CRUD surface.

The cause is over-optimisation of the 3.2 context packet: “read only listed
sources” is efficient, but the listed sources do not include a bounded product
fact packet. Either bootstrap must include deterministic, stage-specific
product facts, or the prompt must name the small set of authoritative files
that SPECIFY is expected to inspect.

### 6. Repeated CLI attempts consumed time without adding evidence — **medium**

The transcript contains repeated invalid `stage finish` calls (five with
`waiting_for_user`, four with `blocked`) and multiple session registration/bind
variants. These are symptoms of items 1 and 3, not independent model
carelessness. Once the CLI rejects the first state, the prompt offers no
authoritative fallback; once binding is absent, the agent has no deterministic
identity command to use.

### 7. Git cleanliness is reported without separating expected intake — **low**

The final worktree is dirty only because the controller-created intake file is
uncommitted. That is expected for this run, but the stage report exposes only
`git.status=dirty` and an empty `changed_files` list. This creates a false
signal in comparisons. The report should classify controller-owned intake as
expected and list it explicitly; this is an observability improvement, not a
functional failure.

## What is *not* a defect in this run

- No semantic subagents were expected for this small SPECIFY pass.
- The wall-clock measurement was present and plausible.
- Targeted Memory Bank lint was correctly not required because no Memory Bank
  documents were changed.
- The three questions themselves are a reasonable incomplete-input result;
  they are not evidence of a poor model answer.

## Required fixes before a comparable rerun

1. Make one canonical stop state and one accepted CLI command for it.
2. Make the controller close the RUN deterministically after the stage gate,
   and stop the bound session as part of that gate.
3. Pass the real harness session ID to bootstrap/bind; reject empty “complete”
   coverage and expose usage as unavailable when binding is absent.
4. Add a strict SPECIFY report schema/example for questions, evidence, and
   checks; fail fast on missing required structure.
5. Put a bounded, authoritative product-facts packet in SPECIFY bootstrap.
6. Mark expected controller intake changes separately from agent changes.

