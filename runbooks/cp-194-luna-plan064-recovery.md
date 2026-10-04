# CP194 — recovery-tested Luna candidate

2026-10-04. Preparation only; no scored CP194 EVAL has been started.
Supersedes the unlaunched bounded candidate after test-only recovery fixes.
Product, historical EVALs, prior packages and qualification attempts are retained.

## Frozen package

- Engine beta.125 / `acfcdfefaadc7dd345963e6c75d5a41ddd7e917d`.
- Candidate `/Users/deksden/.dd-eval/qualification/cp-194-candidate/recovery`.
- Tarball SHA-256 `3f5d0ea05f1e5e0bc86ea8596662cf61ab962ab201a6a0c8e79bdf683932235a`.
- Installed CLI `/Users/deksden/.dd-eval/qualification/cp-194-candidate/installed-recovery/node_modules/@deksden-com/dd-flow-cli/dist/cli.js`.
- Full runtime SHA-256 `f731fb3d605486d51717997f3e8c19d4c0de8d6470e86917d9dc0be2e8cb8b94`.
- Canon 4.1.2 / `2e57b987ec91b7c3b0fa97f6169047802a1233fb`.

Production fixes from [bounded preparation](cp-194-luna-plan064-bounded.md)
remain unchanged. Recovery fixtures previously executed four negative cold CLI
probes inside every recovery scenario. They are now explicit admission cases,
covering both RUN-only and EVAL fences, with durable assertions for all four
rejections. Ordinary cases still execute actual allowed daemon start, retained
Session resume and native ACK; none of those guards is mocked or bypassed.

The 20-second whole-recovery wait and 45-second outer test limit did not account
for sequential bounded maintenance/ACK/client phases. Test readiness and outer
budgets now compose those phases. Production 5-second maintenance and 15-second
fixture CLI request limits are unchanged. Launcher exit, controller errors and
operation/native evidence now survive in test failure diagnostics.

The standalone recovery file passed all 13 cases; typecheck/lint/strict build,
ordinary installed engine health and release contracts passed. Final required
suite logs use `/tmp/dd-flow-cp194-recovery-verified-*`. Only their actual complete
success and ordinary consumer acceptance may mark this package `accepted`.
An installed matrix attempt exceeded its unchanged 120-second fixture deadline;
retain it as failed evidence, never publish a fabricated qualification from it.
Standalone installed-consumer qualification uses an explicit four-Stage budget
of `4 * 60_000` through Vitest's existing `--testTimeout=240000` option. This
accounts for full snapshot verification throughout PLAN/PLAN-REVIEW/CODE/MERGE;
it does not change the standard suite's 120-second timeout, production request
limits, assertions, or the mechanical proof validator. Retain new publications
under `recovery-matrix-fixture/qualification-evidence`, not the failed attempt.
That new installed cycle passed in 46.34 seconds, and the normal qualification
validator accepted four owning Stage publications. Its receipt SHA-256 is
`d6ed314c7c3ec9ff572cf55df0b26e89f1c7ebfdcc5a25159c7bf3e63d684687`.
The exact installed baseline/admission/maintenance checks passed all 29 cases.

## HITL Judge fixes

The previous Judge treated dependent ordering from a rejected proposed vocabulary
as an independent gap, despite the exact canonical refusal of separate control
ordering. Shared policy now preserves the proposal's conditions and rejects that
promotion without hiding independent unresolved decisions.

A subsequent attempt joined nonadjacent canonical sentences into one quote and
added punctuation absent from the question. Exact-byte validation correctly
rejected it. Shared instructions require contiguous source/answer substrings,
separate evidence entries for separate passages and local substring self-checks.
Twenty-five contract/corpus/retention/issuance checks passed. The exact final
committed definition must still pass live qualification; no answer or validator
was weakened, and no historical failed Judge result may be rebound as passed.

## Launch gate

Retain the same product/flow-pack pins, Luna profile, CPA authorization and shared
resources as the bounded preparation. Subject `gpt-6-luna/xhigh`; both Judges
`gpt-6.1-sol/high`; runtime `cx`, explicit `CODEX_HOME=/Users/deksden/.codex-cpa`.

After exact installed owning-Stage matrix qualification, freeze its new checkpoint
and case definition. After complete package acceptance and live HITL qualification,
run standard light preflight and exactly one new scored Luna EVAL. Confirm its own
baseline PASS, native Subject Session and actual RUN SPECIFY, not merely observer
acknowledgment. No product edits, historical resume, runtime repair, implicit
heartbeat, foreign-process termination or duplicate scored attempts.
