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
