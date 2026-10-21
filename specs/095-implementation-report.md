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
| memory-layer: prepared targets retain version proofs… | e3-memory-target, same body | No extra tool launches; source/executable identity |
| memory-layer: prepared tool identity checks… (3 tool variants) | e3-memory-target, same body | Changed lint/WT/Git rejected |
| memory-layer: shared lint qualification… (2 routes) | e3-memory-target, same body | Existing bank preserved; no init/tool reselection |
| memory-layer: upgrade lint qualification rejects… | e3-memory-target, same body | Ignored temporary config rejected |
| memory-layer: lint capability requires actual JSON… (4 variants) | e3-memory-target, same body | Version alone insufficient; malformed acceptance rejected |
| memory-layer: lint probe cleanup preserves primary… | e3-memory-target, same body | Original error retained; only owned scratch removed |
| memory-layer: real explicitly selected mb-lint… | e3-memory-target, same opt-in | Real tool capability; missing prerequisite remains SKIP |
| memory-layer: target preflight negative matrix… (7 cells) | e3-memory-target, same body | Exact files preserved; no store/publication effect |
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

PR stack: FLOW [094 #101](https://github.com/deksden-com/dd-flow-cli/pull/101) →
[095 #103](https://github.com/deksden-com/dd-flow-cli/pull/103), canon
[#7](https://github.com/deksden/dd-memorybank/pull/7), EVAL
[094 #125](https://github.com/deksden-com/dd-eval/pull/125) →
[095 #127](https://github.com/deksden-com/dd-eval/pull/127).

Final frozen identities, complete gate receipt locations, package smoke and
integration PRs will be added after verification. Current development checks
are not full release evidence and do not authorize publication.
