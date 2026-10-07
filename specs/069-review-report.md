# Plan 069 implementation review

Review scope: implementation completeness and substantial defects; PR integration
is authorized. Live E2E, publication and historical-run repair are not part of
this review.

## Confirmed defects and corrections

1. Canonical model inventory publishes `session.harness_id`, while EVAL read
   `session.harness`. This discarded harness identity and allowed another harness
   with the same Session ID to satisfy coverage. Normalize the producer field,
   retain legacy controller compatibility and test both matching and wrong-harness
   observations using the real producer shape. Controller-state `profile.harness`
   is normalized through the existing mapping too. Missing/malformed asserting
   canonical identity and unknown controller harness conservatively mark coverage
   incomplete without discarding readable evidence; explicit non-asserting sources
   remain exempt.
2. Supplemental Judge inherited the original EVAL's frozen recovery home while
   replacing its control binary. Status/stop then rejected the inconsistent owned
   scope. Bind the supplemental owner's own recovery directory and exercise the
   public control-status path with a production-shaped original manifest.
3. Imported coordinator prompts retained obsolete absolute input paths, although
   leaf Work already rendered relocation receipts. Deliver a shared derived
   current Stage/recovery prompt; preserve original prompt/context bytes and
   hashes. Current operational metadata is read from the authoritative RUN DB.
4. A second recovery capture discarded the selected RUN's prior relocation audit
   receipts (they have no protocol ID). Preserve only that RUN's relocation proof
   rows so mapping composes across generations. The regression removes both prior
   project locations and verifies current paths, unchanged historical inputs and
   rejection of context drift.
5. Profile settings and checksum came from two separate reads. Freeze the parsed
   profile and its checksum from the same bytes; a mutation during preparation
   must be rejected before RUN creation.
6. The first relocation regression used a synthetic coordinator body and missed
   production CODE's trusted cwd, readiness receipt, block-summary, verification
   output and matrix locators. A production-renderer witness with the old roots
   offline reproduced this gap after real import. The correction projects these
   physical locators through verified, sequential longest-prefix mappings,
   protects accepted blocks and exact scoped invocation tokens, and explicitly
   prohibits executing historical embedded commands. The production regression
   checks two generations, all five artifact locators and unchanged lifecycle
   authority; lookalike prefixes and double mapping have negative witnesses.

Ordinary @2/@3 profiles still reach selected-engine structural validation before
model dispatch. Bootstrap failure without check receipts remains not applicable
to workspace validation, as specified in the plan; its primary error is retained.
No speculative tightening of dynamic scope materialization was added.

## Verification

- EVAL final focused journal/model/schema projection: 18/18 PASS, no skips.
- EVAL supplemental Judge: 17/17 PASS, no skips.
- FLOW Stage context/execution/reviewer tests: 31/31 PASS, no skips.
- FLOW paired real recovery/import regression, including a second generation:
  PASS. Filtered cases are not counted as acceptance of the entire file.
- Typecheck, lint and strict clean-canon build passed.
- First full EVAL review run: 601 PASS, 1 FAIL, 10 optional installed-path skips.
  The sole failure was the spent-budget observer's final one-second read under
  heavy host load. It reproduced separately; its retained record showed a pending
  observation, while wrong-generation evidence remained rejected. After heavy
  jobs finished, the same unmodified paired test passed 2/2. No runtime deadline,
  budget or authority check was weakened. This failed attempt is retained at
  `/Users/deksden/.dd-eval/qualification/cp-199-candidate/eval-review-tests.log`.
- First fully enabled final run: 579 PASS / 35 FAIL / 0 skips. Refreshing CP199's
  engine/proof changed checkpoint bytes but its active case still carried the old
  checkpoint hash. The existing exact-pin guard correctly rejected the mismatch;
  dependent negative tests also saw that primary guard before their intended
  fault. The case pin is updated as part of the same candidate chain, not by
  weakening verification. This attempt remains retained in
  `eval-review-final-tests.log`; it is not acceptance.
- A subsequent uncommitted-definition attempt: 601 PASS / 13 FAIL / 0 skips;
  the retained-definition guard rejected working-tree drift. The corrected tuple
  and active case pin were committed together before the next full run. No guard
  was weakened. Retained log: `eval-review-final-pinned-tests.log`.
- Committed EVAL `5d614a8`: 614/614 PASS, zero skips, all installed runtime paths
  enabled. Log: `eval-review-committed-tests.log`.
- FLOW `4088c0a`: all four integration shards passed (2220 cases / 128 files),
  native runtime-sensitive 43/43 and release 8/8; release-build self-tests 2/2.
  Inventory verification confirmed no missing/skipped cases. These receipts
  remain valid for that candidate, but do not cover correction 6; a new exact
  candidate and final receipts are required before integration.

Installed EVAL admission/lifecycle/restore tests passed with all optional paths
enabled. The fresh installed native fixture published four owning Stage packets;
CODE-REVIEW-off is explicit, not a claim of model-review qualification.

Earlier review candidate (superseded, receipts preserved): FLOW `4088c0a00f4da01f1248f86ad75590f51d66862e`,
canon `b91f82165cbf713739bec6cc9db2cb9867e1824e`, flow-pack
`cc6f6d99da6b2e3ec80ac6cc0941eb848800baa0`. Tarball SHA256:
`d0e2c482588cadaed0a800c57ad382af26740c5a6635b17b7d25be02ecf60dc8`;
installed engine SHA256:
`87802c9ee4554017b9404027c7272d4a29fa9224799f60cd8e7e7ddb97e6a46f`.
Fresh [qualification receipt](../checkpoints/cp-199-verification-matrix-qualification-review.json)
SHA256 `3598ec0c23b8c554c858c4eed6b534d431e4ddacef5cbca6db8368a184e858fe`.
That tuple's receipt packets remain unchanged.

Final reviewed FLOW source: `b74ba81f88cbb2fe3b752eb4579baac6b2244d6a`.
Tarball SHA256 `179a532bfb2f6bc722d023d198f8fc90d4d4a23a0179420efada8bdb718426f0`;
installed engine SHA256
`a09397ee52a51cd002c0050853920e8d38432139b723058d6871824e841a121f`.
Canon/flow-pack refs are unchanged. Strict build, typecheck and lint passed;
the final targeted suite passed 32/32 without skips.

Final [native matrix proof](../checkpoints/cp-199-verification-matrix-qualification-review-final.json)
SHA256 `e32702a5c9d6976725a87d81fa3209f6ac56b573a99c8e267a56fb6bd90a648f`.
CP199 checkpoint SHA256
`feb9dd426d5a2e345f6bcb56e0908109dc6e7502ed245d1ad9a8b16b54d635d6`
is exactly the active case pin. The four-stage proof and exact installed-engine
admission chain passed; pin/proof regressions passed 6/6 with no skips.
Final committed EVAL `89ee6db` full suite: **614/614 PASS, zero skips**, with all
installed-engine/runtime optional paths enabled; log:
`/Users/deksden/.dd-eval/qualification/cp-199-candidate/eval-review-final-candidate-tests.log`.

Final frozen FLOW receipts:

- integration shards 978 + 498 + 393 + 352 = **2221/2221 PASS**;
- union inventory: 128/128 files, all four integration projects, zero skips;
- runtime-sensitive: **43/43 PASS**; release: **8/8 PASS**;
- release-build self-tests: **2/2 PASS**;
- receipt wrappers verified unchanged source/build identity and exited zero.

Receipt root:
`/Users/deksden/.dd-eval/qualification/cp-199-candidate/gates-review-final`.
The complete snapshot suite includes the production CODE two-import witness;
full offline controller cycles cover Luna/Grok/AGY/ZCode plus repair, overload
and HITL. These are fixture-adapter cycles, not live model E2E acceptance.
The release-candidate consumer smoke passed against the exact tarball; its local
candidate receipt is `accepted` with the same installed engine checksum. This
does not publish the package or promote CP199 as live accepted.

## Integration

Canon PR 2 merged as `ff90f3e51f5d65ca1e288ffd0fe748c1e42dd151`.
Flow-pack PR 5 merged as `46cf007a9e8f33cf3d2d81634f42f751cf41e5a9`.
Merge commits preserve selected/pinned source commits, including disclosed prior
canon/pack dependencies. No product source was changed.

FLOW [PR 49](https://github.com/deksden-com/dd-flow-cli/pull/49) merged as
`2ba2ce2364705cf59fdc48bdd5dc5b37fb7cd784`; its tree exactly matches reviewed
`b74ba81`, which remains an ancestor of main. EVAL
[PR 53](https://github.com/deksden-com/dd-eval/pull/53) completes the remaining
integration with this report. Implementation and offline review gates are
complete; R8b closes when this PR merges. **R9 live acceptance is not executed**
and remains separately authorized work. No old EVAL or accepted historical tuple
was rewritten, no npm release/global installation was performed.
