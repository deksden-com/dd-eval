# CP194 — fresh Luna after managed-lease review

2026-10-03. The failed CP191 Luna EVAL and every historical runtime remain unchanged.

This preparation was not launched and was superseded by
[the finalized CP194 candidate](cp-194-luna-plan064-finalized.md).

## Frozen inputs

- Flow source `c41f5c32cddc328ae9c3a2af93c56a87e1670363`, beta.125 candidate.
- Candidate directory `/Users/deksden/.dd-eval/qualification/cp-194-candidate/reviewed`;
  acceptance is authoritative only after the required release, four integration
  shards and runtime-sensitive suites pass and the existing candidate interface
  writes `status: accepted`. No public npm release or global upgrade is implied.
- Installed CLI `/Users/deksden/.dd-eval/qualification/cp-194-candidate/installed-reviewed/node_modules/@deksden-com/dd-flow-cli/dist/cli.js`.
- Tarball SHA-256 `2d7efac2dcbb46f7dafbd3d07d718060235396cd1cba806d3dc8fa1349f619c4`;
  full engine snapshot SHA-256 `f0634e829a3539b78e25904833dae199b6b791b7dea388325bf8f9e7352a9a02`.
- Source baseline, flow pack, case request, baseline policy and canon are unchanged
  from CP191. The new checkpoint changes only the engine and bound matrix proof.
- Installed-module matrix fixture uses the unchanged repository Vitest configuration,
  not the external root's 5-second default. Its actual Stage publications were
  qualified by `bin/qualify-verification-matrix.mjs`, not copied/rebound old evidence.

## Readiness repair and checks

The readiness check found six lint errors: unsafe `throw` statements in worker/test
`finally` blocks and an undeclared `performance` test global. Worker cleanup now
retains secondary failures and raises them outside `finally` only when the main
operation has succeeded. Original operational failures remain primary, persistence
and physical finish are both attempted, and a cleanup failure cannot produce success.
The test imports Node's `performance` explicitly. Five injected cleanup regressions
use isolated stores and never try to signal their own test process.

Checks before campaign launch: typecheck/lint/build; five cleanup regressions;
managed-daemon 23/23; installed cold maintenance 7/7; installed EVAL baseline,
maintenance and error parsing 25/25; installed matrix publication. Complete required
suite results belong to the exact candidate's acceptance receipt and retained logs,
not to earlier source commits.

## Profile and launch

- Subject: Codex CLI 0.160.0, `gpt-6-luna/xhigh`, CPA through
  `/Users/deksden/.local/bin/cx` and `/Users/deksden/.codex-cpa`.
- Interaction and Final Judge: `gpt-6.1-sol/high`, same CPA route.
- Committed run profile: `e2e-inline-merge-luna-xhigh.json`; the flow pack governs
  actual server MERGE and a fresh native Session for each Stage.
- Fresh EVAL home `/Users/deksden/.dd-eval/qualification/cp-194-luna`;
  config `engine-config` inside that home. Shared resource home remains
  `/Users/deksden/.dd-eval/qualification/cp-191-resources` for host-wide coordination.
- No historical database, baseline, Session, RUN or preflight receipt is reused.

After package acceptance and definition commit, qualify contextual HITL against the
committed tree, then run the standard light preflight using the exact installed CLI
and explicit homes. Preflight does not execute baseline. Only after its PASS launch
one new scored E2E. Confirm that its own baseline passed and its native Subject
Session entered SPECIFY; detached observer acknowledgement alone is not startup.
On an individual blocker retain the primary cause and owned cleanup; no historical
resume/manual repair, no second prompt and no implicit heartbeat automation.
