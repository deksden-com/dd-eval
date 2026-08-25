# Execute an eval

This runbook is the operator procedure for focused-stage, contiguous-segment
and E2E executions of `sdlc-eval-2026-summer`.

It implements [specification 002](../specs/002-canonical-stage-checkpoint-evaluation.md).
The active CLI and case use `case@5`; the old portable fixture path is
diagnostic-only and must not be used for a scored run.

The implementation cutover and launch gates are defined by
[specification 003](../specs/003-canonical-eval-launch-readiness.md). At the
time that specification was written, its beta.58 facts were historical. The
active case is launchable only when its current
`dd-eval validate --require scored` gate passes; a structural authoring check
is not permission to launch.

All non-Git data belongs below `DD_EVAL_HOME`; set it before creating a
canonical workspace or an attempt. See [eval storage and retention](eval-storage.md).

## Execute a committed scenario

A scenario under `cases/<case-id>/scenarios/` fixes a concrete comparison
matrix: profiles, selected stages, E2E inclusion, execution order and comparison
rule. The Controller reads the scenario first, records its path and the clean
`dd-eval` commit, then applies this runbook to every execution it declares.

The scenario may select existing `dd-eval prepare` options; it does not replace
the case definition, starter registry, accepted assessment or this lifecycle. Do not
invent missing matrix entries or silently substitute an old result.
The case's `checkpoint.id` resolves the immutable input checkpoint in the
repository-level `checkpoints/` directory. That file, rather than a scenario
or profile, is the sole source of the project, flow-pack and engine pair.

For each restored execution, `prepare` renders the Subject packet with the
current project root, inline `DD_FLOW_HOME` and exact normal `stage start`
command. For a focused stage or segment, fork the shared stage starter and send
that packet as the first new message with the requested model and reasoning
explicitly selected. E2E is different: create a clean Subject Session directly
on the requested profile and perform the ordinary prime, discussion and flow.

## Choose the measurement

Use exactly one of these meanings:

| Mode | Start | Subject execution | Judgment |
| --- | --- | --- | --- |
| focused | canonical entry checkpoint for one stage | exactly that stage | one fresh Judge fork |
| segment | canonical entry checkpoint for the first stage | every stage in one contiguous range | one fresh Judge fork per stage |
| E2E | clean Subject Session plus restored canonical `specify-entry` project/RUN state | complete declared contour | one fresh E2E Judge fork |

Examples:

```sh
dd-eval prepare --case sdlc-eval-2026-summer-task-priority \
  --focus specify --output "$DD_EVAL_HOME/attempts/active/EVAL-101--summer--focus-specify"

dd-eval prepare --case sdlc-eval-2026-summer-task-priority \
  --focus specify,protocolize,plan,plan-review,code \
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
2. the case points to one immutable input checkpoint file;
3. that checkpoint's `dd-tasks` source, flow pack and `dd-flow` engine are
   committed and form the intended matched pair; `dd-eval prepare` rejects a
   restored binding with any other engine version;
4. the requested Controller, Subject and Judge profiles are declared;
5. every selected stage has an accepted canonical entry checkpoint;
6. the selected case assessment is accepted and matches the case hash;
7. checkpoint archives exist and their checksums match;
8. the current shared stage starter Sessions and Judge priming parent are reachable;
   during case creation or starter recovery, the canonical Subject Sessions
   must also be reachable;
9. the output path is new and outside the `dd-eval` checkout.

Use absolute paths. A Controller may start in any working directory, but every
command must name the intended case, eval directory and project root explicitly.

Run evals as visible Codex Desktop tasks by default. `codex exec` is only for an
explicit CLI-harness case or mechanical smoke and is not comparable to a
Desktop attempt.

The initial suite uses the current Controller task on `gpt-5.6-terra/high`.
There is no canonical Controller Session to create or fork. Record the actual
Controller Session ID and profile in the run evidence.

Resolve the effective model profile before every provider launch. A mono-model
run applies that profile to the root Subject, every stage continuation and each
fresh configurable child. Stage- and child-level overrides are allowed only
when the scenario declares them. A context-inheriting child uses the parent's
model when the harness does not support an override; reject an incompatible
request instead of silently substituting another model. Record requested and
observed profiles separately for every Session.

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

The checkpoint file is the single source of the project/engine pair. Before
authoring begins, `dd-flow --version` and the project's compatibility pin must
equal that file. A globally linked older CLI is a blocker: relink or install
the matched engine, then start a new canonical revision rather than mutating a
partially authored one.

### 1. Prepare one canonical workspace

- Allocate the next canonical revision below
  `$DD_EVAL_HOME/canonical/<case-id>/REV-<NNN>/` with `workspace/project`,
  `workspace/runtime` and `checkpoints`. Do not put the archive inside the
  project or runtime tree it captures. Compact checkpoint reviews live in the
  Git case at `checkpoint-reviews/REV-<NNN>/`.
- Materialize the exact tagged beta project into `workspace/project` and
  install the exact matched engine into `workspace/runtime`. Because a Git
  archive has no `.git` directory, initialise the materialized project on the
  `integration_branch` declared in its
  `.memory-bank/dd-flow/project-workspace.json` (for this case: `git init -b
  main`), then commit the exact archived tree. Verify `HEAD` is clean on that
  branch before allocating a RUN. Do not let the host's default branch name
  silently substitute for the project policy. That runtime may
  contain only this canonical project's single RUN; checkpoint capture fails
  if unrelated records exist.
- Verify the **declared pair** before allocating the RUN: the project’s
  `.memory-bank/dd-flow/compatibility.json` and `manifest.json` must name the
  same Memory Bank/engine beta that the input checkpoint pins. Installing an
  engine snapshot alone is insufficient: a stale compatibility declaration
  makes the router correctly reject normal write commands. Repair and tag the
  pair first; never work around it by installing the stale engine as well.
- Allocate the unstarted canonical RUN with the vNext entry command, not a
  stage bootstrap. For the current flow this is:

  ```sh
  DD_FLOW_HOME="<canonical-runtime>" dd-flow run prepare-vnext-specify \
    --project-root "<canonical-project>" --slug task-priority --json
  ```

  Record the returned RUN ID. This is the only command that may create the
  unstarted RUN captured at `specify-entry`.
- Create the canonical Subject Session with the declared canonical profile.
- Send the normal project prime and the exact versioned case discussion **up
  to, but not including, the user-level flow trigger**. The moving Subject must
  stay idle after the discussion; do not let a project-level trigger select a
  global/default runtime before the isolated RUN checkpoint exists.
- Do not mention the eval, assessment, golden reference or expected answers.
- Stop when the next natural user message would trigger SPECIFY.
- Do not start SPECIFY or bind the Controller Session as its Subject. Preserve
  the exact versioned discussion/intake messages for the later stage-start
  packet. After the SPECIFY-entry capture, the generated isolated `stage start`
  command is the sole allowed first-stage trigger.

For every later stage, capture the entry snapshot **after** its predecessor is
accepted and **before** sending the target-stage command. The recorded
canonical Subject Session is preserved history. Create a disposable starter
fork from it, then fork that starter for actual stage work; a failed or
accidentally continued worker never changes the protected canonical session.

### 2. Capture `specify-entry`

The Controller runs capture from any cwd using absolute project/runtime paths.
The archive and pending record default to the current canonical revision:

1. Fork the idle canonical Subject into a same-directory child.
2. Rename the child to `CANON <case-id> REV-<NNN> SPECIFY-entry`.
3. Do not send any message to that child.
4. Use the returned child Session ID in capture:

```sh
DD_FLOW_HOME="<canonical-home>" dd-eval checkpoint capture \
  --case sdlc-eval-2026-summer-task-priority \
  --stage specify \
  --project-root "<canonical-project>" \
  --flow-run "<run-id>" \
  --canonical-subject-session "<moving-session-id>" \
  --checkpoint-subject-session "<frozen-fork-session-id>"
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

1. continue the moving canonical Subject according to the configured handoff;
2. send the ordinary stage trigger plus one controller boundary: complete only
   this stage, then stop immediately after its successful `stage finish` and
   wait for the next user message. The boundary prevents an in-turn next-stage
   directive from crossing a checkpoint that has not yet been captured. For a
   canonical chain restored from an unstarted entry snapshot, use the exact
   generated `stage start <RUN> --stage <stage>` command for that prepared RUN;
   do not resend a bare user-level bootstrap trigger, because bootstrap creates
   a second RUN and cannot preserve the checkpoint boundary.
   For an isolated `DD_FLOW_HOME`, materialize raw intake first and make the
   `stage start` / `stage finish` invocation a separate, single Bash command using
   `DD_FLOW_HOME=<absolute-path> dd-flow ... --intake-file <absolute-path>`.
   Do not pipe or compose those commands with a heredoc. A generated
   `stage resume --answer-stdin` is the exception: use its generated template
   unchanged, with the literal inline `DD_FLOW_HOME` immediately before
   `dd-flow`; the trusted hook recognises that piped stdin form.
   SPECIFY is special: materialize the immutable raw discussion/trigger in the
   prepared RUN first, then make the Subject’s first flow command exactly

   ```sh
   DD_FLOW_HOME="<canonical-runtime>" dd-flow stage start "<RUN-ID>" \
     --stage specify --project-root "<canonical-project>" \
     --intake-file "<absolute-RUN-intake-file>" --json
   ```

   The Subject, rather than the Controller, invokes this command. Its normal
   PreToolUse hook therefore binds the real Subject Session to the root Work.
   Do not use `--bootstrap`, `--session-id`, a controller-issued stage start,
   or a relative path in this contour.
3. deliver the declared response exactly when it matches the interaction script.
   An additional Subject question is valid candidate behaviour: preserve the
   question and answer it substantively, resume the same stage, and retain the
   interaction as Judge evidence rather than treating it as an operational error;
4. stop immediately after successful stage finish;
5. check semantic quality before accepting it as canonical input;
6. perform the normal handoff for the next stage;
7. after PROTOCOLIZE, verify the finished report records the required feature
   workspace route and that the PRT/feature documents live in that workspace,
   not in the stable checkout; then, while the target Session is idle, create one same-directory child fork and
   send it no prompt;
8. name that child `CANON <case-id> REV-<NNN> <STAGE>-entry`;
9. snapshot the matching project/RUN and accept the pair before starting the
   target stage in the moving canonical Session.

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
  → capture code-entry
  → CODE canonical-chain validation
```

If a predecessor artifact changes, increment the canonical-chain revision and
recapture all downstream checkpoints. A checkpoint is immutable after
acceptance.

If a matched engine/flow change alters SPECIFY obligations, PROTOCOLIZE
ownership, PLAN schema/projection, PLAN-REVIEW closure or CODE execution,
rebuild the canonical
chain from `specify-entry` even when the user discussion is unchanged. The
checkpoint pins the whole runnable pair, so splicing downstream entries from an
older pair is not a valid scored comparison.

When the accepted assessment axes also change, do not compare old weighted
scores directly with the new run. Statically rejudge retained old candidate
evidence under the new assessment when possible and mark incomplete transcript
or runtime evidence as `limited`; otherwise present the historical score in a
separate lane. For the current contour, execute all declared focused stages for all
three declared Subject profiles and the three declared E2E runs after the new
canonical chain is accepted.

For the specification-006 pair, focused SPECIFY and E2E candidate manifests
retain both `01-specify/specify.json` and its deterministic
`01-specify/specify.md` projection. Judges use the former for exact obligation
coverage and the latter for readable semantic review. PLAN and PLAN-REVIEW
candidate manifests retain generated `code-work-batch.json` as flow evidence;
it is never treated as a separately authored semantic answer.

### What “capture the current Session” means

At every stage entry, keep the canonical Subject idle, immediately create one
child fork of its latest completed history, and leave that child untouched.
Then snapshot the matching stable project tree, active RUN workspace and
`DD_FLOW_HOME`. The accepted checkpoint records the moving canonical Session,
optional source turn evidence and the separate frozen child Session. A routed
PLAN entry therefore includes both stable checkout and feature-worktree state;
the snapshot mechanism recreates the latter as a real worktree on restore.

Do not rely on forking an arbitrary old turn later: the current Desktop
Controller tool does not expose that boundary selection. Once the pair is
accepted, continue only the original canonical Session. Never send a message
to the frozen checkpoint Session.

The frozen child is the recovery source for a starter Session; it is not exposed
to routine eval operation. See [Create an eval case](create-eval-case.md).

### 4. Freeze definition evidence

Commit and tag:

- case manifest and checkpoint records;
- prompt/message manifests and hashes;
- interactions and the accepted assessment;
- engine/flow/project identities;
- compact human checkpoint reviews.

Keep project bundles, RUN snapshots, SQLite and raw transcripts in the declared
external archive. Record locators, sizes and checksums in Git.

### 5. Create the starter Sessions

After all required checkpoints are accepted, create one untouched starter
Session for every checkpoint and Subject profile. For the canonical profile,
the parent is the frozen checkpoint Session. For another profile, first accept
its ordinary prime baseline and use that baseline as the protected parent.

1. fork the applicable protected source Session;
2. name the child `START <case-id> <STAGE>-entry`;
3. send the child no message;
4. write its current Session ID under the matching stage in
   `cases/<case-id>/starter-sessions.json`;
5. verify that the starter is reachable, idle and directly parented by the
   declared protected source Session;
6. commit and push the updated starter registry before running an eval.

The two Git locations have different audiences:

- `cases/<case-id>/checkpoints/<stage>.json` records the canonical-chain and
  frozen checkpoint Session IDs. Only checkpoint creation and starter recovery
  use them.
- `cases/<case-id>/starter-sessions.json` records the current starter Session
  ID for each stage. Routine Controller operation uses only this file.

There is no starter revision. Recreating a starter produces the same logical
input with a new provider Session ID. Replace that stage's ID in the registry;
completed attempts retain the exact old starter ID in their own evidence.

If a starter receives a message or otherwise advances, do not use it. Mark or
archive that provider task for operator clarity, fork a replacement from the
canonical checkpoint Session, and replace the registry ID. Never advance or
replace the canonical checkpoint Session during this recovery.

## Prepare an attempt

`dd-eval prepare` performs all deterministic work before a Subject fork:

1. validates the case, its input checkpoint and profile identities;
2. reads `cases/<case-id>/starter-sessions.json`, resolves the selected stage's
   current starter Session and verifies that its checkpoint and chain IDs match
   the selected canonical snapshot;
3. creates a new attempt directory;
4. restores the project archive and verifies HEAD/tree;
5. creates an empty isolated `DD_FLOW_HOME` and restores the paired RUN snapshot;
6. materializes only the checkpoint-bound immutable engine snapshot from the
   canonical runtime, rebases its local manifest path, then verifies its
   checksum against `engine-binding.json`;
7. verifies the target graph entry and absence of stale active bindings;
8. writes immutable manifest/state files and rendered operator/Subject packets;
9. returns exactly one next action: `fork_subject`.

The returned JSON must include:

- execution ID and mode;
- canonical checkpoint and chain IDs;
- current starter Subject Session ID;
- requested model/reasoning profile;
- attempt project root, `DD_FLOW_HOME`, RUN ID and RUN home;
- exact Subject task title;
- exact ordinary continuation message and its immutable path/hash to send after
  the fork.

If prepare returns a mismatch or restore incident, stop. Do not copy files,
rewrite SQLite, change a Session ID or reconstruct upstream state manually.
The routine Controller packet must not expose canonical-chain or frozen
checkpoint Session IDs. The Controller does not supply a starter ID by flag;
the committed starter registry is authoritative.

## Launch the Subject

### Capacity-aware controller scheduling

The Controller may run independent low-fan-out stages such as SPECIFY and
PROTOCOLIZE for several profiles in parallel. It must run PLAN and PLAN-REVIEW
for one Subject profile at a time: those stages may perform a capacity probe and
launch child review Work. Starting several parent orchestrators first can occupy
the entire provider pool and make every probe wait for capacity that none can
release. Finish, sync and judge one such stage before launching the next profile.

### Native fork

1. Fork the latest completed state of the starter Subject Session returned by
   `dd-eval prepare`.
2. A fork preserves the selected starter's context, but Desktop applies the
   Controller's default model to a new turn unless its send operation explicitly
   supplies the selected Subject model and reasoning. Send every Controller
   message that starts or resumes Subject work with exactly the profile returned
   by `prepare` (for example
   `model: gpt-5.6-luna`, `thinking: xhigh`). This explicit assignment is part
   of launch, not a user-visible model change. `dd-eval sync` verifies the
   resulting provider turn; a mismatch invalidates the attempt before judging.
3. Give the task the title returned by `dd-eval`.
4. Set the task workspace to the restored project root when the harness permits;
   otherwise tell the Subject the absolute root in the generated continuation.
5. Record the fork Session ID and parent before sending the stage message:

```sh
dd-eval session add --eval "<eval-root>" --execution "<execution-id>" \
  --role subject --session-id "<fork-session-id>" \
  --parent-session-id "<starter-session-id>"
```

When a Controller calls a Desktop API through an automation wrapper, first
decode its returned payload and extract the actual opaque `threadId`. Never
pass a missing value, `undefined`, or a title-derived ID to `dd-eval session
add`; the CLI rejects those placeholders before it writes attempt state.

6. Send the generated Subject continuation without editing it, using the exact
   requested model and reasoning returned by `prepare`. Use the same explicit
   profile when delivering a HITL answer or any later continuation in that
   Subject Session.

The evaluated Session must differ from the starter and its recorded parent
must equal the current starter ID. A restored stage-entry snapshot deliberately
has no live canonical binding: its first Subject is the fork of this starter,
which satisfies the project’s `same_session` policy for the candidate attempt.
A direct fork from a canonical checkpoint is
an operator error: preserve the incident, do not run the Subject, and prepare a
new attempt through the starter registry.

The continuation contains ordinary workflow information only: current working
directory, inline `DD_FLOW_HOME`, exact normal stage command/trigger, trusted
restore receipt and the requested stop boundary. It contains no eval,
assessment, golden reference or Judge terminology.

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

#### Versioned answer pool

Each case keeps its reusable, product-specific answers under
`cases/<case-id>/interactions/`. A declared interaction references its exact
`response_file`; together those files form the **answer pool** for HITL.

- The Controller sends a matching pool answer byte-for-byte. It does not
  paraphrase, combine or silently strengthen it.
- For an observed question, first check whether one pool answer directly and
  completely resolves it. If so, send that exact file and preserve the
  question/answer receipt as observed evidence.
- If no pool answer applies and there is no reasonable product default, obtain
  the decision from the user. Preserve the raw answer in the current RUN. Before
  the next canonical run, add the clarified answer to the pool in a new
  committed case revision; do not rewrite a completed attempt's evidence.
- A pool answer is eval input, not a general Memory Bank fact. Promote it to
  project knowledge separately only when it describes accepted product behavior.

When `sync` returns `deliver_declared_interaction`:

1. verify that stage and pause ordinal match the interaction script;
2. send the exact versioned response bytes;
3. let the same stage resume;
4. do not complete or rewind the stage;

When `sync` returns `deliver_observed_interaction`:

1. preserve the returned stage, pause ID and question path;
2. answer the question substantively from the materials already available to
   the Subject; if the answer requires a genuine product decision without a
   reasonable default, obtain that decision from the user;
3. send only the raw user answer to the Subject — never append Controller
   instructions to that message — then let the same stage resume with its
   generated command;
4. do not label the attempt invalid solely because the question was undeclared;
5. do not help the Subject with an evaluation, assessment criteria or hidden
   golden material.

`dd-flow` persists each question/answer pair under `intake/hitl`; candidate
checkpointing copies it into the candidate receipt. The Judge must assess both
whether the extra question was materially justified and whether its answer was
already present in the Subject's supplied context. An extra question is neither
automatically a defect nor automatically a virtue.

### Stage finish barrier

When a selected stage finishes, immediately capture it before sending any
successor instruction. In a focused run this is the final candidate checkpoint:

```sh
dd-eval checkpoint --eval "<eval-root>" \
  --execution "<execution-id>" --stage "<finished-stage>"
```

For E2E or a multi-stage segment, capture the finished boundary instead:

```sh
dd-eval checkpoint stage --eval "<eval-root>" \
  --execution e2e --stage "<finished-stage>"
```

The receipt is immutable evidence that the predecessor was done before its
successor was created; `dd-eval continuation` refuses to run without it.

For focused mode, the next action must be `stop_subject`. For segment mode it is
`continue_segment` until the final selected stage. For E2E it is `continue_e2e`
through the captured CODE boundary. The full-chain case ends only after CODE
has completed its planned Works and aggregate gate; MERGE remains outside this
evaluation.

If the Subject starts or mutates a successor before capture, mark the attempt
`invalid_infrastructure_flow`; do not repair or score it.

### E2E handoff ownership

`handoff_mode: same_session` is the default. The root Subject is the
orchestrator and continues every sequential stage in the same provider
Session. A fresh provider Session is for a delegated child Work (research,
review, code or repair), never an implicit stage boundary.

`handoff_mode: new_session` is a Controller operation, not an instruction for
the running Subject to improvise. After the completed stage has crossed its
barrier, the Controller forks a fresh Subject from the E2E execution's recorded
starter Session, registers that child in the same E2E execution, and sends only
the exact successor `stage start` command returned by the completed stage. The
fresh Subject uses the existing E2E project root and `DD_FLOW_HOME`; its stage
prompt reads the accepted predecessor artifacts. This preserves clean provider
context without substituting a canonical intermediate result.

For `same_session`, continue the existing Subject. In either mode, record every
Subject Session ID before its first flow command. Never tell a Subject to create
or select a provider Session itself, and never let it start a successor before
the Controller has recorded the completed-stage boundary. Every generated
Subject continuation stops after one stage, including E2E. After checkpointing,
the Controller obtains the next immutable packet with:

```sh
dd-eval continuation --eval "<eval-root>" --execution e2e --from-stage "<finished-stage>"
```

It sends that exact returned packet to the permitted successor Session; it does
not synthesize a next-stage command or reuse the original E2E request.

### Completion gate

Before judging, verify:

- expected final stage boundary reached;
- provider Subject task idle;
- no child agent is running;
- no child or stage-owned Work is `created`, `running` or `paused`; the root
  coordinator Work may remain resumable at a non-terminal legal boundary, but
  must be `completed` when the configured stop target completes the RUN;
- no provider turn or Work-session binding remains active;
- all selected candidate checkpoints exist;
- project and RUN files have not changed after their capture;
- trusted Session topology and usage have been synced;
- effective model/reasoning equals the requested profile.

After the provider reports every Subject and child turn settled, run the
engine-owned reconciliation once, using the execution's exact engine/pack pair:

```sh
DD_FLOW_HOME="<execution-runtime>" dd-flow stat usage \
  --run "<RUN-ID>" --project-root "<execution-project>" --json
DD_FLOW_HOME="<execution-runtime>" dd-flow stat run sessions ls \
  --run "<RUN-ID>" --project-root "<execution-project>" --json
```

`stat usage` rereads the registered Codex JSONL sources, records the current
usage projection and changes an `idle` Work Session to `stopped` only when its
latest provider lifecycle event is `task_complete`. It must return at least one
Session row whenever the RUN has transcript-backed Sessions. Treat an empty
usage projection, a transcript-backed completed child left `idle`, or a
`provisional` result after every provider turn has settled as an observability
defect. Do not infer token totals from wall time and do not edit SQLite.

## Judge procedure

Do not continue the Subject Session as Judge.

For each focused stage and each stage inside a segment:

1. fork the canonical Judge priming Session into a fresh Session;
2. record its parent and child IDs;
3. run `dd-eval judge prepare` for that candidate stage;
4. send the generated packet unchanged with the exact declared Judge model and
   reasoning. It includes any captured
   `run/intake/hitl` interaction evidence; Judge it as observed model behavior;
5. wait for the Judge. The generated packet names one deterministic
   `judge-XX.result.json` destination in the attempt's `judge/` directory;
   the Judge writes its schema-valid result there and modifies no candidate
   artifact;
6. accept that exact result unchanged.

If the result violates its mechanical schema, do not repair it in the
Controller. Preserve the invalid packet/result and reject that judgment with a
short factual reason; then create a fresh Judge fork and use `--rejudge`.

```sh
dd-eval judge prepare --eval "<eval-root>" \
  --execution "<execution-id>"

dd-eval judge accept --eval "<eval-root>" \
  --execution "<execution-id>" \
  --result "<judge-XX.result.json>"

dd-eval judge reject --eval "<eval-root>" \
  --execution "<execution-id>" \
  --reason "result violates the declared schema"
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
- for a focused execution, request usage with `--stage <stage>`; for a segment,
  pass the comma-separated selected stages; only E2E requests whole-RUN usage;
- derive focused/segment wall time from the selected lifecycle stage records,
  never from the first stage present in the restored RUN;
- fail synchronization when the usage command itself fails. Provider fields
  may be explicitly `unavailable` in a valid response; silently replacing a
  CLI/statistics failure with absent usage is forbidden;
- keep Controller, Subject, Subject children, Judge and Judge children separate;
- render the deterministic JSON and Markdown report from one report truth;
- retain exact checkpoint, fork, model, prompt and artifact identities;
- record runtime/transcript evidence checksums/locators when explicitly
  archived;
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
- the evaluated Subject was not forked from the current starter Session;
- a starter or canonical checkpoint Session received an eval message;
- restored project or RUN does not match the checkpoint;
- engine and flow pack are not the declared pair;
- selected model silently changes or falls back;
- hook binding is absent and identity is manually substituted;
- Controller leaks assessment/golden/eval guidance to Subject;
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
- Do not expose or directly fork canonical checkpoint Sessions during routine
  eval operation.
- Do not send work to a starter Session; fork it first.
- Do not use one Judge conversation for several candidates.
- Do not treat focused and E2E scores as the same measurement.
- Do not add a general scheduler, snapshot server or fixture compatibility
  layer for this local Desktop milestone.
