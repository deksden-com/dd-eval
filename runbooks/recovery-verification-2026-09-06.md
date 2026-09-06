# Recovery verification — 2026-09-06

Engine source: `a81ade7` (`0.9.0-beta.20`). Runner campaign checkpoint:
`cp-072-task-priority-project-flow-pack-4-0-6-engine-0-9-0-beta-20`.

- Full engine suite: 294 tests in 23 files passed. Subsequent focused snapshot
  suite: 8 passed; typecheck and lint passed.
- Full runner/adapter suite after retained-daemon changes: 198 passed.
- npm publication was refused (401 on `npm whoami`, 404 on publish). beta.20
  is not published. The campaign uses the documented local engine override.
- E2E preflight passed with AGY 1.1.27 and Codex CLI 0.153.4; no provider
  Sessions were created by preflight.
- Live AGY native-retention smoke passed. Session
  `c9d3da01-8290-425a-ae7f-459aba6c3e01` received a private test marker, then
  its daemon stopped cleanly. A second daemon loaded that same Session from
  the retained isolated store. A second prompt, which did not contain the
  marker, returned it exactly. Both turns used zero tools. The second daemon
  was also stopped cleanly. Evidence is retained locally under
  `/Users/deksden/.dd-eval/conformance/recovery-agy.e53EeL`.

This is evidence of root Session retention across a clean daemon restart,
not proof of selective child recovery, interrupted external effects, native
archive portability, or full interrupted → recovered → judged acceptance.
Full-flow E2E results and remaining plan-026 gates must be recorded separately.
