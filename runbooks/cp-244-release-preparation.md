# CP244 — five full E2Es

Follow [execute-eval.md](execute-eval.md). New engine beta.146 identifies
`9081f5f67228cbf80c50c8cec14fc7d4ad819aff`, canon 4.1.2 /
`925ef10ecc0b683f7feba6f74913e15560842500`. This is a new artifact, not the
unpublished CP241 beta.146 candidate. Local release acceptance is pending;
no scored dispatch is authorized by this preparation record alone.

Local release receipts: `~/.dd-eval/qualification/cp-244-release-gate`.
Fresh homes: `~/.dd-eval/qualification/cp-244-{opencode,zcode,agy,luna,grok}-full`.
The shared immutable installation is `~/.dd-eval/qualification/cp-244-engine`.
Verify its bytes against the accepted and published artifact before dispatch.
Keep the CP243 product checkpoint and existing flow pack; do not change product
behavior or substitute current product main. Each workspace runs its own baseline.

Full profiles retain GLM-5.3-Flash/max for OpenCode/ZCode,
Gemini-3.8-Flash/high for AGY, gpt-6-luna/xhigh for Codex and Grok-4.7/high.
Both Judges use gpt-6.1-sol/high. No semantic decisions or stop-after.
Codex uses `cx` with `CODEX_HOME=/Users/deksden/.codex-cpa`.

Use the existing homes registry and shared resource registry from CP241.
PostgreSQL is the project-owned `dd-eval-cp240-postgres` on loopback 55439;
never touch the other project's 55433. Select the existing Playwright cache
explicitly. Close failed owners through the normal retirement barrier, not
PID-only kills; preserve historical runtimes and native outcomes.

AGY 1.4.6 requires the reviewed native receipt at
`~/.dd-eval/qualifications/native/agy-1.4.6-f6469b21/qualification-reviewed.json`
via `DD_AGY_NATIVE_QUALIFICATION`. The new installed reader verified it qualified.
AGY and Grok changed native versions and need compatibility admission before
their new productive launches. Unchanged Judge inputs do not need new live calls.

No GitHub CI. Publication, hook refresh, checkpoint/matrix qualification,
preflight and scored launch remain separate steps; none is claimed complete here.

## Release blocker

Hybrid 66/66, canon 75/75 and E2 135 passed (one expected fish skip).
E3 case `compiled public init aliases ... (operation-only=false)` failed before
controller acceptance with `memory_init_fresh_preparation_incomplete`, caused by
`memory_init_lint_capability_failed` / `lint_probe_execution_failed`.
The linter capability probe uses `spawnSync` with a fixed 5000ms bound and drops
the subprocess error/signal/stderr, so the retained failure alone does not prove
a timeout. The exact retained synthetic linter passed all four isolated probes
afterwards (1257/339/1715/1277ms). This is diagnostic evidence, not a retry that
turns the failed gate into PASS. Preserve the failed gate and its retained fixture.
No package publication, global cutover or scored E2E has occurred for CP244.

The failed E3 wrapper was interrupted through its owned drain handler; runner
PIDs exited and uncertain fixture evidence remains retained, not deleted or
marked clean. Fix merged as engine `58d620223e278316ed9591125691df6f22b09c12`
(PR117), beta.147: shared setup startup budget, typed diagnostics and bound
probe start/completion events. Original public-init and three related cases
passed on the fix, alongside merge-gate and prerequisite regressions. CP245
performs fresh exact-artifact release acceptance; CP244 evidence is not PASS.
