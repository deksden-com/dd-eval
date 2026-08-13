# 004 — Beta eval launch and review

## Problem

The controller prompt for the previous 3.2.0 run still instructs standalone
priming and repeated preflight before `stage start`. Its intake is written by
the evaluated agent. Beta controller materials also need to be bound by hash
to the preparation manifest, not merely referenced manually.

## Decision

`dd-eval prepare` writes the initial user request verbatim to a deterministic
ignored `.tasks/dd-flow/intake/<case>/initial-request.md` after it creates the
immutable `eval-input` commit. The file is a controlled untracked input; its
path and SHA-256 are recorded in `*.run.json`. Clarification and hidden review
materials remain outside the repository.

Checkpoints may override named controller/operator materials. `prepare` resolves
those paths under `dd-eval`, validates them, and hashes the selected files into
the manifest. The first beta checkpoint selects this bundle's
`controller-initial.md`; old checkpoints retain their historical controller
prompt.

The beta controller creates a Goal when required, then calls the intake-provided
bootstrap command as its first flow action. It stops after the receipt records
`waiting_for_user`. No separate prime/run/session procedure appears in the
controller prompt.

Review has two ordered gates: mechanical validity first, semantic quality
second. `context_misses` is recorded only by post-run reviewer analysis. A
repeated or contractually required miss becomes a candidate for the next stage
packet, not an instruction asking the evaluated agent to score itself.

## Acceptance

1. `prepare` test proves selected beta controller prompt and hash appear in the
   run manifest.
2. It writes only the initial request under ignored `.tasks`; source tree and
   `eval-input` commit remain unchanged.
3. Preparing the same checkpoint twice produces the same intake bytes/hash.
4. Controller prompt has `Goal -> bootstrap -> worker prompt -> finish` order.
5. Review template distinguishes invalid infrastructure flow from model quality.

## Out of scope

Embedding clarification/reference/review material in the evaluated repository,
creating a separate eval runner, or automatic model scoring.
