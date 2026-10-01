# Plan 060 — source implementation

Date: 2026-10-01. Scope: FLOW, EVAL and canonical review contracts only.
No product changes, historical EVAL repair, publication, hook installation or paid provider/E2E calls.

## Implemented contracts

| Plan | Implementation and regression evidence |
|---|---|
| A/B | Pinned `codex-overload-burst@1` policy, immutable native refusal identity, inclusive 120000 ms two-continuation window, unlimited slow instability, exact Session/prompt/predecessor admission, retained owner deadlines. Controller, independent children, external Work, MERGE, recovery/HITL and daemon callers use the contract. Pure policy, real socket admission and full seven-stage two-child regressions cover these paths. |
| C | EVAL loads the module from its verified engine snapshot before Judge/probe native creation. Judge chain@2 binds engine/prompt/packet/owner identity; legacy chains are no-send. Final/Interaction/Supplemental and capacity probe share the implementation. Tests cover reattach, duplicate refusal, unknown effects, cancellation, ownership, deadline, Retry-After and installed module bytes. |
| D | Existing cleanup/settlement guards retained. Provider success does not override incomplete physical cleanup or durable owner completion. Full suites are the acceptance gate, not isolated repaired tests. |
| E | Work check declarations validated before materialization; final target gate includes full PLAN/item-only obligations and mandatory policy, with post-apply binding. |
| F | Frozen checker independently rebuilds required coverage from retained PLAN and exact profile bytes. Qualification@3 and RUN coverage marker required. Failed target execution is classified from a sealed failure snapshot, never forged successful MERGE acceptance; missing claimed bytes remain unavailable. |
| G | PLAN decision@4, unresolved user decisions block acceptance; per-protocol accepted revision/hash baselines replace aggregate-max authority. Legitimate no-change decisions need no fake correction. CODE decisions are unique/known before freeze. DEF identity is project-local and hash-bound. Original SPECIFY/PROTOCOLIZE inputs are protected in reviewer packets. |
| H | Offline type/lint/build, integration/runtime-sensitive/release and EVAL suites; explicit commits and branch pushes. No delivery to live runtime in this request. |

## Additional defects found during acceptance

- The independent capacity admission API could omit Session/prompt bindings. They are now mandatory for a continuation, with a negative regression.
- Managed baseline command timeout included process registration/admission time, allowing a blocked gate to die before ownership confirmation. The timer now starts immediately before productive dispatch. Slow admission and actual command timeout are both tested; scope cancellation remains authoritative.
- Optional real-CLI EVAL fixtures contained obsolete incomplete profiles/manifests. Fixtures now meet existing production contracts. Stop assertions allow an already completed drain while retaining process, neighboring-scope and captured-evidence checks.
- A multi-phase recovery test had a 45 s outer budget below its own bounded phases. Its outer budget now sums those phases; individual CLI/state waits and production deadlines are unchanged. A separate `intent` wait failure did not reproduce and was not widened.
- A packaged hook test assumed the writer phase was always reached before an inherited deadline. It now also accepts the exact early import-timeout diagnostic, without extending the 800 ms deadline or elapsed bounds, and checks that no hook event was written.

## Verification and delivery

Committed identities:

- FLOW `1e44064b81984047bbdb1733c8ec3c55a92f8c3e` (implementation `2d840fd`, subsequent fixture-only corrections).
- EVAL implementation `8efcd91fc343b0b49241fea98e83552ed8c2beeb` (this report is a subsequent documentation commit).
- Canon `2e57b987ec91b7c3b0fa97f6169047802a1233fb`.
- Strict build: FLOW `0.9.0-beta.123`, canon `4.1.2`, exact commits above. No package publication.

Final checks already completed: typecheck/lint/strict build PASS; runtime-sensitive **30/30**; release build verifier **1/1** and release procedure **8/8**; full EVAL **392/392**, no failures/cancellations/skips. EVAL command enabled `DD_FLOW_SOURCE_ROOT`, `DD_EVAL_TEST_FLOW_CLI` and `DD_EVAL_TEST_FLOW_ADAPTER`, so installed-module and real offline CLI paths were not skipped.

Final FLOW integration: **1894/1894 PASS**, **110/110 files**, exit 0, duration 2287.93 s. All added paths ran; no skips. Full stage-cycle cells include Luna, ZCode, AGY and offline Grok, Luna repair and two independently overloaded native children. The accepted full run is `/tmp/dd-flow-060-integration-accepted.log`; EVAL is `/tmp/dd-eval-060-accepted.log`. Runtime/release/build/type/lint logs use the corresponding `/tmp/dd-flow-060-*-accepted.log` names.

Intermediate failed runs are retained in local logs and are not counted as full acceptance: stale build **1893/1894**; subsequent loaded-host run **1891/1894** with the three fixture failures described above. The isolated repaired files passed **11/11** (resume) and **29/29** (hook ingress); these alone were not substituted for the full gate. No remaining source acceptance blocker was observed in the final clean complete suites.

Ponytail final review: reused existing owner ledgers, checks/materialization, review publication and runtime loaders; one pure pinned capacity policy, no new dependency/framework/database. Strict identity and data-loss guards were preserved. Source scope A–H is complete; delivery remains separate.

Live provider availability, model/product quality, initial OS EPERM offender, Q1 optimization and late semantic replan remain outside this source implementation. Grok is not automatically re-enabled. Publication and new scored E2E require a separate request.
