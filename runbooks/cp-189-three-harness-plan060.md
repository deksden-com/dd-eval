# CP189 — fresh Luna, ZCode and AGY E2E after plan 060 review

Preparation: 2026-10-01. This campaign is separate from historical CP188.
No historical RUN, product files or accepted receipts are repaired manually.
Grok remains excluded from this campaign.

## Delivery candidate

- Engine candidate: beta.124; CLI main `7bc8e8d17471c2cd33a93ca25e55770a4cb6e336`.
- Source integration: PR 45, containing reviewed plan 060 fixes and prior fixes
  since published beta.123. Exact artifact must pass normal release gates.
- Release workflow: `36864785028`; all gates and publication passed. Registry
  readback confirms beta.124. Installed-engine matrix qualification @3 passed
  with four owning Stage publications; exact digest is in the CP189 checkpoint.
- Canon: `2e57b987ec91b7c3b0fa97f6169047802a1233fb`, version 4.1.2.
- Project flow pack: branch `fix/cp189-flow-pack`, commit
  `2777773781b69dfd2ccaed55bbec245a88344655`; only canonical flow files
  changed. Product baseline stays `d81cd0acd589a35789aec4c5291ffb5a6efd2d4e`,
  tag `eval/cp-172-source-baseline-setup`.

## Runtime and isolation

Fresh homes: `/Users/deksden/.dd-eval/qualification/cp-189-zcode`,
`cp-189-luna`, `cp-189-agy`; one shared resource home
`/Users/deksden/.dd-eval/qualification/cp-189-resources`.
Only portable harness configuration and selected agent profiles are copied;
Sessions, databases, runs and conformance evidence are not copied as new results.

- Luna: current Codex CLI 0.159.1, `gpt-6-luna/xhigh`, through `cx` and
  `CODEX_HOME=/Users/deksden/.codex-cpa`.
- ZCode: current native 0.16.9; qualified bridge 0.52.0,
  `4621fabd3f517ecdd349dfebebae9077c01d2f2b`; GLM-5.3-Flash/max.
- AGY: current 1.2.14, operator-selected `gemini-3.8-flash-high/high`
  (native selector for Gemini 3.8 Flash).
  A new profile is qualified separately; Pro's capacity is not inherited.
- All Final/Interaction Judges: `gpt-6.1-sol/high`, CPA route, for every harness.
- PostgreSQL service `dd-tasks-postgres-1` is healthy on loopback 55433.

Reuse unchanged accepted native compatibility/capacity evidence, but run exact
installed adapter doctors. Requalify only a changed or unproven runtime contract.
Refresh the installed Codex hook launcher after publication, preserving both
homes' hook files and unrelated handlers. Runner owns AGY workspace hook install
before each fresh execution's baseline.

Installed adapter doctors passed for ZCode, AGY Flash and Codex Judge.
The new AGY Flash capacity probe started four direct children and observed
`settled_by_root`, not four successful Work results; capacity=4 was qualified
and owned daemon cleanup passed. This is capacity evidence, not product success.
The global Codex hook launcher was refreshed to beta.124.

## Ordered gates

1. Release CI, registry tarball/build/tag identity and installed engine digest.
2. Real installed-engine matrix publication fixture, qualifier @3 and retained
   packet bytes; new exact engine/canon/flow checkpoint.
3. Commit the definition; Interaction Judge qualification for that exact tree.
4. Light preflight per harness; each scored run executes its own baseline.
5. Launch ZCode, Luna, AGY in order, waiting for the preceding run's own baseline
   receipt before starting the next. Startup requires native Session and actual
   RUN stage evidence, not an initial detached-observer acknowledgement.

On a conclusive individual blocker, preserve primary error and owned cleanup;
do not resume/restart/manual repair that attempt or stop other healthy runs.
No recurring heartbeat is created implicitly. Launch IDs and final acceptance
will be recorded separately; preparation/qualification PASS is not E2E PASS.
