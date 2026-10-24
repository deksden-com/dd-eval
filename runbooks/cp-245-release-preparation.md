# CP245 — five full E2Es after prerequisite repair

Use [execute-eval.md](execute-eval.md). Engine beta.147 source:
`58d620223e278316ed9591125691df6f22b09c12`; selected canon remains 4.1.2 /
`925ef10ecc0b683f7feba6f74913e15560842500`. Local release receipts are under
`~/.dd-eval/qualification/cp-245-release-gate`. Integration found 19 failures:
14 stale native-contract fixtures and five pre-storage issuance validations.
The latter exposed storage initialization before input validation. Fixes are
merged in engine `96824d273cfd91ca8eeb5ec7e7e52eda337b5273` (beta.148).
This candidate is not release-accepted or published; no scored dispatch occurred.

Keep the CP243 product source and flow pack unchanged. Prepare fresh homes
`cp-245-{opencode,zcode,agy,luna,grok}-full` and exact installation
`cp-245-engine`, never replace the failed CP244 candidate. Publish and verify
registry bytes, refresh hooks, then generate the installed matrix proof and
commit its checkpoint before preflight. Every workspace runs its own baseline.

Profiles: OpenCode/ZCode GLM-5.3-Flash/max, AGY Gemini-3.8-Flash/high,
Codex gpt-6-luna/xhigh and Grok-4.7/high; both Judges gpt-6.1-sol/high.
Full contour, no semantic decisions and no stop-after. Codex uses `cx` and
`CODEX_HOME=/Users/deksden/.codex-cpa`. Reuse unchanged Judge qualification.

Use the existing homes/resource registries and owned PostgreSQL on loopback
55439, not the unrelated service on 55433. Pin the existing Playwright cache.
Before productive dispatch qualify changed AGY/Grok native versions, with the
reviewed AGY 1.4.6 native receipt explicitly selected as in CP244. Preserve
working and historical runs. No GitHub CI.
