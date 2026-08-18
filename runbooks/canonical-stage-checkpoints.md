# Canonical checkpoint eval runbook

This runbook is the operator procedure for focused-stage, contiguous-segment
and E2E executions of `sdlc-eval-2026-summer`.

It implements [specification 002](../specs/002-canonical-stage-checkpoint-evaluation.md).
The active CLI and case use `case@3`; the old portable fixture path is
diagnostic-only and must not be used for a scored run.

The implementation cutover and launch gates are defined by
[specification 003](../specs/003-canonical-eval-launch-readiness.md). At the
time that specification was written, the active case was **not launch-ready**:
its beta.58 engine identities disagreed, all canonical checkpoints and
Subject/Judge session baselines were pending, and all oracles were drafts. Do
not interpret a
successful structural `validate` as permission to launch until the readiness
contract from specification 003 is implemented and passes.

All non-Git data belongs below `DD_EVAL_HOME`; set it before creating a
canonical workspace or an attempt. See [eval storage and retention](eval-storage.md).

## Choose the measurement

Use exactly one of these meanings:

| Mode | Start | Subject execution | Judgment |
| --- | --- | --- | --- |
| focused | canonical entry checkpoint for one stage | exactly that stage | one fresh Judge fork |
| segment | canonical entry checkpoint for the first stage | every stage in one contiguous range | one fresh Judge fork per stage |
| E2E | canonical `specify-entry` checkpoint | complete declared contour | one fresh E2E Judge fork |

Examples:

```sh
dd-eval prepare --case sdlc-eval-2026-summer-task-priority \
  --focus specify --output "$DD_EVAL_HOME/attempts/active/EVAL-101--summer--focus-specify"

dd-eval prepare --case sdlc-eval-2026-summer-task-priority \
  --focus specify,protocolize,plan,plan-review \
  --output "$DD_EVAL_HOME/attempts/active/EVAL-102--summer--focus-all"

dd-eval prepare --case sdlc-eval-2026-summer-task-priority \
  --segment plan..plan-review --output "$DD_EVAL_HOME/attempts/active/EVAL-103--summer--segment-plan-review"

dd-eval prepare --case sdlc-eval-2026-summer-task-priority \
  --e2e --output "$DD_EVAL_HOME/attempts/active/EVAL-104--summer--e2e"
```

Several values passed to `--focus` create several independent executions. They
do not form a chain. `--segment plan..plan-review` creates one chain. Never use
the two forms interchangeably.

## Immutable inputs

Before preparing an attempt, verify:

1. `dd-eval` is clean and its definition commit is recorded;
2. `dd-tasks` checkpoint, project flow pack and `dd-flow` engine are committed;
3. the engine and flow pack are the matched pair declared by the case;
4. the requested Controller, Subject and Judge profiles are declared;
5. every selected stage has an accepted canonical entry checkpoint;
6. every selected rubric and oracle is accepted;
7. checkpoint archives exist and their checksums match;
8. the canonical Subject and Judge parent Sessions are reachable;
9. the output path is new and outside the `dd-eval` checkout.

Use absolute paths. A Controller may start in any working directory, but every
command must name the intended case, eval directory and project root explicitly.

Run evals as visible Codex Desktop tasks by default. `codex exec` is only for an
explicit CLI-harness case or mechanical smoke and is not comparable to a
Desktop attempt.

The initial suite uses the current Controller task on `gpt-5.6-terra/high`.
There is no canonical Controller Session to create or fork. Record the actual
Controller Session ID and profile in the run evidence.

## Readiness gates

Use the two gates for different purposes:

```sh
dd-eval validate --case sdlc-eval-2026-summer-task-priority \
  --source "/absolute/path/to/dd-tasks-beta" --require authoring

dd-eval validate --case sdlc-eval-2026-summer-task-priority \
  --source "/absolute/path/to/dd-tasks-beta" --require scored
```

- `authoring` must pass before creating a canonical Subject Session or
  checkpoint archive.
- `scored` must pass before `prepare`, Subject launch or Judge launch.

The command returns all blockers at once. Never work around a failed gate by
editing a checkpoint, profile, Session ID, engine binding or SQLite file.

## Build the canonical chain

Do this once per exact case-definition, engine and flow-pack revision.

### 1. Prepare one canonical workspace

- Allocate the next canonical revision below
  `$DD_EVAL_HOME/canonical/<case-id>/REV-<NNN>/` with `workspace/project`,
  `workspace/runtime` and `checkpoints`. Do not put the archive inside the
  project or runtime tree it captures. Compact checkpoint reviews live in the
  Git case at `checkpoint-reviews/REV-<NNN>/`.
- Materialize the exact tagged beta project into `workspace/project` and
  install the exact matched engine into `workspace/runtime`. That runtime may
  contain only this canonical project's single RUN; checkpoint capture fails
  if unrelated records exist.
- Create the canonical Subject Session with the declared canonical profile.
- Send the normal project prime and the exact versioned case discussion.
- Do not mention the eval, rubric, oracle or expected answers.
- Stop when the next natural user message would trigger SPECIFY.
- Allocate the vNext RUN with the matched engine, but do not start SPECIFY and
  do not bind the Controller Session as its Subject. Preserve the exact
  versioned discussion/intake messages for the later stage-start packet.

### 2. Capture `specify-entry`

The Controller runs capture from any cwd using absolute project/runtime paths.
The archive and pending record default to the current canonical revision:

```sh
DD_FLOW_HOME="<canonical-home>" dd-eval checkpoint capture \
  --case sdlc-eval-2026-summer-task-priority \
  --stage specify \
  --project-root "<canonical-project>" \
  --flow-run "<run-id>" \
  --subject-session "<session-id>" \
  --fork-point "<provider-turn-id>"
```

Capture must report `target_stage=specify`, an unstarted RUN, no pending HITL,
no active child Work and a clean runtime check. Write the compact review at the
returned path, then accept the checkpoint through:

```sh
dd-eval checkpoint accept --case sdlc-eval-2026-summer-task-priority \
  --stage specify --record "<returned-capture.json>" \
  --review "<returned-review.md>"
```

Never change the captured record by hand.

### 3. Advance one canonical stage at a time

For each stage:

1. fork or continue the canonical Subject according to the configured handoff;
2. send the ordinary stage trigger;
3. deliver only the case's declared interaction response, if requested;
4. stop immediately after successful stage finish;
5. check semantic quality before accepting it as canonical input;
6. perform the normal handoff for the next stage;
7. capture and accept the next stage-entry checkpoint before starting it.

The resulting order is:

```text
prime + discussion
  → capture specify-entry
  → SPECIFY
  → capture protocolize-entry
  → PROTOCOLIZE
  → capture plan-entry
  → PLAN revision 1
  → capture plan-review-entry
  → PLAN-REVIEW canonical-chain validation
```

If a predecessor artifact changes, increment the canonical-chain revision and
recapture all downstream checkpoints. A checkpoint is immutable after
acceptance.

### What “capture the current Session” means

At every stage entry, record the current canonical Subject Session ID and the
exact idle turn boundary, then snapshot the matching project tree and
RUN/`DD_FLOW_HOME`. Capture does **not** fork the Session and does not stop the
canonical continuation. The canonical Subject continues to the next stage
after the checkpoint is accepted.

The fork happens later, when an eval starts from that checkpoint. The
Controller then forks the recorded Subject boundary and restores an independent
copy of the paired project/RUN snapshot. Thus every focused stage starts from
the same conversation and filesystem/runtime state without creating four
unrelated canonical conversations.

### 4. Freeze definition evidence

Commit and tag:

- case manifest and checkpoint records;
- prompt/message manifests and hashes;
- interactions, rubrics and accepted oracles;
- engine/flow/project identities;
- compact human checkpoint reviews.

Keep project bundles, RUN snapshots, SQLite and raw transcripts in the declared
external archive. Record locators, sizes and checksums in Git.

## Prepare an attempt

`dd-eval prepare` performs all deterministic work before a Subject fork:

1. validates definition and profile identities;
2. resolves the checkpoint for the selected start stage;
3. creates a new attempt directory;
4. restores the project archive and verifies HEAD/tree;
5. creates an empty isolated `DD_FLOW_HOME`;
6. asks the matched `dd-flow` engine to restore the paired RUN snapshot;
7. verifies the target graph entry and absence of stale active bindings;
8. writes immutable manifest/state files and rendered operator/Subject packets;
9. returns exactly one next action: `fork_subject`.

The returned JSON must include:

- execution ID and mode;
- canonical checkpoint and chain IDs;
- parent Subject Session and fork point;
- requested model/reasoning profile;
- attempt project root, `DD_FLOW_HOME`, RUN ID and RUN home;
- exact Subject task title;
- exact ordinary continuation message to send after the fork.

If prepare returns a mismatch or restore incident, stop. Do not copy files,
rewrite SQLite, change a Session ID or reconstruct upstream state manually.

## Launch the Subject

### Native fork

1. Fork the exact checkpoint Subject Session at its recorded turn boundary.
2. Explicitly select the requested Subject model and reasoning profile.
3. Give the task the title returned by `dd-eval`.
4. Set the task workspace to the restored project root when the harness permits;
   otherwise tell the Subject the absolute root in the generated continuation.
5. Record the fork Session ID and parent before sending the stage message:

```sh
dd-eval session add --eval "<eval-root>" --execution "<execution-id>" \
  --role subject --session-id "<fork-session-id>" \
  --parent-session-id "<checkpoint-session-id>"
```

6. Send the generated Subject continuation without editing it.

The continuation contains ordinary workflow information only: current working
directory, inline `DD_FLOW_HOME`, exact normal stage command/trigger, trusted
restore receipt and the requested stop boundary. It contains no eval, rubric,
oracle or Judge terminology.

Every `dd-flow` shell command uses the inline form:

```sh
DD_FLOW_HOME="<attempt-home>" dd-flow <command> ...
```

A prior `export` is insufficient for Codex `PreToolUse` hook matching.

### Portable replay

Use replay only when the harness cannot fork. Start a fresh Session with the
selected profile and replay the exact ordered canonical messages recorded by
the checkpoint. Record `seed_mode=portable_replay`. Never label it a native
fork or compare its priming/cache/latency directly with native forks.

## Control the Subject execution

After every Subject turn returns:

```sh
dd-eval sync --eval "<eval-root>" --execution "<execution-id>" \
  --project-root "<attempt-project>" --flow-run "<attempt-run-id>"
```

Follow only the `next_action` returned by `sync`.

### HITL pause

When `sync` returns `deliver_declared_interaction`:

1. verify that stage and pause ordinal match the interaction script;
2. send the exact versioned response bytes;
3. let the same stage resume;
4. do not complete or rewind the stage;
5. do not invent a response for an undeclared pause.

An undeclared pause is candidate behavior. Preserve it and stop the attempt at
that boundary.

### Stage finish barrier

When a selected stage finishes, immediately capture it before sending any
successor instruction:

```sh
dd-eval checkpoint --eval "<eval-root>" \
  --execution "<execution-id>" --stage "<finished-stage>"
```

For focused mode, the next action must be `stop_subject`. For segment mode it is
`continue_segment` until the final selected stage. For E2E it is
`continue_e2e` until `plan_review_accepted`.

If the Subject starts or mutates a successor before capture, mark the attempt
`invalid_infrastructure_flow`; do not repair or score it.

### Completion gate

Before judging, verify:

- expected final stage boundary reached;
- provider Subject task idle;
- no child agent is running;
- no child or stage-owned Work is `created`, `running` or `paused`; the root
  coordinator Work may remain resumable at the legal boundary;
- no provider turn or Work-session binding remains active;
- all selected candidate checkpoints exist;
- project and RUN files have not changed after their capture;
- trusted Session topology and usage have been synced;
- effective model/reasoning equals the requested profile.

## Judge procedure

Do not continue the Subject Session as Judge.

For each focused stage and each stage inside a segment:

1. fork the canonical Judge priming Session into a fresh Session;
2. record its parent and child IDs;
3. run `dd-eval judge prepare` for that candidate stage;
4. send the generated packet unchanged;
5. wait for the Judge and accept its schema-valid result unchanged.

```sh
dd-eval judge prepare --eval "<eval-root>" \
  --execution "<execution-id>" --stage "<stage>"

dd-eval judge accept --eval "<eval-root>" \
  --execution "<execution-id>" --stage "<stage>" \
  --result "<judge-result.json>"
```

E2E uses one fresh Judge fork and the aggregate E2E packet. That packet includes
all stage candidates and asks for per-stage vectors plus cross-stage findings.

The Judge is read-only. It may inspect candidate artifacts and transcript
evidence but may not modify Subject files, resume Subject work or repair the
candidate.

## Finalize and retain

```sh
dd-eval finalize --eval "<eval-root>"
```

Finalization must:

- refresh usage after all Subject and Judge turns have stopped;
- deduplicate usage by physical Session;
- keep Controller, Subject, Subject children, Judge and Judge children separate;
- render JSON, Markdown and HTML from one report truth;
- retain exact checkpoint, fork, model, prompt and artifact identities;
- archive runtime/transcript evidence and record checksums/locators;
- copy only compact validated results into the case result directory.

Commit and push the result separately from the frozen definition. Never commit
raw SQLite, secret-bearing transcripts or mutable external workspace paths as
if they were portable inputs.

## Mode-specific checks

### Focused

- start checkpoint belongs to the target stage;
- only the target stage executed;
- Judge sees only that attempt's stage transcript slice and candidate;
- no upstream quality is attributed to the evaluated Subject.

### Segment

- start checkpoint belongs to the first stage;
- stages are contiguous and execute in one Subject attempt;
- no canonical result is inserted inside the segment;
- candidate captured after every stage;
- every stage uses a separate clean Judge fork.

### E2E

- starts from `specify-entry` only;
- no canonical intermediate result is substituted;
- all intermediate boundaries are captured;
- E2E Judge assesses both stage vectors and cross-stage preservation;
- CODE remains unstarted for the summer planning suite.

## Invalid attempts

Preserve but do not score an attempt when:

- checkpoint/session/archive cannot be verified;
- restored project or RUN does not match the checkpoint;
- engine and flow pack are not the declared pair;
- selected model silently changes or falls back;
- hook binding is absent and identity is manually substituted;
- Controller leaks rubric/oracle/eval guidance to Subject;
- a successor stage starts before its capture barrier;
- candidate files are edited after capture;
- Judge shares Subject context or mutates candidate state.

An operational failure before the first Subject action may be relaunched in the
same attempt. After the first Subject action, preserve the attempt and allocate
a new attempt number.

## Do not do

- Do not import `fixtures/*.json` to emulate upstream stages.
- Do not start PLAN from an isolated protocol document without its canonical
  RUN and Session checkpoint.
- Do not copy `DD_FLOW_HOME` with `cp` or edit SQLite directly.
- Do not reuse a canonical checkpoint directory as an attempt workspace.
- Do not use one Judge conversation for several candidates.
- Do not treat focused and E2E scores as the same measurement.
- Do not add a general scheduler, snapshot server or fixture compatibility
  layer for this local Desktop milestone.
