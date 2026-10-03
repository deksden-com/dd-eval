# CP194 — finalized Luna launch candidate

2026-10-04. Supersedes the unlaunched preparation in
[the initial CP194 runbook](cp-194-luna-plan064-reviewed.md). No historical EVAL,
product checkout, candidate tarball or qualification packet was rewritten.

## Frozen identity

- Engine beta.125, source `50f3b45f1546357ca77206d545ab40735a95b501`.
- Candidate `/Users/deksden/.dd-eval/qualification/cp-194-candidate/finalized`.
- Tarball SHA-256 `827d0033378657366a221f601f6a7dfe655654c86e85c89faaa5e2f97f7267c8`.
- Installed CLI `/Users/deksden/.dd-eval/qualification/cp-194-candidate/installed-finalized/node_modules/@deksden-com/dd-flow-cli/dist/cli.js`.
- Full runtime snapshot SHA-256 `51cbf8abefc8c118acdce59019a6e2699786c728b44178136dcc7a420dc9f56c`.
- Canon 4.1.2 / `2e57b987ec91b7c3b0fa97f6169047802a1233fb`.
- Product source, flow pack, request, baseline policy and Subject/Judge models remain
  unchanged. The new checkpoint pins this engine and actual installed-module matrix
  publications. Four Stage packets passed the ordinary matrix qualification command;
  the deterministic fixture explicitly retains its code-review-off reason.

## Readiness defects and verification

1. Six lint errors: worker/test cleanup threw from `finally`, and the daemon fixture
   used an undeclared `performance`. Retain cleanup failures and raise outside
   `finally`; preserve primary operational failures; import Node's clock explicitly.
   Five injected cleanup regressions cover primary/secondary failure precedence.
2. Local development selection hashed the whole mutable checkout: 7,216 files /
   157 MB, including source, tests and development dependencies. It now reuses the
   package snapshot inventory. Its ephemeral identity is explicitly
   `degraded_local_development`, never a substitute for installed `full_content`
   proof. Strict whole-snapshot checksum/symlink rejection remains unchanged.
   A read-inventory regression forbids the irrelevant development-tree scans.
3. A failed install left a staging manifest. The registry counted it as installed;
   retry could return `changed=false` and a missing active snapshot. Internal
   staging/activation backups/locks are excluded from registry discovery. Duplicate
   installation shortcuts require intact snapshot content and schema evidence.
   Three isolated regressions cover retained staging, backup and corrupt active bytes.

The host also experienced severe shared load (up to 156 load average on 8 CPUs),
causing CLI scenario and package health-check timeouts. Preserve those failed logs;
do not waive assertions or increase production/test deadlines to label them passed.
Only the final frozen candidate's complete required suites and consumer acceptance
may set its receipt to `accepted`. Prior commit test results are diagnostic, not
final-candidate acceptance. Full required-suite logs use
`/tmp/dd-flow-cp194-finalized-*`; the receipt is the authority for completion.

## Launch contract

- Subject: Codex CLI 0.160.0, `gpt-6-luna/xhigh`.
- Interaction and Final Judge: `gpt-6.1-sol/high`.
- Authorization/configuration source: `CODEX_HOME=/Users/deksden/.codex-cpa`,
  runtime `/Users/deksden/.local/bin/cx`; native Subject homes/hooks are generated
  per execution by the existing managed adapter.
- Profile: `cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-luna-xhigh.json`.
- Actual flow pack: fresh native Session per Stage, server MERGE. The profile's
  historical filename does not override that flow contract.
- EVAL home `/Users/deksden/.dd-eval/qualification/cp-194-luna`, config
  `<home>/engine-config`; resource home
  `/Users/deksden/.dd-eval/qualification/cp-191-resources` for host-wide coordination.

After final package acceptance and clean definition commit, qualify HITL against
the exact committed definition tree, then use the standard light preflight and one
new scored run, all with the same explicit homes and installed CLI. Preflight
baseline `not_run` is not PASS; only the new execution's own baseline followed by
native Subject startup and actual RUN SPECIFY establishes successful startup.
Stop at a conclusive blocker, retain its primary cause and owned cleanup, never
resume historical EVALs or create an implicit heartbeat/duplicate scored run.
