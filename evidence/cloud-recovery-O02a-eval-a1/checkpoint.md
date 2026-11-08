# RECOVERY O02a-eval/a1 — author session 1/3

Status: implementation in progress; mandatory Work/group fork acceptance OPEN.
No campaign, RV3, installed, live, service or reboot acceptance claimed.

Goal API active before edits, created 1794134496 in thread
01a1babf-acb0-7810-a5fa-aa6f2f3198e4. Bounded objective: complete S1/S2/S3
consumer implementation and selected verification, commit/push/readback on the
assigned branch. Actual permission policy never, filesystem danger-full-access;
no additional workers, model/effort/profile/runtime-limit changes.

## Exact inputs and priming

- ORCH packet/ref: 2a2c480a57d04827227f1c20a856b8955fb4de60,
  `.memory-bank/plans/cloud-recovery-task-O02a-eval.md` in sibling CLI.
- Eval parent a6a9f028de60e439918b2d95979c0d3293ebcfe4;
  branch codex/recovery-o02a-eval-a1;
  checkout `/home/exedev/workspaces/dd-flow-cli/o02a-eval-a1`.
- CLI source 9c9a96bf6b37aa7844557c9ca2d7d8cabed7e726;
  independent detached consumer `/home/exedev/workspaces/dd-flow-cli/o02a-cli-consumer-a1`.
  Interface freeze e75fb5d3a0f725f1ec6c169eeceac85ec031ff8a;
  actual operational schema `run-operational-decision@1`.
- Canon 55f6987c501ecd1d848896c0d9059f45e0f4e4c3; prepared dependencies reused.
  Absolute primary `scripts/cloud/run.sh` selected Node 26.13.0/pnpm 10.23.0.
- Read own README, runbooks/git-workflow.md,
  runbooks/flow-test-suite-verification.md; sibling AGENTS, index/policy,
  ponytail/dd-recovery-cloud/dd-cloud-work/using-exe-dev skills, immutable
  packet/interface and current plan/matrix/handoff. Historical phases are not
  assignments. Managed environment status tool unavailable; no setup attempted.

## Consumer changes so far

Current runner Stage fork/listing callers are lib/runner.mjs; shared managed
controller observation is lib/managed-flow-client.mjs. Snapshot schema gates
are lib/snapshot-version.mjs. Sealed recovery and candidate readers in
snapshot-observation.mjs/recovery-safety.mjs must remain distinct from Work
cursor admission. driver-recovery/qualification-recovery do not grant Work
snapshot capabilities and need no independent recovery engine.

Implemented exact retained-engine public listing with honest negative entries,
Work/cursor shape recognition (never restorability by label), explicit no-effect
refusal for the pinned unsupported execution-scope contract, preserved Stage
target/request on lost reply, and derived suffix accounting separate from original
full E2E completion. Judge scope stays at the suffix target; candidate provenance
and report observability retain inherited scope. No new semantic checker.

## Concrete CLI contract gap / ORCH coordination

Pinned work-snapshot-continuation.ts forces resource Home and captured budget at
line 97 and immediately launches at line 182, without caller stopAfter/captureRoot
or EVAL predispatch routing/hook/baseline preparation. EVAL runner.mjs:5552 supplies
its retained resource home and derived budget; recovery at :5619 validates it.
Stage returns ready without dispatch, then preparedForkRun prepares those inputs.
ORCH acknowledged and coordinates the CLI owner. abe12f7c is reported as a
resource/budget candidate, NOT an assigned new pin. Do not float this checkout.
No post-reply patch to an executing controller; mandatory consumer proof waits a
coherent published interface and explicit immutable input assignment.

## Commands and observed results

All node/pnpm commands below use the absolute primary cloud runner.

1. In independent CLI checkout:
   `DD_FLOW_BUILD_CANON_ROOT=<prepared sibling dd-memorybank> DD_FLOW_BUILD_STRICT_CANON=1 bash <primary>/scripts/cloud/run.sh pnpm build`
   PASS before all dist consumers; strict-build.log and complete package inventory
   cli-artifact-before.json retained. No source edits to CLI.
2. `node --test --test-concurrency=1 --test-name-pattern='lost fork reply|derived candidate|fork rejects unsupported' test/runner-fork.test.mjs`
   PASS 3/3, focused.log.
3. Selected four-file run (runner-fork, snapshot-version, completion-scope,
   managed-flow-client): 79 PASS / 4 FAIL, selected-consumers.log.
   One file failed to load Ajv because the isolated checkout dependency link was
   missing; restored the prepared link, no install. Three cleanup assertions also
   fail on clean exact parent; parent-cleanup-comparison.log has 1 PASS / 3 FAIL
   on their four named cases. These remain FAIL, not waived to PASS.
4. `node --test --test-concurrency=1 test/snapshot-version.test.mjs test/completion-scope.test.mjs`
   PASS 13/13 after dependency link and added accounting checks, version-accounting.log.
5. `node --test --test-concurrency=1 --test-name-pattern='snapshot registry' test/managed-flow-client.test.mjs`
   PASS 1/1, listing-contract.log.
6. `DD_EVAL_RECOVERY_CLI_ROOT=<independent pinned CLI> node --test test/runner-work-cli.integration.test.mjs`
   FAIL 1/1, real-cli-observation.log: real Git/SQLite/test-owned fake agent source
   completed, but test selected the first sequential point (1 accepted/2 pending)
   and asserted the intended second point (2 accepted/1 pending). Selector corrected;
   this failed log/source evidence is retained. Not a suffix PASS. No paid provider.
7. Read-only verification plan inspected; no aggregate/scoped gate executed.
   Initial plan invocation exposed a node_modules symlink ignore mismatch, now
   handled by the repository ignore rule. No full tests, CI, EVAL/product launch,
   live/Luna/provider calls, service install, Docker, merge or release.

Next: accept explicitly assigned coherent CLI contract, wire public Work fork to
returned controller without duplicate launch, finish principal source-preservation
and suffix proof, grouped risk-selected checks in a clean prospective checkout,
artifact rehash, exact owned cleanup and final commit/push/readback.
