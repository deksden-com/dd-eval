# RECOVERY O02a-eval/a1 — author session 1/3

Status: bounded S1/S2/S3 author work complete, ready for ORCH acceptance.
Current code299e15a5; delivered proof8b75d603. Principal PASS1/1/46 assertions;
ready consumers115 PASS/3 exact-parent FAILs, artifact3278/3278 MATCH.
No campaign, G02, RV3, installed, live, service or reboot acceptance claimed.

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

## Published S1/S2 checkpoint and registry-selection follow-up

Published/read back ed1b221411e1fa607b54ed0201734c693350b367 on assigned branch.
Clean detached prospective checkout at that commit ran the four selected files:
89 PASS / 3 FAIL, exactly the same three parent cleanup assertions. The attempted
negative test-name filter did not exclude those qualified tests; all 92 ran, no
hidden skips. This is not a blanket PASS. Original logs kept verbatim; log-only
trailing spaces cause `git diff --check` diagnostics, while source-only diff check
passes. No failure evidence is rewritten to normalize it.

Further bounded change: stable registered snapshot_id selection resolves through
the retained scoped RUN engine, not boundaries/from. Registered automatic recovery
and derived capture roots can be selected; arbitrary caller paths cannot. Historical
Stage basename selection remains an alias only within its owned boundaries directory.
Listing verifies its executable against the retained RUN engine binding as well
as full artifact content. Targeted registered-selection.log PASS4/4, including
outside-boundaries selection, negative capability, foreign engine binding,
unsupported Work predispatch refusal and stable Stage retry.

The completed real required-policy source was read back without relaunch:
retained-source-readback.json PASS8 assertions (second sequential point, two
accepted/one pending, automatic producer, terminal evidence-only, RUN done,
required policy). Original first-point selector FAIL stays preserved. This is
observation proof only, not the mandatory public fork/suffix acceptance.

ORCH coordinates coherent public `run fork --prepare-only`: prepared Work target,
no controller; EVAL preflight, then same exact request starts continuation. Current
pin remains unchanged until an explicit published source/interface assignment.
Stop target/capture root and predispatch selected adapter routing remain required.

## Explicit v2 input and connected implementation

ORCH cf3a91c4030c684f89a5a0a1b6ac4eb2c3ddbbd8 explicitly revised the input to
CLI 9af49580675829b700ff0fb5e2a3148a1f187f52. Updated packet/interface read in
full. Separate clean `/home/exedev/workspaces/dd-flow-cli/o02a-cli-consumer-v2-a1`
strict build PASS with the same canon/toolchain, before dist consumers; complete
cli-v2-artifact-before.json retained. Earlier 9c9a proofs/FAILs are not relabeled.

Implemented public Work `--prepare-only` capability check and shared
forkManagedRun transport with exact execution binding readback. Runner preserves
ready handle, cursor and graph identity; ordinary harness/hooks/baseline/context
preparation precedes the SAME request's native continuation. Observer consumes
the returned controller with its frozen `work-snapshot:<request>` identity;
recovery checks it too, with no second drive launcher. Only supported normal
SDLC full-RUN stop targets are admitted; a different requested EVAL target gets
explicit no-effect fork_stop_target_unsupported before import. Required snapshot
policy is preserved, never silently strengthened from best_effort.

Native Work capture root `.execution-captures` is frozen in the derived execution
and admitted only inside that EVAL for candidate readers. Stage reader behavior
is unchanged. Report separates actual technical state, case acceptance status,
Judge status and inherited Stage/Work scope, all explicitly suffix-only.

Development checks: runner Work prepare/start and lost-observer recovery3/3 PASS,
zero ordinary drive launch calls; integrity/accounting14/14 PASS. Real v2 dev
principal FAILED after actual native target start because the test assumed public
binding included entrypoint. Public binding does not; runner now starts through
its verified private shim, test observes through its exact source-built CLI.
Failure retained in principal-dev.log; readback failed-dev-readback.json shows
target RUN done/controller completed and all 17 retained process records stopped,
not a completed principal assertion receipt. No automatic unknown replay was run.
Test cleanup now fences an active target through public control before physical
drain, covering the creator→registration gap on an early assertion failure.

Ready for grouped clean prospective verification plus the final principal actual
CLI check using DD_EVAL_TEST_RECOVERY_CLI_ROOT (standard test env prefix). Source
and selected artifact remain immutable during those checks. Full task acceptance
still OPEN until successful principal assertions, artifact comparison, cleanup,
own delivery evidence and push/readback. Session counter remains1/3.

## Final author handback

Principal passed on clean code299e15a5829c243569351d8ded5293b483042bad against
explicitly assigned CLI9af49580675829b700ff0fb5e2a3148a1f187f52: real required
automatic point, two accepted/one pending, public prepare/start and suffix→RUN
done,46 assertions/209.6s. Prefix/source/snapshot/graph preserved; retries retain
handle/controller, corrupt/conflicting inputs refuse. Technical/case/Judge/
inherited accounting remains suffix-only. See delivery.md and principal-ready/.

Clean ready consumer batch115 PASS/3 parent-matching FAILs, no skips/TODO/cancel;
not an aggregate PASS. Both original and v2 complete CLI inventories3278/3278
MATCH. V2 checksum962ddebd6be2bbe441f6a993cc6de688826e4dc0bf13639c8e663a090e497c63
matches the principal target. Exact eval Git inventory is eval-source-manifest.json.
Runtime code in the delivery is identical to the tested code299e15a5; later changes
are README and evidence/cleanup records only. All failure logs remain intact.

Acceptance evidence pushed/read back8b75d60351c13b0fc9056ced20838e32c7218b17
before raw cleanup. cleanup-result.json records12 removals:5 owned clean test/
consumer checkouts,4 failed owned fixture roots, the explicitly handed redundant
W05 spool and2 persisted duplicate temporary logs. Successful principal roots
were already removed by fixture cleanup. Post-cleanup argv/cwd/fd/maps consumers0;
retained unused task resources0. Author checkout remains for ORCH follow-up.

W05 index126/126/20,387,697bytes independently matched and remote dc5aea25 read
back; two unindexed administrative files were copied into this published packet
before spool deletion. No roots from its archival candidate list were acted on.
Primaries remain clean: eval a6a9f028, CLI0a554864. Previous W03/W04/W05 sources,
prepared toolchain/dependencies/cache/key and unrelated evidence remain intact.

Next owner/action: ORCH evaluates this bounded consumer delivery alongside CLI
G02 proof, then O02b/RV3; no further author code is pending. Full campaign and
installed/live/service/reboot/O03 remain OPEN. No main merge/release authorized.
