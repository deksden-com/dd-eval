# 099 — AGY P3 completed

2026-10-23. **PASS for the exact AGY 1.4.6 / client tuple below.** Supersedes
the BLOCKED decision in [the initial review](099-review-and-native-p3-result.md),
whose negative captures remain unchanged. No EVAL or release was launched.

Engine source candidate: `a7c40365` (`fix/099-agy-native-node-proof`).

## Missing native evidence, now established

`StreamAgentStateUpdates` exposes per-conversation `status`, `executable_status`,
`executor_loop_status`, `fully_idle`, background task snapshots and pending agent
messages. Its schema was verified against descriptors embedded in the installed
binary; the existing protobuf generator and gRPC client are reused. No model
request, prompt, native database write or command/PID-name heuristic is needed
to observe these fields.

`CascadeRunStatus.IDLE = 1` on the local executor is **not** whole-tree readiness
and is not semantic SUCCESS. A parent executor can be idle while its subtree's
required work or completion delivery is pending (`fully_idle=false`). This native
distinction, unavailable in the previous capture, supplies the terminal-parent
side of P3 without interpreting a model's “done” message or marker file.

The client checks owned endpoint/CSRF, native root/parent/workspace and trajectory
identity before returning a snapshot. Foreign frames are ignored; missing or
unknown state is not an idle grant. The evidence collector requires source-bound
recursive ancestry and complete task/message pages for isolated-grandchild
claims. The production readiness authority remains the qualified whole-tree
idle barrier, with the existing request/revision fences; node status alone does
not release a Work, budget or Session.

## Actual captures

Retained base: `/Users/deksden/.dd-eval/qualifications/native/agy-1.4.6-f6469b21`.
Captures were copied there before finalization, independently of temporary
worktrees. Their hashes are retained in `evidence-reviewed.json`.

| Case | Native observation (UTC) |
| --- | --- |
| root idle / child running | `captures/tree.json`, sample 5, 10:49:11.256; root local executor IDLE, owned child required work live, root wait busy |
| child idle / background running | tree sample 17, 10:49:32.658; child executor IDLE, explicit non-daemon task `8319388a-fb75-463c-ac1b-3fbf19924dd8/task-6` live |
| isolated grandchild required work | tree sample 23, 10:49:43.285; root/child executors IDLE, child task/message inventory empty, grandchild required work live, barrier busy |
| completion pending | `captures/completion.json`, sample 149, 10:54:07.879; native pending message `128b89e2-d32d-4393-ae61-e2aca965e068` with owned sender/task and exact recipient; barrier busy |
| fully idle | tree sample 43, 10:50:18.049; all observed nodes IDLE/fully_idle, native barrier idle and root SUCCESS retained |
| timer delivered/drained | `captures/timer.json`, sample 11, 10:51:46.040; native schedule delivery and expected exit 7 handled; executor/message work drained |
| persistent service excluded | `captures/service.json`; explicit native run_command/IsDaemon=true and matching native TaskSnapshot; root SUCCESS/required idle while fixture PID/birth live |
| owned service retired | same capture; exact native ForceStopCascadeTree ACK, fresh native idle, task PID/birth absent, provider closed |

These are live captures. Executor error, timeout and activity/cancel/restart
fencing are the three **deterministic fault-injection** cases allowed by plan
099, not relabelled live observations. Collection executes the transport/fence
regressions and retains their log separately. No live case comes from the
synthetic safety fixture. The existing validator was not weakened.

## Exact qualification

- Binary: `/Users/deksden/.local/bin/agy`, 1.4.6.
- Binary SHA256: `11e51de3d0e3e16ea0a8574c13e730ab415bf95d11ec7af75b5b22eec3a98e3e`.
- Client policy SHA256: `f6469b21dfd1779672b46539197c972e9ac2e807073b0c622ef08f1c885d9adb`.
- Evidence: `evidence-reviewed.json`, SHA256
  `b3b59c717b0cc4870fc92e965b3a12b60746767725f21be37f1faec65e971738`.
- Receipt: `qualification-reviewed.json`, SHA256
  `49811af80bf90ba3d01744cf7fc4c7b6247dfbbcf05a8477a6a3184a69e1e773`.
- Existing no-model finalizer and actual qualification reader: **all 11 checks
  PASS, qualified=true**. Source and built client policy hashes match; the built
  reader accepts the same exact receipt. Updated binaries/client bytes still
  fail closed without corresponding qualification.

## Qualified production-path check

Fresh isolated native persistent probe, using that receipt and **without** the
pre-qualification injected observer:
`captures/production-stop.json`, SHA256
`bcda356fc6066266981ec4a253ec876cd71711827274e50d2e7d65b864b9f39d`.

- `runtime.nativeQualification.qualified=true`.
- Original `prompt` returned before `prepareStop(false)`.
- `prepareStop`: clean=true, settled=true; typed service state stopped via
  native `ForceStopCascadeTree`, revision 7 retained.
- Post-stop native idle=true, no retained task PID/birth remains; provider exited.
- Productive result remains SUCCESS before and after control. Physical cleanup
  confirmed. This is a native acceptance probe, not an EVAL.

## Probe defects corrected during acceptance

- Short-lived completion queues were missed by the coarse sample interval;
  tree capture now samples more frequently, without model activity.
- Direct Runtime probes did not forward the explicit qualification path (the
  normal daemon entrypoint already did). Qualified probes now use the real
  observer and configured receipt, not a testing admission substitute.
- Raw native SUCCESS can precede the adapter prompt's durable terminal reply.
  Probes now await that reply before production stop/closing stdin. Previously
  cleanup could manufacture context-cancel ERROR or attempt stop too early.
- Fixture process identity is retained for physical fallback after provider
  reparenting. The failed early-stop capture remains `physical_cleanup:false` in
  `captures/early-stop-negative.json`; its task PID 33124 / birth
  `Fri Oct 23 12:57:25 2026` was subsequently revalidated and retired. Neither
  that failure nor the earlier timer cleanup race was used as positive evidence.

## Verification and limits

Engine merge gate: typecheck/lint, 770 fast + 66 hybrid PASS. Native inspection/
qualification/collector regressions: 23/23 PASS, zero skips. They cover foreign
ancestry/trajectory, local-idle versus tree-idle, partial inventory, contradictory
idle, qualification fences and no overwrite of existing evidence. Build and
source/built qualification import PASS. No full release qualification claimed.

P3 is complete for this tuple, not a claim of universal AGY correctness. Existing
unknown topology, unsupported resource classification and late-activity guards
remain conservative. Future engine selection must use the matching published
client and explicitly select this qualification receipt; no installed hooks,
pins, global profile or running EVAL was changed in this task.
