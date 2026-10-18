# Plan 092 implementation

Implementation is complete; final offline verification and integration are pending.
No scored EVAL, release, global installation or historical runtime was changed.

## Changes

- OpenCode inspection and cancellation preserve one Session identity and stable
  inventory representation without hiding real ownership/topology changes.
- CODE checks bind relevant source inputs, execution/completion and frozen SQL.
  Unrelated concurrent Work no longer invalidates a receipt. Real input drift
  permits one safe deterministic successor, not an unbounded retry episode.
- Codex metadata reads share the bounded observation phase, accept delayed valid
  replies and reject malformed/foreign Thread replies before productive dispatch.
- Frozen EVAL consumers validate native receipt ownership and resolved runner
  obligations without inferring gate identity from directory names.
- Existing verification matrices retain the original accepted intake and delivered
  HITL question/answer packets. Reviews bind the exact accepted sources; later
  clarification cannot silently acquire an old independent review's authority.
- Canonical fixture and Judge instructions allow, but do not require, priority
  text on the creation form. This adds no product implementation requirement.

## Additional defects found during implementation review

- Empty/array Codex read envelopes could masquerade as loaded Threads: strict
  shared read validation plus malformed-response/no-dispatch regression.
- A zero-duration best-effort cancellation pass accidentally skipped children:
  preserve one pass while using the normal metadata-read budget.
- Targeted retry of one planned alias changed the full profile hash: retain all
  declarations and filter execution groups only; do not repeat unaffected checks.
- Declared directory symlinks could hash only the link, not target contents:
  fail closed and require the contained real source path rather than add a second
  filesystem traversal implementation. File symlinks remain content-aware.
- EVAL compared unenriched required artifacts against runner-enriched receipts:
  reconstruct only trusted runner obligations and reject arbitrary additions.
- New accepted-source contracts could be omitted from the frozen matrix:
  independently reconstruct the exact inventory from frozen SQL Stage packets.
- Scoped artifact metadata now agrees with frozen SQL, not only receipt JSON.
- The E3 source-reference regression still expected three proof files. It now
  checks the exact receipt/completion/input-manifest/declared-artifact inventory;
  the added manifest is not silently ignored or accepted by count alone.
- Canon schema mirrors and exact reviewed source inventory were synchronized;
  shared prompt/schema parity is verified rather than waived.
- The complete integration gate exposed a diagnostic-authority regression:
  mutable receipt annotations could falsely block source repair. Engine and
  frozen EVAL consumers now derive failures from SQL and verify the independently
  hashed/bound execution outcome. Dropping a JSON obligation cannot hide that
  outcome; forged mutation/missing-output annotations cannot grant a failed
  result or invent Judge facts. Legacy receipt behavior is retained.
- The stale-input successor had a duplicate annotation-equality guard. It now
  reuses the shared evidence validator without relaxing the single-successor,
  deterministic-contract or real-drift requirements.
- The Codex concurrency test mocked an entire module and omitted the new
  metadata-phase export. Its inspection barrier hid the immediate daemon error
  behind a timeout. The mock now retains real exports; the barrier also surfaces
  early failures, with an explicit no-dispatch regression. No timeout increase.
- Runtime-sensitive coverage exposed an ownership/routing conflation in OpenCode:
  an owned Session that moved cwd must remain inspectable/cancellable. Immutable
  Session/parent/root/adapter identity is still checked; observed cwd changes the
  inventory version and the existing route guard blocks productive dispatch.
  The dispatch-fence RPC fake also now supplies the required native Thread id.

## Source references

- Engine implementation: `ec2d85a6`, E3 manifest expectation `08427dd4`,
  diagnostic-authority/concurrency correction `b1816f1c`.
- Canon candidate: `a1cfe8b06329c691c314064b6ea6a3da6628cceb`.
- Task check policy: `1c728b32700d4a09565d2dd4adc7d4e132ba0821`, integrated
  into `deksden-com/dd-tasks` main. No product files changed.
- EVAL runtime changes: `a40d577`, `2387952`, `bcc6901`, `0c186fa`.

## Verification boundary

Focused regressions pass. Final gate results will be recorded after completion.
Canon lint was run: its 27 errors concern unchanged files; no changed file is
reported. The configured linter excludes shared dd-flow prompt files, so their
validation relies on behavioral/copy-parity tests, not that lint result.
Live semantic qualification and a new scored E2E remain separate future work;
no deterministic test certifies model/provider correctness.
