---
file: 'specs/002-canonical-stage-checkpoint-evaluation.md'
description: 'Canonical stage-entry checkpoints, Subject session forks, RUN restore, focused/segment/E2E execution modes, and deterministic Controller procedure.'
status: 'DRAFT'
suite_id: 'sdlc-eval-2026-summer'
supersedes: 'portable stage-fixture execution from specification 001'
---

# 002 — Canonical stage-checkpoint evaluation

## Goal

Evaluate an SDLC stage in the same project, RUN and conversation context in
which that stage normally executes, while giving every compared Subject profile
the same accepted upstream state.

The system uses one mechanism:

```text
canonical stage-entry checkpoint
  → fork the checkpoint Subject Session
  → restore an independent copy of the checkpoint project and RUN
  → execute the selected stage or contiguous segment
  → capture candidate evidence at every selected boundary
  → evaluate with a fresh Judge fork
```

An evaluated stage is not reconstructed from a portable semantic fixture. A
SPECIFY document, protocol set or PLAN by itself is not its complete input. The
real input also includes the exact project tree, RUN variables, completed stage
history, durable Memory Bank files and the Subject conversation that reached
the boundary.

## Terminology

- **Canonical chain** — one accepted Subject execution through the complete
  suite contour. It is used only to produce reusable stage-entry checkpoints.
- **Stage-entry checkpoint** — an immutable paired snapshot of project/RUN
  state and the exact Subject Session fork point immediately before one stage.
- **Focused eval** — restores one stage-entry checkpoint, executes exactly that
  stage and scores it.
- **Segment eval** — restores the checkpoint at the first stage of a contiguous
  range and executes that range in one Subject continuation.
- **E2E eval** — restores the initial SPECIFY-entry checkpoint and executes the
  full declared contour without substituting canonical intermediate results.
- **Candidate checkpoint** — immutable evidence captured after an evaluated
  stage. It is an output of an attempt, not a reusable stage-entry checkpoint
  unless it is separately accepted into a later canonical-chain revision.
- **Subject checkpoint Session** — the provider Session that is ready to enter
  the target stage. It may be the continuing Session or a prepared fresh
  handoff Session, according to the flow's configured handoff mode.

## Required canonical checkpoints

The summer planning suite records these entry boundaries:

| Checkpoint | Required predecessor state | Next unstarted stage |
| --- | --- | --- |
| `specify-entry` | project primed and canonical user discussion complete | `SPECIFY` |
| `protocolize-entry` | accepted SPECIFY and any configured handoff complete | `PROTOCOLIZE` |
| `plan-entry` | accepted PROTOCOLIZE and any configured handoff complete | `PLAN` |
| `plan-review-entry` | accepted PLAN revision 1 and any configured handoff complete | `PLAN-REVIEW` |

All four checkpoints come from one versioned canonical chain. Mixing a
`plan-entry` checkpoint from one chain revision with a `protocolize-entry`
checkpoint from another is invalid even when individual checksums happen to
match.

The initial `specify-entry` also has a real unstarted RUN. After the canonical
discussion, the Controller uses the normal engine `run start` operation to
allocate the vNext RUN without starting SPECIFY or binding the Controller
Session as Subject. The exact versioned discussion/intake messages are stored
as input evidence. The forked Subject's first flow action remains `stage start`
for that RUN; no extra agent-visible “flow launch” stage is introduced.

For `same_session`, the checkpoint Session is the canonical continuing Subject
Session. For `new_session`, the checkpoint is captured only after the normal
handoff has created and primed the target Session. In both cases the saved fork
point is the moment at which the ordinary target-stage trigger is the next user
action.

## Clean-boundary invariant

A canonical stage-entry checkpoint may be captured only when all conditions are
true:

1. the predecessor stage has an accepted finish receipt;
2. the target stage has not started and has produced no artifacts;
3. no user answer is pending;
4. no child Work is `created`, `running` or `paused`;
5. the provider Subject task is idle at a known turn boundary;
6. RUN projections and SQLite truth agree;
7. the project tree and RUN workspace are readable and internally consistent;
8. the matched engine and flow-pack identities equal the case definition;
9. the effective handoff mode and RUN variables have been materialized;
10. the Controller has not edited Subject artifacts to make the boundary pass.

Checkpoint capture fails closed when any condition is false. It never marks a
semantically unreviewed stage accepted merely because its schema is valid.

## Stage-checkpoint contract

The active case contract moves to `dd-eval/case@3` and references one
stage-checkpoint record per stage. Specification 003 replaces the initial
`dd-eval/stage-checkpoint@1` draft with the stricter
`dd-eval/canonical-stage-checkpoint@2` launch contract. There is no executable fallback
to `case@2` or `stage-fixture@1`.

A stage-checkpoint record contains:

- checkpoint, canonical-chain, suite, case and target-stage IDs;
- creation time and human acceptance status;
- `dd-eval` definition commit;
- project commit, tree and checkpoint archive checksum;
- flow-pack commit/version and engine commit/version;
- source RUN ID and runtime snapshot checksum/archive locator;
- source `project_root`, `DD_FLOW_HOME` and RUN workspace paths as historical
  evidence only;
- Subject provider, Session ID, optional provider turn/fork-point ID, harness,
  model and reasoning profile;
- handoff mode and the identity of the Session that must be forked;
- completed predecessor stages and their accepted receipt checksums;
- expected target stage and legal graph entry;
- RUN-variable and flow-setting checksums;
- quiescence evidence: active Work count, pending HITL state and runtime lint;
- ordered canonical prompt/message hashes needed for replay-only harnesses.

The record does not embed raw transcripts, SQLite or project archives. It
points to immutable external archives and stores their checksums. Compact,
non-secret stage artifacts needed by Judge or human review may remain in Git.

The checkpoint Session is referenced, not copied into the repository. Native
forking uses the provider Session ID and exact turn boundary. A provider that
cannot fork uses the recorded ordered message sequence to create a
`portable_replay` attempt; such an attempt is labelled separately and is not
latency/cache-equivalent to a native fork.

## Runtime snapshot ownership

`dd-flow` owns RUN state and therefore owns snapshot capture and restore.
`dd-eval` must not copy a live SQLite database or rewrite runtime rows itself.

The required engine surface is deliberately limited:

```sh
dd-flow run snapshot create <run-id> \
  --stage-entry <stage> \
  --project-root <canonical-project> \
  --output <snapshot-directory> \
  --json

DD_FLOW_HOME=<attempt-home> dd-flow run snapshot restore \
  --snapshot <snapshot-directory> \
  --project-root <attempt-project> \
  --json
```

The canonical chain must use a dedicated `DD_FLOW_HOME` containing only its one
project and RUN. This removes the need for a general database subset exporter.
A shared runtime home fails checkpoint capture instead of triggering selective
row-copy logic.

`snapshot create`:

- verifies the clean-boundary invariant that belongs to the engine;
- verifies that the dedicated home contains only the selected canonical
  project/RUN;
- creates a consistent database snapshot and archives that dedicated runtime
  home, including the RUN workspace, together with the exact project tree
  excluding only its Git metadata;
- preserves completed predecessor history, variables, settings, receipts and
  Work/session evidence required to understand that history;
- writes an immutable manifest plus content-addressed files;
- returns the snapshot checksum, source RUN ID, target stage and graph entry.

`snapshot restore`:

- requires a fresh isolated `DD_FLOW_HOME` and prepared project root, then
  replaces the prepared tree with the archived canonical tree while preserving
  the target checkout's Git metadata;
- verifies archive, engine, flow-pack and project-tree compatibility;
- rebases every runtime and workspace path to the attempt locations;
- preserves the RUN ID inside the isolated home unless the engine has a hard
  reason to allocate a new one; the returned ID is always authoritative;
- keeps predecessor Session/Work rows as historical evidence but leaves no
  stale active binding;
- leaves the target stage unstarted;
- prepares the normal trusted-hook binding for the forked Subject Session when
  that Session first invokes the returned stage command;
- returns the attempt RUN ID, RUN home, project root, target stage, exact next
  command and restore receipt.

The Subject never receives an old absolute path as an instruction. The normal
stage-start response is authoritative for restored paths and runtime identity.
The forked conversation may contain historical paths, so the Controller sends
the standard, non-eval relocation continuation generated by `dd-eval`; it
states only the current working directory and exact normal flow command.

Portable semantic fixture export/import is removed from the active engine and
case contract. Historical fixture files remain only in immutable historical
results until those results are archived; they are not runnable inputs.

## Project snapshot

The runtime snapshot and project snapshot form one checkpoint and are restored
together.

At canonical capture the Controller creates a boundary commit in the isolated
canonical project without changing file content, records its tree, and stores a
Git bundle or equivalent immutable repository archive. The archive includes the
stage-produced Memory Bank changes that are inputs to later stages.

At restore, `dd-eval` creates a new project directory from that archive and
verifies its HEAD/tree before asking `dd-flow` to restore the paired RUN. The
attempt repository has no hidden eval files, oracle material or mutable link to
the canonical chain workspace.

## Subject Session procedure

For a native-fork attempt the Controller:

1. resolves the checkpoint Session and exact fork point;
2. creates a provider fork using the requested Subject model/reasoning profile;
3. records both parent and child Session IDs before the evaluated stage starts;
4. restores the paired project/RUN into fresh attempt paths;
5. sends the exact generated continuation packet containing the current
   working directory, inline `DD_FLOW_HOME`, normal stage trigger and stop
   boundary;
6. lets the trusted hook bind the new Session when it invokes `dd-flow`;
7. never supplies a manual session ID to the Subject or edits binding state;
8. delivers only versioned scripted HITL responses declared by the case;
9. stops the Subject at the selected candidate boundary.

Selecting a different Subject model from the model that produced the canonical
chain is intentional for a focused comparison. The manifest records both. The
provider must actually execute the fork with the selected profile; an
unrequested model change or a silent fallback invalidates the attempt.

The Subject prompt describes ordinary project work. It must not mention evals,
rubrics, hidden expectations, canonical answers or Judges.

## Eval modes

### Focused stage

Input is one stage name. The Controller restores that stage's canonical entry
checkpoint and executes exactly one stage:

```text
checkpoint(stage-entry) → stage → candidate checkpoint → stop
```

The Controller captures the candidate immediately after successful stage
finish and before any successor-stage start. A fresh Judge fork evaluates the
stage artifacts and the Subject transcript slice beginning at the checkpoint
fork and ending at the candidate boundary.

Focused comparisons answer: “How well does this profile execute this stage
given the same accepted upstream context?” They do not measure the profile's
ability to produce that upstream context.

### Contiguous segment

Input is one inclusive contiguous range, for example `plan..plan-review`.
The Controller restores only the first stage's entry checkpoint, then continues
the same Subject attempt through the declared stages:

```text
checkpoint(plan-entry) → PLAN → capture → PLAN-REVIEW → capture → stop
```

No canonical result is substituted between segment stages. Candidate evidence
is captured at every boundary before the next stage starts. Each selected stage
gets a separate fresh Judge fork and stage score. A separate segment-level
Judge is not added until a case has an explicit segment-integration rubric.

Segment comparisons answer: “How well does this profile preserve and use its
own output across this particular handoff?”

### E2E integration

E2E restores `specify-entry` and executes the entire declared contour in one
Subject run. It captures every stage boundary but never replaces an
intermediate result with canonical data.

One fresh E2E Judge receives all stage candidates, transcript slices and
cross-stage evidence. It reports per-stage criterion vectors plus integration
findings for information preservation, scope drift, legal transitions and
final readiness. Focused stage scores and E2E scores remain different
measurements and are never averaged into one unexplained number.

## Selection contract

The minimal CLI selection is:

```sh
dd-eval prepare --case <case> --focus <stage[,stage...]> --output <dir>
dd-eval prepare --case <case> --segment <start>..<end> --output <dir>
dd-eval prepare --case <case> --e2e --output <dir>
```

`--focus` may select several independent focused executions. `--segment`
selects at most one contiguous range in the first implementation. `--e2e`
selects one full-chain execution. A prepared eval may combine independent
focused executions and E2E, but segment is prepared separately to keep the
operator state and reports unambiguous.

Execution IDs are deterministic:

- `focus-<stage>`;
- `segment-<start>-to-<end>`;
- `e2e`.

The existing ambiguous `--stages` selector is removed rather than retained as
an alias. It previously meant independent isolated executions and would make
the new segment semantics easy to misuse.

## Judge isolation

Judge priming remains independent of Subject checkpointing. The system does
not create Judge stage fixtures.

For every focused-stage judgment, every stage judgment inside a segment, and
the E2E judgment, the Controller forks the canonical Judge priming Session into
a new clean Judge Session. The Judge receives only:

- its role and output contract;
- the applicable rubric and accepted oracle;
- immutable candidate artifacts;
- the relevant Subject transcript/session evidence;
- mechanical lifecycle and timing/usage evidence.

The Judge never joins or mutates the Subject Session, project or RUN. A Subject
Session ID is evidence to inspect, not a conversational handoff to the Judge.

## Canonical-chain creation procedure

1. Freeze and commit the case definition, matched engine, flow pack, profiles,
   prompts, interaction scripts, rubrics and draft oracles.
2. Create one isolated canonical project and `DD_FLOW_HOME`.
3. Start the canonical Subject Session with the normal project prime and exact
   case discussion.
4. When the Session is ready for the ordinary “оформи протокол” trigger,
   allocate an unstarted vNext RUN deterministically, then capture and
   human-accept `specify-entry`.
5. Fork or continue the canonical Session, execute SPECIFY, deliver only the
   canonical scripted answer, and stop immediately after accepted finish.
6. Perform the configured normal handoff, if any, then capture and accept
   `protocolize-entry`.
7. Execute and accept PROTOCOLIZE; perform handoff; capture and accept
   `plan-entry`.
8. Execute and accept PLAN revision 1; perform handoff; capture and accept
   `plan-review-entry`.
9. Execute PLAN-REVIEW only to validate the complete canonical chain and to
   prepare oracle/reference evidence. It does not create another entry
   checkpoint for this suite.
10. Deep-review all checkpoint manifests, oracles and expected findings without
    using a candidate that will later be scored to author its own oracle.
11. Commit the compact checkpoint records and accepted oracles; tag the eval
    definition. Keep project/RUN/transcript archives external and immutable.

If any upstream canonical artifact changes, create a new canonical-chain
revision and recapture every downstream checkpoint. Never patch one downstream
checkpoint in place.

## Attempt procedure

The Controller executes these steps in order:

1. validate a clean `dd-eval` definition and exact engine/flow-pack pair;
2. resolve the selected checkpoint(s), archive locators and checksums;
3. allocate a new attempt directory outside the `dd-eval` checkout;
4. restore the checkpoint project into the attempt directory;
5. restore the paired RUN into an empty isolated `DD_FLOW_HOME`;
6. verify restore receipt, target stage, graph entry, project tree and zero
   stale Work-session bindings; the resumable root coordinator Work may remain
   active at the legal stage boundary;
7. fork the checkpoint Subject Session with the selected profile;
8. record parent/child Session IDs, fork point and effective profile;
9. send the exact ordinary continuation/trigger packet;
10. monitor the provider task and use `dd-eval sync` after each returned turn;
11. on declared HITL pause, send exactly the scripted response and resume the
    same stage;
12. at each selected stage finish, capture candidate artifacts before allowing
    a successor stage to start;
13. stop at the focus, segment or E2E boundary and verify all child Works and
    provider turns are settled;
14. sync trusted Session topology and usage from the complete attempt;
15. fork a fresh Judge Session for every required judgment;
16. render and send each Judge packet, accept schema-valid results unchanged;
17. deterministically calculate scores and render JSON, Markdown and HTML;
18. archive runtime/transcript evidence, copy the compact result into the case,
    commit and push it separately from the frozen definition.

Every Controller command returns the one next legal action and the exact path
or message needed for it. The Controller does not search CLI help, infer paths,
copy a RUN by hand, or compose semantic guidance for the Subject.

## Failure rules

- Checkpoint checksum, profile, model, engine, flow pack or project mismatch:
  invalidate before Subject launch.
- Restore failure or stale active runtime binding: infrastructure-invalid; do
  not repair SQLite or JSON by hand.
- Subject starts a successor before candidate capture: preserve and invalidate
  that attempt.
- Undeclared HITL request: stop and judge the behavior; do not invent an answer.
- Native fork unavailable: use declared `portable_replay`, report it separately
  and do not compare cache/latency as native-fork evidence.
- Judge output invalid: create a new Judge attempt against the same immutable
  candidate; never rerun or edit the Subject candidate for that reason.
- Canonical checkpoint itself is defective: create a new canonical-chain
  revision and new downstream checkpoints; never silently repair an active
  attempt.

## Reporting

Every result records:

- mode and selected stage/range;
- canonical-chain and checkpoint IDs;
- checkpoint Subject Session/fork point and attempt fork Session ID;
- canonical and evaluated model/reasoning profiles;
- restore receipts and source/attempt project/RUN identities;
- transcript locator and exact evaluated transcript slice;
- candidate checkpoint after every executed stage;
- fresh Judge Session ID and parent for every judgment;
- per-stage quality vector, findings, latency and unique-Session usage;
- segment handoff evidence or E2E integration evidence where applicable;
- incidents, retries and run-validity decision.

Priming and canonical-chain creation cost is reported separately. It is not
charged repeatedly to every focused attempt. Subject, Judge and Controller
costs remain separate.

## Required implementation changes

### `dd-flow-cli`

1. Replace `run fixture export/import` with `run snapshot create/restore`.
2. Capture/restore one dedicated single-RUN home and validate clean stage-entry
   boundaries; fail on a shared home rather than implementing database slicing.
3. Rebase all project/runtime paths and remove stale active bindings on restore.
4. Return the exact target-stage command and normal continuation context.
5. Let SPECIFY start against a preallocated unstarted RUN while accepting the
   same canonical intake contract that bootstrap start uses.
6. Rebind the restored root coordinator Work through the trusted hook without a
   manual Session ID.
7. Add direct tests for every suite checkpoint and path relocation.

### `dd-eval`

1. Add strict `case@3` and `stage-checkpoint@1` schemas.
2. Replace fixture fields with per-stage checkpoint references.
3. Replace `--stages` with `--focus`; add one contiguous `--segment` selector.
4. Implement canonical checkpoint capture/accept and attempt restore.
5. Generate ordinary Subject continuation packets from restore receipts.
6. Capture per-stage candidates inside segment and E2E executions.
7. Record native fork/replay identity and exact transcript slices.
8. Prepare separate Judge packets per focused/segment stage and one E2E packet.
9. Delete executable stage-fixture code, schema, tests and active case files.

### Active case

1. Build and accept one canonical chain for the pinned beta engine/flow pack.
2. Record four stage-entry checkpoint manifests.
3. Keep stage rubrics and accepted oracles hidden from Subject attempts.
4. Remove `fixtures/*.json` references and update prompts to normal stage
   triggers only.

### Beta flow pack

No eval wording or checkpoint logic is added to stage prompts. Change the pack
only if its ordinary stage-start contract assumes `--bootstrap` is the sole way
to begin SPECIFY or omits the restored RUN's authoritative path/context. Any
such change remains normal flow behavior and is tested outside Judge material.

## Acceptance

The change is accepted when:

1. all four canonical checkpoints pass the clean-boundary invariant;
2. restoring each checkpoint produces the same project tree, predecessor stage
   history, variables and legal target entry under new absolute paths;
3. no restored checkpoint contains a stale active Subject/child binding;
4. a native Subject fork binds through the trusted hook and completes the
   target stage without manual session identity;
5. focused SPECIFY, PROTOCOLIZE, PLAN and PLAN-REVIEW each start from their own
   canonical entry checkpoint and stop before a successor;
6. `plan..plan-review` uses one restored `plan-entry` checkpoint, preserves its
   own PLAN result into PLAN-REVIEW and captures both boundaries;
7. E2E starts only from `specify-entry` and substitutes no canonical
   intermediate artifact;
8. every required judgment uses a fresh Judge fork and cannot mutate candidate
   state;
9. reports expose checkpoint, parent/fork Sessions, effective models, candidate
   boundaries, timing and usage;
10. changed checkpoint content, model fallback, path mismatch, stale binding or
    premature successor start fails closed;
11. active runtime and documentation contain no executable portable-fixture or
    `--stages` fallback;
12. focused, segment and E2E smoke tests pass using the same committed case
    definition and matched engine/flow-pack pair.

## Out of scope

- a general cloud snapshot service;
- arbitrary non-contiguous stage ranges;
- multiple segment ranges in one prepared execution;
- automatic semantic acceptance of canonical checkpoints;
- cross-provider equivalence claims for native forks and replayed Sessions;
- a separate segment Judge without an explicit segment rubric;
- keeping portable stage fixtures “just in case”.
