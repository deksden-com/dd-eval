# Plan 092 independent review — 2026-10-19

P1–P6 were reviewed against the implementation and callers. Two substantial
omissions were corrected and cross-reviewed. No other substantial omission was
found. This is offline acceptance, not a new scored E2E or live qualification.

## Corrections

1. **P3 — Codex owner budget before productive dispatch.** Successful setup
   reads consumed time, but `turn/start` received a fresh full ACK timeout;
   `thread/resume` used an unsampled elapsed value. The adapter could dispatch
   after its owner's observation window expired. The shared dispatch-budget
   helper now samples the owner immediately before each write and bounds ACK
   plus late-response grace to the remaining window. Expiry before dispatch is
   explicitly `no_effect`. A longer owner window remains distinct from the
   metadata read's 120-second cap. No productive write is replayed.
   Fake-clock regressions cover 99/100 ms, expiry before/after resume,
   partial/full/zero grace, longer owners and dispatch counts.

2. **P4 — final matrix profile@7 authority.** EVAL accepted only profile@6 even
   though the engine and current check tooling support @7. Merely allowing the
   schema would still miss runner-binding drift and compute a different hash.
   The consumer now matches the engine's baseline projection, planned-alias
   removal and recursive canonical @7 hashing, including
   `runner_evidence_by_alias`. Historical @6 serialization remains unchanged.
   End-to-end matrix-authority tests admit valid @7/key reordering/planned
   runner aliases and reject changed existing runner bindings.

## Completeness audit

- P1: OpenCode root/child identity, ancestry conflicts, moved cwd inspection and
  cancellation, productive route fences, reordered sets and unknown inventory.
- P2: scoped inputs in normal/detached/reuse paths, SQL custody, source repair,
  stale-successor bounds, declared inputs and directory symlinks.
- P3: setup/start/prompt/read/inspect/cancel/post-turn callers, strict envelopes,
  late read responses and retained native completion without productive replay.
- P4: frozen receipt ownership, logical execution/binding gates, obligations,
  completion, scoped failures, legacy receipts and final matrix authority.
- P5: original intake and delivered HITL custody, review source paths, immutable
  snapshots, latest-answer event fence and final Judge inputs.
- P6: optional creation-form priority label, canonical packet parity, case hash
  and independent uncovered-question negatives. Qualification native keys exclude
  engine/repository trees; oracle-only changes reassess preserved native finals.
  Canonical packet changes invalidate actual changed model inputs; missing-only
  dispatch and retained negative results remain enforced.

No product behavior was manually repaired. No new dependency, scheduler,
retry loop or Judge layer was introduced.

## Frozen candidate and full gate

| Component | Exact tested source |
| --- | --- |
| Engine | `19ca01d60193f96acf002246cfe7eb4d98b00ae1`, tree `93cd6a6376a1fb3782fd5c13e9a271a40db29c4f` |
| EVAL runtime | `aee24d6dc3c32d4230582f26cbea3530d5b60bf9`, tree `147b33e5cbbe4e6ea725e32b09c00acfdb62b2e4` |
| Canon | `a1cfe8b06329c691c314064b6ea6a3da6628cceb`, same tree as integrated `f1a1a479267d7e3934645d3aac1b39aa73718677` |
| Task check tooling | Integrated `1c728b32700d4a09565d2dd4adc7d4e132ba0821`; not a new scored Subject selection |

The unchanged strict build was packed and installed into a private prefix.
Node v26.8.2 / pnpm 10.23.0 / macOS arm64. Source SHA:
`32d1522238cfe22373cd1698ebba8f2dc8f44c8cf226e746cea3bb59d55ff08c`;
dist SHA: `0868efdaedda5d913b059141ec2e1a1fbd7f6dfc8f3362e334ca1810b792fff9`.
Integration was unsharded with the configured one-worker policy, not a filtered
or retried selection. Inventory verification confirmed complete coverage, exits
and unchanged source/build provenance for release, integration and native groups.

| Check | Result |
| --- | --- |
| Typecheck, ESLint, strict canon build | PASS |
| Hybrid / hybrid canon | 66 / 51 PASS |
| E2 / installed E2 | 133 PASS + 1 platform skip / 2 PASS |
| E3 / E3 canon | 473 PASS + 1 optional-fixture skip / 15 PASS |
| Release-build verifier / release | 2 / 8 PASS |
| Full integration | 174 files, 2919 PASS, no skips |
| Runtime-sensitive | 48 PASS, no skips |
| Complete paired EVAL suite | 942 PASS, 5 explicit optional-fixture skips |

Full chain: `2026-10-19T06:41:20Z`–`2026-10-19T07:52:59Z`, final
`REVIEW_GATE_PASS`. Receipts, exact recipe and complete log:
`/Users/deksden/Documents/_Projects/_artifacts/plan092-review.qtlxBa/`
(`gate.sh`, `gate.log`, `release/`, `integration/`, `native/`).
Both real mb-lint E3 cases ran. Explicit skips: absent fish, absent supplemental
retained completed-correction fixture, and five unconfigured EVAL cells requiring
authenticated Memory delivery (three), pinned dd-tasks fixture (one), or the
separate setup/Console tuple (one). These are not reported as passed. Existing
AJV strictTypes warnings did not fail the suite. Earlier canon lint reported
27 errors in unchanged files; shared prompts were checked behaviorally and for
copy parity, not claimed lint-clean.

Development attempts are preserved separately: a fresh unbuilt tree's initial
inventory selection returned 14 PASS / 1 `entrypoint_missing`; full acceptance
reran inventory after building and passed. An incorrect project filter selected
no files; an explicit ignored `.mjs` lint emitted a warning. Neither is counted
as accepted verification. Subsequent focused native/concurrency/capacity/hook
checks passed 73 cases; final native observation passed 6. This report and plan
status are documentation-only follow-ups to the frozen tested EVAL runtime.

## Integration and cleanup custody

Review corrections use engine PR #96 and EVAL PR #116, squash merges into main.
The original plan was integrated by engine #95, EVAL #115 and canon #6.
Clean duplicate diagnostics/task/canon worktrees and integrated CP235/236/092
task refs were removed after equivalence checks; superseded divergent document
history was saved in verified Git bundles in the review artifact directory.
Exact tested source/build trees remain detached so receipts stay verifiable.
Primary user checkouts, all concurrent E4 work, qualification homes, and genuine
unintegrated HITL/E0-isolation work remain intact. No uncertain operational tree
or credential-bearing ignored file was deleted.

No release, global installation/hook update, new EVAL or historical runtime
mutation was performed. A future launch must explicitly select the reviewed
engine/canon and current task check tooling; historical checkpoint pins are not
silently upgraded. Full offline PASS does not certify model correctness.
