# Execute an eval

Use `node bin/dd-eval.mjs` from a clean committed definition checkout. Preparation
alone does not authorize paid qualification, provider calls or scored launches.

## Before launch

1. Perform [preparation cleanup](eval-storage.md#before-every-campaign): retire old
   owned daemons, close investigation deferrals and remove disposable old data/DBs.
2. Select a committed run profile and its case/input checkpoint. Keep the pinned
   product baseline; do not substitute current product `main`. Record the selected
   Subject, worker/Judge models, reasoning, decisions policy and completion scope.
3. Use a fresh absolute EVAL home and the exact checkpoint engine:

   ~~~sh
   export DD_EVAL_HOME=/absolute/campaign-home
   export DD_FLOW_BIN="$DD_EVAL_HOME/published-engine/node_modules/@deksden-com/dd-flow-cli/dist/cli.js"
   export DD_FLOW_CONFIG_HOME="$DD_EVAL_HOME/engine-config"
   export DD_FLOW_RESOURCE_HOME=/absolute/shared-host-resource-home
   ~~~

   Prepare these from the accepted engine/configuration, not a failed execution.
   All concurrent consumers of shared resources use the same resource registry.
   Preflight and launch must use the same engine. Do not silently fall back to a
   global CLI or change a retained run's engine. See [harness updates](update-harnesses.md).
4. Verify engine integrity, installed `harnesses.json`, every reachable Flow agent
   profile and Subject/worker/Judge adapter admission. Eval profiles and installed
   Flow profiles have different schemas. Run the pinned adapter's non-generative
   doctor; qualify changed native contracts only when relevant evidence is absent.
   Compatibility/capacity qualification can call a provider and needs authorization.
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
   Corrupt evidence, unknown paid outcomes or unconfirmed cleanup require resolution,
   not a replacement call. Qualification is regression evidence, not infallibility.
7. Check host prerequisites. Task Priority needs project PostgreSQL on loopback
   `55433`; reuse its service/volume, never create a competing container. Do not
   add a manual product quality/browser/world suite as a preparation gate.

### Bounded preparation policy (2026-09-13)

~~~sh
node bin/dd-eval.mjs runner eval preflight --profile <absolute-profile.json>
~~~

Preflight prepares the pinned project/configuration and an unstarted RUN, without
Subject Sessions or baseline execution. PASS means **ready; baseline pending**.
Do not repeat it for unchanged inputs or documentation edits. Actual E2E runs its
own baseline before Subject dispatch, including locked Playwright prerequisites;
never share baseline PASS across workspaces. Stagger CPU-heavy baseline admission
before allowing parallel productive runs on one host.

## Run

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
