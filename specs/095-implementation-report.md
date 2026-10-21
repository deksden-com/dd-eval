# 095 — Implementation and acceptance receipt

Status: implementation in progress; no release acceptance or merge claimed yet.
No new EVAL, engine release, pins or installed hooks changed.

## Source boundary

- Frozen parent runtime094: FLOW `6e972a2b`, preserved test follow-ups `03378f56`.
- Dependent FLOW branch: `fix/plan095-gate-cost`, separate checkout `dd-flow-plan095`;
  final frozen candidate `a03ff6a4bf3f8d3f9db75f9496088089ebaed90f`.
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
- Final typecheck and strict canon build PASS. The first profile admission refused
  a concurrently dirtied shared mb-lint checkout before executing any tests;
  no foreign work was altered. Fresh isolated same-commit input used instead.
- One full new profile is running under external artifact directory
  `_artifacts/plan095/release-a03ff6a4-b`; source/dist remain frozen throughout.
- Hybrid/canon completed with complete receipts. A foreign full CLI gate was
  confirmed still running under `SPC-014-E5.DLkGVh`; the user-authorized queue
  coordination was used. Own dispatch shell and Node E3 scheduler are held
  (not their current test child/teardown) until that task releases the heavy slot.
  No foreign process or active EVAL was signalled. Queue wait is not benchmark time.

PR stack: FLOW [094 #101](https://github.com/deksden-com/dd-flow-cli/pull/101) →
[095 #103](https://github.com/deksden-com/dd-flow-cli/pull/103), canon
[#7](https://github.com/deksden/dd-memorybank/pull/7), EVAL
[094 #125](https://github.com/deksden-com/dd-eval/pull/125) →
[095 #127](https://github.com/deksden-com/dd-eval/pull/127).

Final frozen identities, complete gate receipt locations, package smoke and
integration PRs will be added after verification. Current development checks
are not full release evidence and do not authorize publication.
