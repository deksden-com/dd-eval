# Execute an eval

Use `node bin/dd-eval.mjs` from a clean committed definition checkout. Preparation
alone does not authorize paid qualification, provider calls or scored launches.

## Before launch

1. Perform [preparation cleanup](eval-storage.md#before-every-campaign): retire old
   owned daemons, close investigation deferrals and remove disposable old data/DBs.
   Authorized prepare/run performs the registered-owner retirement barrier;
   preflight only reports it. An unresolved conflicting owner blocks dispatch,
   not a reason to stop unrelated active EVALs. Data GC remains separate.
2. Select a committed run profile and its case/input checkpoint. Keep the pinned
   product baseline; do not substitute current product `main`. Record the selected
   Subject, worker/Judge models, reasoning, decisions policy and completion scope.
3. Use a fresh absolute EVAL home and the exact checkpoint engine:

   ~~~sh
   export DD_EVAL_HOME=/absolute/campaign-home
   export DD_FLOW_BIN="$DD_EVAL_HOME/published-engine/node_modules/@deksden-com/dd-flow-cli/dist/cli.js"
   export DD_FLOW_CONFIG_HOME="$DD_EVAL_HOME/engine-config"
   export DD_FLOW_RESOURCE_HOME=/absolute/shared-host-resource-home
   export DD_EVAL_REGISTRY_FILE=/absolute/project-eval-registry/homes.json
   export AGY_CLI_DISABLE_AUTO_UPDATE=true
   ~~~

   Prepare these from the accepted engine/configuration, not a failed execution.
   All concurrent consumers of shared resources use the same resource registry.
   Reuse the selected EVAL registry across that project's campaigns: a fresh
   EVAL home must not hide previous registered owners. Never point tests at it.
   Checkpoint `engine.artifact_sha256` is the installed engine manifest's
   `integrity.checksum`, not the npm tarball SHA256. Record the tarball digest
   separately in the candidate receipt; verify both before selecting the pin.
   Preflight and launch must use the same engine. Do not silently fall back to a
   global CLI or change a retained run's engine. See [harness updates](update-harnesses.md).
   New checkpoints needing Worktrunk declare `preparation.managed_tools: ["wt"]`.
   Preflight/launch prepares it through the pinned engine before Subject dispatch,
   using the same explicit shared resource home; no model or test suite is needed.
   Keep AGY's self-updater disabled from doctor/preflight through all native
   children: it can replace even a private copied binary. Use the literal `true`,
   not `1`, and verify the selected binary digest after preparation. This is
   EVAL-scoped; do not change the user's global updater preference.
4. Verify engine integrity, installed `harnesses.json`, every reachable Flow agent
   profile and Subject/worker/Judge adapter admission. Eval profiles and installed
   Flow profiles have different schemas. Run the pinned adapter's non-generative
   doctor; qualify changed native contracts only when relevant evidence is absent.
   Compatibility/capacity qualification can call a provider and needs authorization.
   Reuse committed `subagent_capacity`; do not run a paid capacity probe before
   every EVAL or merely because a CLI/engine version changed. Current measured
   profiles: Luna/Codex v2 **3**, ZCode **15**, AGY **15**, OpenCode **15**.
   Reprobe only to raise the limit, after a relevant native concurrency/config
   change, or after an observed capacity regression. A new probe must measure
   overlapping live children, not total children created across successive waves.
   Freeze the selected capacity at launch; never update an existing EVAL in place.
5. For focused/segment runs, validate their accepted entry pack:

   ~~~sh
   node bin/dd-eval.mjs runner fixtures validate --case <case-id>
   ~~~

   E2E uses its input checkpoint; it does not require a focused entry pack and must
   not consume later-stage reference artifacts or canonical provider Sessions.
6. If the case requires HITL qualification, ensure its current assessment passes:

   ~~~sh
   node bin/dd-eval.mjs runner definition qualify --profile <absolute-profile.json>
   ~~~

   This may make paid calls for genuinely new Judge inputs. Reuse unchanged tasks:
   Subject harness/engine fixes, transport repairs and unrelated repo edits do not
   retest Judge. Oracle changes reassess retained answers deterministically; changed
   questions affect their tasks, shared Judge prompt/model changes affect all tasks.
   Corrupt evidence and unknown paid outcomes require resolution, not a replacement
   call. Valid retained answers do not require new model calls merely because
   cleanup remains pending; record that technical debt and block only conflicting
   resource reuse. Qualification is regression evidence, not infallibility.
   Codex history may be unavailable before its SQLite view is ready. Observe the
   accepted Turn; do not resend it or classify a history-read refusal as provider
   outage. An unresolved outcome/cleanup uses the retained operation's recovery,
   never deletion of qualification failure evidence.
   For a sealed failed qualification, `runner definition reconcile --intent
   <absolute-native-intent.json>` can record a proven terminal non-verdict after
   exact owned-process retirement. This preserves the paid request and native
   journal, does not manufacture PASS, and permits a fresh qualification attempt
   only when every dispatched Turn is conclusively failed/interrupted/cancelled.
7. Check host prerequisites. Task Priority uses project PostgreSQL on loopback
   `55433` by default; reuse its service/volume, never create a competing container.
   If that port belongs to another project, do not stop or use its server. With
   explicit operator selection, provision an isolated EVAL service/volume on a
   free loopback port and set `DD_TASKS_TEST_ADMIN_URL` (`/postgres`) and
   `DATABASE_URL` (foundation database) for the runner and its children. Verify
   the actual server/role and retained routing; pinned product code already
   supports these environment overrides. Never edit product code to change ports.
   Stop the isolated service while a campaign is blocked and after its last
   consumer; retain the volume/evidence for investigation. Do not
   add a manual product quality/browser/world suite as a preparation gate.

### Bounded preparation policy (2026-09-13)

~~~sh
node bin/dd-eval.mjs runner eval preflight --profile <absolute-profile.json>
~~~

Preflight prepares the pinned project/configuration and an unstarted RUN, without
Subject Sessions or baseline execution. PASS means **ready; baseline pending**.
Do not repeat it for unchanged inputs or documentation edits. Policy@3 reuses an
intact fixture assessment for identical source/tooling/dependency/consumer inputs;
each new workspace separately installs locked prerequisites and proves its own
DB/schema/seed/ownership/read-write/cleanup readiness. Never copy another world's
readiness or writable state. Legacy policy@1/@2 retains its original admission.
No full engine gate or unchanged quality/browser suite is an extra preparation step.

New runs retain one absolute Playwright cache in `manifest.check_resources`:
explicit `PLAYWRIGHT_BROWSERS_PATH`, otherwise
`<DD_FLOW_RESOURCE_HOME>/browser-cache/playwright`. Install, baseline and productive
checks use that selection despite harness HOME changes. Resume/fork inherits it;
do not replace it from the current shell or delete it during daemon cleanup.
Legacy runs without this field do not gain the guarantee retroactively.

## Run

New definition receipts bind executable tooling and selected case/profile inputs,
not the whole repository tree. Unrelated documentation and other experiments do
not invalidate them. Published receipts/payloads remain checksum-protected;
legacy receipts keep their original dependency rules. Do not edit a retained run
to promote it to the new contract. Runtime boundary journals are bounded evidence
cuts, not proof that the provider stopped writing; shutdown needs owned receipts.

~~~sh
node bin/dd-eval.mjs runner eval run --profile <absolute-profile.json>
node bin/dd-eval.mjs runner status --eval "$DD_EVAL_HOME/runs/<EVAL-id>"
~~~

The initial reply acknowledges a detached launch, **not completion**. Retain its
EVAL ID/home. Closing the invoking terminal does not stop the EVAL. Use
[E2E monitoring](e2e-monitoring.md#determine-the-current-stage), not the manifest's
entry stage, to report progress.

The runner restores isolated project/runtime roots and pins execution routing.
For cross-harness full-cycle runs, use the committed flow pack's
`stage_session_mode=new_session` and `merge_mode=server`: a changed physical cwd
needs a new Session unless native rebind is qualified. A prompt saying `cd` does
not prove binding. Do not start a second merge server or hand-write stage prompts.

Use runtime-issued standalone lifecycle commands and JSON/text files. `stage start`
provides live paths, context and completion instructions; after the Stage, the
controller alone dispatches its successor. Follow a `retry_command` only for a
proven no-effect correction. Unknown effects or `publication_pending` require the
original operation's reconciliation, not replay. Native child completion is not
Work success; healthy siblings must not be killed to free slots.

## Semantic decisions and SPECIFY comparisons

The run profile optionally sets `semantic_decisions` (provider/model, confidence
threshold, retries) and `stop_after`. They work independently of Subject harness.
Do not combine modular decisions with legacy `interaction_judge.coverage_policy`.
Credentials stay in the runner owner's environment (`OPENROUTER_API_KEY` or
`OPENAI_DECISIONS_API_KEY`), never profiles, prompts or child environments.
Low confidence, unsupported/uncovered/refused decisions use the qualified native
Judge; transient errors retry at most twice. Unknown paid outcomes remain fenced.

`finished` with `stop_after` means the selected target and cleanup completed, not
full product E2E PASS. Final Judge audits decision exchanges when enabled;
SPECIFY-only profiles disable it and need a separate post-stage evidence review.
Use the committed profile's threshold; never rewrite an active run's policy.

For sequential comparable pilots:

~~~sh
node scripts/run-specify-comparison.mjs --campaign /absolute/comparison-receipts --base-home /absolute/prepared-engine-home --profile cases/sdlc-eval-2026-summer-task-priority/run-profiles/specify-luna-judge-only.json --profile cases/sdlc-eval-2026-summer-task-priority/run-profiles/specify-luna-jev.json --profile cases/sdlc-eval-2026-summer-task-priority/run-profiles/specify-luna-openai-decisions.json
~~~

The script freezes comparable inputs, uses isolated variant homes and waits for
each target **and cleanup** before the next. Failure stops dispatch, not unrelated
EVALs. Reusing a campaign observes its retained IDs; never blindly retry an unknown
launch. Independent EVAL concurrency is not host-wide serialization. Compare
durable Stage timings, pause time and decision latency separately; one run per
mode, especially fallback-only, proves neither accuracy nor a speed advantage.

After npm publication, the normal router may still select an older compatible
snapshot already present in the host engine store.  For published-artifact
acceptance, install the exact public package into a fresh temporary prefix and
pin that installed entrypoint instead of using source bytes or changing the
global installation:

```sh
eval_engine_root="$(mktemp -d /tmp/dd-flow-eval-engine.XXXXXX)"
npm install --prefix "$eval_engine_root" --ignore-scripts --no-save \
  @deksden-com/dd-flow-cli@<checkpoint-version>
DD_FLOW_BIN="$eval_engine_root/node_modules/@deksden-com/dd-flow-cli/dist/cli.js" \
dd-eval runner eval run --profile /absolute/path/to/profile.json
```

Keep that prefix until the run is terminal; then remove only that exact
temporary directory. The recorded engine version, commit and checksum must
equal the immutable checkpoint. This is a published-package pin, not a local
development override.

When refreshing a global router/engine pin as well, install the global engine
store from this exact qualified published prefix, not an unrelated pnpm global
dependency lock. The same package version can resolve a different transitive
closure there. Use the normal `engine install --force` from the qualified CLI
with the intended global `DD_FLOW_HOME`, then verify the selected checksum;
never relabel qualification to accept the other closure. The engine installer
preserves already-bound checksum variants. Keep workstation hooks and symlinks.

The runner allocates a fresh directory under
`$DD_EVAL_HOME/runs/<eval-id>/`. Each execution gets its own restored project,
`DD_FLOW_HOME`, managed harness state and append-only `events.jsonl`.

Before restoring the engine, the runner copies only the portable harness
configuration from `${DD_FLOW_CONFIG_HOME:-${DD_FLOW_HOME:-~/.dd-flow}}`:
`harnesses.json` and optional `agent-profiles/`. `harnesses.json` names the
absolute adapter and native executable for every harness. It contains no
credentials. The isolated home never inherits `db.sqlite`, RUNs, locks, ports,
engines, logs or daemons from the source home. A missing or invalid harness
configuration is a setup blocker; do not work around it with PATH discovery or
ad-hoc adapter environment variables.

`DD_EVAL_REGISTRY_FILE` selects the development campaign's private discovery
registry. It must be an absolute file path, not just a different `DD_EVAL_HOME`.
The selected path is retained in new run/fork manifests and reused by detached
continuation. The runtime shim also captures config/resource/registry roots so
a provider's foreign shell cannot silently replace them. Console reads the same
registry through the same environment variable. Global registration remains the
default only for ordinary invocations without an override and historical
manifests without a retained selection.

The configured `<runtime>/harness-runtime` path is a relative alias to the
selected immutable engine's `dist/harness-runtime`, not a detached adapter copy.
Node must resolve that engine's complete production dependency closure. Fresh
provision, fork and Stage restore install this alias after materializing the
engine; a frozen snapshot alone is not an executable engine installation.
Do not install missing dependencies or rewrite an alias inside a failed or
historical execution. Correct provisioning for a new attempt instead.

An eval profile in `profiles/` is not an installed Flow agent profile. Every
profile referenced by execution routing must also exist in the configuration
home's `agent-profiles/<id>.json` using `dd-flow/agent-profile@1`. Match its
provider/model/reasoning/mode to the committed eval profile; use Flow's harness
key (`zcode`, not the eval key `zcode-acp`) and the approved permission policy.
Do not copy an eval profile verbatim: it has a different schema. Missing
profiles must be installed in the configuration home before a fresh preflight,
not patched into a failed run's frozen state.

Before opening a Subject session, the runner validates the materialized input
as a **project** flow pack: its manifest, every declared file and both
project-owned execution/workspace contracts must be present and match the
checkpoint Memory Bank version. A bare canonical `dd-flow/` source is never a
valid E2E overlay. This is a file-contract check only; policy and semantic
correctness remain agent/`dd-flow` responsibilities.

## Cancellation

`dd-eval runner cancel --eval <path>` is two-phase. It first records
`cancel_requested`; the adapter then reports whether the root Session and all
native children actually settled. Only a receipt with `settled: true` writes
terminal `execution.cancelled` and finalizes the eval. Otherwise the eval is
`cancelling`: use `runner status --eval <path>` for read-only observation.
`runner reconcile` applies only to a terminally failed launch and returns
`reconcile_not_eligible` for cancellation. A repeat
`runner cancel --eval <path>` is an explicit scoped retry of the same
cancellation intent, not an
observation-only command; first check owner/lease and the retained stop receipt.
Do not restart the Subject, send a recovery prompt or delete its daemon while
it is cancelling. Process death alone does not prove native-tree settlement.

## Parallel canonical preparation and E2E

Canonical preparation and ordinary E2E evaluations are independent contours.
A canonical build owns only its directory below
`$DD_EVAL_HOME/canonical/<case>/<revision>/`; an E2E owns a fresh directory
below `$DD_EVAL_HOME/runs/<eval-id>/` and begins from the committed input
checkpoint. An E2E never reads, resumes, forks, or waits for a canonical
provider Session.

They may therefore run at the same time. This is useful when a reference chain
is still being captured while a release comparison is already ready to run.
Keep the following boundaries intact:

- use a separate, fresh E2E directory for every invocation;
- keep `DD_FLOW_RESOURCE_HOME` common and absolute so ports and managed
  processes are coordinated across all concurrent runs;
- do not modify or dirty the `dd-eval` definition worktree used by a live
  canonical build; prepare documentation or unrelated source changes in a
  separate worktree and merge them after the build has reached its boundary;
- treat a missing accepted focused entry pack as irrelevant to an E2E. It
  affects focused-stage qualification only; E2E uses the input checkpoint.

The runner also creates `$DD_FLOW_HOME/bin/dd-flow`: a tiny private launcher
for the exact engine snapshot named by the accepted entry pack. It exports its
own absolute path as `DD_FLOW_BIN`, is placed first in the Subject, worker and
merge-server `PATH`, and is passed explicitly to the managed harness daemon.
Every first lifecycle command explicitly names both `DD_FLOW_BIN` and this
absolute launcher; later commands retain the same identity from the launcher.
`PATH` is only a convenience, not an identity guarantee. Do not replace it
with a globally installed `dd-flow`; the global executable is used only to
bootstrap or restore an isolated runtime before that snapshot launcher exists.

For `merge_mode=server`, the runner does not send MERGE to the coordinator
Session. It invokes one isolated `dd-flow merge serve --once`, records the
server-launched Session and waits for request/Work/Stage/RUN convergence. Do
not run a second merge server or hand-write a MERGE prompt in that execution.

## What counts as a successful qualification

The required qualification set is one successful **focused** execution for
each declared stage. They are independent cells: a successful `PLAN` cell is
not invalidated because a later `CODE-REVIEW` or E2E experiment fails. This is
the evidence used to accept a portable entry pack.

An E2E execution is a separate integration experiment. Run it only when the
selected profile explicitly sets `selection.e2e: true` (for example, when a
release plan calls for an end-to-end comparison). Its result is retained and
judged on its own merits; it is not a hidden prerequisite for accepting the
focused-stage set.

## Live qualification

Every selected harness needs valid compatibility and, for fanout, capacity
qualification; reuse these while their bound inputs remain unchanged. Run
affected deterministic suites for code changes, commit the definition, then
start E2E only when requested. A smoke failure is a harness blocker:
retain its receipt and do not start that profile's E2E. The run profile—not a
literal command-line model/version—remains the source of truth for Subject,
Judge and interaction Judge. Continue stages in the same Subject session unless
the persisted project execution policy selects a supported handoff.

## Operational model

The same short sequence applies to every harness. Keeping these roles separate
is what makes a focused stage comparable to an E2E contour instead of a replay
of an earlier provider conversation.

| Step | Owner | Durable result |
| --- | --- | --- |
| Resolve a committed case and profile | Runner | resolved identities of the case, package, flow, engine and harness |
| Restore the requested boundary | Runner | fresh project and runtime roots inside this execution only |
| Materialize the stage slice | Runner + `dd-flow` | read-only context; `stage start` resolves live paths and lifecycle commands |
| Perform the stage | Subject | its own artifacts and a `dd-flow` lifecycle receipt |
| Handle an allowed question | Runner + clean Interaction Judge | exact question, match decision and one authorized answer in the same Stage/Session |
| Capture or advance | `dd-flow` controller | candidate boundary, append-only journal and, for E2E, the next provider turn |
| Assess | clean Judge | verdict over immutable evidence; it never edits the evaluated RUN |

`dd-flow` is the sole authority for RUN, Stage and Work state; its managed
controller owns provider Sessions, productive turns and capture. Eval owns
experiment preparation, observation, permitted answers and Judge evidence.
The Subject makes product and
flow decisions; it does not manufacture snapshots, statistics or Judge
evidence. A Judge assesses captured facts and cannot repair the Subject's
output. The human operator only accepts a canonical reference boundary or
changes the versioned case definition.

The Final Judge must return the exact outcome and flow criterion sets declared
for its chosen assessment scope. Every applicable criterion needs a score,
rationale and evidence; an unknown scope, duplicate/missing criterion or empty
applicable evidence fails the evaluation machinery instead of producing a
partial score.

The Subject may inspect the isolated runtime. The runner verifies the selected
engine snapshot before a Subject Session starts, records the harness journal,
and captures the resulting RUN boundary. It does not infer the legitimacy or
semantic meaning of shell commands from journal text: that is neither a
reliable safety boundary nor an evaluation criterion.

Usage accounting preserves the provider's native scope. Grok's root counter is
an inclusive execution-tree snapshot; ZCode reports individual physical
sessions. The resulting statistics expose scope and included records rather
than pretending those two measurements are the same.

For a focused stage it restores exactly that entry boundary, materializes the
read-only stage context, opens an empty Subject Session and sends one launcher.
For E2E it restores only the initial entry and follows the Subject's own
outputs through the selected contour. Never copy a later-stage focused fixture
into E2E.

The launcher tells the Subject to use the returned standalone `dd-flow stage
start` command first. Do not prepend `cd`, `cat`, `git`, a help command, a pipe
or another shell command: the harness hook must see this lifecycle call as its
own Bash action. `stage start` is the source of the actual context, paths,
completion command and Work contract.

Lifecycle recognition is centralized in `dd-flow`, not duplicated in provider
adapters. A quoted absolute `dd-flow` executable emitted by the launcher is a
valid command word. Text such as `dd-flow stage start` inside `grep` patterns,
JSON, comments or heredoc bodies is data and must not be trusted or blocked.
Hooks may recognize a lifecycle call inside shell composition for observation,
but do not police shell syntax or issue retries. The invoked CLI validates its
own argv; an ambiguous shell observation is not execution authority. Continue
to use the issued standalone command as the supported launcher format.

For each E2E stage the operational sequence is: eval supplies context to the
managed CLI controller → controller sends one launcher →
Subject invokes standalone `stage start` first → Subject performs only that
Stage → `dd-flow` returns a terminal receipt or a registered pause → controller
captures the boundary → controller, not eval or the Subject, sends the successor
in a later turn. A focused execution stops at the same boundary. This difference is
intentional: a focused result may use its accepted predecessor snapshot, while
an E2E successor consumes the Subject's own preceding result.

Some stages materialize a graph of fresh worker Work records. This is still
one normal Stage: when the graph is agent-owned, the CLI controller first returns
the same coordinator once to materialize it; when it has a deterministic
dispatcher, `dd-flow` materializes it directly. The controller returns the ready
descriptors to the existing coordinator, which launches native subagents.
Each child calls its exact `work start` and `work finish` commands. The runner
does not launch substitute root Sessions, choose aspects, change the graph,
author results or retry workers. Capacity comes from the qualified harness
profile and is recorded in RUN; qualification happens before E2E, not inside
the evaluated stage. A quiet worker is not a
failure and must not be stopped merely because no new message has appeared.

Native terminal observations are reconciled through `stage fanout reconcile`.
Only a unique registered Session/Work attempt may be failed or cancelled.
Native completion never implies Work success. Ambiguous/absent bindings are
explicit blockers with saved observations, not permission to relaunch a child.
An active deterministic check remains owned by its original invocation.

Recovery capture belongs to the CLI controller. Eval accepts only its sealed
receipt and verified immutable bytes; it never creates a replacement snapshot
to bypass a missing capture. Until the controller publishes a usable capture,
eval records incomplete evidence explicitly. Neither cleanup nor capture failure
replaces the original execution failure or authorizes replay.

Each launcher permits exactly its named Stage. Once that Stage is finished, the
Subject stops; it must not follow a successor command shown by a normal
`dd-flow` receipt. The CLI controller captures the boundary and sends the successor
only in a later provider turn.

For Codex Desktop, the runner creates an isolated `CODEX_HOME` through
`dd-flow` and trusts only its generated lifecycle hook for that eval Session.
It does not reuse an interactive hook-trust decision or load user plugin hooks.

Monitor without modifying the evaluated Session:

```sh
dd-eval runner status --eval "$DD_EVAL_HOME/runs/<eval-id>"
```

Follow [E2E monitoring](./e2e-monitoring.md#determine-the-current-stage) when reporting the
stage. In particular, `manifest.executions[].stage` is the configured entry stage, not live
progress; use the RUN/controller projection or the RUN's durable `timeline.jsonl` events.

Model-facing structured submissions use a runtime-issued JSON file followed by a separate
standalone CLI command. HITL uses the retained question/answer text files. Do not instruct the
Subject to combine file creation and a lifecycle call with heredoc, pipe, shell variable,
command substitution or base64; legacy stdin forms are compatibility paths, not examples.

Provider silence or a missing current tool call is not a failure. The runner
waits for a provider terminal state, a registered `dd-flow` pause, an explicit
provider error/cancellation or a configured hard deadline. A terminal chat
message is not a completed Stage: completion requires a matching `dd-flow`
lifecycle receipt for the expected Stage.

An explicit terminal provider error records that Work's provider code and
evidence without completing it by inference. Independent already-launched
siblings may settle; the coordinator then explicitly retries, repairs, or
blocks the failed Work. The runner never cancels healthy siblings merely for
silence and never fabricates `work finish` for a failed child.

## HITL and failure handling

Only a declared registered pause may receive exact canonical answer bytes after
Interaction Judge admission. A matched answer belongs to that Stage/Session/pause;
transport recovery reuses its saved bytes, not a new semantic answer. A fixture gap
is evaluation infrastructure, not Subject product failure. Fix definitions for a
new attempt; never change a live definition or manufacture a response.

Observation timeout, expired lease or quiet root is not provider failure. Inspect
the same retained native operation and children before any new dispatch. Do not
repair runtime SQLite, journals, snapshots, hooks or receipts manually. An
incomplete Stage needs its correlated primary cause, not just the final wrapper.
See [failure diagnostics](e2e-monitoring.md#errors-and-unknown-outcomes).

## Completion and stopping

After success **or failure**, including failed preparation, perform
[daemon/DB cleanup](eval-storage.md#container-retirement-after-an-eval). Preserve
results first; stop the database after the last consumer. Defer live resources
only for a concrete investigation and close that deferral before their next use.

For an explicitly abandoned execution:

~~~sh
node bin/dd-eval.mjs runner cancel --eval <absolute-eval-root> --execution <id>
~~~

Cancellation is two-phase: `cancelling` is not settled. Whole-EVAL stop and failed
cleanup instructions are in [storage cleanup](eval-storage.md#stop-leftover-daemons).
Status never repairs or resumes. `runner resume`, recovery, fork or productive
control release requires explicit authorization and the original input bindings;
cleanup must not create a new Session, Judge call or Subject continuation.

## References

- [Storage and cleanup](eval-storage.md), [monitoring](e2e-monitoring.md).
- [Comparison policy](../methodology/evaluation-methodology.md#comparability-across-runtime-versions).
- [Shutdown ownership](../specs/059-cp188-durable-shutdown-and-judge-cleanup-plan.md),
  [progress/inactivity](../specs/065-operation-progress-and-inactivity-plan.md).
- [Decision routing/stop-after](../specs/071-semantic-decisions-and-stop-after-plan.md),
  [comparison orchestration](../specs/073-cp202-execution-contract-and-comparison-plan.md).
- [Operation reconciliation](../specs/078-operation-progress-and-create-reconciliation-plan.md).

Historical CP reports describe past investigations, not extra readiness gates.
