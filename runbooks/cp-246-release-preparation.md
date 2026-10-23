# CP246 — release blocker follow-up

Use [execute-eval.md](execute-eval.md), no GitHub CI. Engine beta.148 source:
`17bf983178e8f9f27bac65501c1434785ee3f214`; selected canon stays 4.1.2 /
`925ef10ecc0b683f7feba6f74913e15560842500`. Release acceptance, publication,
hooks, checkpoint and five full launches are still pending.

Local release gate: `~/.dd-eval/qualification/cp-246-release-acceptance`.
Prepared archive SHA256: `4f063722329a40bc29ea16cf3bbedcfd890d308c32f9016e220d0944e1bacf7f`;
installed engine full-content checksum:
`48bd7c544f5cc322c68b8fb584c47f8cb7db7b657583804aaf8378d93ebd6c6b`.

CP245 retained the failed full gate (3384 passing tests, 19 failed assertions and
one suite import failure). Its 14 stale native-contract assertions are
corrected without weakening production readiness; lifecycle issuance now validates
before storage initialization (23 input-preparation tests passed). The seven
affected files had 207 passing tests; the final three corrected assertions passed
separately. The additional partial child-process mock repair passed all 22
maintenance tests. Merge gate passed. These checks do not confer release acceptance.

Preserve CP243 product/flow inputs and CP245's selected profiles, owned PostgreSQL
55439, shared registries and Playwright cache. Create a new checkpoint only after
registry verification and actual installed-matrix qualification. Reuse unchanged
Judge evidence and reviewed AGY 1.4.6 P3; qualify only changed native tuples.
Fresh execution homes must never overwrite CP244/245 evidence.

Operator authorized research E2Es on the frozen candidate while release acceptance
continues. None dispatched yet: installed matrix proof timed out at its 600s
test horizon under host load 538–641 (>1200 processes). Retain
`~/.dd-eval/qualification/cp-246-installed-matrix-console.log`; no matrix PASS.
AGY compatibility observed one direct child but failed qualification: process
inspection (`ps`) failed during shutdown confirmation. Retain capacity receipt
under `cp-246-agy-compatibility/conformance/native-subagents/20261023164004036/`;
scope retirement reports physical stopped, native settlement unconfirmed.
Do not duplicate that Session or reinterpret cleanup as native completion.
After host load dropped, the fresh installed matrix attempt `cp-246-installed-matrix-proof-r2`
passed in 85s; its V3 receipt and four real owning packets are committed in CP246.
Fresh `cp-246-{agy,grok}-compatibility-r2` smokes passed with native/physical
cleanup confirmed, qualifying AGY 1.4.6 and Grok 1.0.69 at conservative capacity 1.
Keep the earlier failures unchanged. CP246 checkpoint now selects the exact local
beta.148 candidate; release acceptance/publication remain pending.
