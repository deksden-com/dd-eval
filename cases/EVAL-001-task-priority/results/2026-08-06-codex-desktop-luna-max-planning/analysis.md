# Planning smoke result and timing analysis

Run: `EVAL-001-task-priority`  
Task: `019fd671-5250-7db0-a148-1a1bb5e36cad`  
Observed harness: Codex Desktop, `gpt-5.6-luna`, reasoning `max`  
Result: `ready_for_code`, manually reviewed at `83/100`

## Validity note

The materialized run profile says `harness: codex-cli`, but the JSONL session
metadata says `originator: Codex Desktop`, `source: vscode`, and
`thread_source: subagent`. This run is useful as the first procedure smoke, but
must not be presented as a Codex CLI comparison result. A future comparison
must either use a separate Desktop profile or actually execute the CLI harness.

## Data sources

- Local session JSONL: `rollout-2026-08-06T11-39-38-019fd671-5250-7db0-a148-1a1bb5e36cad.jsonl`.
- JSONL SHA-256: `fbf76a99caa480c8086d9b029d8166ee3cd599f03ab64d02ff6ad59ee604afc0`.
- Materialized input: commit `02d2fe7`, tree `0be2bf5`, no remotes.
- Flow artifacts: `PRT-007-task-priority` / `RUN-007-prt-007-task-priority-specify`.
- Reference and rubric: the case-local `reference/` and `review/planning.md` files.

JSONL timestamps below are UTC. The local Codex filename uses UTC+02:00.

## Outcome

The agent followed `protocol -> specify -> plan`, accepted the common
clarification packet, completed all required aspect coverage, and stopped before
CODE. It did not modify application code, commit, merge, or push.

The final specification and plan are strong. The main quality defect remains the
initial SPECIFY question set: it asked only about priority vocabulary,
default/legacy behavior, and list display/order. It did not separately surface
create-versus-patch omission, invalid/no-mutation behavior, all API
representations, exact fixture bindings, or the complete UI/test/docs acceptance
boundary. The common clarification packet repaired those omissions before PLAN.

## Prompt sequence

### 1. Initial controller prompt

The initial 2,411-character controller prompt did several useful things:

- isolated the agent inside the materialized repository;
- prohibited access to reference answers, review prompts and sibling repos;
- required the goal as the first action;
- required priming before `protocol -> specify`;
- told the agent to research routine project facts before asking questions;
- enforced a hard stop at `waiting_for_user` before PLAN or CODE.

This prompt was clear and did not cause the long PLAN runtime. The first
SPECIFY result arrived in about 37 minutes 50 seconds.

### 2. Clarification and PLAN prompt

The second 2,796-character prompt supplied one authoritative packet and required
the agent to complete project-local PLAN "fully with all applicable
aspect/review/evidence requirements". It also allowed goal completion only after
an accepted `ready_for_code` handoff.

That wording was correct for a strict flow-conformance eval. It deliberately
prevented the agent from returning a short informal plan. It also activated the
most expensive branch of the project flow.

### 3. Project flow amplification

The project-local `plan.md` is 492 lines and classifies persistence, public API,
UI and evidence work as hard triggers. `plan/review.md` then requires:

- a complete aspect map;
- `run_subagents` for hard-trigger/full-plan work;
- a separate packet and report for each focused aspect;
- no grouping for full-plan/high-risk work;
- no `ready_for_code` while an applicable deep aspect lacks a report;
- recovery rather than orchestrator self-approval when a reviewer stalls.

The agent therefore selected 17 applicable aspects: 15 focused reviewer reports
and two self-checks. The 15 packets contain 220 read entries over 72 unique
paths and 44,080 bytes of packet JSON. Fresh-session isolation improved review
independence, but repeated common reads and report reconciliation were costly.

### 4. Reviewer launch prompts

Reviewer prompts were generally well bounded: work only in the target checkout,
read one packet and its named sources, perform read-only analysis, write one
report, and stop. `fork_context: false` avoided copying the main session context.

The orchestration mistake was not prompt content but launch sequencing. Wave 2
used a batch larger than the available pool. The tool returned a limit error
after partially creating sessions without returning all ids. The agent retried
the batch and created duplicate `coding_standards_design_review` and
`contract_propagation_design` sessions. Both pairs wrote to the same canonical
report paths, creating a last-writer-wins evidence race. The duplicate retry
sessions consumed 5,048,618 tokens and delayed the UI reviewer.

Wave 3 initially spawned testing and API reviewers that never reached
`task_complete`. Narrow recovery prompts completed the same work much faster:
testing in 5 minutes 18 seconds and API in 8 minutes 38 seconds.

## Wall-clock timeline

| Step | Duration | Explicit wait | Tool execution | Main-session token delta | What happened |
| --- | ---: | ---: | ---: | ---: | --- |
| Input verification and priming | 3:41 | 0:22 | 1:27 | 0.58M | Goal, Git/input checks, prime rules |
| Protocol rules and bootstrap | 11:17 | 1:56 | 3:18 | 5.19M | Protocol/flow reading, missing CLI diagnosis, write preflight |
| Bounded project discovery | 5:55 | 0:27 | 2:24 | 5.08M | Schema/API/UI/tests/scenario facts |
| SPECIFY artifacts and knowledge worker | 16:57 | 1:58 | 1:27 | 4.21M | Gap ledger, JSON/HTML, fresh extraction worker |
| Waiting gate to packet arrival | 0:48 | 0:00 | 0:00 | 0.40M | Two redundant state rechecks before packet delivery |
| Packet materialization and SPECIFY closure | 14:57 | 0:00 | 1:34 | 9.97M | CLAR-001, durable docs, specification JSON/HTML sync |
| PLAN skeleton and aspect graph | 9:25 | 0:00 | 1:31 | 2.29M | 24-aspect map, 17 applicable, dependency graph |
| Goal-trace review and recovery | 16:29 | 5:03 | 2:16 | 7.46M | Initial reviewer stalled; recovery found premature ready claims |
| Review wave 1 | 15:25 | 3:11 | 4:04 | 9.30M | Architecture, Memory Bank, Git, design traceability |
| Review wave 2 | 56:35 | 6:47 | 14:54 | 20.27M | Pool-limit error, duplicate reviewers, delayed UI review |
| Review wave 3 and recovery | 23:41 | 14:19 | 3:30 | 10.17M | Testing/API initial stalls, close and narrow recovery |
| Review wave 4 | 12:37 | 9:05 | 0:59 | 5.14M | Verification-evidence and scenario/seed reviews |
| Review wave 5 and synthesis | 24:25 | 7:05 | 4:20 | 14.90M | Efficiency review, reconciliation, stage report regeneration |
| Final audit and goal close | 1:56 | 0:00 | 0:20 | 2.05M | JSON/HTML/Git/stop-boundary checks |

Total wall time was 3:34:06. The first `waiting_for_user` result took 37:50.
Clarification-to-`ready_for_code` took about 2:55:28.

Explicit `wait` calls account for 50:13 across 166 calls. The 508 wrapped tool
executions account for another 42:04. These periods are not all waste: reviewer
sessions ran in the background during part of them. Still, the counts show a
polling-heavy orchestration path.

## Reviewer sessions

The JSONL family contains 21 child sessions:

- 17 have a normal `task_complete` event;
- four do not: two goal-trace attempts and the first testing/API attempts;
- two aspect types were launched twice concurrently because of the partial
  batch-spawn failure;
- three no-op capacity probes were also attempted.

Representative successful reviewer durations:

| Reviewer | Duration |
| --- | ---: |
| Knowledge extraction | 13:50 |
| Wave 1 reviewers | 9:15–12:10 |
| Wave 2 reviewers | 19:04–33:33 |
| UI/accessibility | 13:51 |
| Testing recovery | 5:18 |
| API recovery | 8:38 |
| Scenario/seed | 5:52 |
| Verification evidence | 12:05 |
| Execution efficiency | 8:53 |

The execution-efficiency reviewer itself completed at 12:57:24 UTC. The main
agent then spent another 14:26 reconciling reports and regenerating final
artifacts before announcing all reviews complete.

## Token analysis

Main session counters:

- input: 96,745,907;
- cached input: 95,249,920;
- uncached input: 1,495,987;
- output: 252,980;
- reasoning output: 53,615;
- total: 96,998,887.

Main plus all discovered child sessions:

- input: 134,319,243;
- cached input: 130,497,024;
- uncached input: 3,822,219;
- output: 643,454;
- reasoning output: 255,413;
- total: 134,962,697.

These are cumulative request counters: repeatedly supplied context is counted
again, so they do not represent 135 million unique source tokens. The very high
cached-input share shows that repeated long context, rather than unique project
discovery, dominated token processing.

## Where the time went

1. **Flow-mandated independent review.** Fifteen focused aspects and fresh
   sessions are the largest legitimate cost. This is primarily caused by the
   canonical PLAN/review rules, not spontaneous model overengineering.
2. **Wave 2 pool misuse.** A batch larger than the available pool partially
   launched, was retried, created duplicate writers and delayed UI review. This
   was avoidable orchestration overhead and an evidence-integrity risk.
3. **Stalled reviewers and recovery.** Goal trace, testing and API required
   recovery. The flow correctly prohibited self-approval, but no bounded
   reviewer time budget existed in the controller prompt.
4. **Missing `dd-flow` CLI.** The agent manually created and repeatedly checked
   run indexes, JSON reports and template-derived HTML. CLI-backed registration,
   validation and rendering should remove a meaningful part of the 508 tool
   calls and 108 patch events.
5. **Large final artifact contour.** `stage-report.json` is 1,048 lines and the
   generated HTML is 2,008 lines. Reconciliation after every reviewer repeatedly
   rewrote or validated large artifacts in the main context.
6. **Context growth.** Three compactions and 96.7M main-session input tokens show
   that the orchestrator retained too much repeated report and tool output.

## Recommended changes before comparative runs

1. Correct the harness profile mismatch. This run remains a procedure smoke.
2. Make compatible `dd-flow` CLI availability a harness preflight.
3. Launch at most the known free reviewer slots; use a queue rather than a batch
   whose partial failure hides allocated session ids.
4. Give every attempt a unique report path and promote exactly one accepted
   attempt. Never allow duplicate attempts to share a write target.
5. Add per-reviewer wall-time and retry budgets to the harness metadata. A
   timeout should trigger one narrower recovery; repeated failure becomes an
   explicit degraded/blocker result.
6. Keep strict canonical review for benchmark runs, but record a separate smoke
   profile if faster pipeline testing is desired. Do not silently weaken the
   canonical flow inside model-comparison runs.
7. Later add a small `dd-eval collect` command that reads JSONL and emits these
   timing/token/retry fields automatically. This manual report is sufficient for
   the first smoke and defines the minimum useful output.
