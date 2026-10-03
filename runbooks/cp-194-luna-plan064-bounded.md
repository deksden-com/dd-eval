# CP194 — bounded registration Luna candidate

2026-10-04. Supersedes the unlaunched finalized candidate. Historical EVALs,
product and prior package/qualification evidence remain unchanged.

## Identity and additional fixes

- Engine beta.125, source `aa8a8048e7a6d3f7456039aae914bc802decc784`.
- Candidate `/Users/deksden/.dd-eval/qualification/cp-194-candidate/bounded`.
- Tarball SHA-256 `3f19f5bc49fca2cc3ce2fa6e937b6a75252781845831f811b68d1c949e8ae596`.
- Installed CLI `/Users/deksden/.dd-eval/qualification/cp-194-candidate/installed-bounded/node_modules/@deksden-com/dd-flow-cli/dist/cli.js`.
- Runtime full-content SHA-256 `d1abcb464f19117adb752ccf7271029186da2bf4df5f0fb2f15653107a76fe9a`.
- Canon 4.1.2 / `2e57b987ec91b7c3b0fa97f6169047802a1233fb`.

Retains all fixes from the [finalized preparation](cp-194-luna-plan064-finalized.md).
Further investigation of baseline's bounded registration failure found:

1. Registration was outside the maintenance allowlist, so it initialized/migrated
   unrelated RUN storage and did not propagate the request deadline/phase diagnostics.
   Registration now reads RUN authority without creating that database, bounds the
   resource-registry open, and still permits its initial bootstrap. Explicit resource
   writes retain the snapshot-import guard even when RUN storage is opened read-only.
2. An ephemeral in-process selection still traversed/hashed all package runtime bytes
   merely to select the already executing CLI. It now honestly reports no snapshot
   checksum (`degraded_local_development`). Installed snapshot validation, symlink
   rejection, fork checksum and RUN binding requirements are unchanged.
3. Ordinary registration used autocommit INSERT followed by a separate result lookup.
   It now retains insertion and lookup in one resource transaction, giving one durable
   COMMIT boundary and accurate phase evidence; unique-operation registration keeps
   its existing outer transaction.

Checks completed on this exact installed package: 29 EVAL baseline/maintenance/error
and admission tests; seven cold maintenance tests; installed matrix fixture followed
by mechanical qualification of four owning Stage packets. Typecheck/lint/strict build
and focused routing/symlink/registration regressions passed. Registration additionally
tests no RUN creation, duplicate rejection, expired deadline and active import guard.

Full required suite logs use `/tmp/dd-flow-cp194-bounded-verified-*`. Their results
are pending until the suites actually finish; candidate acceptance must not be claimed
from earlier source revisions or partial suite runs. The package receipt is authoritative.
No production/test deadline was raised, no foreign process stopped.

## Launch

Use the same Luna profile/home/resource coordination from the previous runbook, but
the installed CLI and adapter above. Subject `gpt-6-luna/xhigh`; Interaction and Final
Judge `gpt-6.1-sol/high`; `cx` with explicit `CODEX_HOME=/Users/deksden/.codex-cpa`.
Product source, flow pack, request and baseline policy are unchanged.

Judge-only definition qualification may run while final package suites execute, after
the exact definition tree is committed. It neither accepts the candidate nor starts a
Subject/scored EVAL. After actual package acceptance, run standard light preflight and
one new scored EVAL. Confirm its own baseline and native SPECIFY startup separately
from the detached observer acknowledgment. No historical resume, duplicate scored
attempt, manual artifact repair or implicit heartbeat.
