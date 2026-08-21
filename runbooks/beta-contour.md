# Beta flow and engine contour

This runbook defines the shortest controlled loop for changing the project
`dd-flow` pack and `dd-flow-cli`, exercising them in `dd-tasks`, and promoting
only proven changes to the Memory Bank canon.

## Active eval-controller boundary

Use the canonical checkpoint lifecycle in
[the eval execution runbook](execute-eval.md) for the active summer suite.
Keep every non-Git beta eval artifact below `DD_EVAL_HOME`, following the
[storage runbook](eval-storage.md).
Run it from a
visible Desktop Controller task, not `codex exec`; keep the engine binary and
flow pack as an explicit matched pair, and use absolute paths for both.

1. `dd-eval validate` checks the case and checkpoint before any workspace is
   made.
2. `dd-eval prepare` restores the selected canonical project/RUN stage-entry
   checkpoint through the matched `dd-flow` engine. Do not copy `DD_FLOW_HOME`
   or reconstruct predecessor stages from semantic fixtures.
3. Resolve and fork the current starter Subject Session, then record
   starter/child Subject
   and fresh Judge Session IDs with `dd-eval session
   add`; then use `dd-eval sync` to collect engine-owned session and usage
   projections. The worker never supplies identity itself.
4. Stop at the declared stage boundary, `checkpoint` its declared artifacts,
   run a read-only Judge, accept its schema-valid result, then `finalize`.

An unaccepted checkpoint or assessment is deliberately not runnable. Build and
independently accept the canonical chain before comparing a Subject profile.

## Eval modes

Use one of three explicitly named modes; do not mix their evidence or score them
as if they measured the same thing.

### Focused stage eval

A **focused stage eval** measures exactly one stage: `SPECIFY`,
`PROTOCOLIZE`, `PLAN`, or `PLAN-REVIEW`.

- Give the Subject a fresh fork of that stage's starter Session and a restored
  copy of the paired canonical project/RUN checkpoint. The Subject stops immediately after the
  target stage finishes; it does not enter a successor stage.
- Give the Judge a separate fresh fork of the canonical Judge priming session,
  then only that stage's candidate packet, the shared methodology and the
  applicable `assessment.json` scope.
- Every focused stage starts from its own accepted canonical entry checkpoint.
- A focused result therefore measures the stage's own grounding, decisions,
  artifacts and handoff—not the quality of work done before it.

Before sending either stage packet, record both starter parent and evaluated child in
`dd-eval session add`, and verify that the fork has a different Session ID and
its `parent_session_id` is the current starter Session ID.

### Contiguous segment eval

A **segment eval** starts from the canonical checkpoint for the first stage and
executes one contiguous range, for example `PLAN → PLAN-REVIEW`, in the same
Subject attempt. Capture every stage boundary before continuing. Each included
stage receives a separate fresh Judge fork. No canonical intermediate result is
inserted inside the segment.

### E2E integration eval

An **E2E integration eval** measures one uninterrupted Subject flow over a
declared contour. For the summer case that contour is
`SPECIFY → PROTOCOLIZE → PLAN → PLAN-REVIEW`, stopping at
`plan_review_accepted` before `CODE`.

- Fork the current `specify-entry` starter Subject Session, send the normal user
  trigger, and let it carry the working context through the contour.
- Fork one independent Judge session, then give it the aggregate
  candidate package after the Subject stops.
- E2E evidence evaluates legal transitions, cross-stage handoff and the
  resulting integrated plan. It is not a substitute for the focused evidence
  of any individual stage.

Run focused stage evals while evolving one stage, segment evals for a particular
handoff, and E2E integration evals when the whole contour or matched
engine/flow-pack pair is the subject of the test.

The beta contour is for flow and engine development. It does not replace the
published-release eval: after promotion, one control run must use only released
artifacts.

## Invariants

- `dd-tasks/main`, `dd-flow-cli/main`, and `dd-memorybank/main` remain stable.
- Flow experiments happen in a `dd-tasks` beta branch. Engine experiments
  happen in a `dd-flow-cli` beta branch.
- The globally installed `dd-flow` remains the stable router. The router selects
  an immutable locally installed beta engine from the existing engine store.
- A RUN uses one exact engine version and immutable engine binding.
- Every evaluated input is an immutable commit and annotated tag. A failed
  beta tag, engine snapshot, checkpoint, or RUN is never rewritten.
- Product code remains at the chosen product baseline unless product behavior
  is itself the subject of the eval.
- Canon is changed only after a beta iteration passes its mechanical and
  semantic gates.

No separate beta router, engine store, flow overlay, `develop` repository,
runner, or configuration format is required.

## Repositories and truth ownership

| Repository | Beta responsibility | Stable responsibility |
| --- | --- | --- |
| `dd-tasks` | executable project-local flow pack and its beta input commit | accepted application and released Memory Bank state |
| `dd-flow-cli` | engine code, tests, prerelease package version, local engine snapshot | published router/engine package |
| `dd-eval` | beta bundle specifications, immutable checkpoints, harness profiles, controller inputs, results and this runbook | comparison history and eval procedure |
| `dd-memorybank` | none during the experimental loop | canonical flow, schemas, specifications, protocols and release history |

The stage RUN and engine binding remain runtime evidence owned by `dd-flow`.
`dd-eval` records and archives enough of that evidence to make the comparison
independent of mutable working directories.

## Naming and versions

Use one long-lived beta branch per release line and immutable tags per tested
iteration:

```text
dd-tasks branch:       beta/mb-3.2
dd-flow-cli branch:    beta/engine-0.7

dd-tasks tag:          eval-mb-3.2.0-beta.3
dd-flow-cli tag:       eval-engine-0.7.1-beta.3
eval bundle id:        mb-3.2.0-beta.3
```

`memory_bank_version` remains the installed stable base (`3.2.0`). The
project-local `manifest.json` may use `pack_version: 3.2.0-beta.1` to identify
the experimental pack. Keep its canonical source metadata pointing to the
3.2.0 origin; the exact experimental contents are identified by the
`dd-tasks` commit and tag in the eval checkpoint.

The engine package uses valid SemVer prereleases. Do not publish
`0.7.0-beta.1` after `0.7.0` already exists: use the next intended version,
for example `0.7.1-beta.1` for a compatible fix or `0.8.0-beta.1` for a
breaking contract change.

The bundle iteration and component prerelease numbers do not have to match.
If beta.2 changes only the flow, retain the already proven engine version and
record that exact pairing. Never rebuild changed engine code under an old beta
version; increment its prerelease number so engine resolution is unambiguous.
Input checkpoints are immutable: never change an existing checkpoint ID to
point at a different flow or engine commit. Create the next checkpoint when the
pair changes, even if the model and product baseline are unchanged. Profiles
describe only the harness/model/reasoning selection; they are not a second
source of engine identity.

## Beta specification bundle

Every beta bundle is defined by a small, version-local set of specifications in
`dd-eval`:

```text
beta/<bundle-id>/
  index.md
  specs/
    001-<change>.md
    002-<change>.md
```

`index.md` is the bundle manifest. It records the stable bases, intended
`dd-tasks` and `dd-flow-cli` refs, and the ordered list of included specs. A
spec records only what is needed to implement and evaluate one coherent
change:

- problem and evidence from prior RUNs;
- desired engine, flow or harness behavior;
- owning repository and affected contract surface;
- acceptance checks;
- eval evidence required to accept the change.

The numbers are local to the bundle. They are not canonical `SPC-*` ids and do
not consume the Memory Bank specification sequence. If a beta change is
accepted for release, it is reconciled into the normal canonical specification
and protocol during promotion.

Beta specs are design and acceptance documents, not executable Memory Bank
protocols. Implement them interactively on the beta branches with the smallest
relevant tests. Do not run the long `protocol -> specify -> plan -> code` flow
to develop the beta runtime itself. Evals of the resulting runtime still use
normal dd-flow protocols, RUNs and stages; this keeps development overhead out
of the behavior being measured.

Do not add a beta changelog. The bundle specs state intended behavior,
`index.md` states the exact bundle composition, Git records implementation,
and each result `analysis.md` records observed behavior.

## 1. Start a beta line

Create beta branches or worktrees from the stable commits being tested:

```sh
git -C /path/to/dd-tasks switch -c beta/mb-3.2
git -C /path/to/dd-flow-cli switch -c beta/engine-0.7
```

Record the two base commits in the first beta result analysis. They define the
cumulative delta that will later be promoted. Existing repository worktree
commands may be used instead of switching the primary checkout.

In `dd-tasks`:

- edit the real `.memory-bank/dd-flow/` files used by the agent;
- keep `.memory-bank/index.md` at the installed stable Memory Bank version;
- set `.memory-bank/dd-flow/manifest.json` `pack_version` to the beta pack id;
- pin `.memory-bank/dd-flow/compatibility.json` `engine.version_range` and
  `engine.recommended_version` to the exact beta engine version;
- leave product code unchanged unless the eval explicitly tests product code.

An exact engine pin is required. A broad range such as `>=0.7.0 <0.8.0` can
select a different installed snapshot and invalidates the beta run.

## 2. Make and record corrections

Start from a concrete failed RUN or review finding. Classify each problem as:

- `engine`: deterministic CLI behavior, storage, routing, validation or report
  generation;
- `flow`: agent instruction, prompt composition, lifecycle or semantic
  contract;
- `harness`: permissions, hooks, real session identity or transcript access;
- `model`: behavior despite an unambiguous and functioning contract.

Fix the root cause in the owning repository. Add the smallest test that fails
before the engine correction and passes after it. Flow-only wording changes do
not need synthetic code tests, but the next bounded eval is their required
executable check.

Before building changed engine code, set `dd-flow-cli/package.json` to a new
unique prerelease version in a beta-only metadata commit. The build metadata,
engine manifest and project compatibility pin must all report that same
version. Beta engines are installed locally; publishing them to npm is not
part of this contour.

Use normal Git commits. Keep beta-only version/pin metadata separate from
functional commits when practical; this makes promotion easier. Update the
bundle specs when an implementation decision changes the intended contract;
do not turn them into a chronological work log. The result `analysis.md` for
each iteration is the observed-result record and must contain:

```text
beta bundle id
stable base commits
tested dd-tasks and dd-flow-cli commits/tags
candidate changes, grouped by engine / flow / harness
local checks and their results
eval verdict
new findings and findings carried to the next iteration
context misses found by post-run review
```

Git history supplies file-level detail. The analysis explains intent and
observed behavior.

## 3. Build and install a beta engine

Use the normal package build and existing engine installer. The beta
`dd-tasks` checkout supplies the flow metadata embedded in the build:

```sh
cd /path/to/dd-flow-cli
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test

DD_FLOW_BUILD_CANON_ROOT=/path/to/dd-tasks-beta \
DD_FLOW_BUILD_CANON_VERSION=3.2.0-beta.1 \
DD_FLOW_BUILD_STRICT_CANON=1 \
pnpm build

node ./dist/cli.js engine install --json
```

Each prepared eval has one explicit, isolated `DD_FLOW_HOME`. Install the
selected engine snapshot into that same home and use it for every `dd-flow`
command issued during that eval. The home is part of the frozen harness input:
it prevents state from another run being mistaken for this run's binding,
usage or artifacts.

Run all project commands through the globally installed stable router, not by
calling `dist/cli.js` directly. Confirm selection before preparing an eval:

```sh
dd-flow engine resolve --project-root /path/to/dd-tasks-beta --json
dd-flow engine doctor --project-root /path/to/dd-tasks-beta --json
```

The resolved package version must equal the exact beta pin. Record its
`snapshot_root` and integrity checksum. A missing, broad, stable, unhealthy, or
unexpected selection stops the run before an agent is launched.

For an eval that measures agent usage or token accounting, make session binding
a launch gate rather than a best-effort diagnostic. Its controller's first
command uses `stage start --require-session-binding`; the installed PreToolUse
hook must append a trusted event and the start receipt must report `bound`.
Run one real, minimal Codex task smoke after restarting the client whenever a
hook configuration or runtime is changed. A unit test proves the CLI boundary;
only this smoke proves that the active client delivers hook events.

Before freezing, run the schema parity check for every schema changed in both
the engine and flow pack. A RUN-bound engine is authoritative at runtime, so a
project copy must match it; no fallback to the project schema is allowed. The
engine's regression suite must include a deliberately stale project copy.

## 4. Freeze an eval input

Before tagging, require clean beta worktrees and passing local checks. Create
annotated tags and push the beta branches and tags:

```sh
git -C /path/to/dd-tasks tag -a eval-mb-3.2.0-beta.1 -m "EVAL flow beta 1"
git -C /path/to/dd-flow-cli tag -a eval-engine-0.7.1-beta.1 -m "EVAL engine beta 1"
git -C /path/to/dd-tasks push origin beta/mb-3.2 eval-mb-3.2.0-beta.1
git -C /path/to/dd-flow-cli push origin beta/engine-0.7 eval-engine-0.7.1-beta.1
```

Verify the `dd-tasks` diff from its recorded stable base. For a flow-engine
eval, every changed path must be under `.memory-bank/dd-flow/`; any other path
must be explicitly declared and changes `product_code_changed` to `true`:

```sh
git -C /path/to/dd-tasks diff --name-only \
  <stable-dd-tasks-commit>..eval-mb-3.2.0-beta.1
```

Create a new immutable checkpoint JSON in `dd-eval/checkpoints/`, for example
`cp-002-mb-3-2-0-beta-1.json`. It records:

- the `dd-tasks` beta tag, commit and annotated tag object;
- the unchanged product baseline commit and `product_code_changed: false`;
- stable Memory Bank base version;
- beta flow pack id and source commit;
- selected beta engine version and `dd-flow-cli` commit/tag.

Set that checkpoint's id as the case's sole `checkpoint.id`. Never repeat the
pair's version, tag or SHA in `case.json`, scenarios or profiles, and never
edit an old beta checkpoint to point at a newer commit.

Use an existing harness profile shape. Its CLI path remains the stable global
router. The exact selected engine comes from the input checkpoint and is
verified against the actual RUN's generated immutable `engine-binding.json`.

This checkpoint approach deliberately reuses `dd-eval validate` and
`dd-eval prepare`; no beta overlay or new prepare flags are needed.

## 5. Prepare and launch the eval

Use the case's normal controller prompts and a new output directory:

```sh
node ./bin/dd-eval.mjs validate \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-3-2-0-beta-1 \
  --source /path/to/dd-tasks

node ./bin/dd-eval.mjs prepare \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-3-2-0-beta-1 \
  --profile <profile-id> \
  --track planning \
  --source /path/to/dd-tasks \
  --output /path/to/dd-eval-runs/<case>/<unique-run-name>
```

Before launch, retain the adjacent `*.run.json`, rendered controller prompt and
successful `engine resolve` output. `dd-eval prepare` writes the initial user
request verbatim under ignored `.tasks/dd-flow/intake/` after creating the
immutable `eval-input` commit; it records the path and SHA-256 in the manifest.
It also renders the selected controller prompt beside the materialized
repository, replacing only the repository and intake paths. Launch one new
harness task against the materialized
repository. Do not expose hidden clarification, reference, review or acceptance
materials to the evaluated agent.

For a native fork, preserve the complete harness profile as well as the
conversation context. `fork_thread` creates the child context but does not
accept model settings. Send the case's exact trigger as the child's first and
only message through `send_message_to_thread`, explicitly setting `model` and
`thinking` from the selected profile. Thus the trigger text stays comparable
while the child is pinned to the measured model and reasoning effort. If the
harness UI reports a different effective profile, stop before scoring and
archive the RUN as `invalid_harness_profile`; do not relabel it as the intended
model.

The Desktop full-access harness cannot make this boundary an OS security
control. Its stage prompt must prohibit reads of other RUNs, transcripts,
reviews and prior results, and the reviewer must audit the transcript for such
reads. A run that reaches them is invalid for model comparison. Use a separate
OS user, container or VM when hard filesystem isolation is required.

### Eval numbers and Desktop session titles

Before `prepare`, reserve the next monotonic `EVAL-<NNN>` number under
`dd-eval-runs/`; do not reuse it after a failed or infrastructure-invalid
attempt. The same number names the output directory, manifest archive and all
Desktop tasks for that launch.

Every created Desktop task gets a title at launch. Use this stable, sortable
form:

```text
E<run-number> · <case-id> · a<attempt> · <model>-<thinking> · <scope> · <role>
```

Examples:

```text
E013 · sdlc-eval-2026-summer-task-priority · a01 · luna-xhigh · flow · controller
E013 · sdlc-eval-2026-summer-task-priority · a01 · luna-xhigh · specify · subject
E013 · sdlc-eval-2026-summer-task-priority · a01 · sol-high · specify · judge
```

- `flow · coordinator` is a long-lived parent session that may cross several
  stages; do not rename it on each transition.
- A fresh worker uses its owned stage as `<scope>` and its deterministic role
  (`reviewer-01`, `coder-02`, and so on).
- Capacity probes are visible but never registered as Works. They are strictly
  disposable: launch the one concurrent burst, observe the limit, then cancel
  every unfinished probe and close/delete every finished probe task that the
  Desktop harness permits before any productive worker starts. A probe may
  never remain live and consume capacity for reviewer or CODE work.
- Increment `a<attempt>` for a retry of the same `EVAL-<NNN>` launch. Never reuse a title for a retry
  or an infrastructure-invalid run.

The full immutable case id, RUN id, Desktop task id and model profile stay in
the run manifest and collected result; the title is an operator-facing index,
not an identity contract.

### Focused-stage controller tactic

`prepare --focus <stage>` restores that stage's canonical entry checkpoint and
writes `executions/focus-<stage>/attempt-01/prompts/controller.md`.
The Controller follows it in addition to the role prime:

1. Fork the latest completed state of the current starter Subject Session,
   select the requested profile, record the parent/fork IDs, then send the exact
   generated `subject.md` continuation. Do not add assessment, golden or scoring
   hints.
2. Tell the Subject only the harness boundary: after a successful finish of
   the focused stage, stop; the Controller owns the checkpoint and does not
   let it start a later stage.
3. As soon as the finish receipt is available, run `dd-eval sync` and then
   `dd-eval checkpoint` before sending any follow-up. This copies the declared
   candidate artifacts from the finished stage, not a later mutable RUN state.
4. If a later stage is prepared, starts, or mutates the candidate before that
   checkpoint, preserve the attempt as `invalid_infrastructure_flow`; do not
   repair it in place or score it as a focused-stage result.
5. Start the clean Judge only from an accepted assessment. With a draft assessment,
   a read-only diagnostic may be useful, but it is explicitly non-official and
   must never be accepted as the Judge score.

The controller prompt is only a bootstrap instruction: after creating a Goal
when the harness requires one, the agent's first flow action is the exact
`stage start` command. It does not run standalone priming, CLI help, Git or
compatibility discovery first. The rendered `worker_prompt_markdown` returned
by `stage start` is the complete stage prompt and includes the bounded priming,
project grounding, task intake, write boundary and finish contract needed for
that stage.

### Hook-safe command form

Codex runs `PreToolUse` hooks in a separate process. A shell-level
`export DD_FLOW_HOME=...` is not inherited by that process, even though the
following `dd-flow` command itself sees the export. Therefore every eval
command that invokes `dd-flow` **must** carry the isolated home as an inline
prefix on that exact command:

```sh
DD_FLOW_HOME="<eval-dd-flow-home>" dd-flow <command> ...
```

Do not rely on a preceding `export`, a shell profile, an alias, or a compound
pipeline. For bootstrap intake, put the prefix before `dd-flow` and feed the
heredoc by redirection rather than `cat |`:

```sh
DD_FLOW_HOME="<eval-dd-flow-home>" dd-flow stage start \
  --bootstrap --stage specify --project-root "<materialized-project>" \
  --subject "<slug>" --intake-stdin --json <<'USER_INTAKE'
<verbatim discussed user request>
USER_INTAKE
```

This is an operational harness rule, not stage guidance: the evaluated worker
still receives only the ordinary project task and flow instructions. The
launcher or generated flow command supplies the prefix. A missing trusted
binding is an infrastructure-invalid run; never recover it by manually adding
a session id or editing runtime state.

Debug in the smallest useful stage:

1. repeat only incomplete-input SPECIFY until its mechanical and semantic gate
   passes;
2. then run clarification plus PLAN;
3. run CODE only after the planning contour is reliable.

Do not pay for a downstream stage to rediscover an upstream engine or flow
defect.

## 6. Evaluate the result

Evaluate mechanics before semantics.

### Mechanical gate

- the resolved and RUN-bound engine version/checksum match the frozen beta
  input;
- the intended project root, protocol, RUN, stage and attempt were used;
- the actual harness orchestrator session is bound and session/usage coverage
  is honest (`partial` or `unavailable` is allowed; false `complete` is not);
- the requested stop state is represented by one documented CLI outcome;
- stage reports, timeline, timing and required evidence exist and validate;
- no forbidden later stage, merge, deploy or hidden input access occurred;
- the lifecycle machine leaves the RUN in the declared waiting or terminal
  state and the controller stops the harness task without rewriting that state.

An engine, flow, or harness failure makes the run invalid for model-quality
comparison. Preserve it as beta debugging evidence; do not repair its SQLite,
JSON, report, or Git state by hand.

### Semantic gate

- the agent read the bounded applicable rules and project facts;
- questions, specification or plan cover the intended gaps;
- conclusions are grounded in named evidence;
- the output is complete enough for the next declared stage;
- unnecessary work and repeated calls are identified separately from material
  quality defects.

The analysis must prioritize defects as `critical`, `high`, `medium`, or `low`
and state the most likely cause. Distinguish contract-induced behavior from a
model failure.

`context_misses` is a reviewer/controller finding, never an evaluated-agent
artifact. Record a miss when the transcript shows that required context was
absent, late, misleading or repeatedly rediscovered. If the same deterministic
fact is required by contract or independently rediscovered in at least two
RUNs, move it into the appropriate `stage start` packet in the next beta spec.
Do not ask the evaluated agent to assess its own context packet.

Normal stage completion is owned by `stage finish`. A material user question
uses `stage pause`, which returns the exact `stage resume` command, including
the selected `DD_FLOW_HOME` when it is non-default. The agent asks the returned
user message and stops. On the next Turn it passes the raw user answer to
`stage resume` before interpreting it; that command stores the answer and
returns the continuation packet for the same stage, Work and attempt. The
evaluated agent never calls `run complete`. That command is currently a
controller-only manual override despite its historical name; use it only to
terminate an infrastructure-invalid or deliberately aborted RUN, always with
an explicit verdict.

For an infrastructure-invalid run, stop its sessions and apply the manual
controller override:

```sh
dd-flow run complete <RUN-ID> \
  --project-root <run-repository> \
  --status cancelled \
  --verdict invalid_infrastructure_flow \
  --next-action none \
  --json
```

Run `dd-flow cleanup scan --project-root <run-repository> --json` before
archiving. Do not rewrite the semantic protocol/stage result merely to make the
controller envelope terminal.

## 7. Collect and archive comparison evidence

Run `dd-eval collect` with the harness transcript and available timeline,
usage and flags. Store the compact reviewed result in:

```text
dd-eval/cases/<case>/results/<run-id>/result.json
dd-eval/cases/<case>/results/<run-id>/analysis.md
```

The analysis records the beta change list, verdict, timings, session coverage,
engine binding identity, material findings and archive location.

### Session identity is mandatory

Every committed result or analysis must record the real session IDs for **all**
agent sessions that contributed to the RUN, including the role and stage range
of each one. Record the materialized repository path beside them. For example:

```text
- SPECIFY session: `<id>`
- PROTOCOLIZE session: `<id>`
- materialized repository: `dd-eval-runs/<case>/<run>`
```

Obtain the authoritative list with `dd-flow stat run sessions ls --run
<RUN-ID> --project-root <run-repository> --json`; do not infer IDs from a
model report. This is required so a reviewer can reopen the Codex sessions,
locate their JSONL transcripts, and reconcile usage with the stored RUN.

Keep bulky forensic artifacts outside Git under one immutable archive
directory:

```text
dd-eval-runs/<case>/archive/<run-id>/
  repository/
  prepare.run.json
  flow-run/
  transcript.jsonl
```

`flow-run/` is a copy of the RUN home containing `run.json`,
`engine-binding.json`, `timeline.jsonl` and generated stage reports. Record
SHA-256 values for the transcript and preparation manifest in `result.json` or
`analysis.md`. Remove or redact secrets before retention; do not commit raw
transcripts or runtime databases to `dd-eval`.

Comparability requires this complete tuple:

```text
product baseline + dd-tasks beta commit + flow pack id
+ dd-flow-cli beta commit + engine version/checksum
+ controller material hashes + harness/model profile
+ transcript hash + RUN reports + review verdict
```

## 8. Iterate

For a failed beta:

1. preserve and close the failed RUN;
2. add its findings to that iteration's `analysis.md`;
3. update or add the owning bundle spec, then change only the owning
   engine/flow/harness component interactively;
4. increment the changed component beta version and the bundle iteration;
5. install a new engine snapshot only if engine code changed;
6. create new tags, checkpoint and RUN.

Unchanged proven components retain their previous exact refs. Never move a tag,
reuse an output directory, mutate an engine binding or overwrite a result.

## 9. Promote accumulated beta work to canon

Promote from the last accepted beta tag, not by replaying every experimental
iteration. The cumulative diff from the recorded stable base to that tag is
the candidate change set; failed intermediate commits remain useful history but
do not define release scope.

1. Confirm the accepted result has passed both gates and identifies every
   engine and flow commit in scope.
2. Inspect cumulative changes with `git log` and `git diff` from the recorded
   base commits to the accepted beta tags.
3. In `dd-memorybank`, create the normal specification/protocol for the proven
   behavior and link the accepted beta evidence.
4. Transfer the cumulative semantic `.memory-bank/dd-flow/` changes from
   `dd-tasks` to the matching canonical paths. Do not promote project-local
   beta `manifest.json`, exact engine pins, local paths or beta notes as
   canonical truth.
5. Transfer engine functional commits to the normal `dd-flow-cli` release
   branch. Exclude beta-only package-version/pin commits; add the normal
   changeset and final package version there.
6. Reconcile shared schemas, examples, generated assets and compatibility
   metadata in their canonical owners. Run the full canonical lint/test/build
   checks.
7. Release the engine when the new canonical flow requires it, then release
   Memory Bank with compatibility pointing to the published engine.
8. Upgrade `dd-tasks/main` through the normal Memory Bank upgrade flow and
   create its immutable released checkpoint.
9. Repeat the smallest control eval using only published versions. This final
   run proves promotion fidelity; it is the release comparison result.

If several accepted beta bundles contributed to the release, promote the union
represented by the final accepted beta tag and list the earlier result ids as
supporting evidence. Do not manually combine untested tips from separate beta
branches.

## Exit criteria

The beta contour is complete when:

- a beta RUN passes its mechanical and semantic gates;
- its exact inputs, engine binding and evidence are retained;
- the cumulative accepted changes are represented in canonical protocol and
  release history;
- released CLI and Memory Bank artifacts are installed in `dd-tasks/main`;
- a published-artifact control run reproduces the intended behavior.
