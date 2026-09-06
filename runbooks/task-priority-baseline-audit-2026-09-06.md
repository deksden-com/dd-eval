# Task Priority eval baseline audit — 2026-09-06

There is one product task: add task priority. Its active definition is
`cases/sdlc-eval-2026-summer-task-priority/case.json` (`case@7`). EVAL-001,
EVAL-002, EVAL-003 and EVAL-005 contain historical definitions in the old
schema; EVAL-004 retains historical PLAN results. They are not additional
current runner cases. `sdlc-eval-2026-summer-recovery` is a separate technical
recovery campaign using the same task, not a second product benchmark.

The active run profile selects Subject, Judge, concurrency and seven-stage
E2E contour: SPECIFY → PROTOCOLIZE → PLAN → PLAN-REVIEW → CODE → CODE-REVIEW
→ MERGE. The case pins the initial request and checkpoint by SHA-256.
`assessment.json` defines outcome/flow criteria; the private interaction
fixture supplies one required clarification. Neither that answer nor golden
decisions are initial Subject context.

## Correct source and preparation

Remote tag `dd-tasks:eval/cp-068-source` resolves to
`44939e95060a65e80571acdcbf42609b80621e63` (verified with `git ls-remote`).
This is the pre-feature source, also used by CP-070. E2E clones that source,
then overlays only `.memory-bank/dd-flow` from the separately pinned flow
commit. CP-073 retains Memory Bank 4.0.6 at `f4d613d5` and engine beta.19 at
`02648aa2`, while restoring the tagged product baseline. The runner verifies
the tag/commit pair and the project flow-pack manifest before opening a Session.

CP-071 accidentally used `f4d613d5` for both source and flow. That product
already implemented three priorities, default Medium, and archive read-only.
The eval fixture instead specifies four priorities, default no_priority, and
an archive priority-edit exception. Its scored Droid attempts cannot establish
a Subject failure. CP-071 and their receipts remain unchanged historical data.
CP-072 inherits this source and must not be used as a scored Task Priority
baseline; its read-only native recovery smoke results remain separate evidence.

`entry_pack: null` means focused/segment runs are not ready: they require a
new accepted canonical entry pack. E2E needs no canonical Session or pack.
Use `runner eval preflight` for E2E, not `fixtures validate`.

## Installed contour at audit

- Global published engine: `@deksden-com/dd-flow-cli` beta.19; npm beta tag
  also beta.19. Local source beta.20 exists but was not published.
- Droid: 0.212.0, profile protocol 1.201.0, Sol 5.6 high, auto-high;
  profile records previously qualified native child capacity 15.
- Codex Judge/Interaction Judge: CLI 0.153.4, Sol 5.6 high. The beta.11 suffix
  in its profile ID is historical; the checkpoint selects the actual engine.
- Harness configuration names explicit adapter and native executable paths.
  The repeat uses a dedicated copy pointing to its committed adapter checkout.

Version checks and preflight establish setup readiness only. Live execution,
native children, cleanup and the scored outcome require their own evidence.

## Verification and additional preparation defects

The first preflight correctly rejected beta.18: the global npm executable was
beta.19, but the installed router snapshot was still beta.18. Installing the
npm package's snapshot with `dd-flow engine install --force` fixed selection.
All 126 `dist` files matched the installed npm package; build metadata names
engine commit `02648aa2`. The selected snapshot checksum is
`e4bf18b0ab547ab5bfaf579a1f696bbffecdbdc3f858c6d25e9a698233d5dc12`.
Its provenance label is `local_development`; byte verification, rather than
that label, establishes which installed package was captured.

Droid doctor and both Subject/Judge preflights passed. Node 26.7.0, pnpm
10.23.0, Worktrunk 0.74.0, Docker 29.6.2 and Compose 5.3.1 were available;
PostgreSQL on loopback port 55433 accepted connections. Live session-retention
smokes passed before and after the adapter fix: stop daemon, restart it, load
the same native Session, and recover an exact marker without tools or files.

The full suite exposed a Droid completion race: `recoverOperation` accessed
`this.active.resolve` after awaiting persistence, while normal completion
could clear `this.active`. Commit `dad947e` retains the operation reference
across that await. A deterministic regression reproduced the original failure;
203 tests passed on merged definition `5e6e2e3`.

### Stopped intermediate run

`EVAL-20260906192414-ddcfa3bc` completed SPECIFY with its required HITL and
PROTOCOLIZE. It was intentionally cancelled during PLAN so the complete run
could use the subsequently integrated Flow RUN identity fix. Droid returned
`settled: true`; its daemon and the Judge daemon exited.

Cancellation exposed a separate runner defect: cancellation froze a candidate
before the launch handler processed the stopped prompt. The launch handler
then wrote `incomplete_subject_turn`, and its finalization failed with
`candidate_revision_unauthorized`. This is an operator-cancelled attempt, not
a Subject failure. The cancellation/finalization race is not fixed by the
Droid operation-reference change. Historical events and candidate remain intact.

### Concurrent test database collision

The complete repeat is `EVAL-20260906193630-e4169daa`, definition `5e6e2e3`,
CP-073, engine beta.19. It passed SPECIFY, PROTOCOLIZE, PLAN and PLAN-REVIEW;
five review children and the three initial CODE children started their own
Work and completed with no native-observation or reconciliation issues.
Failed formatting/browser gates correctly created native repair Work.

The second CODE gate encountered external interference. The tagged baseline's
`apps/api/tests/global-setup.ts` hardcodes `dd_tasks_foundation_test_vitest`
and resets it for every Vitest invocation. `fileParallelism: false` only
serializes files within one process; checkout separation and
`DD_FLOW_LOCAL_DATABASE_SUFFIX` do not isolate this fixture.

Two integration commands overlapped:

| Run | UTC start | UTC finish |
| --- | --- | --- |
| Droid `EVAL-20260906193630-e4169daa` | 20:24:58.098 | 20:25:23.422 |
| AGY `EVAL-20260906193007-d5463c98` | 20:25:04.109 | 20:25:21.050 |

Droid's `0002_task_priority.sql` hash was `9a0fe038…`; AGY's was `53deac64…`.
Droid failed with `Applied migration changed: 0002_task_priority.sql`. A
read-only query of the shared migration ledger returned the exact AGY hash,
confirming the collision. This is not a Droid implementation failure. Any
quality comparison from the affected attempts must disclose this confounder,
even if a Final Judge accepts the evidence packet.

Before parallel scored runs, isolate every test invocation's mutable database
or serialize all commands that use the shared fixture, including native
worker checks. Fresh checkout directories alone are insufficient. The active
Subject checkout and its database were not changed by this investigation.

Detailed receipts, hashes and the read-only comparison are retained under
`DD_EVAL_HOME/conformance/droid-tagged-baseline-20260906/`.

### Terminal profile drift

The repeat was stopped on CODE after native profile drift. Root and the first
nine child settings remained `gpt-5.6-sol`; the tenth child,
`092d8edd-678c-4725-b7f6-a7c6be4e23d6` (Work `WRK-013-code-gate-repair`),
later reported `kimi-k3`. Its initial `work start` had succeeded, so this was
observed after Work entry. The installed `dd-flow-worker.md` explicitly pins
`model: gpt-5.6-sol`, and the parent Task call contained no model override.
The native cause of the change is not established; quota/fallback explanations
are not verified facts.

Four Execute calls were rejected with `profile_drift`. The controller did not
terminate immediately on those hook errors: read tools continued until the
operator stopped the invalid experiment. `runner cancel` itself refused the
drifted profile; the supported `dd-droid daemon stop --cancel-tree` command
then returned `settled: true`, `forced: false`, `clean: false`, retaining both
topology and inspection profile errors. The Droid daemon exited. The launcher
recorded `profile_drift`, and an incomplete candidate was frozen.

This is **not a successful full Droid/Sol qualification**. CODE-REVIEW and
MERGE were not reached. The run does verify the earlier stage lifecycle,
required HITL, five native PLAN-REVIEW children, three native CODE children,
and a native repair Work. Parallel test-database isolation, prompt-level
termination on profile drift, and drift-tolerant cancellation remain blockers
for a reliable scored campaign. Existing results are preserved; no Subject
code, native settings, migration ledger or frozen score was rewritten.

### Final Judge and terminal state

The runner reached `completed_with_failures`. Final Judge completed at
`2026-09-06T20:48:01.678Z`, retaining `run_validity: valid` for the assessment
of the incomplete candidate. It scored stage quality, cross-stage integrity
and correction quality 3/4; readiness is not applicable. Flow legality, HITL
and observability scored 4/4, and handoff integrity 3/4. CODE-REVIEW and MERGE
remain unreached. Both the Subject Droid daemon and Final Judge daemon exited,
and the runner command completed.

The Judge identified a missing independent proof that PATCH without priority
preserves the stored value. Its other material finding concerns inconsistent
CODE checks and missing browser evidence. The cross-eval database investigation
was outside its allowed evidence packet, so the integration repeatability
finding must be read with the confirmed collision above; it does not establish
a model-caused integration regression. The raw Judge receipt is preserved
unchanged. Its `valid` label does not qualify the incomplete run as a successful
full Droid/Sol benchmark or remove the environmental confound.

Local evidence is retained under
`~/.dd-eval/runs/EVAL-20260906193630-e4169daa/`: `judge/result.json`,
`reports/report.json`, `reports/report.md`, frozen candidate and native events.
