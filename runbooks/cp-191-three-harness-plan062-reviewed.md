# CP191 — new E2E after plan 062 review

2026-10-02. Historical CP190 executions and installed engines are unchanged.

## Frozen candidate

- FLOW `96a34d22ba37b9b22ee48e9cb01553e5e5af66b1`, beta.124 candidate, not the public beta.124 artifact.
- Candidate packed/accepted through the release candidate interface after complete review gates: release 10, integration 1983, runtime-sensitive 30; EVAL offline 417 passed separately.
- Installed CLI: `/Users/deksden/.dd-eval/qualification/cp-191-candidate/installed/node_modules/@deksden-com/dd-flow-cli/dist/cli.js`.
- Tarball SHA-256 `ebdf45836cce3827d2af1c4fc70921a3a41ba523c4a76cac3d3489b321e93bd9`; full engine snapshot SHA-256 `20da928247825fc6dafccf2af84bfd373d3aa97370ef948d1912fab918b539e6`.
- Installed-module matrix publication fixture passed; qualification @3 records four actual Stage publications in `checkpoints/cp-191-verification-matrix-qualification.json`.
- Product baseline, flow pack and canon unchanged from CP190. Only engine/qualification checkpoint changes.

## Profiles and isolation

- Luna: Codex CLI 0.160.0, `gpt-6-luna/xhigh`, CPA through `cx`, `CODEX_HOME=/Users/deksden/.codex-cpa`.
- ZCode: native 0.16.9, bridge 0.52.0 commit `4621fabd3f517ecdd349dfebebae9077c01d2f2b`, `GLM-5.3-Flash/max`.
- AGY: 1.2.14, `gemini-3.8-flash-high/high`.
- All Interaction/Final Judges: `gpt-6.1-sol/high` on the same CPA route.
- Server MERGE, new Session per Stage. Fresh homes `cp-191-zcode`, `cp-191-luna`, `cp-191-agy`; shared resource home `cp-191-resources`, all under `/Users/deksden/.dd-eval/qualification/`.
- Portable configuration/selected agent profiles only; no old database, Session, run, baseline or conformance result copied.
- Exact installed adapter doctors passed for all three native runtimes; PostgreSQL `dd-tasks-postgres-1` healthy on port 55433.

## Launch contract

Commit the definition, qualify contextual HITL with the common Judge, then run light preflight for each profile using the exact installed candidate and explicit homes/config/resource paths.
Launch ZCode, Luna, AGY in order; wait for each preceding execution's own baseline receipt before starting the next. Verify native Session/Turn and actual RUN timeline stage, not the entry stage or detached observer acknowledgement.
On a conclusive individual blocker retain the primary error and owned cleanup; do not resume/restart/manual repair it or stop other healthy executions. No heartbeat is created implicitly. Qualification and preparation are not scored E2E success.
