# CP-203 canonical refusal semantics

## CP206 live verification and recycled privileged PID

The reentered comparison submitted Judge-only
`EVAL-20261008124957-46a74fd1` and JEV
`EVAL-20261008130116-e0938858`. Both finished with settled cleanup, matched
conformance and confirmed SPECIFY completion. Stage durations were 526744 ms
and 535260 ms; HITL pauses were 56325 ms and 46999 ms respectively. JEV returned
covered with confidence 0.66 in 6056 ms; threshold 0.93 correctly selected native
Judge fallback, which returned covered. The original semantic request is retained
with its hash; canonical bytes and historical verdicts were not changed.

The third submission stopped in `assertHitlQualification`, before `executeEval`
creates any scored manifest or native Subject. Its isolated home has no `runs`
directory. The comparison conservatively retained the launch intent without an
ACK and stopped rather than blindly replaying an uncertain submission.

Retained qualification cleanup was clean/settled at 11:37:52Z, but its daemon
PID 40196 had become UID 0 `/usr/sbin/spindump`, born at 13:11:57Z. The shared
retirement check threw on `kill(pid, 0)` EPERM before checking birth identity.
EPERM says only that signalling this PID is denied, not that it is the old
daemon. The common helper now proceeds to the existing read-only birth probe
for EPERM, preserving the same one-second ambiguity guard. A missing/corrupt
stop time, unavailable birth probe, live old incarnation or other signal error
still blocks; no process is signalled or historical lifecycle receipt rewritten.
All callers (Judge cleanup/publication, driver replacement, cancellation and
qualification preparation) use the same corrected helper.

Regression: 9/9 PASS, no skips/failures, covering Judge cleanup, qualification
intent/recovery and recovery safety. The exact retained qualification verdict
now passes read-only cleanup verification with its original settled timestamp.
The third authorized variant needs a fresh single-variant campaign only after
this proven pre-EVAL rejection; the original incomplete campaign remains
unchanged. Full engine testing is still running, not claimed passed.

Fresh single-variant campaign `cp-206-specify-decisions` acknowledged
`EVAL-20261008131843-7fc2ce8e` at commit `05f96c5`. All five baseline checks
passed; native Session `01a11bad-a381-7d21-8577-23cbdb3e971d` entered running
SPECIFY at 13:22:27.104Z with gpt-6-luna/xhigh and matched conformance. OpenAI
Decisions returned covered in 1524 ms, confidence 0.55, on its first HTTP attempt;
fallback gpt-6.1-sol/high confirmed covered and the same Subject Session resumed
after a 45688 ms HITL pause. Both decision providers fell back in these samples;
this is not evidence of fast-path speedup. Threshold 0.93 is unchanged.

The full EVAL follow-up returned 760 PASS, 1 FAIL, 10 SKIP (771 tests,
512066 ms). The only failure expected EPERM directly from the old retirement
helper, despite its mocked unavailable `ps`. The corrected contract retains
the actual EIO and adds denied-signal contrasts for a new incarnation, same
incarnation, one-second ambiguity, absent stop time and unrelated signal errors.
All ten retirement/cleanup/preparation/recovery regressions passed, with no skips
or failures (`/tmp/dd-eval-075-privileged-pid-regression.log`). No additional
production change was needed. The full rerun is recorded separately; the failed
aggregate is not reported as PASS.

OpenAI Decisions `EVAL-20261008131843-7fc2ce8e` subsequently finished SPECIFY
at 13:31:34.128Z (547024 ms); its campaign finished at 13:31:55.482Z. Final
standard `runner status` independently confirms all three fresh EVALs finished,
cleanup settled, observation complete, matched conformance, zero active resources
and zero provider turns. Each has `target_reached=true`, `stage_outcome=done`,
`completion_reason=stop_after_reached` and `full_case_completed=false`.
There was one native HITL round per sample. None was resumed/restarted by an
operator, rewritten, or extended into PROTOCOLIZE. The original CP206 comparison
remains incomplete because the third pre-EVAL rejection was retained; the fresh
third sample is a separately identified campaign with the same comparison inputs.

| Variant | EVAL | SPECIFY duration | HITL pause | Decision route |
| --- | --- | --- | --- | --- |
| Judge only | EVAL-20261008124957-46a74fd1 | 526744 ms | 56325 ms | native Judge |
| JEV | EVAL-20261008130116-e0938858 | 535260 ms | 46999 ms | 0.66 confidence → native Judge |
| OpenAI Decisions | EVAL-20261008131843-7fc2ce8e | 547024 ms | 45688 ms | 0.55 confidence → native Judge |

These are independently generated questions/agent trajectories, one sample each,
not identical-input decision benchmarks. Paused time includes observation,
routing, cleanup and answer dispatch; it is not pure Judge compute. In these
samples the decision HTTP calls were fast but neither bypassed native Judge,
and neither demonstrates improved whole-stage latency. No calibration or extra
paid samples are silently introduced to obtain a preferred comparison result.

Final full EVAL verification after the retirement contract correction passed:
771 tests, 761 PASS, 0 FAIL, 10 explicit opt-in SKIP, 273780 ms
(`/tmp/dd-eval-075-privileged-pid-full-final.log`, exit 0). Test semantics, shared
semantic instructions, qualified native observations and all three scored
completion receipts now agree; no threshold/product/oracle relaxation was used.

Final complete engine gate at `d4ae3924015390de0a25c5b8df3fe149b25fdfe8`
passed with exit 0 (`/tmp/dd-flow-075-full-gate-final.log`): release verifier
2/2, release Vitest 8/8, integration 2234/2234 in 129 files, runtime-sensitive
43/43 in two files. No failed/skipped checks in these final groups. The preceding
build also passed (`/tmp/dd-flow-075-full-build-final.log`); typecheck/lint were
already passed at the same clean source/test tree. This supersedes the incomplete
aggregate attempts as verification evidence, not by rewriting their logs.
The scored samples still use the immutable CP205 beta.125 candidate from runtime
source `356a4e1`; the intervening flow commits change only test setup. No main
merge, public release or accepted-runtime promotion is claimed by this task.

## CP205 follow-up: semantic background and retained requests

All three requested SPECIFY variants were submitted. Judge-only
`EVAL-20261008104125-bf6dc922` completed SPECIFY in 529256 ms (pause 55121 ms).
OpenAI Decisions `EVAL-20261008111007-58a56d99` completed SPECIFY in 420471 ms
(pause 23210 ms), campaign `cp-205-specify-decisions` finished with settled
cleanup and matched conformance. Its HTTP request took 2037 ms, confidence
0.97, first attempt; no native fallback was needed. JEV
`EVAL-20261008105513-e8042302` remains an immutable terminal semantic failure
with settled cleanup. These independent trajectories are not a causal speed
comparison, nor full E2E acceptance. The original three-variant campaign stopped
on JEV failure; Decisions was a separate single-variant campaign after settlement.

The JEV failure was not a provider/retry problem. Its 0.64 confidence correctly
fell back at threshold 0.93. Native Judge treated the Subject's background
heading "Зафиксированное ограничение" as an independent request to enforce
archive priority read-only behavior. The frozen accepted_decisions were empty;
the initial request explicitly left archive rules undecided. The canonical
answer explicitly introduces the narrow priority-edit exception and preserves
all other read-only fields. No actual Q-001–Q-003 asks for the invented extra
enforcement rule. Shared instructions now distinguish existing behavior and
Subject assertions from independently accepted feature constraints. An explicit
replacement resolves only the replaced condition: independent notifications,
other-field questions and conflicts with independently accepted rules remain
unresolved. The authored corpus includes the exact real question and two
negative contrasts (44 items total). Canonical answer bytes, product source,
threshold and unresolved-HITL stop policy are unchanged. New prompt semantics
require new native observations; the previous 41-case PASS is historical only.

Readback also exposed an input-retention defect: semantic observations stored
only the request hash, then reconstructed instructions from current code.
Changing the shared prompt invalidated read-only status of a historical successful
Decisions run. New observations retain the full validated request before HTTP;
readback binds its hash, packet projection, question contract, policy, EVAL and
original dependency fingerprint without a model call. Native Judge readback can
use the original full preview only when its capacity-chain filename/hash and
every paid turn validate. New qualification still requires current instructions.
Legacy semantic receipts without original request bytes remain explicitly
unverifiable under changed instructions (`semantic_request_unavailable`); they
are never backfilled, resampled or presented as newly verified. Their original
terminal campaign/report is retained.

Status follow-up: HITL readback failure now preserves the durable RUN state and
returns `interaction_resolution=unknown` with its typed verification error.
Observation enrichment uses cloned execution results: adding diagnostics cannot
mutate the in-memory journal revision or turn settled cleanup into pending.
Comparison checks evidence/ownership blockers before accepting even a finished,
settled sample, so unavailable proof cannot release the next paid variant.
The combined status/comparison/retained-evidence/execution-contract regressions
passed 72/72 (`/tmp/dd-eval-075-status-readback-final.log`).

The full EVAL suite returned 759 PASS, 1 FAIL, 10 SKIP. Its sole failure was a
fixture that required an exhausted worker's best-effort one-second status read
to succeed on a loaded host. A repeated diagnostic retained the real safe
outcome: `recovery_blocked`, zero remaining budget and no scope result, not a
wrong release or new native mutation. The test now independently proves exact
release projection/stale-generation rejection with a bounded read; the spent
worker must preserve zero budget and issue only native status commands. An
explicit delayed-response contrast checks the unavailable branch. Production
timeouts/ownership policy are unchanged. Control suite: 36 PASS, 5 SKIP, 0 FAIL
(`/tmp/dd-eval-075-control-budget-final.log`). A full suite rerun follows this
fix; the earlier aggregate is not reported as PASS.

The subsequent EVAL aggregate was 758 PASS, 3 FAIL, 10 SKIP (771 tests).
One existing active-status test still expected the old throwing API on corrupt
answer bytes; it now checks explicit unknown/error, absence of usable HITL proof
and unchanged journal. Two control fixtures assumed a short diagnostic deadline
always obtains an ACK (including a one-second read of an already applied
release). Release identity reuse is checked with a bounded ten-second read;
the short UX cases retain their deadline and permit only honest unknown
acceptance before any response. They still require pending, no applied journal
release, no native action except status/resume and at most one preparation.
This is test-contract correction, not longer production timeouts or retrying a
failed test until it happens to pass.
Combined active-status, control, monitoring and comparison verification:
102 PASS, 5 SKIP, 0 FAIL, 107146 ms
(`/tmp/dd-eval-075-readback-control-final.log`).

The updated shared Judge prompt produced all 44 original native observations.
All status/response-ID expectations matched, including the exact CP205 positive
and notification/accepted-conflict negatives. Twenty-two unresolved cases were
manually compared against their authored remaining decisions; bound review
sidecars retain the native verdict and expectation hashes. Assessment reuses
these observations without another model request. Clean-tree reassessment passed
at `78bb3a4`: key
`522445572f8952313a9e214cb25fc1c28a5e731b4fdc06fb5c2a069747c2d22d`,
44 reused cases, zero additional native calls
(`/tmp/dd-eval-075-cp206-definition-reviewed-final.log`).

CP206 comparison admission then stopped before any scored launch. The first two
profiles were admitted; the third staged engine's 15-second version probe was
unavailable. Receipt `cp-206-specify-comparison/receipt.json` has no launch intent,
ACK or EVAL ID, and all three variant homes have no scored manifests. A read-only
probe of the retained staged entrypoint subsequently returned beta.125 with exit
0 in 901 ms. The retained failure proves unavailable observation, consistent
with simultaneous host delays, not dependency corruption; it does not preserve
the OS error well enough to prove a more specific historical cause. Re-entry
must use the same campaign, never blind paid
resubmission.

The subsequent aggregate attempts were interrupted before a final result;
partial output is not PASS. They exposed further test setup timing assumptions:
process-json positive wiring required Node startup inside 1.5 seconds, and one
exact-release reuse assertion still required a one-second response. Pure injected
clock tests retain sliding-window arithmetic; process wiring uses the normal
operational window, while silence/heartbeat negatives retain their short window.
Release reuse has a bounded ten-second diagnostic read. Production durations and
release identity checks are unchanged. The affected clock/process/control/fork
run passed 98 tests, with 5 explicit opt-in skips and no failures
(`/tmp/dd-eval-075-final-affected.log`). Both fork cases that failed during the
interrupted loaded run passed, preserving exactly one launch and recovery.
The subsequent full EVAL gate completed: 771 tests, 761 PASS, 0 FAIL, 10 SKIP
(explicit opt-in integration checks), 316964 ms
(`/tmp/dd-eval-075-gate-sequential.log`).

Full engine gate at runtime commit 356a4e1: release passed; integration 2233 PASS,
1 FAILED, and runtime-sensitive group was not reached. The single failure was
the orphan fixture's direct confirmation under a transient unavailable OS birth
probe. It bypassed the production bounded no-effect confirmation retry. Commit
cc6e5a9 reuses the existing identity fixture helper for setup with the exact same
record/lease and original 30-second uncertainty guard; it does not retry the
test, alter runtime bytes or weaken ownership fences. Affected 70/70 PASS;
typecheck/lint/build PASS. The full rerun was interrupted and had exposed the
same single-shot identity setup in snapshot fixtures. Commit `d4ae392` applies
the same bounded helper to the two remaining snapshot setup calls; all four
affected snapshot checks and typecheck/lint passed. Runtime artifact bytes are
unchanged. No complete full-gate PASS or release/main promotion is claimed.

The fresh SPECIFY comparison stopped before any scored EVAL. Qualification
`b6191a4826a0b5b1ea3083e8f4011a73957e80c38044f842336617de30ebcefb`
returned `definition_qualification_mismatch` for `luna-cp190-exact`: native
Judge asked for the order of a fixed scale despite the canonical answer
explicitly excluding separate ordering/ranking. The native turn completed
with `gpt-6.1-sol/high`, and its physical cleanup was settled. This was not
a transport timeout, missing fixture, or permission failure.

The detailed grounded Judge had an explicit vocabulary-versus-order rule;
compact coverage and semantic decision prompts had only a general refusal
rule. All routes now use `canonicalExclusionRule` from `hitl-contract.mjs`:
an explicit refusal resolves the excluded mechanism and its dependent
parameters, but not independent decisions, unknown references, or ordering
required by an accepted comparison rule. No canonical product answer,
authored expectation, confidence threshold, or failure gate was weakened.

The existing positive real-question corpus and negative independent-gap cases
remain authoritative. Offline regression checks shared instruction wiring
and rejects the original wrong verdict; only live qualification checks model
behavior. Changed prompts create new native task identities, not replacement
calls for a failed immutable task. Historical receipts remain untouched.

Targeted verification: 67/67 PASS (`hitl-contract`, `hitl-coverage`, compact
qualification review, corpus and semantic-decisions suites). `git diff --check`
also passed. No model calls are involved in these deterministic checks.

The first repaired live prompt resolved `luna-cp190-exact` correctly but exposed
another mismatch at `gap-and-extra`: lack of a calendar design was mistaken for
an unidentified reference. The shared rule now distinguishes an identifiable
yes/no addition (uncovered if unanswered) from a material unknown antecedent
(ambiguous). No negative expectation is relaxed. Full suite before this second
clarification: 739 tests, 729 PASS, 0 FAIL, 10 SKIP, 103358 ms.

The legacy shadow declaration tracks the new JEV instruction hash, but does
not claim promotion or reuse an old held-out classifier certificate. The
three requested profiles use `semantic_decisions`, not legacy shadow policy.

The attempted launch used the standard sequential comparison, pinned beta.125 engine,
`gpt-6-luna/xhigh` Subject and `gpt-6.1-sol/high` fallback. Each next variant
requires durable `finished`, completed SPECIFY, matched execution conformance,
and settled cleanup. Live results are recorded in external campaign receipts.

## Live acceptance blocker (not repaired by the prompt change)

On the final code, deterministic verification passed: 739 tests, 729 PASS,
0 FAIL, 10 SKIP, 104138 ms. The updated native qualification
`5a3aa593d0d10894dfd807d41ddfb4b849f7a97b39be128da7013415f97a3ed1`
completed 35 of 41 observations, including both previously failing semantic
cases. Its next operation stopped with `process_ownership_unknown`.

The bounded maintenance child exhausted its deadline while opening the RUN
and resource SQLite stores (`store_open` at 2334 ms, `lookup` at 2356 ms,
resource `store_open` at 3154 ms with no remaining budget). Timeout cleanup
reported `kill EPERM`, so the managed-daemon binding was poisoned rather than
blindly retried. This is fail-closed behavior, not proof of model failure.
The request journal has no native Session or model Turn; provider process
`PROC-codex-provider-d854fd57-df4a-4d58-a1f1-b0498f1b4a90` is stopped, but
daemon `PROC-codex-daemon-5fd27079-0b00-47b5-b290-358b77bb0bcb` (PID 4553)
remained running with unconfirmed cleanup. Read-only runtime status confirmed
that distinction. No scored EVAL was created.

Follow-up must preserve ownership fences and immutable evidence:

- Maintenance transport: distinguish useful phase progress from silence,
  inside the existing finite lease-uncertainty budget. Do not extend it from
  synthetic polling, or bypass native dispatch admission. Retain subprocess
  identity and actual exit/tree observation when a signal fails; `EPERM` alone
  must not be converted into successful cleanup. Validate progressing startup,
  silence, expired authority, delayed acknowledgment and unconfirmed cleanup.
- Qualification: distinguish prepared task intent from accepted native model
  dispatch. Permit preparation recovery only with bound no-dispatch evidence
  AND authoritative physical cleanup. An empty Session list alone is not such
  proof; absence of a final must not authorize paid resampling. Test crashes on
  both sides of dispatch and corrupt/foreign/no-cleanup evidence.
- Use a reviewed immutable runtime artifact and a new checkpoint for any
  engine repair. Never patch this historical operation or hand-edit its
  resource registry/qualification verdicts to obtain admission.

## Implemented follow-up (candidate, not a release/launch receipt)

The engine branch `fix/074-maintenance-progress`, commit `abf9f55`, based on current origin/main,
now uses the existing 30-second ownership-uncertainty budget for each serialized
maintenance command. Its 5-second silence window advances only on a new,
request-bound structured storage/maintenance phase. Ordinary logging, duplicate
phases, foreign process/action, incomplete JSON, hook events and polling cannot
extend it. The original child storage deadline, outer ownership horizon and
unconfirmed-cleanup poison remain. Timeout diagnostics also retain subprocess
PID; a failed group signal plus observed leader exit does not prove subtree exit.
Affected checks: 73/73 PASS; native CLI transport checks: 5/5 PASS; typecheck,
lint and build PASS. This is not full runtime-release acceptance; this branch
must not be substituted into the historical pinned beta.125 artifact.

Qualification intents now have an explicit prepared/dispatch barrier before
native Session creation. Reassessment permits only an exact bound preparation
with complete durable stop/physical retirement, no Session, no verdict and no
productive native operation. Dispatch intents, old intents, failed cleanup,
changed/foreign packet/profile/path and live daemon remain blocked. The new
regression covers these boundaries; successful observations remain immutable.

Affected EVAL recovery/cleanup/fork/preparation checks: 73/73 PASS. The first
broader run had two failures and is not counted as acceptance: its synthetic
maintenance transport still imposed the old 5-second deadline; a cleanup test
could confuse cold CLI startup cancellation with rejection of an invalid reply.
The fixture now uses the shared ownership budget. The cleanup test additionally
records and asserts all three observed native replies, so an abort cannot make
its negative cases pass. These changes do not relax production settlement or
scope validation. The follow-up full-suite result is recorded separately below.

The broader recovery run also exposed a stale-generation test relying on a
spent worker's best-effort 1-second final diagnostic to invoke its fixture CLI.
That read is not a guaranteed dispatch under host load. The test now separately
observes and asserts `runtime_scope_release_unproven` for the wrong generation,
then checks that the spent worker never projects a release or performs native
mutation. Both generation cases pass; production deadlines remain unchanged.

Read-only reassessment identifies the current pending task as
`heldout-offline-client`, native key
`81ced6ea2f250aa2cc2204b2b85a052ba38ec2c2b3eb140238b17147fc71252e`.
It returns `definition_qualification_outcome_unknown`, `legacy_unknown`; PID
4553 is still live. No missing dispatch marker was invented retroactively.
The historical unconfirmed maintenance subtree has no retained subprocess PID;
the exact reason for the OS signal denial is not established by its phase log.

Release acceptance and reconciliation of this old unresolved ownership are
still required before the comparison can be admitted. The 35 observations are
retained, not an accepted qualification or successful three-variant comparison.

Final deterministic EVAL verification after the fixture corrections:
740 tests, 730 PASS, 0 FAIL, 10 SKIP, 212420 ms; explicit engine source root
was the maintenance-progress worktree. `git diff --check` and affected module
syntax checks passed. The skipped live/opt-in tests are not acceptance evidence.

## CP204 follow-up — ownership horizon and pre-model recovery

The EVAL observer facade still capped confirmation/heartbeat requests at the
5-second transport silence interval. It now passes the remaining 30-second
ownership episode; the selected runtime alone applies its structured-progress
silence policy. Shorter explicit caller budgets, failed/late acknowledgements,
ownership fences and finite uncertainty horizons remain authoritative.
Maintenance tests: 39/39 PASS.

`runner definition reconcile --intent <native-intents/item.json>` is a separate
control operation, not model replay. It accepts only the inspected Codex contract:
exact retained packet/profile, Session-less sealed native tree, no prompt/capacity
chain/verdict, and a create rejected at ownership admission. It verifies registry
lease/registration/PID/group bindings, stops only the two exact owned resources
using `runtime process stop`, observes terminal registry records and retired OS
groups, and publishes a separately bound reconciliation sidecar. Old intents,
daemon state, failed cleanup and native outcomes are not rewritten. Reassessment
rechecks that proof before allowing the missing preparation to be sampled.
Unknown native requests, live/replaced resources, changed packet/profile and
foreign ownership remain blocked. `runtime process reconcile --owner` is NOT
used: its owner argument claims all eligible expired records, not one old owner.
Recovery and CLI checks: 40/40 PASS, with the exact two-resource suffix contract
also rechecked against the retained live records.

The CP203 `heldout-offline-client` preparation was reconciled at
2026-10-08T09:45:55Z: daemon PID4553 and provider PID4656 are retired; their
registry records are terminal. The original failed shutdown evidence remains.
Its separate proof lives beside native intent `8deb96c3…`; this is no Judge PASS
and authorizes no replacement of any of the 35 completed observations.

The fresh CP204 engine is a development candidate from `abf9f55`, built against
unchanged canon `b91f821` and packed/installed in fresh qualification directories.
It does not replace CP202/CP203 bytes and is not a public npm release. Full-suite
results, installed matrix proof, final definition qualification and launch IDs
must be recorded when actually obtained.

Installed CP204 matrix fixture passed and its four real Stage publications were
independently qualified. Full engine checksum is
`970da6f642ff67e030ca7cb855bf8d09889a6359f152460a30a019bdb82a2859`;
checkpoint `cp-204-specify-decision-comparison` pins that exact candidate, with
unchanged product baseline, flow pack and canon. Admission uses the documented
pinned development override, not a claimed public release/accepted package.

The first broader follow-up EVAL run exposed a subprocess boundary mismatch:
monotonic remaining time is fractional, whereas `execFile` requires an integer
timeout. The facade now rounds remaining budgets down (never extends ownership).
The failed run was retained in `/tmp/dd-eval-075-full.log` and its owned test
group was retired; it is not acceptance. Maintenance/baseline checks after this
correction: 47/47 PASS. A fresh full run uses concurrency two without weakening
assertions; the engine full suite continues separately.

## CP205 follow-up — end confirmed admission uncertainty

CP204's next preparation failed before Session creation. Its daemon log contains
a successful admission ACK followed by successful provider and daemon renewals;
the combined post-ACK time then exhausted admission's old uncertainty clock.
The error was `process_ownership_unknown`, action `admission`, effect `committed`,
`native_dispatch_started=false`. Cleanup was fully settled. This is a false
ownership refusal, not a model failure or unconfirmed physical stop.

Engine commit `356a4e1` ends admission uncertainty on the exact timely bound ACK,
before the post-ACK gate. That gate still verifies current RUN/lease ownership,
and every heartbeat retains its own finite uncertainty episode. Late admission
ACKs, late heartbeat ACKs, ownership loss and stale RUN generations still block
dispatch. Regression: 31/31 PASS; combined maintenance suites: 51/51 PASS.
The previously running full engine gate was stopped because it used the previous
build; its log `/tmp/dd-flow-075-full.log` is not acceptance. A fresh full gate
runs in isolated `cp-205-engine-build` against the unchanged packed candidate.

Qualification reconciliation now also recognizes that exact typed admission
refusal, with the same sealed no-Session/native ledger, immutable input and
lease/PID/group proof. Unknown effects or native dispatch remain ineligible.
Both heartbeat/admission recovery regressions PASS. The CP204 preparation was
reobserved at 2026-10-08T10:14:03Z; both resources were already terminal and OS
groups retired. Historical outcomes are unchanged; reconciliation is a sidecar,
not a fabricated native response or a paid replay.

The broader EVAL gate exposed a test invocation defect: default discovery also
executed helper `.mjs` files, while parallel modules raced a shared case's
temporary untracked-input probe. Standard `npm test`/`validate` now select only
`test/*.test.mjs` and serialize modules. All nine previously failed scenarios
passed on repeat with unchanged assertions; the serial full gate runs separately.

The installed CP205 candidate passed the real offline PLAN/CODE/MERGE fixture
and independently verified four Stage matrix publications. Its source commit is
`356a4e1e95526cbaa9a379f01ff9673dc8187b1d`, tarball SHA256
`cf30fb7d1d326ebef56f4938fad768784d46a9405b66af6500fbb2b76482c4c7`,
engine checksum `276d34874bc8c7d92908822307cb0b08a2ade14ec062a644cd223b17fb6f10dd`.
It remains an explicit development candidate, not a public release or aggregate
release acceptance. CP204 and earlier artifacts/checkpoints are retained.

Corrected full EVAL invocation: 745 tests, 735 PASS, 0 FAIL, 10 SKIP,
732937 ms (`/tmp/dd-eval-075-serial-full.log`). The extra admission recovery
case was separately rerun with the heartbeat case: 2/2 PASS. Typecheck, lint,
build, installed matrix and module syntax checks also passed. The case now pins
CP205; qualification continues only the six genuinely missing native samples.

CP205 definition qualification subsequently passed all 41 cases. Six missing
observations were obtained, reviewed against their original native verdicts,
and retained; final reassessment reused all 41 with zero new native calls.
Receipt key: `5a3aa593d0d10894dfd807d41ddfb4b849f7a97b39be128da7013415f97a3ed1`.

The first comparison EVAL `EVAL-20261008102834-b535b492` is terminal
`completed_with_failures`, cleanup settled, before any Subject Session. Install
and quality passed; browser tests could not launch Chromium headless shell 1234
because its executable was absent from the host cache. The pinned baseline
policy now provisions the browser using its own installed/locked Playwright
before testing, under ordinary process ownership and sliding inactivity.
Product source, canonical answers and Judge inputs are unchanged.

Separately, comparison polling confused missing `managed-runtime.json` during
baseline with unknown native ownership. Preparation may now continue only with
the exact acknowledged EVAL scope, alive observer PID/birth, unexpired leases,
no fences, no provider turns and only baseline/observer resources. Missing,
foreign, expired or productive ownership remains a blocker. Old EVAL/campaign
receipts are unchanged; the repaired run needs a fresh campaign.

Preparation/comparison regression checks: 55/55 PASS, zero failures/skips,
38943 ms (`/tmp/dd-eval-075-startup-regression.log`). The policy pin is updated
to include browser provisioning. No historical receipt or product tree changed.

The repaired Judge-only attempt is `EVAL-20261008104125-bf6dc922`.
It exposed one additional comparison edge case: the scoped process inventory
retains completed baseline records as `stopped`, not `finished`. The observer
now excludes the registry's two terminal states (`stopped`, `failed`) from
active-lease checks, while still checking every record's scope/kind. Orphaned,
foreign, productive and expired active records remain blockers. Regression:
50/50 PASS (`/tmp/dd-eval-075-startup-terminal-regression.log`). Comparison is
reobserved using the same campaign/acknowledged EVAL; no Subject replay.

Judge-only `EVAL-20261008104125-bf6dc922` finished at 10:55:09Z with
settled cleanup, matched conformance and confirmed SPECIFY completion.
Stage interval: 529256 ms; HITL pause: 55121 ms. One native Judge returned
covered and delivered the canonical package. This is SPECIFY completion, not
full E2E/product acceptance. JEV `EVAL-20261008105513-e8042302` was submitted
only after that settlement; Decisions remains sequentially queued.

Reentering a campaign now marks the active orchestration as running and clears
its previous blocker, rather than displaying an obsolete error during healthy
observation. It still reuses retained IDs and restores blocked on a new failure.
Comparison regressions: 51/51 PASS, zero skips/failures, 16509 ms.

The next live transition exposed the remaining false ownership check: a native
controller can already be registered before `managed-runtime.json` is published.
Scope membership is selected by the registry's retained `budget.scope_id`, not
equal owner IDs (controller/daemon owners legitimately differ). Missing that
exact execution manifest permits continued observation only with healthy scoped
resources and a bound alive observer. Missing unrelated files, inaccessible or
corrupt execution evidence, journal/continuation failures, scope fences, unknown
or expired active resources still block. This authorizes observation, never a
new native prompt or completion. Comparison regressions: 55/55 PASS, zero
failures/skips, 28365 ms (`/tmp/dd-eval-075-publication-final.log`).

JEV `EVAL-20261008105513-e8042302` passed baseline and reached SPECIFY.
Its HTTP result completed in 1286 ms with confidence 0.64; the configured 0.93
threshold correctly selected native Judge fallback. That Judge returned uncovered
for an archive read-only assertion in the question's background, despite the
canonical priority exception. The EVAL is completed_with_failures,
hitl_coverage_unresolved, cleanup settled. This is a retained semantic
classification failure, not a transport/retry or confidence-routing failure;
do not overwrite its verdict or loosen confidence to turn it into PASS.
The original multi-variant campaign remains blocked as designed. The third
authorized Decisions sample may use a fresh single-variant campaign after this
settlement; this does not make the original campaign a completed comparison.

Decisions sample `EVAL-20261008111007-58a56d99` uses fresh campaign
`~/.dd-eval/qualification/cp-205-specify-decisions`, after authoritative JEV
status proved settled cleanup, zero active processes and zero provider turns.
Its own baseline passed all five checks and timeline attached running SPECIFY
at 2026-10-08T11:14:07.940Z. Native inputs/models/checkpoint match the original
matrix; no previous scored EVAL was resumed/replayed. All three intended
variants have now started, but only Judge-only has a successful completed sample.

Remaining semantic finding needs a separately verified policy fix, not automatic
replacement of the native verdict: distinguish existing product behavior and
the Subject's preliminary assertions from accepted feature requirements; apply
explicit canonical exceptions only within their declared scope. Preserve genuine
independent questions and contradictory accepted answers. Add the exact retained
JEV question as a positive regression plus a negative case with a genuinely
unanswered independent archive rule before changing shared Judge/decision
instructions. A shared prompt change requires new native qualification; the
current 41-case PASS cannot certify different prompt bytes. This correction is
not implemented or claimed accepted here; the active Decisions sample remains
on its frozen admitted inputs. Full engine gate is still running, not PASS.
