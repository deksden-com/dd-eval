# Specification 017: Deterministic eval runner and portable stage entry

Status: proposed implementation contract
Date: 2026-08-29
Owner: `dd-eval`
Affected repositories: `dd-eval`, `dd-flow-cli`
Supersedes: the routine focused-eval canonical Session, frozen Session, starter
Session and provider-fork procedures in specifications 002–003 and
`runbooks/execute-eval.md`
Extends: specification 014 harness backend contract

## Purpose

Replace the manually operated, fork-dependent eval procedure with one
deterministic runner that can:

- build and accept one harness-neutral canonical entry fixture for every
  evaluated stage;
- execute focused-stage, contiguous-segment and E2E evals through Codex,
  ZCode, Grok, OpenCode and Antigravity/AGY;
- launch independent executions concurrently within explicit resource limits;
- handle expected human-in-the-loop interaction through a semantic matching
  Judge without predicting exact question wording;
- optionally launch the final quality Judge;
- preserve a complete append-only execution trace and produce deterministic
  JSON and Markdown protocols;
- resume safely after Controller or host restart without repeating a productive
  model turn or lifecycle mutation.

The runner makes orchestration deterministic. It does not make model output or
semantic judgment deterministic. Subject and Judge variability is measured
evidence, not an implementation defect.

## Design decision

### Clean Session is the focused-eval baseline

Every routine focused-stage execution starts from a new empty provider Session.
The runner restores one accepted stage-entry fixture and sends one generated
launcher packet. The Subject's first technical action is the exact standalone
`dd-flow stage start` command in that packet. `stage start` returns the complete
authoritative stage context.

An empty Session has no prior user, assistant or tool turn. The generated
launcher packet is its first user message. Provider system/developer
instructions are allowed only when they are declared by the selected harness
profile and their identity or hash is recorded in the resolved manifest. This
prevents an undeclared warm-up prompt from becoming hidden stage context.

```text
accepted stage-entry fixture
  -> isolated project/runtime restore
  -> new empty provider Session
  -> generated launcher packet
  -> standalone stage start
  -> one evaluated stage
  -> candidate checkpoint
```

This is the same semantic input for every harness. Native fork support, provider
history import, warm context and prompt-cache history are not part of the
focused-stage baseline.

### E2E retains real process continuity

E2E starts from one clean initial fixture and executes the selected contour
without substituting canonical downstream artifacts. The Subject consumes its
own preceding results and follows the configured flow handoff policy. E2E
therefore measures information preservation, accumulated error, orchestration
and final outcome; a focused stage measures the stage itself under fixed input.

The pack carries one stage-context blueprint shared by focused and E2E modes,
but the runner exposes only the active stage slice. In a focused execution that
slice binds to accepted predecessor artifacts in the restored snapshot. In E2E
the corresponding slice binds at every `stage start` to the Subject's current
RUN, workspace and preceding outputs. Canonical downstream files and future
stage slices are never copied into the live E2E RUN.

The initial E2E fixture contains only the case's starting project/runtime state,
the raw user request and discussion facts accepted before flow entry, and the
project-orientation sources required at that entry. It must not contain a
canonical result from any downstream stage.

### Session-continuity experiments are separate

Native forks may later support an explicitly named session-continuity
experiment. They are not a routine focused-stage seed, a required case input or
a fallback. Such an experiment is scored in a separate lane because it has a
different context and cache condition.

After cutover the active runner does not read canonical Session IDs or
`starter-sessions.json`. Historical Git records remain history only; there is no
dual execution path.

## Terminology

- **Stage-entry fixture** — accepted, immutable, harness-neutral input for one
  stage: project snapshot, RUN/runtime snapshot, semantic context descriptor and
  Subject interaction-policy reference.
- **Eval Entry Pack** — one accepted case revision containing the E2E entry and
  every focused-stage entry declared runnable for that case. Its identity is
  `<case-id>@<revision>`; no separate registry or opaque ID is introduced.
- **Semantic context package** — path-independent description of everything a
  Subject is entitled to know at stage entry.
- **Stage-context blueprint** — case-specific task/project source mappings for
  all declared stages. The flow pack supplies universal method and dynamic
  predecessor roles; `stage start` binds the blueprint to the current RUN.
- **Launcher packet** — small per-attempt message containing restored absolute
  paths, the exact standalone `stage start` command and the stop boundary.
- **Rendered stage context** — authoritative Subject-visible result returned by
  `stage start` from the semantic package, flow pack and restored runtime.
- **Eval-control fixture** — Judge/runner-only material: HITL response set,
  assessment, golden context oracle and failure policy. It is never rendered to
  the Subject.
- **Run profile** — versioned machine-readable selection of case, profiles,
  modes, repetition, HITL, judgment, concurrency and failure policy.
- **Resolved manifest** — immutable expansion of one run profile into concrete
  executions, paths, versions, hashes and requested profiles.
- **Interaction Judge** — clean semantic matcher that selects an existing
  canonical response for an expected Subject question. It never authors an
  answer.
- **Final Judge** — clean evaluator of an immutable completed candidate.

## Ownership and trust boundaries

`dd-flow` owns:

- RUN, Stage, Work and legal flow transitions;
- stage methods, output contracts and lifecycle commands;
- rendered stage context;
- trusted hook binding;
- lifecycle, Session, Work, timing and usage truth.

`dd-eval` owns:

- cases and run profiles;
- canonical stage-entry fixtures;
- attempt isolation and the deterministic runner state machine;
- harness selection and driver invocation;
- HITL response fixtures and interaction-Judge packets;
- candidate checkpoints, final-Judge packets, scoring and reports;
- the normalized append-only runner trace.

Harness drivers own physical provider Sessions and provider evidence:

```text
codex-desktop     -> dd-codex
zcode-acp         -> dd-zcode
grok-acp          -> dd-grok
opencode-server   -> dd-opencode
antigravity-cli   -> dd-agy
```

The Subject sees only the launcher packet, rendered stage context and exact
canonical HITL response delivered after a successful match. It never sees the
assessment, golden context oracle, response-selection rationale or final-Judge
packet.

## Canonical fixture model

### One semantic fixture for all harnesses

For a given case revision and stage, every harness restores the same:

- project tree and Git state;
- routed workspace and branch state when present;
- RUN directory, SQLite truth and projections for an entry after flow start;
- RUN variables and flow flags for an entry after flow start;
- completed predecessor artifacts;
- flow-pack and engine identities;
- semantic context package;
- Subject-visible HITL policy;
- canonical interaction-fixture identity used only when HITL occurs.

Allowed per-execution differences are limited to:

- absolute restored paths;
- provider Session/turn, eval execution and operation identities;
- driver transport details;
- requested and observed provider profile;
- provider-native event and usage receipts.

Focused snapshots preserve internal flow entity identities such as RUN, Stage,
protocol and Work because artifacts and graph edges refer to them. Context
mappings still use dynamic roles instead of spelling those IDs. Initial E2E
bootstrap creates its own internal identities inside its isolated runtime.

Portable capture normalizes observability state. It preserves domain RUN,
Stage and Work records, dependencies, statuses and semantic results, but removes
reference provider Sessions/turns, hook claims, usage samples and provider-only
agent IDs. Optional Session links on preserved completed Work are cleared. The
runner rebuilds projections from the normalized SQLite/domain truth and records
a scrub receipt. Reference observability remains available only through the
build's forensic trace; a restored focused attempt starts usage and Session
accounting empty.

The fixture records a path-independent `semantic_package_sha256`. Every
attempt records its path-bearing `rendered_package_sha256`. The semantic hash
must be identical across harnesses for a comparable focused-stage cell.
Canonical HITL material has its own `interaction_fixture_sha256`; it is fixed
across comparable harnesses and excluded from the initial Subject prompt and
from `semantic_package_sha256`. Assessment, context-oracle and Judge-methodology
hashes are resolved separately into the run manifest, so they may evolve
without pretending the Subject's stage input changed.

Semantic hashes use one canonical JSON serialization: UTF-8; object keys sorted
recursively; array order preserved; insignificant whitespace removed; and one
trailing newline. Path-bearing values, generated identities and hidden control
material are excluded before serialization. The rendered hash covers the exact
UTF-8 bytes delivered by `stage start`; the runner performs no prompt
post-processing after hashing.

### Storage

Compact definitions remain in Git:

```text
cases/<case-id>/
  case.json
  run-profiles/
  entry-pack-source/stage-context.json
  entry-pack-source/context-oracles/<stage>.json
  entry-pack-source/interactions/<stage>.json
  stage-entries/REV-<NNN>/entry-pack.json
  stage-entries/REV-<NNN>/stage-context.json
  stage-entries/REV-<NNN>/e2e.json
  stage-entries/REV-<NNN>/<stage>.json
  context-oracles/REV-<NNN>/<stage>.json
  interactions/REV-<NNN>/<stage>.json
  checkpoint-reviews/REV-<NNN>/<stage>.md
```

`entry-pack-source/` is the mutable, machine-readable authoring SSOT consumed
by `canonical build`. It contains no captured project/RUN bytes and no provider
Session identity. Final acceptance freezes its normalized content and hashes
under the allocated revision. Scored runs resolve only `case.json.entry_pack`
and never read the mutable authoring source.

Large immutable snapshots remain under `DD_EVAL_HOME`:

```text
$DD_EVAL_HOME/canonical/<case-id>/REV-<NNN>/
  build/state.json
  build/events.jsonl
  qualification/<stage>/
  stages/<stage>/project/
  stages/<stage>/runtime/
  stages/<stage>/snapshot-manifest.json
```

The Git stage-entry record stores relative canonical locators, sizes and hashes.
It never stores mutable host paths as restore truth.

Canonical snapshots are content-addressed and deduplicated. Storage collection
must treat the active `case.json.entry_pack`, every retained eval manifest and
every unfinished canonical build as roots. An object reachable from any root
cannot be deleted. Unreachable objects become ordinary retention candidates;
the runner reports their count and size before the existing storage policy
removes them. No separate fixture registry is introduced.

### Entry-pack manifest

Strict `dd-eval/entry-pack@1` is the atomic index of one case revision:

```json
{
  "schema_id": "dd-eval/entry-pack@1",
  "case_id": "sdlc-eval-2026-summer-task-priority",
  "revision": "REV-078",
  "title": "Task Priority SDLC Entry Pack",
  "input_checkpoint": {"id": "cp-...", "sha256": "..."},
  "flow": {
    "kind": "vnext_protocolize",
    "entry_stage": "specify",
    "terminal_stage": "code-review",
    "engine_sha256": "...",
    "flow_pack_sha256": "..."
  },
  "authoring": {
    "harness": "...",
    "profile_id": "...",
    "build_trace_sha256": "..."
  },
  "stage_context": {"path": "stage-context.json", "sha256": "..."},
  "e2e": {"path": "e2e.json", "sha256": "..."},
  "focused_entries": {
    "specify": {"path": "specify.json", "sha256": "..."},
    "protocolize": {"path": "protocolize.json", "sha256": "..."}
  },
  "status": "accepted",
  "accepted_at": "...",
  "acceptance_sha256": "..."
}
```

The example is abbreviated; `focused_entries` contains exactly the stages the
case declares for focused evaluation. Stage names and order are validated
against the selected flow pack, not a list hardcoded in `dd-eval`.

`entry-pack.json` is written last. A revision remains `building` until its E2E
entry and every declared focused entry pass their own gates. The accepted
manifest is immutable. An incomplete revision may be inspected or resumed but
cannot seed a scored run.

Authoring provenance explains how canonical predecessor artifacts were
produced; it does not make that provider Session part of the fixture. An entry
pack is a fixed evaluation input, not a golden output. Golden decisions and
quality expectations remain in assessment/oracle material and may admit valid
alternatives to the reference execution.

The next strict case schema replaces `canonical_checkpoints` with one relative
`entry_pack` path. That case field is the sole active-pack pointer. Per-stage
candidate-file declarations remain because they describe evaluation output;
starter fields and per-stage `subject_packet` flow instructions are removed.
The raw task/intake source is declared once at case level as an ordered list of
role, UTF-8 content-file and hash records. This preserves the actual discussion
and flow trigger without inventing a Controller summary. Explicitly accepted
pre-flow decisions may be indexed separately, with evidence back to the source
message.

A new case starts as `status: authoring` with `entry_pack: null`; only
`canonical build` may consume that form. Final pack acceptance atomically sets
`status: runnable` and the relative `entry_pack` pointer. `eval run` accepts only
`runnable`. This is one case schema with a conditional invariant, not a second
draft format.

The final `canonical accept` operation writes the accepted manifest and updates
`case.json.entry_pack` to its relative path under one build lock. The build
journal makes an interrupted two-file promotion recoverable. A scored run is
still forbidden until the resulting dd-eval definition tree is committed and
clean; its Git commit/tree is recorded in the resolved run manifest.

### Stage-entry schema

The implementation adds strict `dd-eval/stage-entry@1`. Its semantic shape is:

```json
{
  "schema_id": "dd-eval/stage-entry@1",
  "case_id": "sdlc-eval-2026-summer-task-priority",
  "revision": "REV-078",
  "stage": "plan",
  "checkpoint_id": "STG-PLAN-ENTRY-001",
  "source": {
    "input_checkpoint_id": "cp-...",
    "engine": {"id": "...", "sha256": "..."},
    "flow_pack": {"id": "...", "sha256": "..."}
  },
  "snapshot": {
    "project": {"locator": "...", "sha256": "..."},
    "runtime": {"locator": "...", "sha256": "..."},
    "run_id": "RUN-...",
    "target_stage": "plan"
  },
  "context": {
    "objective": "Prepare an executable implementation plan.",
    "inputs": [],
    "project_context": [],
    "accepted_decisions": [],
    "subject_hitl": {"mode": "forbidden", "max_rounds": 0}
  },
  "context_template": {
    "id": "flow-pack:plan",
    "sha256": "..."
  },
  "context_slice_sha256": "...",
  "semantic_package_sha256": "...",
  "interaction_fixture_sha256": "...",
  "accepted": {
    "at": "...",
    "review_sha256": "..."
  }
}
```

`inputs`, `project_context` and `accepted_decisions` are indexes, not copies of
large documents. Each entry has a role, path, required flag, reason and hash
where the source is immutable. Paths are relative to `project`, `workspace` or
`run`; an absolute or escaping path is invalid.

An indexed source may be one file or one directory. A directory entry is the
right representation for a bounded evidence set whose members are created by a
preceding stage; the package need not predict and repeat every filename. The
entry still states its role, root, required flag and reason, and snapshot
integrity covers its contents.

### Context sources

The complete Subject-visible stage context combines four sources:

1. **Flow context**, supplied by the versioned flow pack:
   stage method, output contract, schemas, lifecycle commands, verification
   obligations, legal transition and stop boundary.
2. **Predecessor results**, supplied by the accepted fixture:
   requirements, protocols, plans, scenarios, decisions and evidence produced
   before the target stage.
3. **Project context**, selected during case authoring:
   relevant Memory Bank indexes, coding/documentation standards, Git/worktree
   policy, architecture, specifications, ADRs and check aliases.
4. **Task context**, supplied by the case:
   stage objective, already accepted decisions, unresolved permitted choices
   and Subject-visible HITL rule.

The package references authoritative files instead of paraphrasing them. It
inlines only the small orientation required to explain what a source is and why
the Subject must read it.

The flow pack declares the source roles a stage needs. Case authoring maps
those roles to case-specific paths and accepted decisions. Deterministic code
checks containment, existence, hashes and required-role coverage; it does not
decide which architecture document is semantically relevant. That selection is
made during the reference chain and accepted by semantic review.

Those case mappings are authored once in `stage-context.json`. They
distinguish:

- **static task/project sources**, which resolve from the task input, project or
  routed workspace;
- **dynamic flow sources**, which are role selectors such as accepted previous
  result, current plan, current diff or verification-evidence directory.

Strict `dd-eval/stage-context@1` stores an ordered task input plus a map of
stage-name to static sources, accepted decisions and dynamic roles. Each stage
slice has its own canonical hash. `entry-pack.json` hashes the whole runner-side
blueprint, while a stage entry hashes only its slice. The runner materializes
one slice at a time; the Subject-readable file never contains another stage.
Editing PLAN context therefore does not force an unrelated SPECIFY
qualification rerun; every entry whose slice or consumed shared source changed
is still invalidated.

The blueprint never pins a dynamic source to a canonical predecessor path.
`dd-flow stage start` resolves dynamic roles from its current RUN state. A
focused restore therefore sees the accepted canonical predecessor, while E2E
sees only the current Subject's predecessor. The rendered context receipt
records the blueprint hash and every bound source/hash, making leakage or stale
binding mechanically detectable.

The runner restores a read-only path-bearing copy of only the active stage
slice and places its exact file hash in the launcher. The complete authoring
blueprint remains runner-side. The first lifecycle command has one of two
forms.

For the initial E2E/SPECIFY entry, no RUN exists yet. The one `stage start`
operation creates it and starts SPECIFY:

```text
DD_FLOW_HOME=<absolute-runtime> dd-flow stage start --bootstrap --stage specify --subject <safe-subject> --project-root <absolute-project> --context-file <absolute-restored-stage-context.json> --context-sha256 <expected-sha256> --require-session-binding --json
```

For a focused downstream stage or segment entry, the accepted snapshot already
contains the predecessor RUN:

```text
DD_FLOW_HOME=<absolute-runtime> dd-flow stage start <RUN> --stage <stage> --project-root <absolute-project> --context-file <absolute-restored-stage-context.json> --context-sha256 <expected-sha256> --require-session-binding --json
```

`--context-sha256` is the SHA-256 of the exact materialized slice file bytes,
including restored absolute roots. The `stage start` receipt records that hash,
the path-independent `context_slice_sha256` from the accepted entry and the
final rendered-context hash. Thus file tampering, semantic drift and rendered
prompt drift remain distinct checks rather than one overloaded checksum.

The runner records the expected three hashes before it sends a launcher and
compares them with the `stage start` receipt during reconciliation. A Subject
may try a different command, but it cannot turn a different context file into a
valid eval input: a different materialized-file hash, semantic-slice hash or
rendered-context hash invalidates that execution as a flow-protocol failure.
`dd-flow` therefore needs no eval-specific signing key or hidden runner state.

For bootstrap and every restored focused/segment execution, `stage start`
validates the expected hash and installs the current slice into that Stage
workspace before changing state, then returns the RUN identity,
resolved-binding receipt and rendered context. Bootstrap creates the RUN inside
that same atomic operation; there is no earlier Controller-created RUN or
hidden lifecycle mutation.

After an E2E stage finishes, `dd-flow` returns the legal successor identity and
base lifecycle arguments. The runner checkpoints the boundary, materializes
only the successor slice and sends a continuation packet containing the exact
standalone command with `--context-file` and `--context-sha256`. This is pure
deterministic command assembly, not a model decision or extra Subject tool
call. The Subject never receives a future slice and never runs a separate
context-install command.

The stage context is read from the supplied file exactly once, copied into the
Stage workspace as part of `stage start`, and is thereafter immutable stage
evidence. `stage resume` delivers only a matched HITL response to that already
started Stage; it neither replaces nor rerenders the stage slice.

Bootstrap hook binding does not require a preallocated RUN ID. The trusted
hook records the exact normalized command fingerprint plus provider Session;
`stage start` claims that event, creates the RUN and attaches the Session in the
same operation. `--require-session-binding` makes a missing or ambiguous claim
a hard error. The hook and CLI parser must include the context flags in the
same canonical fingerprint calculation; neither side rewrites heredocs or
injects `--session-id`.

For runner-managed bootstrap, the ordered task input comes from the validated
SPECIFY slice. `stage start` preserves those exact bytes as RUN intake, so no
second `--intake-file` is passed. Existing non-runner entry paths may retain
their ordinary intake argument, but the new runner contract has one input SSOT.

In `stage-entry@1`, `snapshot.run_id` is `null` only for the initial
E2E/SPECIFY bootstrap entry and is required otherwise. This conditional is
enough to select the command form; no separate entry-mode field is introduced.

Universal stage instructions belong to the flow pack, not a case prompt. A
case may add only task-specific objective, accepted decisions and permitted
unresolved choices. If an instruction from an old `subject-<stage>.md` is
necessary for every task, it moves into the corresponding `stage start`
renderer. If it is specific to the task, it becomes structured case context.
It is not copied into both places.

Hidden assessment, context oracles and canonical response descriptors live
outside every Subject-readable project, workspace and RUN root. Harness
credentials, `.env` secrets, provider caches, host sockets and machine-local
configuration are never captured in an entry pack. Required runtime secrets
are injected by the harness profile at execution and are recorded only as
redacted presence/identity evidence.

### Rendered context structure

`dd-flow stage start` returns one Markdown document organized by structural
tags. The tags are delimiters; Markdown remains valid inside them.

```text
<stage_identity>...</stage_identity>
<objective>...</objective>
<required_inputs>...</required_inputs>
<project_context>...</project_context>
<accepted_decisions>...</accepted_decisions>
<stage_method>...</stage_method>
<output_contract>...</output_contract>
<verification>...</verification>
<hitl_policy>...</hitl_policy>
<commands>...</commands>
<stop_boundary>...</stop_boundary>
```

The response names every required input with its role, exact restored path and
reason. It includes exact pause/resume/finish commands and does not require the
Subject to open CLI help.

One pure internal `renderStageContext` implementation supplies both `stage
start` and read-only validation. If a public diagnostic command is required,
it is:

```text
dd-flow stage context --run <RUN> --stage <stage> --project-root <path> --json
```

It performs no lifecycle mutation and is not a substitute for the Subject's
standalone `stage start`.

## Fixture authoring and acceptance

### Reference chain

One accepted reference execution produces stage-boundary artifacts. Provider
Session history may be retained for forensics but is not part of the fixture
and is never required for routine execution.

```text
capture specify-entry
  -> execute and accept SPECIFY
  -> capture protocolize-entry
  -> execute and accept PROTOCOLIZE
  -> capture plan-entry
  -> ...
```

At every entry the runner:

1. proves the predecessor is accepted;
2. proves the target stage is unstarted;
3. proves no HITL answer is pending;
4. proves no child Work or provider turn is active;
5. reconciles RUN projections and SQLite truth;
6. captures stable checkout, routed workspace and runtime state;
7. resolves and hashes the semantic context descriptor;
8. renders a diagnostic context through the same renderer used by `stage
   start`;
9. scans the Subject-visible package for forbidden eval-control material;
10. writes a pending stage-entry record and compact review template.

The reference Subject completes one stage per provider turn and stops after
the successful `stage finish`. The runner captures the boundary before sending
the returned successor command in the next turn of the same Session. HITL
resume is the only ordinary reason to add a turn before the stage boundary.
This capture barrier prevents a fast Subject from starting the successor while
its fixture is still being recorded.

`canonical boundary accept` is deliberately non-productive: it accepts or
rejects the finished reference boundary and, when accepted, atomically captures
the next pending entry. It never sends a provider prompt. Its receipt returns
the one `canonical resume` command that may create the next reference turn.
This gives the operator a stable inspection point and means a lost terminal
stdout cannot accidentally advance the reference chain.

If a predecessor artifact, engine, flow pack, selected project context or
accepted decision changes, a new revision recaptures every dependent
downstream entry. Accepted fixtures are immutable.

### Mechanical acceptance gate

Code verifies:

- every required file exists and matches its hash;
- all paths are contained in the captured roots;
- target stage and RUN state are correct;
- no later-stage directory/artifact, stale RUN from another build, pending
  interaction or unrelated active Work is present;
- engine, flow pack and project identities match the case input checkpoint;
- no Work, provider turn or interaction remains active;
- no reference provider Session, hook event, usage row or provider-only agent
  identity remains in the portable snapshot;
- workspace route and Git state are reproducible;
- the context template and schemas are present;
- hidden assessment, golden and canonical responses are absent from Subject
  material;
- every dynamic role binds inside the current restored RUN/workspace and never
  to another stage-entry snapshot;
- a fresh temporary restore reproduces the same semantic package hash.

For mutable authoring input, the same gate additionally rejects a missing
declared stage slice, absolute or escaping path, hidden-control path, generated
reference ID inside a dynamic selector and any source role not declared by the
selected flow pack. This validation runs before a reference provider Session
is created.

### Semantic acceptance gate

A human or clean context Judge verifies:

- all information required to perform the stage is available;
- accepted user decisions are preserved;
- relevant project sources are named without dumping unrelated knowledge;
- there is no dependency on the reference Session's private conversation;
- expected outputs and verification are actionable;
- no golden answer or scoring hint is leaked;
- a clean Session can perform the stage without rediscovering already accepted
  facts.

The canonical stage entry becomes runnable only after both gates pass. The
runner may automate the semantic review packet but does not silently promote a
golden fixture from a schema-valid result. Human acceptance remains explicit in
the first implementation.

### Context oracle and observed context misses

Each case may define a hidden context oracle for a stage. It lists facts,
decisions and source roles that must be available, not the exact wording of the
Subject prompt.

After an execution, the Judge or analysis pass may inspect provider transcript
and tool activity to identify `context_misses`. A read, search or extra file
open is not automatically a miss. A miss requires evidence that the Subject had
to discover a fact, decision, path or command that the accepted package was
responsible for naming. Legitimate implementation research remains normal
stage work.

Repeated discovery of the same missing source across profiles is strong fixture
evidence. A single model's redundant reread is efficiency evidence unless the
package itself is demonstrably incomplete. The evaluated Subject never writes
its own `context_misses` assessment.

The deterministic report builds a diagnostic projection from the provider
transcript and tool journal:

- package-declared sources that were opened;
- undeclared sources that were opened;
- searches used to discover paths, facts or commands;
- CLI help calls and lifecycle calls before the required `stage start`;
- the evidence span supporting every asserted context miss.

These counters are observations, not an automatic quality score. A Judge or
post-run analysis decides whether an undeclared read was necessary research, a
redundant model action or evidence that the fixture omitted required context.
The projection records `observation_coverage` as `complete`, `partial` or
`unavailable` with the contributing driver evidence. It must not claim that no
extra read occurred when a harness cannot expose tool activity.

### Context-package qualification run

A stage entry is not semantically accepted merely because its files and schema
are valid. Every new entry-pack revision runs one focused qualification
execution per declared stage from the candidate package.

The initial qualification profile for Task Priority SDLC Entry Pack is:

- harness: Codex through `dd-codex`;
- Subject: `gpt-5.6-terra`, reasoning `high`;
- Session: new and empty for every stage;
- repetitions: one;
- concurrency: one Codex root execution at a time, with no other eval using
  that harness during qualification;
- execution boundary: exactly one stage;
- context analysis: clean existing Judge profile, followed by explicit human
  acceptance;
- scoring: diagnostic only; never included in model-comparison results.

Each Subject receives the normal launcher and flow instructions, not an
eval-specific hint about which files to read. The runner preserves the complete
Session/tool evidence and builds the context diagnostic projection. Analysis
checks:

1. `stage start` was the first technical action and was issued as a standalone
   command;
2. every required role resolved to a readable source;
3. the Subject did not need CLI help or broad path discovery for commands and
   paths the package owns;
4. accepted facts and decisions were not rediscovered from unrelated files;
5. undeclared reads and searches are classified as legitimate research,
   redundant behaviour or a genuine package miss;
6. HITL occurred only where allowed and was not caused by omitted accepted
   context;
7. the stage reached its boundary, or any failure is demonstrably a Subject
   quality defect rather than missing context;
8. no hidden assessment, oracle, response-selection rationale or canonical
   downstream artifact was exposed.

A package correction updates the candidate blueprint/entry and reruns the
affected stage. If a shared source role changed, every stage that consumes that
role is rerun. The clean E2E qualification is rerun after the focused set is
clean. A single redundant Terra read does not justify changing the package
without evidence that the source was required and insufficiently named.

The subsequent clean E2E qualification uses the same Codex Terra-high Subject
profile. This keeps package qualification internally consistent while the
separate semantic reviewer remains free to use the case's current clean Judge
profile.

Qualification outputs are stored below the pending canonical build under
`qualification/<stage>/`; they include Session identity, requested/observed
profile, transcript/tool journal locators, context diagnostics, Judge verdict
and human acceptance. Subject output from a qualification run never replaces a
reference-chain artifact and never becomes a golden answer.

The qualification verdict is `qualified`, `package_gap` or
`invalid_infrastructure`. `qualified` means no unresolved context-package
blocker; it does not require a high semantic stage score. A documented Subject
quality defect may coexist with `qualified`. Only `package_gap` requires a
package correction and rerun; infrastructure-invalid evidence is retained but
does not qualify the entry.

## First migration: Task Priority SDLC Entry Pack

The first implementation target is the current case
`sdlc-eval-2026-summer-task-priority`. Its accepted pack is named **Task
Priority SDLC Entry Pack** and addressed as:

```text
entry-pack:sdlc-eval-2026-summer-task-priority@<revision>
```

Its concrete pre-implementation source map and authoring checklist live in
`cases/sdlc-eval-2026-summer-task-priority/stage-entries/authoring-plan.md`.
That document prepares content; it is never rendered to the Subject.

The name is descriptive; the stable identity remains the existing case ID plus
the allocated revision. At the time of this specification the case resolves
input checkpoint `cp-045-zcode-snapshot-git-beta-124`. `canonical build` must
resolve that value from `case.json` at runtime and record its hash; neither the
checkpoint ID nor the next revision number is compiled into the runner.

The first build uses clean Codex `gpt-5.6-sol` high as the reference-chain
Subject and clean Codex `gpt-5.6-terra` high as the qualification Subject.
These are committed profile selections, not runner defaults; requested and
observed profiles are recorded for every Session.

### Declared entries

The initial pack contains:

| Entry | Required Subject-visible roles |
| --- | --- |
| `e2e` | raw task input and any explicitly accepted pre-flow decisions; initial project orientation; flow-entry trigger; project and runtime snapshot before SPECIFY |
| `specify` | the same initial task facts and project orientation; SPECIFY method and output contract; focused stop boundary |
| `protocolize` | accepted SPECIFY result and HITL exchange; product-document indexes; feature/epic/specification/ADR conventions; Git/worktree policy |
| `plan` | accepted protocol set; requirement and acceptance obligations; applicable engineering/project sources; scenario and check catalogs; PLAN method |
| `plan-review` | accepted plans; obligation mapping; code-work batch; aspect decisions; review severity and repair policy |
| `code` | accepted reviewed plan and executable Work graph; per-Work context sources; coding/documentation standards; check aliases; workspace/Git policy |
| `code-review` | accepted CODE result; complete changed-file diff; CODE verification evidence directory; plan and acceptance obligations; review aspects and severity policy |

This table defines roles, not task-priority answers or fixed filenames. The
stage-entry records map each role to the actual restored source. A full
evidence directory may satisfy the CODE or CODE-REVIEW evidence role.

The E2E and focused SPECIFY entries may share the same immutable project/runtime
snapshot bytes. They remain distinct descriptors because their execution
boundaries differ: focused SPECIFY stops after that stage, while E2E follows
the case's declared contour through CODE-REVIEW. Snapshot content is not copied
merely to create a second descriptor.

### Migration procedure

1. Validate the case's current input checkpoint, engine, flow pack, assessment,
   interaction material and declared six-stage contour.
2. Use the exact flow trigger currently represented by `subject-e2e.md` as the
   task input. Do not include `subject-discussion.md` without its missing
   assistant turn. Focused SPECIFY reuses the same task input; it does not keep
   a duplicate prompt.
3. Replace the old exact `interaction-script@1` pause record with canonical
   response material for semantic Interaction-Judge matching.
4. Create a clean reference workspace and capture the initial E2E/SPECIFY
   snapshot before flow entry.
5. Advance one reference execution through SPECIFY, PROTOCOLIZE, PLAN,
   PLAN-REVIEW, CODE and CODE-REVIEW. Before each stage starts, capture its
   project/runtime state and build its semantic source index.
6. For each entry, run mechanical validation, author the hidden context oracle
   and mark the entry `candidate`.
7. Run the six clean Codex/Terra-high focused qualification executions, inspect
   context diagnostics, correct candidate mappings and rerun affected stages.
8. Run one clean E2E qualification to prove that dynamic context binding uses
   the Subject's own outputs, the initial fixture contains no
   canonical downstream artifact and that the Subject's own outputs cross all
   stage boundaries.
9. Run final semantic review and explicitly accept every entry.
10. Write and accept `entry-pack.json` only after all seven descriptors are
    accepted and the dependency chain is consistent.

The migration does not translate `starter-sessions.json`, provider Session IDs
or `canonical-stage-checkpoint@2` records into the new contract. Existing
snapshot contents may be used as reference evidence only after they pass the
new capture and acceptance gates. The old active files and starter-specific
tests are deleted at cutover.

### Reuse for other evals

The runner contains no task-priority or six-stage branch. To add another case,
the author supplies only:

- a strict case definition with input checkpoint, flow kind, entry/terminal
  boundary and stages selected for focused evaluation;
- ordered raw task/discussion messages, the flow trigger and any explicitly
  accepted pre-flow decisions;
- mappings from flow-declared context roles to project/RUN sources;
- canonical HITL responses for allowed interaction points;
- assessment, context oracles and a run profile.

`canonical build` queries the selected flow pack for legal stages and advances
only the declared reference contour. A case may expose one focused stage, a
subset, or a complete contour. A missing stage entry prevents only selections
that require it; an accepted E2E entry can still run when no focused entries are
declared. One run profile evaluates one case; a later multi-case suite command
is unnecessary until a real use case requires it.

### Revision and invalidation rules

- A change to Subject-visible task facts, project/runtime snapshot, accepted
  predecessor output, source mapping, flow pack or engine creates a new entry
  pack revision and recaptures every affected downstream entry.
- A change only to assessment or final-Judge methodology does not recapture the
  entry pack. Its new hash is recorded by the run profile and resolved manifest.
- A change to a canonical HITL answer changes the interaction-control revision
  and comparability identity. It does not duplicate unchanged snapshot bytes,
  but the affected entry must be semantically reaccepted because the delivered
  Subject stimulus changed.
- Accepted revisions are never edited in place. Unchanged snapshot objects may
  be referenced by hash from a new revision instead of copied.

## Run profile

Markdown scenarios are not executable configuration. The implementation adds
strict `dd-eval/run-profile@1` with `additionalProperties: false`.

```json
{
  "schema_id": "dd-eval/run-profile@1",
  "id": "zcode-glm53-focused-and-e2e",
  "case_id": "sdlc-eval-2026-summer-task-priority",
  "subject": {"profile_id": "zcode-acp-zai-glm-5-3-high"},
  "selection": {
    "focused_stages": ["specify", "protocolize", "plan"],
    "segment": null,
    "e2e": true,
    "repetitions": 1
  },
  "judge": {
    "enabled": true,
    "profile_id": "codex-desktop-gpt-5-6-sol-high"
  },
  "interaction_judge": {
    "profile_id": "codex-desktop-gpt-5-6-sol-high"
  },
  "concurrency": {
    "global": 4,
    "per_harness": {"zcode-acp": 1, "codex-desktop": 2}
  },
  "failure_policy": {
    "stop_run_on_infrastructure_error": false,
    "stop_execution_on_unexpected_hitl": true,
    "stop_execution_on_unmatched_hitl": true
  }
}
```

The profile contains no secret. CLI overrides are allowed only for fields
declared overrideable by the schema and every override is copied into the
resolved manifest with source `command_override`. The runner never mutates the
profile in place.

`case.json` defines what can be evaluated. `run-profile.json` defines the
experiment. Existing `manifest.json` remains the immutable resolved execution
plan; no parallel `execution-plan.json` is introduced.

## Runner command surface

All high-level automation lives under one namespace:

```text
dd-eval runner canonical build --profile <run-profile.json>
dd-eval runner canonical status --build <path>
dd-eval runner canonical boundary accept --build <path> --stage <stage> --review <file>
dd-eval runner canonical qualify --build <path> --profile <run-profile.json>
dd-eval runner canonical accept --build <path> --entry <e2e|stage-name> --review <file>
dd-eval runner canonical resume --build <path>
dd-eval runner fixtures validate --case <case-id> [--revision <REV>]
dd-eval runner eval run --profile <run-profile.json>
dd-eval runner eval judge --eval <path> [--profile <judge-profile-id>]
dd-eval runner status --eval <path>
dd-eval runner resume --eval <path>
dd-eval runner cancel --eval <path> [--execution <id>]
```

Existing low-level commands remain implementation and diagnostic primitives:
`prepare`, `sync`, `checkpoint`, `continuation`, `judge prepare`, `judge
accept` and `finalize`. The ordinary runbook does not ask an operator to compose
them.

There is no routine `starters build` command because routine focused evals do
not use provider starter Sessions.

`canonical build` runs one sequential reference chain for the selected case
revision. It captures a pending entry before each stage and stops after the
stage so `canonical boundary accept` can approve that reference result as the
next stage's predecessor. This is a quality gate on reference-chain output, not
acceptance of the portable entry. Its output always contains the current state,
artifact paths and one exact next command. Provider Session IDs may be recorded
as forensic evidence but never become fixture inputs.

Boundary acceptance is an explicit barrier, not a shorthand for continuation:
it records the decision and captures the successor entry only. The separately
returned `canonical resume` command performs the next productive provider
prompt. At the terminal boundary it instead advances the build to
qualification. This command split makes the human approval and the provider
action independently recoverable.

If a reference boundary is rejected, the runner invalidates that result and
all downstream candidate entries. The operator corrects the source, flow or
profile when applicable, then resumes from the already captured pre-stage
entry in a new clean reference Session. The runner does not coach or silently
retry a weak reference answer.

After qualification, `canonical accept` approves the portable entry itself.
For a stage entry, `--entry` is the stage name; for the initial descriptor it is
`e2e`. Accepting the final required entry causes the runner to validate and
write `entry-pack.json`. There is no separate manual finalize command.

`canonical qualify` is the only execution path allowed to launch a Subject from
a candidate entry. It uses normal runner/driver machinery but writes diagnostic
evidence under the canonical build and never a scored eval result. `canonical
accept` rejects an entry without the required successful qualification receipt
and explicit semantic review.

Canonical construction has its own append-only build journal and projection
under the pending canonical revision. `canonical build` is resumable: after a
restart it reconciles the provider and `dd-flow`, then continues from the first
unfinished safe operation. It never repeats a productive reference prompt or
stage transition merely because final stdout was lost.

### Canonical-build state machine

Canonical construction is distinct from a scored eval execution:

```text
planned
  -> preflight
  -> reference_running
  -> entries_captured
  -> qualifying
  -> semantic_review
  -> accepted
  -> promoted_pending_commit
```

Side states are `waiting_for_reference_hitl`, `waiting_for_reference_review`,
`waiting_for_entry_review`, `package_gap`, `invalid_infrastructure`, `failed`
and `cancelled`.

The reference execution may continue in one provider Session for authoring
quality, but its Session history is provenance only. HITL during the reference
chain uses the same canonical-response and clean Interaction-Judge procedure as
an eval. An unmatched question pauses the build for fixture authoring; the
runner never invents a reference answer.

`entries_captured` requires all declared snapshots and candidate descriptors.
`qualifying` runs isolated candidate copies and never mutates those snapshots.
`accepted` requires every entry to have a non-stale qualification and semantic
review receipt. Final acceptance writes the pack and active case pointer;
`promoted_pending_commit` tells the operator to review, commit and push the
definition tree. Only then can scored preflight consume it.

## Runner lifecycle

### Small eval state machine

A target step list alone cannot represent restart, HITL, parallel work,
judgment and cancellation. The runner therefore has one small execution state
machine:

```text
planned
  -> preflight
  -> materializing
  -> creating_session
  -> running_subject
  -> syncing
  -> checkpointing
  -> candidate_ready
  -> judging (optional)
  -> completed
```

Side states are:

```text
waiting_for_interaction_judge
invalid
failed
cancelled
```

This machine does not duplicate the SDLC graph. `dd-flow` remains the sole
source of legal Stage transitions. The runner follows only returned
`next_action` values and the case's selected terminal boundary.

### Deterministic control loop

For each execution the runner:

1. resolves and validates the run profile;
2. performs harness doctor/profile/version preflight;
3. restores the accepted fixture into a new attempt directory;
4. verifies project, runtime and semantic package hashes;
5. materializes the read-only path-bearing active-stage slice and exact
   launcher;
6. creates one empty Subject Session through the selected driver;
7. records the Session before its first productive prompt;
8. sends the immutable generated launcher packet;
9. waits for provider terminal or interaction state;
10. synchronizes `dd-flow` lifecycle, topology and usage;
11. verifies every returned lifecycle receipt against the launcher and fixture
    hashes, then follows the exact returned action;
12. captures every completed stage boundary before any successor starts;
13. captures the terminal candidate;
14. optionally runs a fresh final Judge;
15. finalizes usage and deterministic reports.

Provider silence, reasoning time or absence of a current tool call is not a
failure. The runner waits for provider status, explicit interaction, explicit
error, cancellation or a separately configured hard deadline. It does not
interrupt a live Work based on an elapsed nominal wait.

A provider turn that ends while `dd-flow` still reports a running Stage, with
neither registered pause nor successful finish, is
`incomplete_subject_turn`. If the final message asks the user something but no
flow pause was registered, it is additionally classified as
`unregistered_hitl`; deterministic code preserves the text but does not try to
interpret or answer it. The interaction Judge is invoked only for a registered
and allowed pause.

### Failure classes

| Class | Example | Runner result |
| --- | --- | --- |
| preflight invariant | wrong engine, model, snapshot or profile | fail before Subject launch |
| infrastructure | daemon crash, lost provider tree, hook mismatch | invalidate execution; apply explicit retry policy |
| flow protocol | successor started before checkpoint | invalidate execution |
| expected matched HITL | semantic match selects canonical response | resume same stage |
| unexpected or unmatched HITL | wrong stage/point or no canonical response | fail execution and preserve evidence |
| Subject quality defect | poor plan, missing implementation, unnecessary read | continue unless it blocks legal progress; Judge later |
| invalid Judge result | schema or evidence-boundary violation | reject judgment; optional fresh Judge attempt |

The runner never edits Subject output, injects coaching, replaces an upstream
candidate or retries a semantic stage merely to improve its score.

## HITL contract

### Do not enumerate expected question text

Question wording is semantic model output. Deterministic code must not compare
strings, keywords or embeddings to a catalog of expected questions.

The hidden case fixture stores canonical responses, not question templates:

```json
{
  "schema_id": "dd-eval/canonical-responses@1",
  "stage": "specify",
  "mode": "required",
  "max_rounds": 1,
  "responses": [
    {
      "id": "RESP-001",
      "topic": "archived_projects",
      "applicability": "Decision about applying task priority to archived projects.",
      "answer_file": "responses/RESP-001.md",
      "sha256": "..."
    }
  ]
}
```

`mode` is `forbidden`, `required` or `optional`. It defines where the runner is
allowed to wait for HITL; it does not prescribe the wording of a question.

- `forbidden`: any Subject pause for user input fails the execution;
- `required`: the stage cannot be accepted without at least one successfully
  matched round and cannot exceed `max_rounds`;
- `optional`: a pause may be matched up to `max_rounds`, while successful stage
  completion without a pause remains valid.

Preflight requires `interaction_judge.profile_id` whenever any selected stage
is `required` or `optional`.

### Interaction-Judge procedure

When the Subject pauses at an allowed HITL point, the runner:

1. captures the complete raw question packet unchanged;
2. creates a fresh interaction-Judge Session;
3. gives it only the Subject-visible stage package, raw question packet and
   hidden canonical response descriptors/content;
4. requires strict `dd-eval/hitl-match@1`;
5. accepts only an existing response ID;
6. sends the selected canonical response bytes to the same Subject stage;
7. records question, judgment, selected IDs and exact delivered bytes.

```json
{
  "schema_id": "dd-eval/hitl-match@1",
  "status": "matched",
  "classification": "covered_by_canonical_response",
  "response_ids": ["RESP-001"],
  "covered_questions": ["..."],
  "uncovered_questions": [],
  "rationale": "..."
}
```

For several selected responses, the runner combines their exact bytes in the
Judge-returned order with one versioned deterministic delimiter. The
interaction Judge never authors, paraphrases or strengthens an answer.

If any question is uncovered, the result is `unmatched`. The Judge also
classifies the likely cause as `fixture_gap`, `unnecessary_question`,
`out_of_scope` or `ambiguous`. Every non-matched verdict fails the execution;
the classification supports later fixture or flow repair.

HITL at a forbidden stage/point fails immediately as `unexpected_hitl` without
calling the interaction Judge. A required HITL point that is never reached
fails stage acceptance as `required_hitl_missing`.

The final Judge receives the captured HITL exchange and interaction-Judge
receipt and independently evaluates whether the Subject's question was
justified. The interaction Judge and final Judge never reuse a Session.

## Parallel execution

Every matrix cell is an independent execution:

```text
case x subject profile x mode/selection x repetition
```

It owns an isolated project, runtime, harness state directory, journals and
Sessions. Isolation prevents file and RUN collisions but does not remove
provider account limits, rate limits or shared subagent capacity.

The runner uses a bounded asynchronous pool with:

- one global semaphore held by each root eval execution;
- one per-harness semaphore acquired only for an active provider turn;
- every Subject, Interaction Judge and Final Judge turn using the semaphore of
  the harness it actually invokes;
- no operation holding permits for two harnesses at once;
- no hardcoded PLAN/REVIEW stage names in the scheduler.

A paused or between-stage Session retains its global root permit but releases
the harness permit. A same-harness Interaction Judge can therefore run at
`per_harness: 1`; a Judge on another harness cannot create a cross-harness
hold-and-wait cycle. Before resuming, the Subject reacquires its harness permit.
The runner never runs the Subject and its nested Judge productively at the same
time.

The safe default is one root execution per harness and parallelism across
different harnesses. A run profile may raise the per-harness value after
capability testing. `dd-flow` continues to schedule subagents inside one
Subject execution; the eval runner never schedules internal Work itself.

Canonical fixture construction is sequential within one reference chain.
Independent cases or harness executions may run concurrently only when their
project, runtime and provider resources are isolated.

Each eval run is materialized below one runner-owned directory:

```text
$DD_EVAL_HOME/attempts/active/<eval-id>/
  manifest.json
  state.json
  events.jsonl
  executions/<execution-id>/
  reports/
```

The runner allocates `<eval-id>` and every execution directory before starting
a provider. Operator-supplied output paths are permitted only below
`DD_EVAL_HOME` and cannot overlap another active or canonical directory.

## Harness-driver contract and `dd-codex`

The runner consumes the static contract from specification 014:

```text
doctor
create
prompt
inspect/wait
cancel
archive/close
```

Routine focused execution does not require `fork`. A driver may still expose it
for explicit session-continuity experiments.

Add `dd-codex` with the same JSON CLI conventions as the existing drivers:

```text
dd-codex doctor --json
dd-codex session create ... --json
dd-codex session prompt ... --json
dd-codex session inspect ... --json
dd-codex session wait ... --json
dd-codex session cancel ... --json
dd-codex session archive ... --json
```

It uses the supported Codex app-server/SDK protocol, records requested and
observed model/reasoning/cwd, provider thread and turn IDs, ordered events,
usage and tool calls. It must support several independent active Sessions under
the runner's semaphore and must not infer Desktop identity from a title.

Provider-specific control remains in each driver. Do not add a plugin
marketplace or inheritance hierarchy; use a small static driver map and shared
pure receipt validators.

## Append-only runner trace

### Format

Each attempt has one normalized `events.jsonl`. Every line is a CloudEvents
1.0 JSON event with stable dd-eval extensions:

```json
{
  "specversion": "1.0",
  "id": "EVT-...",
  "source": "dd-eval://EVAL-081/focus-plan-luna",
  "type": "dev.dd.eval.operation.completed",
  "time": "2026-08-29T14:32:11.442Z",
  "subject": "stage:plan",
  "datacontenttype": "application/json",
  "runid": "EVAL-081",
  "executionid": "focus-plan-luna",
  "traceid": "...",
  "spanid": "...",
  "parentspanid": "...",
  "data": {
    "sequence": 42,
    "operation": "dd-flow.stage.start",
    "status": "completed",
    "duration_ms": 412,
    "receipt": {"path": "receipts/stage-start.json", "sha256": "..."}
  }
}
```

No CloudEvents SDK or telemetry service is required. The runner writes the
envelope directly with Node standard-library file operations. Trace/span
relationships provide causality for parallel executions; monotonic `sequence`
inside the data provides append order for one journal. One serialized writer
owns sequence allocation and append operations even when executions run in
parallel.

### Required events

The journal covers:

- profile resolution and preflight;
- materialization and hash verification;
- driver/daemon start and status;
- Session creation, prompt, turn state and cancellation;
- every low-level `dd-eval` and lifecycle operation;
- progress from long-running operations;
- Stage, Work and child topology changes observed by reconciliation;
- HITL question, interaction-Judge launch/result and delivered answer;
- checkpoint and candidate creation;
- final-Judge launch, acceptance or rejection;
- usage/tool/timing reconciliation;
- retry, invalidation, failure, cancellation and finalization.

Every mutating operation records `requested`, then `started` when a provider
receipt exists, then exactly one terminal event. Stable operation IDs prevent a
restart from issuing the same productive prompt or finish command twice.

### Large and sensitive data

The normalized journal stores locators, hashes, sizes and sanitized summaries,
not large prompt bodies, source files, test logs, provider transcripts, binary
snapshots or secrets. Those remain in attempt-scoped artifact files and raw
driver journals with private permissions.

```text
attempt/events.jsonl                    normalized runner truth
attempt/drivers/<execution>/events.jsonl raw provider evidence
attempt/executions/.../DD_FLOW_HOME     flow lifecycle and usage truth
```

The final manifest indexes and hashes all three evidence layers.

### Recovery

`state.json` is a fast projection of `events.jsonl`, not an independent truth.
On resume the runner:

1. reduces the event journal;
2. compares the projection;
3. performs read-only driver and `dd-flow` reconciliation;
4. records any discrepancy;
5. continues from the first uncompleted safe operation.

It never treats missing final stdout as permission to repeat an operation. A
live provider turn remains live until the driver reports a terminal state or a
configured hard deadline is reached.

For an operation whose terminal receipt is missing, reconciliation chooses only
one of three results: a matching completed receipt is adopted; a live provider
turn remains pending; or an irreconcilable state invalidates the execution.
It never infers that it is safe to issue the operation again.

## Judgment and reporting

`judge.enabled` selects whether final judgment is part of the initial run.

When enabled, the runner creates a fresh Judge Session, deterministically
renders the existing assessment/candidate packet, validates the strict result
schema, accepts it unchanged and calculates scores in code.

When disabled, the execution finishes at `candidate_ready`. A later
`dd-eval runner eval judge` operates on the immutable candidate without rerunning
the Subject.

The Judge's semantic output is not deterministic. Deterministic properties are:

- immutable candidate evidence boundary;
- packet and methodology hashes;
- clean Judge Session;
- exact result schema;
- mechanical validation;
- score calculation;
- immutable acceptance receipt.

Finalization derives one JSON truth and Markdown projection containing:

- resolved profile and fixture identities;
- semantic and rendered context hashes;
- all Subject, child, interaction-Judge and final-Judge Sessions;
- stage boundaries and candidate artifacts;
- HITL questions, matches and failures;
- wall time, token classes, tool calls, retries and concurrency facts;
- context misses and limitations identified by judgment/analysis;
- infrastructure incidents and validity;
- trace, raw journal and artifact locators/hashes.

HTML/site publication remains an optional later presentation of the same
accepted report truth.

## Preserve from the current runbook

The deterministic runner must retain these established invariants:

- all non-Git data is below `DD_EVAL_HOME`;
- every execution has an isolated project, runtime and harness state;
- exact project/engine/flow-pack/profile inputs are frozen before launch;
- lifecycle commands are standalone and use explicit absolute paths and inline
  `DD_FLOW_HOME` where hook matching requires it;
- a running or quiet Subject is not interrupted without terminal evidence;
- only graph-ready Work may start and hard dependencies are enforced;
- expected HITL resumes the same Stage and Session;
- every completed stage boundary is captured before a successor starts;
- E2E records defects but does not repair or coach the live candidate;
- Subject and Judge context are isolated;
- candidate artifacts are immutable before judgment;
- provider tree, sessions, usage and tool calls are reconciled after all turns
  settle;
- focused, segment and E2E measurements remain separate;
- invalid infrastructure attempts are preserved but not scored.

## Operational walkthrough

### Walkthrough-derived execution invariants

The following constraints were checked by walking the procedure through as an
operator, a Subject and a restarted runner. They make the written workflow
executable rather than a sequence of implied manual decisions.

1. **One boundary, one owner.** `dd-flow` decides whether a Stage is running,
   paused, finished or invalid. The driver decides only whether its provider
   turn is live, terminal or failed. The runner never treats a chat reply as a
   completed Stage: it proceeds only from a reconciled lifecycle receipt.
2. **The launcher is the only initial instruction.** The runner must not send
   a warm-up prompt, a separate context-install command or a hand-written
   continuation. It records the generated launcher bytes before dispatch. The
   first Subject action is the standalone `stage start` command; all later
   stage-entry commands are returned by `dd-flow` and assembled by the runner
   from that receipt plus the next active slice.
3. **Every execution owns its mutable world.** An execution gets an exclusive
   attempt directory containing its project restore, routed workspace,
   `DD_FLOW_HOME`, driver state and event journal. Concurrent executions may
   share immutable content-addressed snapshot objects, but never a restored
   tree, a runtime database or a provider Session.
4. **A focused boundary is terminal by construction.** Its launcher names one
   target stage and its selected terminal boundary is that same stage. On its
   finish the runner captures evidence and stops; it does not send a successor
   command. A segment has one first focused-style restore, then continues only
   from its own preceding results. E2E has one initial restore and never
   substitutes a canonical downstream result.
5. **HITL is a registered pause, not an inferred question.** The same Subject
   Session remains attached to the same Stage. The runner supplies a response
   only after `dd-flow` has registered an allowed pause and the interaction
   Judge has selected an existing response. A plain-language question in a
   terminal message is preserved as evidence and fails as unregistered HITL;
   it is never silently answered.
6. **Recovery starts with observation.** Before issuing any mutating action,
   resume reduces the journal, inspects the provider and reconciles `dd-flow`.
   It may adopt a matching receipt, wait for a live turn, or invalidate the
   execution. It cannot reconstruct a lost prompt, stage finish or checkpoint
   by guessing.

These invariants are acceptance tests for both the runner and every harness
driver. They intentionally avoid provider-fork behavior: native forks can be
measured separately, but they never alter the normal focused-stage path.

### Step-through simulations and resolved gaps

The following short simulations are normative. They deliberately use ordinary
flow behaviour rather than an eval-only shortcut; an implementation is correct
only if each of them can be reconstructed from `events.jsonl` and the
`dd-flow` receipts.

#### A. Focused PLAN from an accepted boundary

1. The runner resolves `plan.json`, verifies the committed entry-pack and
   restores **only** the PLAN boundary into an attempt directory.
2. It verifies the project and runtime snapshot manifests before writing
   anything mutable.  The source paths in the semantic slice are then resolved
   under that restored attempt, never under the authoring checkout or a host
   `DD_EVAL_HOME` path.
3. It writes the exact stage-slice bytes once, records materialized, semantic
   and rendered hashes, opens an empty Subject Session and sends the launcher.
4. The Subject's first tool use is one standalone `dd-flow stage start`.
   Before this command exposes a `running` PLAN Stage or binds its coordinator,
   `dd-flow` copies the verified slice to the stage workspace and puts the
   rendered context at the beginning of the stage prompt.  A failed copy or
   hash check leaves no half-started Stage.
5. The Subject may read the paths granted by the rendered context, edit the
   pre-materialized PLAN artifacts and invoke the exact finish command.  A
   normal assistant message alone changes no runner state.
6. The runner observes a successful lifecycle finish receipt for **PLAN**,
   checks that its context receipt matches the launcher and captures the
   candidate.  It does not send PLAN-REVIEW in this focused execution.

This resolves two easy-to-miss ambiguities: context binding is an atomic part
of stage entry, and an entry-pack source reference is a *role resolved in the
attempt*, not a path to be read from the eval-definition checkout.

#### B. E2E through CODE with delegated Works

1. The runner restores only the initial E2E fixture and launches SPECIFY.  It
   never restores PLAN, CODE or review output from a focused entry.
2. After every `stage finish`, it records a boundary checkpoint before it
   creates the next Subject turn.  The next launcher is built from the live
   RUN and the next stage slice; its predecessor inputs therefore are the
   Subject's own outputs.
3. In CODE, `dd-flow` (not the runner) owns the Work graph.  The Subject may
   launch child workers, wait for graph-ready Work and run their declared
   checks.  The runner observes their Sessions, Work states, usage and tool
   evidence through reconciliation; it neither schedules a child nor guesses
   that a quiet child is stuck.
4. CODE can finish only when `dd-flow` reports the graph terminal and the
   stage's required verification gate has passed.  The runner treats a
   provider-terminal coordinator turn without that receipt as
   `incomplete_subject_turn`, not as a successful CODE result.

This keeps the runner small: it coordinates one evaluated Subject execution,
while the product flow remains responsible for concurrent Work and its gates.

#### C. Registered HITL and a runner restart

1. The Subject invokes the returned pause command.  `dd-flow` records the
   pause, exact Stage/Work identity and allowed interaction point; the Stage
   remains paused and its Session is retained.
2. The runner journals that receipt, gives the captured question plus the
   allowed response set to a clean Interaction Judge, and stores either the
   selected response identity or an unmatched failure.  It never creates a
   question catalogue by parsing ordinary prose.
3. On a successful match, the runner sends the exact `stage resume` command
   and response bytes to the **same** Session.  It does not resend `stage
   start`, reconstruct a prompt or make a new RUN.
4. If the host stops at any point, `runner resume` first reduces the journal
   and asks both harness and `dd-flow` for their read-only state.  It may adopt
   the recorded pause/finish, wait for a live turn, or invalidate the attempt.
   It never repeats a launcher, resume, finish or checkpoint merely because
   stdout was lost.

#### Mandatory reconciliation truth table

| Provider observation | `dd-flow` observation | Action |
| --- | --- | --- |
| live turn | any nonterminal lifecycle state | wait; do not interrupt from silence alone |
| terminal turn | registered allowed pause | invoke Interaction Judge; resume only after match |
| terminal turn | successful finish receipt for expected Stage | checkpoint/advance or capture candidate |
| terminal turn | running/paused without a corresponding registered receipt | preserve evidence and fail as incomplete/unregistered interaction |
| provider or lifecycle unavailable | state cannot be proved | invalidate as infrastructure; do not retry a productive action blindly |

The table is intentionally the common contract for Codex, ZCode and every
future harness.  A driver may expose richer provider events, but cannot weaken
these decisions.

### Create and promote an entry pack

1. The author commits a case skeleton plus `entry-pack-source/` containing the
   ordered task input map, stage-context source map, canonical responses and
   context-oracle drafts, along with the assessment and two profiles: reference
   build and context qualification.
2. `canonical build` allocates the next revision below `DD_EVAL_HOME`, freezes
   the project/engine/flow identities, writes its manifest/journal and creates a
   clean reference workspace.
3. It captures the E2E/SPECIFY entry before flow start, launches the declared
   reference Subject and sends a launcher whose standalone bootstrap
   `stage start` creates the RUN and installs the SPECIFY slice.
4. Expected reference HITL is resolved by a clean Interaction Judge selecting
   canonical response bytes. Unexpected/unmatched HITL stops the build for case
   authoring.
5. After each successful stage boundary the Subject stops. The operator accepts
   the reference result as a suitable predecessor; `canonical boundary accept`
   atomically captures the next entry and returns `canonical resume`. Only that
   separate resume creates a new turn in the same reference Session and sends
   the exact successor command. It continues until every declared entry exists;
   no provider Session becomes an input.
6. Mechanical gates mark the descriptors `candidate`. `canonical qualify`
   restores six isolated copies and runs the Codex Terra-high profile one stage
   at a time, then runs clean E2E.
7. Package gaps update only affected stage slices/entries. The runner marks
   dependent qualification receipts stale and reruns them; diagnostic Subject
   output never updates the reference chain.
8. A clean semantic review plus explicit human review accepts each entry.
9. Final `canonical accept` writes `entry-pack.json`, updates the sole
   `case.json.entry_pack` pointer and reports `promoted_pending_commit`.
10. The operator reviews, commits and pushes the dd-eval definition tree. A
    scored run is now allowed.

### Run one focused stage

1. `eval run` resolves the committed run profile, case pointer and accepted
   pack; preflight verifies the clean definition tree and all hashes.
2. The runner allocates an isolated execution, restores the selected stage
   snapshot and materializes a read-only path-bearing context slice. The initial
   SPECIFY entry has no RUN; every downstream entry restores one.
3. The driver creates an empty provider Session. Its first user message is the
   launcher packet.
4. The Subject runs the exact standalone `stage start` command, including
   `--bootstrap` only for the initial entry and always including the context
   file plus its expected hash.
   `dd-flow` installs the slice, binds dynamic roles to the restored
   canonical predecessor and returns the full rendered stage context.
5. The Subject completes exactly that stage. The runner waits for explicit
   terminal/interaction evidence, reconciles lifecycle and captures an
   immutable candidate at the focused boundary.
6. Optional judgment runs in a fresh Session. Finalization records result,
   context diagnostics, Sessions, time, usage, tools and trace.

### Run E2E

1. The runner restores only the initial E2E project/runtime state and installs
   no canonical downstream artifact.
2. The first SPECIFY bootstrap `stage start` creates the RUN and installs only
   the SPECIFY context slice in one operation.
3. After every stage finish, the Subject stops. The runner checkpoints the
   boundary, materializes the successor context slice and sends the exact
   next-stage command in the next turn, using the configured handoff Session.
   `stage start` resolves dynamic roles from that live RUN and the Subject's own
   preceding outputs.
4. Expected HITL resumes the same stage/Session through canonical response
   matching. Any unplanned HITL follows the configured failure rule.
5. Every stage boundary is checkpointed for evidence, but none is replaced by
   a focused fixture. At the declared terminal stage the runner captures one
   E2E candidate and may launch a fresh E2E Judge.

### Resume after interruption

`canonical resume` or `runner resume` reduces its append-only journal, compares
the state projection, inspects the provider and `dd-flow` read-only, and
continues from the first unfinished safe operation. A missing stdout packet,
quiet model or Controller restart never authorizes repeating a productive
prompt, stage finish, response delivery or checkpoint.

### Add another eval case

The author supplies a different case definition, task input, source mappings,
responses, oracles and profiles. The same build/qualification/run path queries
that case's selected flow pack and declared contour. No runner source change,
provider starter Session or multi-case registry is required.

## Runbook cutover

After implementation, replace `runbooks/execute-eval.md` with a short operator
procedure:

1. select and inspect a committed run profile;
2. run `dd-eval runner fixtures validate`;
3. run `dd-eval runner eval run --profile ...`;
4. watch `runner status` or the streamed event trace;
5. respond only to explicit canonical-acceptance or infrastructure attention;
6. optionally run deferred judgment;
7. inspect the deterministic final report.

Detailed lifecycle, failure and evidence rules remain in this specification and
code contracts; the operator is not asked to reproduce the state machine by
hand.

Rewrite `runbooks/create-eval-case.md` around `entry-pack-source/`, reference
artifact-chain capture, mechanical/semantic fixture acceptance and run
profiles. Remove canonical/frozen/starter Session creation and recovery. Its
operator path is: author case inputs/source → `canonical build` → inspect/status
→ `canonical qualify` → semantic reviews → `canonical accept` → commit/push.

Update `runbooks/harness-backends.md` to describe clean-Session focused entry
as the common scored path. Keep native fork documentation only under an
explicit session-continuity diagnostic.

Update `runbooks/eval-storage.md` to replace canonical Session and starter
retention with entry-pack revisions, pending-build journals and immutable
snapshot locators. Update specifications 001–003 and README only enough to point
active operation to this superseding contract; preserve their historical
rationale rather than rewriting history.

## Required implementation changes

### `dd-eval`

1. Add strict schemas:
   - `entry-pack.v1.schema.json`;
   - `stage-entry.v1.schema.json`;
   - `stage-context.v1.schema.json`;
   - `run-profile.v1.schema.json`;
   - `canonical-responses.v1.schema.json`;
   - `hitl-match.v1.schema.json`;
   - normalized runner-event validation.
2. Introduce the next strict case schema with one `entry_pack` pointer and no
   starter-session, canonical-Session, `canonical_checkpoints` or per-stage
   flow-instruction fields.
3. Replace permissive scenario hashing with run-profile validation and resolved
   manifest expansion.
4. Add canonical entry-pack build, review and acceptance services with a
   resumable build journal and candidate qualification operation.
5. Restore focused executions from stage entries and always create an empty
   Subject Session.
6. Implement the small runner reducer, async semaphore pool, status, resume and
   cancel commands.
7. Add interaction-Judge packet/render/validate/deliver flow.
8. Add append-only CloudEvents JSONL, operation IDs and recovery reconciliation.
9. Extend final reports with package, HITL, trace, concurrency, context-miss and
   complete Session/usage/tool evidence.
10. Remove active canonical Session, starter registry and provider-fork
    requirements in one cutover; do not retain a fallback executor.
11. Add `dd-codex` or consume its completed JSON driver contract.
12. Migrate `sdlc-eval-2026-summer-task-priority` to Task Priority SDLC Entry
    Pack, including six focused entries, the E2E entry, context oracles and
    semantic HITL responses.
13. Add its Codex `gpt-5.6-terra` high qualification profile and require its six
    focused receipts plus clean E2E receipt before pack acceptance.

Keep `lib/dd-eval.mjs` as the small public facade. Move only the new cohesive
implementation units into `lib/entry-pack.mjs`, `lib/runner.mjs` and
`lib/runner-events.mjs`; existing harness drivers remain separate. Do not add a
dependency-injection framework, plugin loader or class hierarchy.

### `dd-flow-cli`

1. Define one path-independent stage-context data model.
2. Implement one renderer used by `stage start` and read-only fixture
   validation.
3. Add `stage start --context-file --context-sha256`: validate the explicit
   expected hash, copy the normalized active-stage slice into the Stage
   workspace before state transition and reject a different replacement for
   that Stage after installation. Support this atomically in both bootstrap and
   existing-RUN forms. Every runner-managed stage start supplies its own slice.
4. Extend trusted bootstrap matching to the new exact command shape, require
   session binding and materialize ordered intake from the SPECIFY slice
   without a duplicate intake argument.
5. Return the complete structured context, exact commands, bound-source receipt
   and semantic-package receipt from `stage start`.
6. Add read-only stage-context inspection only if `dd-eval` cannot validate the
   same renderer through an existing service boundary.
7. Ensure snapshot restore preserves project, routed workspace, RUN variables,
   flow flags, normalized SQLite/domain state, engine binding and target-stage
   state, then regenerates projections.
8. Expose stable reconciliation/progress receipts required by runner events.
9. Keep provider lifecycle/usage ingestion in existing harness adapters; do not
   move physical Session control into `dd-flow`.

### Harness drivers

1. Normalize doctor/create/prompt/inspect-wait/cancel/close receipts.
2. Add `dd-codex` against the supported Codex app-server/SDK contract.
3. Preserve raw append-only per-execution journals and observed profiles.
4. Report actual terminal and interaction states; inspect must remain
   non-mutating.
5. Enforce one productive operation per owned root tree unless native
   concurrency isolation is proven.

## Implementation sequence and cutover

1. **Freeze contracts.** Add the strict schemas, canonical serializer, driver
   receipts and runner event envelope with conformance tests.
2. **Make stage context portable.** Refactor `dd-flow` to one stage-context
   model and renderer, then prove equal semantic hashes across restored roots.
3. **Normalize harness control.** Bring existing drivers to specification 014
   receipts and implement `dd-codex`; do not add fork as a baseline
   requirement.
4. **Build fixture services.** Implement snapshot capture/restore, reference
   chain progression, mechanical review and explicit semantic acceptance.
5. **Build the runner.** Add manifest resolution, the reducer, serialized event
   writer, operation deduplication, bounded concurrency, status/resume/cancel
   and deterministic reporting.
6. **Add semantic HITL.** Implement the clean interaction-Judge packet, strict
   response-ID validation and exact-byte delivery to the same stage.
7. **Cut over one case.** Rebuild one complete fixture revision, run a focused
   stage on a forkless and fork-capable harness, then run E2E and deferred
   judgment.
8. **Replace operator documentation.** Shorten `execute-eval.md`, rewrite
   `create-eval-case.md`, update `harness-backends.md`, and delete active
   starter/frozen-Session fields and commands in the same release.

The cutover is atomic for routine execution. Do not keep a compatibility flag,
legacy reader or fallback to the former starter registry. Historical artifacts
remain readable through Git history and need no runtime support.

## Test plan

### Unit

- strict schema acceptance/rejection;
- authoring/runnable case invariants and interrupted promotion recovery;
- entry-pack completeness, sole-pointer resolution and immutable acceptance;
- rejection of acceptance without required qualification receipts;
- path containment and deterministic semantic hashing;
- portable runtime scrubbing preserves flow graph/results while removing
  reference Session, hook and usage state and regenerating projections;
- context rendering with different absolute roots but the same semantic hash;
- bootstrap and existing-RUN stage-slice installation with an explicit
  expected hash, same-hash reuse and different-hash replacement rejection;
- rejection of an initial entry with a RUN or a downstream entry without one;
- rejection of generated reference RUN/protocol/Work identifiers in a dynamic
  role mapping;
- identical hook/CLI fingerprints for bootstrap commands with context flags,
  plus hard failure when trusted binding is absent or ambiguous;
- exact ordered intake materialization from the SPECIFY slice with no duplicate
  intake source;
- runner reducer transitions and illegal transitions;
- operation deduplication and event reduction;
- interaction-Judge result validation and exact response assembly;
- `incomplete_subject_turn` and `unregistered_hitl` classification without
  semantic string matching;
- semaphore limits and cancellation;
- secret/large-body exclusion from normalized events.
- rejection of captured secrets, host caches and hidden control paths from
  Subject-readable roots.

### Integration

- capture and restore every supported stage entry into a fresh directory;
- prove focused binding resolves canonical predecessors while E2E binding
  resolves the live Subject's predecessors from the corresponding slice of the
  same blueprint;
- build a second minimal case with a different focused-stage subset to prove
  the runner has no task-priority or six-stage branch;
- launch the same focused fixture through each supported harness with an empty
  Session;
- prove identical semantic package hashes and only allowed rendered
  differences;
- expected paraphrased HITL question matches the canonical response;
- unmatched and out-of-stage HITL fail with complete evidence;
- restart the runner during materialization, provider wait, checkpoint and
  judgment without duplicate productive operations;
- run independent harness executions concurrently within configured limits;
- complete deferred judgment against an immutable candidate;
- reconcile full Session tree, token classes, tool calls and wall time.

### Context-quality validation

For every stage:

1. run at least one clean-Session focused diagnostic;
2. inspect transcript/tool events for rediscovered facts, paths and commands;
3. classify genuine context misses separately from legitimate research and
   redundant model behaviour;
4. update and reaccept the fixture when a required source was omitted;
5. retain the finding in the fixture review and context oracle.

### E2E

- build the complete accepted Task Priority SDLC Entry Pack;
- run clean focused qualification tests for SPECIFY, PROTOCOLIZE, PLAN, PLAN-REVIEW,
  CODE and CODE-REVIEW with Codex Terra high and inspect their context
  diagnostics;
- execute focused stages on at least one forkless and one fork-capable harness;
- execute one uninterrupted E2E contour;
- run optional final judgment;
- produce deterministic JSON/Markdown protocol and verify it can be rebuilt
  from the manifest, artifacts and event trace.

## Acceptance criteria

The specification is implemented when:

1. routine focused evals create no canonical, frozen or starter provider
   Sessions;
2. the same accepted stage entry launches a new empty Session in all declared
   harnesses;
3. semantic package hashes are harness-neutral and mechanically verified;
4. `stage start` provides enough context that no prior conversation is required;
5. expected HITL is matched semantically to existing canonical responses and
   no code compares question wording;
6. unexpected or unmatched HITL fails the execution and preserves complete
   evidence;
7. one run profile can request focused, segment and E2E cells plus optional
   judgment;
8. independent executions obey explicit global/per-harness concurrency;
9. a host restart resumes without duplicate prompt, stage finish or checkpoint;
10. `events.jsonl` and referenced artifacts reconstruct every runner action and
    final report fact;
11. the ordinary operator runbook contains runner commands rather than a manual
    lifecycle procedure;
12. no active compatibility or fallback path depends on the former starter
    registry;
13. Task Priority SDLC Entry Pack contains one accepted E2E entry and all six
    accepted focused-stage entries;
14. another case with a different contour can build and run without changing
    runner code;
15. all six Task Priority focused entries have Codex Terra-high qualification
    receipts and reviewed context diagnostics;
16. E2E stage starts bind only the current blueprint slice to live Subject
    outputs and cannot read canonical downstream artifacts or future slices.

## Out of scope

- deterministic model or Judge answers;
- distributed scheduling across machines;
- a persistent runner service;
- a SQLite eval registry as source of truth;
- a dynamic harness plugin marketplace;
- automatic semantic selection of relevant project documents;
- a multi-case suite scheduler before more than one case must be launched as a
  single operation;
- automatic authoring of missing canonical product decisions;
- model-written context-miss self-assessment;
- native-fork cache/continuity comparisons in routine focused scoring;
- MERGE-stage modernization beyond the case's currently declared contour.
