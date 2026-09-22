# CP-140: Grok startup readiness

Date: 2026-09-22. Fresh scored Grok E2E for the CP-138 startup failure.
The CP-138 RUN is historical evidence and must not be resumed. CP-139 AGY
continues independently on its immutable beta.98 definition.

## Incident and repair

CP-138 `EVAL-20260922200445-74f14dc1` ended `recovery_blocked` before any
SDLC Stage. The first error was `daemon_start_failed`: Grok ACP initialized,
and its daemon recorded `running` and opened its socket, but startup polled
reconciliation-heavy `daemon.status` with a one-second response budget and
treated the missed readiness window as failure. The later
`run_control_worker_start_timeout` was a secondary cleanup error.

The beta.99 adapter uses a side-effect-free `daemon.ready` response. It
reports ready only after startup state has been persisted. An unresponsive
existing daemon is not overwritten; the startup observation fails closed.
The regression fixture makes status heartbeat exceed one second while fresh
startup and duplicate-start detection pass.

## Exact inputs

- Product source: `deksden-com/dd-tasks`
  `924ef61752b642f06c2c326b444ed7a3239f20ff`, tag
  `eval/cp-074-source-final`.
- Flow pack: `53d4b76943900f122957c78cc0fefa2051bd7b1a`,
  `.memory-bank/dd-flow`, Memory Bank `4.1.1`.
- Canon: `4.1.1`, commit
  `678daa038287c948ada5b2d785a6dcc925c7b891`.
- Engine: `@deksden-com/dd-flow-cli@0.9.0-beta.99`, commit
  `a68a8ac243ceef7806094964106ebe38c5d384fd`, installed engine
  full-content SHA-256
  `44d74f969e0d0445cef2b82c353ee255f5ee60a18ce1d36ecacb9ab1b2dae57f`.
- Grok: Build `1.0.40`, binary SHA-256
  `3f2aef9618191a2c60d18a5044fa462c9c77bdc4187b02ed716b0394e8d4fef2`,
  `grok-4.7` high, ACP1.

The source/flow/canon/task inputs are identical to CP-138. The new home
`/Users/deksden/.dd-eval/qualification/cp-140-grok` contains only copied
portable agent profiles, its own adapter configuration and the separately
installed published package. It contains no copied runs, runtime database,
conformance state or provider Session. Its resource database is created only
by the new run.

## Release and admission

Workflow `35786953847` passed prepare, runtime-sensitive, all four
integration shards, candidate/package smoke and publish. Independent
readback confirmed npm `beta` tag `0.9.0-beta.99`, peeled Git tag
`v0.9.0-beta.99` at the exact engine commit, npm tarball SHA-256
`a4c37baaa68b88aef15bd3b1370a3b1826014b7a8fdf5ff064f6087e117ae74f`,
and npm integrity
`sha512-NXUzWTjzzHPWsqx43vkKO8KZaTyblBITEegpSmsQ0iibUnCkgn6690EgdRoH/SCGixgBH9t6SyRkraaC+kFHYA==`.
Tarball `dist/build-info.json` names beta.99, the exact commit and canon
tuple above. A scratch installation of the public package produced the
engine full-content SHA above; `engineArtifactDigest` and
`verifyEngineArtifact` agreed with `engine.json.integrity.checksum`.

Use the standard preflight and scored profile
`cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-grok-4-7-high.json`
with explicit `DD_EVAL_HOME`, `DD_FLOW_BIN`, `DD_FLOW_CONFIG_HOME` and
`DD_FLOW_RESOURCE_HOME` under CP-140. Commit the checkpoint/case definition
before preflight and launch. Preflight proves inputs/environment only; the
baseline runs inside the scored E2E. Do not create a duplicate EVAL.

## Monitoring

Follow [E2E monitoring](e2e-monitoring.md). Use actual RUN timeline/controller
and fresh Work artifacts for the Stage, not manifest entry-stage. Confirm that
Grok `daemon.start` returns a ready daemon and `session.create` starts, then
monitor native turns, process leases, HITL consistency and terminal state.
At runtime failure, preserve the new run and investigate read-only; do not
resume, restart, manually repair or edit code.

## Receipts

The standard preflight passed against committed definition
`980792a6de4b98fff5cfa266a593867466141550`:

- receipt:
  `/Users/deksden/.dd-eval/qualification/cp-140-grok/conformance/e2e-preflight/1790113820041-379e3132/e2e-inline-merge-grok-4-7-high`;
- installed engine beta.99 and its full-content checksum matched the
  checkpoint; Grok `1.0.40`/ACP1 and the Sol Judge doctor were compatible;
- the prepared RUN reached `specify` without a provider Session;
  baseline `not_run` awaits the scored workspace.

The scored EVAL receipt is appended only after accepted launch.
