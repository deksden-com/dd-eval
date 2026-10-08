# CP-203 canonical refusal semantics

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

Launch uses the standard sequential comparison, same pinned beta.125 engine,
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

These runtime repairs are outstanding; the 35 observations are retained, not
an accepted qualification or successful three-variant comparison.
