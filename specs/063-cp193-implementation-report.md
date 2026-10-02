# Plan 063 implementation

Scope: shared Interaction Judge; no product changes, native harness updates or scored E2E starts.

## Implemented

- J1/J2: grounded v2 atoms preserve exact question fragments, reference bindings and exact answer evidence. The common prompt separates resolving a reference from matching a canonical answer.
- J3: aggregate coverage/status/selected IDs derive from atoms, never independently from model-authored summaries. Contradictory coverage is rejected.
- J4: answer issuance validates the packet, original question/stage and exact fixture before joining unchanged canonical answer bytes.
- J5: reference/productive replay and evidence use a shared verifier of event anchors, packet/receipt hashes, stage/pause/scope/round, profile/Session, cleanup and exact answer bytes. Historical v1 remains read-only compatible; new issuance requires v2. A settled saved pause verdict is reused; an unknown original paid outcome blocks instead of starting another Turn.
- J6: shared packet builder, validator, prompt and contract constant used by production, qualification and smoke. No added dependencies.
- J7/J9: 16-item corpus including unresolved/resolved references and mixed independent decisions; targeted atom expectations cannot be satisfied by dropping a question while retaining the same aggregate class. Offline tests are contract checks, not semantic model proof.
- J8: failed qualification retains expected/observed atoms, item identity, contract and evidence paths. Judge proof/context/cleanup failures are evaluation infrastructure errors, not Subject defects.

Frozen source snapshots enforce declared roots, symlink containment and source checksums. Qualification reconstructs inline grounding from authored source bytes, rejecting internally consistent but forged text.

## Validation

Initial dirty-tree full suite: 413 pass, 10 fail, 8 skip. Definition-binding tests require the committed changed corpus; other failures were obsolete checkpoint-name and incomplete fake historical HITL evidence. Those fixtures were corrected without weakening v2 admission.

Final clean-tree suite on implementation commit `80f5a81`: **423 pass, 0 fail, 8 conditional skips** (431 total). `git diff --check` passed. Independent integration review found no v2 issuance/replay bypass. Judge error attribution check passed.

Native qualification used gpt-6.1-sol/high through CPA, exact committed definition `80f5a81`, key `7addf94a38a67ed44c5119526fe4ad9f810f78e3887478f3b4db9c496fd5ba21`. Twelve items passed, including original CP193 `ambiguous-reference` (ambiguous, no response IDs). The thirteenth item `partial-covered` failed the targeted atom oracle. Model emitted separate covered atoms for priority levels and labels, plus the correctly out-of-scope SMS atom; aggregate class and selected IDs were correct. Oracle expected levels/labels as one covered atom. Thus this first failure is an oracle granularity limitation, not recurrence of CP193 or loss of the uncovered request.

First failure retained at:

`/Users/deksden/.dd-eval/definition-qualifications/7addf94a38a67ed44c5119526fe4ad9f810f78e3887478f3b4db9c496fd5ba21/operation-bc642520-6f56-49a4-82d8-9985ad90162b/failure.json`

Full semantic acceptance is **not passed**. Per plan6.5 the live gate stopped at its first failure: no oracle/model/answer changes to force PASS, no rerun, no bounded pair trials and no scored E2E. Implementation is complete; a follow-up must explicitly author acceptable atomizations for the mixed question (or simplify its covered fragment to one independent decision), preserving one-to-one coverage and the independent SMS oracle. This documentation commit does not claim qualification of a different tree.

## Limits

Exact quote/hash validation establishes evidence consistency, not deterministic semantic correctness. The native Judge remains probabilistic; qualification and the bounded pair trials must pass separately. Unknown original Judge outcomes require retained-operation reconciliation, never a blind paid retry. Historical EVALs/receipts are not rewritten.

Ponytail full: one shared boundary fix, standard-library containment/hash checks, existing native execution/cleanup, no NLP parser, second Judge or service.
