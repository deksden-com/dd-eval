# 029 — Implementation evidence

2026-09-07. Delivery in progress: cp-077 stopped on a native provider capacity
failure during CODE repair. Full E2E qualification is not yet accepted.

## Implemented

- A: cancellation uses retained ownership, joins concurrent stop, attempts every owned child despite inspection/cancel errors, and never starts a daemon just to stop it. Unknown settlement remains unconfirmed. Native-dispatch guards invalidate prompt preparation already in flight.
- B: execution terminal state and candidate finalization use shared locks and generation checks. Cancellation/fatal/completion races, crash and late replies cannot authorize another candidate or silently rerun Judge.
- C: durable session-scoped model observations preserve requested versus native configured/response evidence. Fallback is allowed, appears in progress and model attribution, and retains unknown cause/usage explicitly. Native identity violations still fail closed.
- D: baseline test invocations own separate PostgreSQL databases, migration input and API/Web ports, including same-checkout concurrency. Cleanup checks ownership. Browser receipts retain actual endpoints. Preview scenarios exclude duplicate compose-world ownership before Docker access.
- E: checkpoint pins exact engine content; router executes the selected artifact even at the same version. Preflight, launch and recovery verify identity; canonical resume checks retained admission. Case-owned baseline commands run before Subject. Functional browser persistence and native keyboard qualification are separate.

## Tests and boundaries

dd-eval initial full suite: 227/227, `/tmp/dd-eval-029-final-suite.log`.
After the native dispatch guard, corrected Codex fixture and guard regression:
23/23 `/tmp/dd-eval-029-codex-fence-target.log`; AGY and guard: 8/8
`/tmp/dd-eval-029-dispatch-fence-target.log`. Final integrated suite is recorded
in `/tmp/dd-eval-029-delivery-suite.log`: 228 passed and one stale checkpoint assertion failed. The updated cp-074 assertion and its suite passed 64/64 (`/tmp/dd-eval-029-checkpoint-target.log`).

dd-flow full run: 303 passed, two old fixture failures. Both corrected fixtures
passed together (2/2), `/tmp/dd-flow-engine-targeted.log`. Full log:
`/tmp/dd-flow-engine-artifact-test.log`. Typecheck and lint passed.

Baseline quality, format, docs and browser passed. Browser concurrent invocations:
6/6 each, `/tmp/dd-tasks-browser-concurrent-a.log` and `-b.log`. Different migration
inputs and killing one invocation without affecting the other passed both within
one checkout and across two actual Git worktrees (`/tmp/dd-tasks-world-isolation.log`,
`/tmp/dd-tasks-two-checkouts-world.log`). Foundation scenario all six phases passed
(`/tmp/dd-tasks-foundation-world.log`). Preview exclusion regression passed.

Native keyboard qualification on macOS Chromium 151.0.7922.34 reported
`qualified:false`: ArrowDown+Enter did not change the standalone select.
This is preserved as one skipped qualification, not accessibility acceptance.

## Live root read and cancellation

All paths below are under `~/.dd-eval/conformance/live-029/`, ending in the
profile's `receipt.json`. They prove native marker read and owned-root cancellation,
not all providers' hidden routing or child capacity.

| Harness | Receipt root | Result |
| --- | --- | --- |
| Droid | `cf7c661b-8a29-4c27-9b97-02a68c03889c/droid-cli-openai-gpt-5-6-sol-high` | Native read and cancel passed; redundant second stop failed because daemon already stopped |
| Grok | `f1e5ebd0-1a56-4a1b-8037-4b8401c11f84/grok-acp-xai-grok-4-6-high` | Passed |
| AGY | `f1e5ebd0-1a56-4a1b-8037-4b8401c11f84/antigravity-cli-google-gemini-3-1-pro-high` | Passed |
| Codex | `f1e5ebd0-1a56-4a1b-8037-4b8401c11f84/codex-desktop-gpt-5-6-sol-high-dd-flow-0-9-0-beta-11` | Passed |
| OpenCode | `952f7627-0ccd-4161-b48e-b1a560095085/opencode-server-opencode-big-pickle-default` | Passed |
| ZCode | `3d1d7a54-a314-4034-8e5c-25c78a4ad52d/zcode-acp-zai-glm-5-3-high` | Passed |

Droid emitted actual native settings transition Sol → Kimi K3. Both models were
retained and progress displayed the change. Cause is unknown; quota exhaustion
was neither induced nor inferred. Native configured evidence does not prove
hidden response routing. Earlier unsuccessful smoke receipts were preserved;
cleanup addenda record subsequent cleanup without rewriting them.

## Release

CLI `0.9.0-beta.21`, source `2350e9cbeddba31e283d27384163b2bb44690d46`, published to
npm beta, Git main and annotated `v0.9.0-beta.21` pushed. Installed engine content:
`1daa9865f52088ae76a82cd26aeaf6b85399fa401dea0bc15e1c04d3d6903bb1`.
Build metadata pins canon 4.0.6 at `2aafb30d23e3f646b736b7ead25438cab97b16bf`.

Baseline source: `eval/cp-074-source-final` (separate branch from historical
`44939e9`), flow pack remains `f4d613d5b933aa7e0c77895e84dc9b8d24e4ffc9`.
Historical checkpoints and scored workspaces were not modified.

## Post-release qualification update

Frozen dd-eval `5a88c2276b00cab050908909eb42f898114e6af6` passed preflight against
installed beta.21. Baseline install, quality, browser and isolation all passed;
receipt: `~/.dd-eval/conformance/e2e-preflight/1788739647239-58b70886/e2e-inline-merge-droid-sol-high/baseline-admission/receipt.json`.
E2E `EVAL-20260907000948-658e07d0` started on that frozen definition and cp-074.
It emitted a native Sol → Kimi transition with later cause `overage_proactive`;
no account settings or intentional quota consumption were used to provoke it.

Repeated live qualification root `b3ea74f6-7f71-4653-9391-ff5926fccd74` passed
Droid, Codex, Grok, AGY and OpenCode. ZCode read passed but initial stop response
exceeded its timeout; subsequent cleanup of the same daemon was confirmed clean.
The original receipt remains unchanged. Investigation showed diagnostic read
before cancellation and continued profile-preparation RPCs after cancellation.

Follow-up changes cancel known owned Sessions before diagnostic observation,
check ZCode's dispatch guard between profile RPCs, and cancel before inspecting
its tree. Regression covers an expired deadline and failed child cancellation
without skipping the root. Targeted tests: 46/46; full suite: **230/230 passed**,
`/tmp/dd-eval-cancel-observation-full.log`. ZCode live read + immediate stop passed
under `f8247e0e-d7c7-43a4-978c-7d829ba1f387/zcode-acp-zai-glm-5-3-high/receipt.json`.
These follow-up changes did not alter the already running E2E definition.


## First full E2E outcome and follow-up

`EVAL-20260907000948-658e07d0` reached completed CODE after native source repairs,
then stopped during CODE-REVIEW repair WRK-019. Sixteen physical native children
were reconciled to their registered Works. The final repair was blocked because
the accepted check had `required_artifacts: []`, and the engine collected only
required files; the repair could not retain an additional screenshot without
changing the accepted packet. This run did not reach MERGE and is not accepted.

The launch then lost its `daemon.stop` response. Retained daemon evidence records
`shutdown_state: clean`, `active_tree: false`; the actual owned process identities
have exited. An immutable `qualification-cleanup-addendum.json` under that EVAL
root records this separately; original receipts remain unchanged. The control
RPC reply was not recovered and is not claimed as observed.

Follow-up runner fixes establish an incomplete semantic stage outcome before
cleanup, so a lost stop response cannot mask that outcome. Recovery now compares
retained process birth identities when available; a recycled PID belonging to a
new unrelated process no longer blocks settlement. Missing identity remains
unconfirmed. Both daemon-owned and managed-process evidence use this rule.
The ZCode fixture waits for an observed productive operation instead of assuming
it starts within 150 ms. Full suite: 231/231 passed
(`/tmp/dd-eval-semantic-pid-full.log`); the subsequent managed-process birth-identity
regression is recorded in `/tmp/dd-eval-recovery-birth-target.log`.

CLI beta.24 is prepared on the newly merged shared-harness-runtime baseline with supplemental evidence collection shared
by normal and recovered checks. Required files remain minimum pass obligations;
symlinks are excluded. The supplemental collector passed 311/311 tests before integration;
78/78 harness tests passed against the integrated bundled adapter files.
Typecheck and lint passed. The complete integrated CLI suite is running.
Publication and a fresh Codex/Sol E2E qualification remain pending. The previous Droid run is retained as an adaptive harness result with
observed Sol → Kimi routing, not as a Sol-only completed E2E.


Checkpoint cp-075 keeps the exact cp-074 source and flow pack, pins the installed
beta.24 artifact `5ec4a3554b9231673301feaf299082f3ee4fee48b20fa0b0f096b8053a8e7c69`,
and selects a new Codex/Sol E2E run profile. Preflight uses the immutable installed
engine under `~/.dd-eval/conformance/engine-beta24/`, independent of global updates.
No earlier checkpoint, source tag, or scored Subject workspace was changed.


The first Codex capacity probe created three completed children but was rejected
because a stale `thread/turns/list` response (`interrupted`) overwrote an already
observed native `turn/completed` event (`completed`). The adapter now prefers
that exact Turn's terminal event after in-flight reads. Regressions cover both
success and interruption precedence: 24/24 Codex tests passed; the bundled
adapter regression suite passed 4/4. The repeated live probe qualified **3**
children with clean cleanup, not the requested upper bound of 15:
`~/.dd-eval/conformance/native-subagents/20260907023303665/codex-desktop-gpt-5-6-sol-high-dd-flow-0-9-0-beta-11/capacity.json`.
The first failed receipt remains unchanged. cp-075 was rejected at capacity
admission before baseline/Subject; a new checkpoint will pin the corrected
beta.24 artifact rather than changing cp-075's content identity.

The old Droid qualification was closed with the normal cancellation control
path: retained adapter settlement confirmed cleanup; candidate remained
`incomplete`, final state `cancelled`. Its final Judge completed on that
incomplete candidate. No additional Subject prompt or replacement daemon ran.
The integrated pre-race-fix CLI suite passed 321/321 in
`/tmp/dd-flow-beta24-suite.log`; the final Codex-only delta is covered by the
native and bundled regressions above.


Final beta.24 was published from CLI commit `931f704348792d785f3a32ec7ee09aaf176c97a9`.
The new cp-076 pins its installed digest
`7608382cb1c5420813f1492836f720db6f237c4c1ddc4ee3c89a20d30cee1040`;
cp-075 remains immutable. The final conformance engine lives under
`~/.dd-eval/conformance/engine-beta24-final/`. Registry artifact audit, preflight
and the new E2E remain in progress.


Registry audit completed: all 165 files in the npm package match the installed
conformance snapshot, including CLI/canon build metadata. Audit receipt:
`~/.dd-eval/conformance/engine-beta24-final/registry-artifact-audit.json`.
A fresh npm dependency resolution produced a different full-content digest;
the global engine was explicitly aligned to the qualified immutable snapshot.
Global CLI is beta.24 and selected snapshot checksum is `7608382...ee1040`.
No running EVAL was rebound to the different dependency snapshot.

cp-076 preflight passed install, quality, browser and isolation. Receipt:
`~/.dd-eval/conformance/e2e-preflight/1788748741661-8ceaa3b6/e2e-inline-merge-sol-high/baseline-admission/receipt.json`,
SHA-256 `582ac9320ecd9fa954fc0148575c31596b26acc453f4b327e2c74b70f123fe4c`.
New E2E `EVAL-20260907024127-4abd3fe2` uses frozen dd-eval
`9c5311ce4272864b3c7d18162f9762b4d76fadec`, the exact cp-076 engine, and qualified
native capacity 3. Its own baseline admission passed; SPECIFY completed after
the canonical interaction-Judge exchange. Remaining stages and final acceptance
are pending. The frozen definition and Subject workspace remain untouched.


cp-076 interim native review evidence (2026-09-07 03:18 UTC): SPECIFY,
PROTOCOLIZE and PLAN completed. Five physical Codex children completed their
PLAN-REVIEW assignments across two capacity-bounded waves. Four returned
`needs_changes`, one returned `pass`; the coordinator is processing findings
in the same run. This is not yet an E2E completion verdict.

Model observation limitation: the adapter model journal currently contains
root configuration observations only. The five child session journals each
contain native `turn_context.model = gpt-5.6-sol`, but those child observations
were not projected into the adapter model journal. Therefore the existing
`available_native_sources` summary must not be read as complete tree-wide
model attribution. The separate native evidence confirms child configuration,
not hidden provider routing or per-model token costs. The running frozen engine
and original observation journal have not been modified to backfill this gap.


cp-076 final qualification outcome: cancelled before CODE-REVIEW completion,
not a completed E2E. CODE completed after two Subject-owned browser repair
Works and passed fresh API, web, docs, quality and browser receipts. The first
CODE-REVIEW wave produced two completed reviewers, while WRK-014 remained in
an interactive `--result-stdin` finish invocation for more than twenty minutes
without a result receipt. WRK-013 had independently diagnosed terminal canonical
input truncation and recovered using non-interactive redirection. No evaluator
prompt, source edit or terminal input was injected into the Subject.

The normal cancellation control receipt confirmed clean settlement; candidate
`4cc376234cc758ea6f0738ca51fc1b1b4d35a3e73c60748a4725915ba6755ca0`
was frozen as `incomplete`. A later launcher stop timed out after cancellation;
read-only process checks confirmed the retained provider and waiting finish
processes were gone. Runner cleanup now uses the existing generation reducer
to skip an already settled cancellation and avoid stopping a newer generation;
late stop transport errors reconcile against the accepted settlement.

CLI beta.26 (`ca419f51a8553a6ddb6a8275412a98bfa10bd0d4`) now rejects interactive
TTY result submission before routing, state creation or progress heartbeats.
Pipes, redirection and result files remain available. The patch includes the
parallel beta.25 test-isolation release. Two targeted rejection regressions,
34 existing lifecycle tests, typecheck and lint passed. The final version/TTY
suite passed 3/3; the published installed CLI rejected a real PTY immediately.
All 165 package files matched the final source build. Artifact audit:
`~/.dd-eval/conformance/engine-beta26/registry-artifact-audit.json`.

New cp-077 preserves source and flow-pack identity and pins beta.26 installed
checksum `dfe8530a0640e7952792b023f444c300a913384e0d3c0a8525521894ba46a237`.
Its qualification is pending; cp-076 and its evidence remain unchanged.

The final cp-077 source suite passed 233/233; focused checkpoint/reducer/regression checks passed 72/72. cp-076 final Judge completed against the unchanged incomplete candidate.

## cp-077 outcome and coordinated follow-up

Run `EVAL-20260907045257-eab7aba4` used the frozen dd-eval definition
`dd41ad0e9eca313317cef2fb9650f58166fc3efa` and the installed beta.26 engine.
SPECIFY, PROTOCOLIZE, PLAN and PLAN-REVIEW completed. The scenario-owned HITL
answer was matched by Interaction Judge. Five native PLAN-REVIEW children ran
in waves of three and two; all submitted results. The coordinator corrected
nine accepted findings and classified one duplicate before passing review.

CODE Work `WRK-009-prt-007-task-priority-p1` completed with four passing
receipts: API contract, PostgreSQL integration, pre-feature priority upgrade
and web unit tests. The aggregate CODE gate subsequently passed API contract,
integration, upgrade, docs and quality, but failed web unit and browser
readiness checks. The original failed receipts remain evidence even though
the earlier Work checks passed. A normal repair declaration created
`WRK-010-code-gate-repair`.

The repair child `01a07a84-890b-7be3-a2ec-7bc11d542b8a` ended before Work start
at 06:18:42 UTC with native `server_overloaded` and no final agent message.
The root `01a07a37-ff65-7df0-9a6d-e1cca14cbe18` then emitted
`serverOverloaded`, `willRetry:false`, `thread/status = systemError` and a
failed current turn at 06:19:39 UTC. This is a provider capacity failure, not
an inferred quota fallback or a Subject code verdict. MERGE was not reached.

The adapter reduced the failed turn to generic `turn_interrupted`, losing
the native error detail on the normalized path. Its stop observation accepted
terminal turns for `notLoaded` only, so the `systemError` thread remained
unsettled despite a terminal failed turn and no active operation. Automatic
cleanup and a subsequent normal cancellation both returned
`tree_not_settled`. Recovery inspection reported `recovery:null`.

The failed execution retains its original incomplete evidence snapshot:
`executions/e2e/failure-evidence/f1eb27e9-fda2-4a83-8222-6e0e5e9a1e7a`, manifest
SHA-256 `ca00b66f95325c1006e4f77c602dac3c3b80ba7068ec95f3a978f3c8a6504bd4`.
No Subject prompt, source patch or engine replacement was injected. Local
cleanup subsequently verified the retained daemon identity and its direct
app-server child, stopped the provider group, and stopped the daemon through
its managed process lease. No owned PID remained. The separate operational
receipt is `~/.dd-eval/conformance/cp077-local-cleanup/receipt.json`.
This does not rewrite the original adapter settlement; the run remains
failed/cancelling, without a finalized candidate or Judge result.

Coordination with tasks `dd-eval` and `dd-eval2` established these boundaries:

- The shared runtime/policy CLI commits `4e29998`, `bcfd8cb` and `8274ba3`
  are ancestors of published beta.26 `ca419f5`.
- dd-eval PR #1 (`1999682`, bundled adapter execution) and dd-memorybank PR #1
  (`8794e3a`, routing/policy guidance) were still open at verification. They
  are not included in cp-077 or the canon `2aafb30` used by beta.26.
- Consequently, cp-077 pins the Flow engine, but adapter dispatch still uses
  the configured eval-side command. It does not qualify execution of the
  adapters bundled inside the engine artifact.
- Task `dd-eval` owns beta.27, synchronized adapter source/bundle integration,
  AGY native-child hooks, active-coordinator recovery, and the confirmed Codex
  terminal-settlement/error-detail fixes. It will run the shared full AGY
  qualification through MERGE and Judge; acceptance remains pending.

A concurrent late publication of beta.23 temporarily moved npm's `beta` tag
backwards. Readback confirmed its correction to beta.26 (`latest` stayed
0.8.0); the beta.26 artifact and pinned cp-077 engine were unaffected. The
tasks agreed on one beta.27 release owner and a final artifact readback before
the next qualification. This channel incident is separate from the native
capacity failure above.
