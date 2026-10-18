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

## Source references

- Engine candidate: `ec2d85a618d92a2147c58afc62ba6369c449caf0`.
- Canon candidate: `7c97f36`.
- Task check policy: `1c728b32700d4a09565d2dd4adc7d4e132ba0821`, integrated
  into `deksden-com/dd-tasks` main. No product files changed.
- EVAL runtime changes: `a40d577`, `2387952`, `bcc6901`.

## Verification boundary

Focused regressions pass. Final gate results will be recorded after completion.
Canon lint was run: its 27 errors concern unchanged files; no changed file is
reported. The configured linter excludes shared dd-flow prompt files, so their
validation relies on behavioral/copy-parity tests, not that lint result.
Live semantic qualification and a new scored E2E remain separate future work;
no deterministic test certifies model/provider correctness.
