# Plan 105 — implementation receipt

## Scope

Implementation spans dd-flow-cli, dd-tasks tooling and dd-eval. No product source
or assertion was repaired manually. Historical CP254 definitions, evidence and
runtime remain unchanged. No new EVAL, provider request, release, installed-hook
update or GitHub CI is part of this implementation.

## Delivered contracts

- P1 / D1–D2 / D14: synchronous Testing Library DOM 10.4.1 query failures have a
  narrow native proof. Producer records bounded frames before human DOM truncation;
  engine and generated EVAL reader verify pinned helper bytes, candidate test,
  raw input artifacts and captured identities. Unknown/async shapes remain
  unsupported. Existing repair consumers share this disposition; no stage-specific
  exception was added. Probe @1 retains five cases; explicit @2 adds library-query.
- P2 / D3–D4: active SPECIFY packets include system contract and engineering rules.
  One existing shared rule handles inherited public-error requirements for grounded,
  compact and Decisions routes. Four corpus cases include the exact CP254 question
  and independent new-error-format negatives; authored corpus hashes are updated.
- P3 / D5–D9 / D12–D13: baseline and active child traversal share lineage guards;
  registration precedes native observation. Continuation preserves parent/root.
  Native-message dedup detects positive identity/profile contradictions, including
  reconnect. Conformance preserves conflict > missing > matched precedence and
  does not treat non-asserting observations as proof. Requested and executed Judge
  profiles are reported separately.
- P4 / D10–D11: shared snapshot reader validates binding/seal independently from
  process retirement. RUN-scoped settlement uses actual registration proofs;
  observer/Judge separation requires owned identities, not role labels alone.
  Authorized cleanup ingests late capture once, preserving original failure,
  without another launch, prompt, stop, resume or Judge call. Recognition remains
  read-only; active/unknown processes still block physical settlement.

## Verification

Only impact-selected contracts and targeted producer tests are executed. Original
failed attempts remain retained. Initial new test-fixture failures (corpus count,
authored hashes, duplicate helper-directory setup, wrong fixture control-bin home)
were corrected without weakening expected outcomes. Browser regression uses the
existing pinned browser cache explicitly because verification isolates HOME.

Live semantic acceptance is deliberately pending separate authorization: corpus
expectations and deterministic packet/oracle tests are not a fresh Judge verdict.

### Engine / producer acceptance

- Engine: `/tmp/dd-flow-plan105-verification-final/verification.json`, PASS,
  12 impact-selected contracts, 748 top-level cases and 44 nested native cases.
  Final attempt executes only the five updated library-proof tests, reuses ten
  contracts and revalidates one. OpenCode's 44 native cases were executed in the
  preceding retained successful contract attempt, not skipped.
- dd-tasks: `/tmp/plan105-producer-tests-r2.tap`, 13/13 PASS, including real
  synchronous query and native browser observations. Only tooling scripts changed.
- Generated EVAL proof mirror matches final built engine (`sync-runner-proof --check`).
- The installed producer/consumer test actually exercised both @1 (five cases)
  and @2 (six cases) in the retained first scoped EVAL attempt; legacy CP247 proof
  replay remains optional because its historical report directory was not supplied.

### Integration

- dd-tasks main: `03be9411b6bcbaf9fae7ecfacb5d687750af443a` (fast-forward).
- dd-flow-cli: PR #131, squash main `f4e4feff133404beb33874f5778e6cdcaae35ea6`;
  merged tree equals tested implementation commit `7c4e7988`.

### EVAL acceptance

Final scoped receipt:
`/private/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-eval-scoped-GoSknd/receipt.json`.
PASS: 59 selected files, 497 cases (487 passed, 10 explicitly allowed optional
integration skips). The final aggregation reuses all 59 validated receipts and
executes zero additional tests. The final recovery-file attempt passed 66/66:
`/tmp/plan105-recovery-final-file-drkUSm/result.json`.

Optional skips are published-engine admission (2), installed/legacy producer
integration (2), exact external zero checkpoint (1), and real-CLI control (5).
Installed producer @1/@2 integration was separately executed successfully above;
the other optional boundaries are not claimed as new release/EVAL acceptance.
All new 105 regressions executed, none skipped. Required selected-engine source
was explicitly supplied for native-capacity/supplement fixtures; skipped capacity
tests were rejected, not accepted as PASS.

Completion date: 2026-10-26. Source implementation complete; live semantic
acceptance and release/new EVAL remain separate, not implicitly authorized.

### Additional test-boundary corrections

Existing doubles were updated where they contradicted actual contracts: native
@2 capability and reused cleanup runtime, idempotent exact-target runtime symlink,
RUN scope in control replies, and independent physical proof for cancelled work.
Same-scope logical settlement without physical evidence is explicitly negative.
The current native-shaped receipt plus inventory positive is in the linked 105
regression; the retained top-level physical flag test is labelled legacy compatibility.
The IPC mock uses a unique short socket directory because macOS Unix socket paths
have a finite native limit and the adapter already shortens long runtime paths.
