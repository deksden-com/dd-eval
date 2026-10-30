# CP264 — full Luna after plan113

Follow [execute-eval.md](execute-eval.md), [monitoring](e2e-monitoring.md) and
[cleanup](eval-storage.md). Authority: operator request 2026-10-29 in this chat.
Only affected-contract verification; no full gate or GitHub CI.

## Additional authority — 2026-10-30

The user explicitly authorized exactly one additional correction cycle for the
CP267 SCN-002 acceptance-synchronization finding and confirmed analogous defects,
followed by a fresh full Luna and monitoring. The total repair budget is now four
(five EVAL attempts including the initial run), not a counter reset. Reserve and
continue cycle4 once in the ledger. Preserve the previous three cycles and CP267
evidence. All other workflow, scoring, product-ownership and safety boundaries
below remain in force. No full gate or GitHub CI; no fifth repair authorized.

## Launch contract

- Publish the engine containing plan113, update pins and both installed Codex
  hook homes, verify exact registry bytes/dependency resolution and installed
  engine checksum. A research candidate is not a substitute for publication.
- Profile: `e2e-server-merge-luna-xhigh`; Luna `gpt-6-luna/xhigh`, native children3,
  Interaction/Final Judge `gpt-6.1-sol/high`, no Decisions and no `stop_after`.
- Keep CP263 product source, canon4.1.4, flow-pack and fixture/Judge inputs.
  Reuse measured capacity and intact qualifications; do not probe them again
  merely because the engine changed. The changed lifecycle/state modules are
  matrix dependencies: CP264 has a fresh offline installed-CLI matrix proof,
  not relabelled CP263 evidence.
- Initial fresh home: `/Users/deksden/.dd-eval/qualification/cp264-luna-full`.
  Registry: `/Users/deksden/.dd-eval/homes.json`.
  Resources: `/Users/deksden/.dd-eval/qualification/cp-211-specify-scoped-base/resources`.
  PostgreSQL: existing owned loopback55439 service, never foreign55433.
- `cp-264-runtime` is non-launchable until actual engine commit/checksum,
  published readback and the case checkpoint hash are committed. Do not invent
  source/artifact identities or edit a historical checkpoint to represent a new run.
- After actual detached launch, record EVAL ID/root, exact engine/config/resource
  homes, definition commit, baseline state and automation ID in
  `/Users/deksden/Documents/_Projects/dd-eval/.tasks/cp264-luna-monitor/state.json`.
  Then stop foreground work. Do not wait for the full E2E in the launch turn.

## Monitor every five minutes

Read this runbook and the state file on every wake. Monitor only the state's
current EVAL; use its retained engine/config/resource/registry with `runner status`.
Report actual baseline, current Stage, Work progress and errors from fresh RUN
timeline/controller/evidence, not manifest entry-stage. Include observation time
in Europe/Kaliningrad. Give a concise status each scheduled check, as requested;
do not call models merely to obtain status.

Never start another repair while one is in progress. Persist `phase`, the current
failure EVAL ID, completed steps and `repair_cycles_started`; repeated observations
of the same failed EVAL continue the same cycle rather than incrementing it.
Unknown/running/quiet is not a terminal failure. Reconcile durable native outcome
and owned process identity before deciding that execution ended; never replay an
unknown paid effect or stop healthy siblings/neighbour EVALs.

On a verified successful full E2E: report the final result, stop the owned DB after
its last consumer and settle owned cleanup under the runbook, pause this monitor,
then stop. Technical cleanup notes do not invalidate accepted results, but are
reported honestly. Do not archive/delete investigation evidence.

## Failure cycle — at most three

The initial run does not consume a repair cycle. At most **three correction and
fresh-launch cycles** are authorized afterwards (at most four EVAL attempts in
this campaign). Reserve a cycle once for a new terminal technical failure before
making changes; retain the earlier failure and never reset this counter on wake.

Perform these steps in order, saving evidence/reports and reporting completion:

1. Reconstruct events from all relevant artifacts and source, establish each
   systemic root cause, not just its symptom. If a cause remains unclear or
   uncertain, search the web across plausible hypotheses and incorporate primary
   source evidence. Produce a detailed investigation report and proposed fixes.
2. Write a detailed fix plan for confirmed defects. Audit analogous code paths
   systematically; use subagents where useful and independently check findings.
   Add confirmed sibling defects and systemic fixes. Apply `$ponytail` and report
   additions. Do not add speculative frameworks or checks without an action to protect.
3. Review plan readiness: decisions, sufficiency, edge cases and omissions.
   Do additional investigation where necessary; check subagent results and apply
   `$ponytail` again. Update the plan and report concrete additions before coding.
4. Implement the full agreed plan. Use subagents where helpful without further
   approval. Run only affected checks; preserve valid evidence and failed attempts.
   Commit and push. Do not patch product source to make the EVAL pass.
5. Review implementation against the plan. Fix significant defects, not taste.
   Verify affected paths, commit/push and merge by [Git rules](git-workflow.md).
   Remove only proven unnecessary local/remote branches and worktrees; preserve
   unique history and active neighbours. Report findings, fixes and integration.
6. Publish the corrected exact engine if runtime changed, refresh pins/hooks,
   perform only necessary preparation and start a **fresh** full Luna E2E under
   a new immutable checkpoint/fresh home. Record it as current, keep monitoring
   every five minutes and stop foreground work after launch. Never mutate or
   resume a failed historical run as a substitute for this fresh verification.

Scope is flow/harness/tooling only. Product findings belong to the evaluated flow
and Judge. A terminal scored result with only product findings is reported as
such, not silently renamed PASS or fixed manually by this operator. If the full
flow has finished and only product scoring is negative, report that distinction,
pause the monitor and stop; do not consume a technical repair cycle.

After a failure of the third repaired attempt: report all outcomes, exhausted
budget and remaining causes, pause the monitor and stop. If continuation needs
new credentials, unavailable user authority or unresolved unknown effects, retain
state, report the blocker and pause rather than inventing a bypass or consuming
cycles on identical provider unavailability. Do not increase retry limits or
change model/threshold/capacity silently. Ignore unrelated active automations.
