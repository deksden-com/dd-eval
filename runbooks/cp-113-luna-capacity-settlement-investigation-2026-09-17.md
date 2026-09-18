# CP-113: native capacity and premature tree-settlement failure

Status: minimal instruction/runtime fixes implemented and verified. CP-114 was launched from CODE-REVIEW and stopped by an intentional infrastructure guard; no capacity/settlement failure occurred in this run.

## Scope revision: native instructions first

The installed `codex-cli 0.154.0` binary embeds the native close_agent description: completed agents remain open and count toward concurrency until closed. The official subagents documentation also defines the limit in terms of open spawned threads and supports closing completed threads: https://learn.chatgpt.com/docs/agent-configuration/subagents.

Use that existing mechanism. The shared Codex instructions now explicitly require waiting for terminal completion, retaining the Work receipt, and calling close_agent on the returned native ID (v1: `{id: <agent_id>}`; otherwise follow the exposed schema). This applies after each Work/wave, including repair and capacity probes. Shared wave instructions now preserve successful children on partial spawn refusal, wait for them, and return remaining assignments to the existing controller.

This supersedes the scope of proposed items 3 and 6 below: do not build an occupancy manager, release API, persistent capacity ledger or mandatory expanded qualification framework. Slot reuse is now experimentally verified as recorded below; product behavior is still to be verified in the resumed E2E.

Keep the independently demonstrated controller defect separate: live children after a completed parent turn must reach the existing waiting_for_children loop, instead of timing out in generic bookkeeping. No broad adapter rewrite is required to start fixing that distinction. The detailed earlier proposals below remain investigation notes, not authorization to implement all of them.

Evidence root: `/Users/deksden/.dd-eval/qualification/cp-113-luna/runs/EVAL-cp113-luna`.
Controller: `DRV-a6b0dab2-5cec-487b-8e76-6d607d3547dc`.
Engine artifact: `dc1beccbba9917ed5a4b068f200c23c4cade3d85ecf90228c3a7d7adadb3650a`.

## Observed sequence (UTC)

- 18:03:28: P1 native child created; native wait completed at 18:17:16.
- 18:23:17: repair native child created; native wait completed at 18:27:58.
- 18:32:55: CODE accepted and checkpoint captured for CODE-REVIEW.
- 18:34:16: coordinator prompt requested six fresh reviewers.
- 18:35:25–28: four reviewer spawns succeeded; the next spawn failed with `collab spawn failed: agent thread limit reached`. Native completed-tool records identify the four successful children. No native close/release call is recorded for either earlier child.
- 18:35:42: coordinator returned an incorrect summary, claiming no reviewer had started. Four reviewers actually ran `work start` successfully and continued reviewing.
- 18:35:43: durable `session.prompt` result was saved as completed. The controller then waited for whole-tree settlement.
- Around 18:39: controller failed with `settlement_recovery_required / tree_unsettled`; the four reviewers were still producing work. Stop subsequently settled cleanly. Final EVAL state is `completed_with_failures`, cleanup `settled`.

The failing operation is `DRV-a6b0dab2-5cec-487b-8e76-6d607d3547dc:5be50f3f-b28f-4244-9076-80b5f7fed1c7`; inspect its requested/result/settlement files under session-1/operations (directory is SHA-256 of operation ID).

## Root causes and affected code

1. Qualified maximum is treated as currently free native capacity. `dd-eval/lib/runner.mjs` records profile.subagent_capacity as available slots; `vnext-fanout.ts` projects the same fixed value; `controller-fanout.ts` slices ready Work by it. `run-controller.ts` removes previous-stage children using native_baseline, which is appropriate for stage ownership but loses them for session-wide capacity accounting. Two retained children plus four new allocations exhausted the six-slot session. Terminal Work/Turn is not proof of native slot release.
2. Delegation has no reliable partial-launch lifecycle. `delegation-instructions.mjs` says launch exactly the whole wave and wait, but does not explicitly retain successful handles on a later spawn failure. The coordinator's false no-launch summary must not override native events.
3. Generic adapter settlement blocks all successful prompt and inspect returns until the whole native tree is idle. In `run-controller-adapter.ts`, awaitSettlement applies a 120-second deadline to live children. On failure, catch recovers the already-completed operation and enters another 120-second wait. It prevents run-controller's existing waiting_for_children branch from owning the situation, then stops productive children as an infrastructure failure.
4. Failure projection loses the causal event. The final code describes settlement only; native launch refusal, successful partial dispatch and live child IDs remain buried in evidence. Codex descendants also retain pendingInit event status; current tree observations must have precedence over stale creation status.

Shared exposure: PLAN-REVIEW waves, CODE dependencies/repairs, CODE-REVIEW and repair waves all reuse this fanout/controller path. Shared daemon-operations.mjs and managed-daemon.mjs couple provider completion, tree activity and budget release, so a controller-only conditional is insufficient. Other native adapters need the same semantic contract; their exact capacity/release behavior must not be inferred from Codex.

## Proposed implementation

1. Separate provider operation outcome, descendant activity, budget-release state and native slot occupancy in the existing adapter receipt. Keep provider result durable immediately. A completed parent with live owned children is normal waiting_for_children. Keep its capacity lease until the owned activity actually ends; never admit overlapping productive work just to bypass settlement.
2. Route live-tree observation through the existing controller waiting loop. Do not apply bookkeeping's 120-second timeout to legitimate child execution. Retain real liveness/error policies and strict whole-tree settlement for stop, final cleanup and checkpoint capture. Session.inspect must return its observation immediately. Retry only failed bookkeeping; never run two full settlement budgets for the same known completed receipt. Persist the original result and causal error before reconciliation.
3. Compute native free capacity session-wide, including earlier-stage retained children. Preserve native_baseline solely for Work ownership. Use qualified maximum as a ceiling; adapter reports occupancy/release capabilities, or explicitly unknown. Release only terminal, recorded children using the native supported mechanism; retain their evidence. Prove release before advertising a free slot. Preserve coordinator session. If native release cannot be established, expose a specific capacity blocker rather than inventing a new coordinator or silently switching delegation mode.
4. Reconcile partial spawn by native child identities and Work binding. Preserve successful handles, wait for running children, release settled ones, then dispatch only remaining unstarted Work. A missing Work receipt alone does not prove no spawn: account for pending initialization and outstanding launch operations. Do not replay an ambiguous spawn. Make these rules explicit in shared delegation instructions with adapter-specific release details.
5. Normalize fresh child status and structured launch failures at the adapter boundary. Reports retain primary capacity refusal, partial-success IDs, unresolved children and secondary settlement/cleanup diagnostics. Avoid assistant-prose parsing as authority. For providers without structured refusal evidence, preserve the raw error with uncertainty.
6. Extend capacity qualification to a second wave in the same coordinator, proving slot reuse after completion/release. This is a focused technical experiment, not another product E2E. Before choosing Codex release implementation, verify the installed native tool/API actually frees a slot; archive/interruption is not assumed equivalent.

## Execution walkthrough and regression criteria

- P1 completes; Work receipt and terminal child observation are retained. Native release frees its allocation only after confirmation. Repair does the same.
- On CODE-REVIEW entry, ownership uses the new stage, capacity still uses the whole coordinator. Issue at most the free number of ready Work.
- If four spawns succeed and the fifth is refused, retain four identities, leave remaining assignments unstarted, and process live children normally beyond 120 seconds. Parent completion does not trigger fatal stop.
- When children finish, accept their results, release their native allocations, and launch only the remaining assignments. Unknown launch outcomes require observation, not replay.
- Real child failure keeps its original diagnostic. Explicit stop cancels only owned activity and still proves complete physical settlement.
- Tests: two waves plus repair in one coordinator; terminal-but-unreleased slots; partial spawn and delayed work binding; children running longer than settlement budget; inspect during active tree; one bounded bookkeeping retry budget; no replay of completed provider operation; preserved primary refusal; stop/checkpoint barriers; fresh observations overriding stale pendingInit.
- Re-run from CP-113 checkpoint `code-4b9cc39ee6a7a8ae6a46e10d3e3127e64da701cd2716c9dc0e7196ce88add8d4` to exercise review dispatch. A fresh checkpoint fork does not recreate retained P1/repair native slots, so it cannot alone validate the capacity regression; the same-session multi-wave test is mandatory.

## Monitoring correction

Previous heartbeat messages continued calling the stage CODE after it changed. run-control status confirms control/stop state, not the productive stage. Monitor current controller stage plus terminal outcome; recent adapter traffic alone does not prove productive progress.

## Implemented minimal fix and native evidence

- `run-controller-adapter.ts` returns live-tree prompt/inspect observations to existing fanout waiting, keeping the daemon budget reserved. Fresh inspection topology is retained rather than discarded. Read-only inspection has no durable productive operation to recover/settle. Transport recovery is scoped to the initial dispatch; an already-received result cannot trigger a second settlement deadline. Original results are persisted before bookkeeping recovery; identity errors remain fatal. Stop/checkpoint semantics are unchanged.
- Shared delegation instructions retain partial-spawn handles and require terminal-child cleanup using the actual native tool. After refusal, also inspect retained earlier-wave children; never close running or unknown children to create capacity.
- Native probe: `tools/probe-codex-slot-reuse.mjs`, Codex 0.154.0, Luna, isolated home, max_threads=1. Root `01a0b0cb-b491-7e30-a192-9f0288e748ca`. A completed (`01a0b0cb-e18f-77f2-b769-9f010e484afa`); B was refused with `collab spawn failed: agent thread limit reached`; native close_agent(A) succeeded; C spawned in the same root (`01a0b0cc-123b-7a52-b2f0-53c96b7d2143`), completed and was closed. CLI exited zero. This tests retained-slot reuse, which a fresh EVAL fork alone cannot prove.
- Retained probe events/prompt: `/Users/deksden/.dd-eval/qualification/cp-114-luna/evidence/slot-reuse/`. Native call-order and matching close IDs were also checked with assertions against these events. No source RUN or product files were changed by the probe.
- Verification: controller/adapter/stage tests 48 passed; delegation tests 11 passed; daemon operation/cleanup tests 6 passed. Build, targeted ESLint, probe syntax and diff whitespace checks passed. No full release gate or product quality/browser suite was repeated.

## Prepared continuation: CP-114

- EVAL root: `/Users/deksden/.dd-eval/qualification/cp-114-luna/runs/EVAL-cp114-luna`.
- EVAL ID: `EVAL-20260917191823-ed163730`; request `cp114-luna-code-review-fork-001`.
- Fork reports `ready`, runner status `planned`, execution `awaiting_provider`; zero provider turns/processes. This is readiness, not a passed E2E.
- Target CODE-REVIEW; source checkpoint above preserves SPECIFY through CODE. Original CP-113 remains unchanged.
- Engine: local-development immutable beta.75 artifact, checksum `0baac74157df0807f7c3952ea1f7fa764f6703ff450c8f77e9ec2641a877cb67`. Subject Luna xhigh, Judge Sol high, Codex 0.154.0, capacity 6. No npm release implied.
- Non-generative doctor from this installed engine reports app_server available and the expected Codex/harness tuple. PostgreSQL loopback 55433 is reachable. Fork admission accepted the inherited baseline receipt and pinned case/fixture inputs.
- Both restored Git roots inspected: MERGE target clean; feature worktree contains the expected restored CODE implementation and untracked feature/protocol/migration files. Those are checkpoint contents, not preparation edits; do not reset them.

After explicit launch authorization, run from the dd-eval repository (same request/output are idempotent):

```sh
DD_FLOW_CONFIG_HOME=/Users/deksden/.dd-eval/qualification/cp-114-luna/engine-config node bin/dd-eval.mjs runner fork \
  --eval /Users/deksden/.dd-eval/qualification/cp-113-luna/runs/EVAL-cp113-luna --execution e2e \
  --from code-4b9cc39ee6a7a8ae6a46e10d3e3127e64da701cd2716c9dc0e7196ce88add8d4 \
  --output /Users/deksden/.dd-eval/qualification/cp-114-luna/runs/EVAL-cp114-luna \
  --engine-version 0.9.0-beta.75 \
  --integrity-checksum 0baac74157df0807f7c3952ea1f7fa764f6703ff450c8f77e9ec2641a877cb67 \
  --request-id cp114-luna-code-review-fork-001 --start true
```

Then monitor the current controller stage, Work receipts and native outcomes. Create a heartbeat for meaningful changes/failure/completion, not periodic unchanged messages. No monitor is needed while the fork remains unstarted.

## CP-114 launch result

CP-114 started at 19:21:58 UTC and reached CODE-REVIEW. All six declared reviewer children were admitted in the same native Codex session, confirming the slot-release preparation did not regress. The run then stopped at 19:23:44 on `native_hook_failed` for `WRK-014-code-review-3`.

The child copied the issued `work start` command but changed the project path from `.../cp-114-luna/...` to `.../cp114-luna/...`. Native proof verification compared that model-supplied path with the daemon workspace and raised `native_hook_unproven`, surfaced as `native_hook_failed`; the CLI separately reported `invocation_command_mismatch`. The path typo was an argument error incorrectly promoted by the hook into infrastructure failure. The adapter's conservative unknown-effect report and tree stop were appropriate for a real hook failure, but the hook should not have failed on CLI arguments. All six child sessions were subsequently observed idle and closed during cleanup; the run is `completed_with_failures`, `cleanup=settled`, `judge=not_run_cleanup_only`.

Agreed correction: native hooks record identity and receipt only; the CLI owns argument validation before execution and returns an atomic no-effect correction with its exact successor command. Real hook failures remain fatal, without retry. The same boundary applies to Codex, ZCode, Grok, OpenCode, Antigravity and Droid. Do not mutate this historical failed RUN; prepare a new engine-pinned fork from the last sealed CODE boundary. Preparation alone does not authorize starting it.
