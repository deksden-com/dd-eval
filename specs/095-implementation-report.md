# 095 — Implementation and acceptance receipt

Status: implementation in progress; no release acceptance or merge claimed yet.
No new EVAL, engine release, pins or installed hooks changed.

## Source boundary

- Frozen parent runtime094: FLOW `6e972a2b`, preserved test follow-ups `03378f56`.
- Dependent FLOW branch: `fix/plan095-gate-cost`, separate checkout `dd-flow-plan095`;
  first frozen diagnostic candidate `a03ff6a4bf3f8d3f9db75f9496088089ebaed90f`.
  Reporter/cost follow-up `286648a8` is isolated in `dd-flow-plan095-report-review`.
  Final offline-home isolation follow-up `c9c7b0cd` is integrated into the task branch.
- Canon companion: `c46098d65c4b4c317682de36503f0e531052ab92`, version 4.1.2.
- EVAL parent receipt: `b7fe1d1`; reviewed plan095: `407ae81`.
- Frozen mb-lint source `5cc35eb4f28fc97f5bb52211373281b258381e08`,
  isolated verification checkout; actual local tools mb-lint 0.4.0, Worktrunk 0.77.0.
- Existing primary local main and foreign test processes were not modified.

094 had no full green gate: its stopped/failed attempts are preserved as such.
095 tests the combined source; moving tests does not itself accept runtime094.

## Guarantee transfer map

No original assertion deleted or weaker outcome substituted.

| Old location / cases | New location / preparation | Preserved guarantee |
| --- | --- | --- |
| prepared targets retain version proofs while rechecking source and executable identity without launching tools | e3-memory-layer → e3-memory-target, same body | No extra tool launches; source/executable identity |
| prepared tool identity checks still reject changed lint, Worktrunk and Git executables | same move/body; mb-lint, wt, git | All three changed executables rejected |
| shared lint qualification supports an existing upgrade bank without init or tool reselection | same move/body; supported and unsupported lint | Existing bank preserved; no init/tool reselection |
| upgrade lint qualification rejects a linter that ignores temporary configuration | same move/body | Ignored temporary config rejected |
| lint capability requires actual JSON acceptance and invalid-YAML rejection, not a version response | same move/body; good, version-only, invalid-json, always-success | Version alone insufficient; malformed acceptance rejected |
| lint probe cleanup preserves primary failure and reports only its own retained scratch | same move/body | Original error retained; only owned scratch removed |
| real explicitly selected mb-lint passes isolated positive and negative capability probes | same move/body and opt-in | Real tool capability; missing prerequisite remains SKIP |
| target preflight negative matrix preserves exact files without publication or store effects | same move/body; empty-memory, partial-memory, linked-memory, missing-wt, missing-lint, no-git, foreign-workspace | Exact files preserved; no store/publication effect |
| Default full-engine bootstrap/upgrade payload assembly | One private process-local prepared archive | Actual installRelease, checksums, authority, SQL, controller and drift assertions unchanged; custom roots uncached |
| Five integration hotspot initial schemas | Prepared closed empty schema; independent regular DB files | Existing cases/SQL CAS/independent writers/WAL/recovery/publication races unchanged; project/RUN/Session/lease freshly created |
| Ownership/admission seed INSERTs | One fixture-only SQL transaction | Same rows; no FS/provider/CLI operation moved under writer |

19 default installations (20 with the existing real-linter opt-in) are removed
from target-only cases. Real installation/authority scenarios remain installed.
The private prepared archive is verified against frozen inputs at family end;
mutable Buffers are never shared. New schema helper rejects existing stores,
orphan WAL and invalid shared resource files before copying.

Native six-entrypoint × four-invalid-budget cells retain their real CLI checks:
each has independently parsed argv/wiring, so removing them merely for speed
would weaken the adapter boundary. Shared policy already has direct in-process
assertions. No provider retry/timeout policy changed for test speed.

## Evidence / measurements so far

- Prepared schema helper: 3/3 PASS, bodies 249 ms; independent worlds, shared
  registry explicit opt-in, existing/WAL target refusal.
- Ownership original parent: 31/31 PASS, total 100.99 s, bodies 92.70 s.
- Schema-only intermediate: 33/33 PASS with helper, total 113.15 s: no speedup.
- Batched fixture seed: same ownership 31/31 PASS, total 35.21 s, bodies 30.51 s.
- External load differed; these observed timings do not establish a precise
  causal speedup. Reduced SQL commits/archive assembly/install counts are the
  auditable improvement; no repeated full baseline for benchmarking.
- A one-second read-only sample of the final memory-layer process observed
  748/837 main-thread samples under Node fsync/fcntl. This is only a local sample,
  not a whole-gate attribution. It shows a remaining physical durable-I/O cost;
  durability was not disabled or mocked to make the optimized gate appear fast.
  Sample: `_artifacts/plan095/development/final-memory-layer-sample.txt`.
- Droid daemon targeted: 6/6 PASS, 12.36 s, including real teardown. Historical
  failed `ps` observation remains unclean, not rewritten to PASS. It does not
  prove a deterministic runtime defect; physical absence cannot be inferred
  from the old command failure. No blanket retry or skip added.
- Receipt selection targeted: 5/5 PASS, including discovery mutation rejection.
- Publish contract targeted: 8/8 PASS (mocked acceptance/publish boundaries).
- First moved E3 check exposed a missing lexical SHA256 helper; corrected before
  acceptance. Failed attempt retained, not silently retried as an accepted gate.
- Corrected moved target suite: 8 PASS / 1 existing real-linter opt-in SKIP,
  zero failures, 28.67 s. Typecheck PASS after fixing optional-close annotations
  and the parent094 fixture's missing await for a late provider owner.
- Cross-review closed CI report transport/verification, local installed smoke,
  bounded interruption and environment-selection gaps. Ordinary E3 requires real
  Worktrunk; CI now installs a pinned checksum-verified binary instead of skipping
  the guarantee. No new required capability was invented: the pre-existing case
  already refused to skip without that tool.
- Final receipt/SIGTERM contracts: 7/7 PASS; final workflow/release contracts
  8/8 PASS. Real interrupted wrapper remains non-PASS even if its child exits zero.
- Initial candidate typecheck and strict canon build PASS. The first profile admission refused
  a concurrently dirtied shared mb-lint checkout before executing any tests;
  no foreign work was altered. Fresh isolated same-commit input used instead.
  Subsequent review removed this over-strict mb-lint cleanliness requirement:
  its actual consumer verifies historical Git objects, not checkout HEAD/content.
  Canon cleanliness remains required because its working files are consumed.
- One full new profile is running under external artifact directory
  `_artifacts/plan095/release-a03ff6a4-b`; source/dist remain frozen throughout.
- Hybrid/canon completed with complete receipts. A foreign full CLI gate was
  confirmed still running under `SPC-014-E5.DLkGVh`; the user-authorized queue
  coordination was used. Own dispatch shell is held after the current E3 family
  initially pending queue coordination; the already-running test family and
  teardown are not suspended. Its scheduler was briefly held then released to
  avoid pausing the Node reporter protocol. Existing overlap is recorded, not
  presented as an uncontended benchmark.
  No foreign process or active EVAL was signalled. Queue wait is not benchmark time.
  The user subsequently authorized continuing our sequential chain alongside the
  foreign task; overlapping wall times are not an uncontended benchmark.

| Initial frozen profile family | Collected | PASS | Explicit skip | Receipt wall |
| --- | ---: | ---: | ---: | ---: |
| hybrid | 66 | 66 | 0 | 16.74 s |
| canon | 71 | 71 | 0 | 20.01 s |
| E2 | 136 | 135 | 1 | 139.88 s |

These receipts are from the same frozen candidate, not a mixture of development
targets. Source/build/platform/environment verification succeeded after each.
Remaining families and installed smoke are still pending; no overall PASS yet.

The initial profile was deliberately superseded after the reporter finding.
Its exact E3 wrapper received SIGTERM; its held dispatch shell was resumed so
the nonzero result could terminate the chain instead of dispatching E4.
`owned-process.json` correctly records `interrupted_cleanup_unconfirmed`;
no PASS/clean teardown is inferred. A subsequent process-group observation
found no member of the owned group 5783. Partial artifacts remain preserved.

Additional reporter review found a real identity gap: Node nested case counts and
nesting were retained, but `fullName = data.name` omitted parent context. Node26
provides native IDs only in newer minors, so the corrected reporter uses ordered
reporting parent frames compatible with Node26.0, checking IDs when present.
The follow-up is committed in a separate checkout so the running candidate is not mutated.
Real two-file/default-concurrency/helper-source and legacy event regressions pass;
the complete receipt contract file is 8/8 PASS. The fixture-cost regression is
1/1 PASS; CLI starts/completions and TS transpilation counts/time are recorded
without retaining arguments. These are cost observations, not physical drain proof.
This candidate's partial results remain diagnostic evidence, not final acceptance
of the corrected reporter. Final policy evidence must identify the corrected source.

Final offline-env sweep found a concrete operator-home dependency in the E3
project target helper and the external Work launch helper: real managed-home
preparation could read operator Codex config/auth links before invoking a fake
adapter. Both now use an empty fixture-owned CODEX_HOME; sensitive home-policy
tests retain their explicit source homes. Invalid operator TOML/auth sentinel
regression: 1/1 PASS; external Work launch: 56/56 PASS; full lint PASS.
The 286 profile finished hybrid/canon/E2 with valid receipts, then its dispatch
shell was terminated between families before starting E3. Exit143 is intentional;
it is not a complete release PASS. No source was edited during either profile.
Final coherent acceptance is being prepared from c9c7b0cd.

## Frozen full profile (c9c7b0cd, failed and interrupted)

Artifacts: `_artifacts/plan095/release-c9c7b0cd`, outer log adjacent `.log`.
Build, full typecheck and full lint PASS. No source/dist mutation during the run.

| Family | Collected | PASS | Explicit skip | FAIL | Verified exit |
| --- | ---: | ---: | ---: | ---: | ---: |
| hybrid | 66 | 66 | 0 | 0 | 0 |
| canon | 71 | 71 | 0 | 0 | 0 |
| E2 | 136 | 135 | 1 | 0 | 0 |
| E3 | 533 | 524 | 9 | 0 | 0 |
| E4 | 80 | 79 | 1 | 0 | 0 |
| build contracts | 2 | 2 | 0 | 0 | 0 |
| release contracts | 8 | 8 | 0 | 0 | 0 |

E3 wall 3959.51 s is an observed loaded-host run, not a speedup claim. Its
memory-layer counters show 141 real installs, 141 fixture-specific canon archives,
75 engine archive assemblies including custom variants, and only two engine
payload scans. The shared default engine payload was prepared once, copied 68
times into independent consumers and boundary-verified once. Custom fixture
variants are intentionally not folded into a shared mutable cache.
Integration found six failures and was subsequently stopped through its exact
owned wrapper after the user's targeted-acceptance decision. Receipt exit1 and
`interrupted_cleanup_unconfirmed` are retained. At interruption all observed
descendants belonged to its PGID2655; wrapper2420, runner2655/2752, worker49700
and the process group were subsequently absent. This is not a claim that every
past fixture teardown completed. Native was not dispatched by that failed chain.

Integration has exposed four runtime-budget failures; this profile cannot be
declared PASS. Three cleanup fixtures predate the intentional custody changes
in FLOW `5fc08230`: they omit the real scope-control intent and worker token, so
startup returns superseded before reaching the intended injected failure.
The persistence fixture also incorrectly expects finish after uncertain state
persistence, which the retained-metadata custody guard intentionally prohibits.
They are being corrected in a separate checkout; production guards are unchanged.
The fourth crash-atomicity case expected child exit89 after INSERT but observed a
different error. Its precise exit/stderr must be examined before choosing a fix;
no timeout increase or blanket retry has been applied. A diagnostic selected
run passed both crash phases; the original cause is not proven by that rerun.

A fifth failure is the runtime-scope-resume `cached-fenced` case; its precise
actual result is being investigated separately. The user explicitly approved
targeted acceptance and candidate merge instead of another full profile after
the fixes (plan §10). No historical receipt will be reassigned to a new source;
no release-accepted status will be produced by this implementation task.

A sixth failure is the scope-stop physical-owner fixture: confirmation cannot
observe process birth under host load. Its normal setup bypasses the existing
bounded `retryPhysical` used by adjacent fixtures. The setup confirmations are
being aligned with that helper, retaining the same IDs, leases and assertions;
no production ownership policy or whole-test retry is introduced. The observer
crash test and cached-fence test now retain full phase-specific diagnostics so
an unreached faultpoint cannot be mistaken for a rollback/fencing defect.

Engine follow-up `2df88d75` changes only these three test files. Full typecheck
and targeted lint passed on its tree in the isolated review checkout; the
production build then passed at the final commit. Diagnostic selections:
cleanup3/3, crash-atomicity2/2, cached-fenced1/1 PASS. The latter has no proven
production fix; its original failure remains explicit. Whole affected files,
fast baseline, hybrid and the missing native group are being checked with
separate receipts at `_artifacts/plan095/merge-2df88d75`. No old receipt is
promoted to the new source.

That selected run finished with 835 PASS / 1 FAIL across 17 files. Its single failure is
now proven by the retained stack: `registerManagedProcess:141`, observer
registration, `physical_identity_unavailable`, `effect:no_effect`, in the
scope-resume fixture's direct registration. The other 16 files passed, including the
fast baseline, receipt policy, scope-stop and scope-budget cases. A further
test-only follow-up aligns analogous ordinary registrations/confirmations with
the existing bounded observation helper. Generated scripts use one startup
horizon and the same retained process/lease, never a whole-test retry or respawn.
The crash child's former 10 s guard is replaced by the existing fixture startup
plus cleanup budget; exit 89 and actual rollback assertions remain mandatory.
Unsuccessful fixture startup now joins its owned daemon/provider before
handoff. Only the two changed files need another run; the unchanged 835 results
remain evidence at their original source, not a fabricated final profile.

PR stack: FLOW [094 #101](https://github.com/deksden-com/dd-flow-cli/pull/101) →
[095 #103](https://github.com/deksden-com/dd-flow-cli/pull/103), canon
[#7](https://github.com/deksden/dd-memorybank/pull/7), EVAL
[094 #125](https://github.com/deksden-com/dd-eval/pull/125) →
[095 #127](https://github.com/deksden-com/dd-eval/pull/127).

## Targeted candidate acceptance (user-approved plan §10)

Final engine source: `9c3ecc183b026a26e35eb225dc77ec99371826d5`, tree
`208fdf5fc3dda971bb32290ba9c24a07c07bb74b`. Canon: `c46098d6`, tree
`28360b42108042f4d91b01a2450cc57e054bb217`. Node26.8.2 / SQLite3.53.4,
macOS arm64; concurrent host load, no wall-time speedup claim.

- Full typecheck and affected lint PASS on the identical tracked tree in the
  isolated review checkout; production build PASS on the final source.
- Hybrid 66/66 PASS at `2df88d75`; the subsequent delta changes only two tests.
- The selected baseline at `2df88d75` retained 835 PASS / 1 FAIL. All unchanged
  16 files passed, including the fast baseline, scope-stop and receipt policy.
- Final changed files: 43/43 PASS; final missing native group: 52/52 PASS.
  Both verified receipts are in `_artifacts/plan095/merge-9c3ecc18`, scope `merge`.
  Source hash `39b7009e1f9b7be37d1eb1a87b9ead18af2ef2aac996baf9ac67e33b49c81e2e`;
  tested dist hash `1c9071fc73a44aea786f866a098c934f79261234d7a714dae2ef7d7f3b19bdf9`.
- First package smoke correctly rejected missing canon build metadata before
  packing. The standard generator then changed only `dist/build-info.json`,
  with strict canon enabled; release-build contracts passed 2/2. Runtime bytes
  were not rebuilt or changed. Earlier receipt identities were not rewritten.
- Regular isolated npm installation of the exact final tarball passed
  version/install/resolve/status and consumer tuple/checksum verification.
  Tarball SHA256 `9d96234561bcd53f2dc343e024135245928112b77296056ebcf08ff9d90c836a`;
  engine snapshot `7e812772fb569eff913a8f736bd945114b16500a732503a90ba71978712cbe5f`.
  Smoke log: `merge-9c3ecc18-package-smoke-b.log`; manifest remains `built` with
  empty suites, `release_accepted:false`. No install-script policy was weakened;
  npm's warnings about unapproved native build scripts remain in the log.

This is targeted implementation acceptance, not a coherent full release PASS.
Original failed/interrupted attempts and the unresolved exact cause of their
nonreproduced crash/fence failures remain visible. No release, EVAL, pins or
installed hooks were changed. Neighbour V19 timeout and two-homes launch-gap
failures are independent evidence, not claimed covered by this acceptance.
Related EVAL capacity/supplement tests passed 50/50 with the explicit
`DD_FLOW_SOURCE_ROOT` pointing to this engine. An initial command omitted that
required fixture input and failed eight preconditions before native scenarios;
both attempts remain in `eval-094-affected*.log`, without changing test guards.
Integration is through the PR stack above; its merged commit identities are
recorded in GitHub PR status and the final handoff, not as release qualification.
