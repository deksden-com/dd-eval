# CP188 — three fresh E2E attempts after plan 058 review

Preparation started 2026-09-30. Grok is excluded until its quota resets on October 2.
Historical CP187 executions are not resumed or modified. Product source stays
`d81cd0acd589a35789aec4c5291ffb5a6efd2d4e`, tag `eval/cp-172-source-baseline-setup`.

## Frozen candidate

- dd-flow: `0d75e9e7e18868fbe9eee8d51e4c4d06ab03a8cd`, candidate `0.9.0-beta.123`.
- Canon: `bbb3845083d7c1984bb61d813dd6700fe695180a`, version `4.1.2`.
- Project flow pack: `e23f32d0e199794af8e0b9ad211a8d83027275f6`; changes are limited to three review instruction documents and Canon provenance.
- [Release CI](https://github.com/deksden-com/dd-flow-cli/actions/runs/36712741009) must succeed before package installation and scored launch.
- Previous CI `36709658604` rejected five full-cycle controller fixtures because they omitted the three assigned baseline CODE-REVIEW criterion files, and one hook fixture because its mock omitted canonical observation sources. Follow-up commits supply the inputs, keep PLAN catalog/group/result coverage consistent and update the mock; production guards are unchanged. Hook boundaries passed 14/14 locally; typecheck and lint passed.
- Local full-cycle replay additionally exposed a process-group exit race: `kill` raised `ESRCH` after a positive liveness read. The shared helper now treats that exact signal result as already settled, while permission/other failures and unknown leaderless ownership remain blockers. Both TERM/KILL race points and permission rejection are covered; managed-daemon suite passed 6/6. Intermediate candidates were cancelled before publication.

## Harnesses and reusable qualification

Non-generative candidate doctors confirmed the exact committed runtime tuples:
Codex `0.159.1`, AGY `1.2.13`, ZCode `0.16.9` with bridge `0.52.0`, commit
`4621fabd3f517ecdd349dfebebae9077c01d2f2b`.
Unchanged native compatibility/capacity qualifications remain CP187 evidence,
not newly manufactured CP188 receipts. See plan 057 section 17 for their paths,
capacities and cleanup results. Native contract changes in plan 058 have
deterministic regression coverage; runtime-sensitive release CI tests the candidate.

Luna uses `gpt-6-luna/xhigh`; AGY uses `gemini-3.1-pro-high/high`; ZCode uses
`GLM-5.3-Flash/max`. Final and Interaction Judges use `gpt-6-sol/high`.
Codex runs through `/Users/deksden/.local/bin/cx` with
`CODEX_HOME=/Users/deksden/.codex-cpa`.
ZCode reuses the exact qualified bridge artifact read-only; it is not rebuilt
or replaced beneath historical runs.

## New campaign ownership

Homes: `/Users/deksden/.dd-eval/qualification/cp-188-luna`, `cp-188-agy`,
`cp-188-zcode`. Only portable agent profiles were copied; no runs, DBs,
Sessions or old qualification directories were copied as new evidence.
All three use the common absolute resource home
`/Users/deksden/.dd-eval/qualification/cp-188-resources`.

Release CI completed successfully and beta.123 was installed in all three homes.
The global Codex hook launcher is beta.123; both Codex homes retain the same absolute target.
Installed-artifact matrix replay passed in 130 seconds (the initial 120-second
test limit was insufficient; replay used a 600-second limit without changing checks).
The @2 qualifier accepted four real Stage publications, bound to snapshot digest
`a7d62a3b522498c728789cfa8eee31e10df398ca742c98ddc2014d04f57a6ff1`.
Receipt: `checkpoints/cp-188-verification-matrix-qualification.json`, SHA-256
`db869272368630edecabda745715766e6b0e260925f33d61810025e5f04f1df5`.

Before launch: publish exact candidate; refresh Codex global hook launcher;
qualify matrix publications on the installed artifact; pin a new checkpoint;
commit the definition; qualify HITL against that tree; run each light preflight.
Launch the next scored attempt only after the preceding attempt has written
its own baseline PASS. PostgreSQL prerequisite on loopback `55433` is healthy.

The normal runner owns launch, answers and bounded native overload continuation.
On an individual conclusive blocker, preserve evidence and stop only that
execution through normal controls. No manual repair or new provider prompt.
No heartbeat is enabled automatically. Launch IDs and actual progress are
reported separately from full-cycle acceptance.
