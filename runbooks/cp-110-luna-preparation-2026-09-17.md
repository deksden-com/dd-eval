# CP-110 Luna E2E preparation — 2026-09-17

Статус: подготовка, live E2E не запускался.

## Frozen inputs

- Case: `sdlc-eval-2026-summer-task-priority`
- Checkpoint: [`cp-110-task-priority-adapter-delegation-flow-4-1-1-engine-0-9-0-beta-75.json`](../checkpoints/cp-110-task-priority-adapter-delegation-flow-4-1-1-engine-0-9-0-beta-75.json)
- Source: `dd-tasks` commit `924ef61752b642f06c2c326b444ed7a3239f20ff`, tag `eval/cp-074-source-final`
- Flow pack: `dd-tasks` commit `9b121e24f94ac56c2a076cd95e84f427eeea8c6d`, Memory Bank `4.1.1`
- Engine: `@deksden-com/dd-flow-cli@0.9.0-beta.75`
- Engine commit: `60b05d220e32542b0e4cf38234595fdad51b8e80`
- Engine artifact SHA-256: `d2848cfc16578cc9f108159bb8be88fd606372ee42fed6084c7ad2d454017574`
- Checkpoint SHA-256: `7c2619ad68bc6e817019c78fb6f172adb3bd03a5bac721909e93bb518a538eee`

## Selected run

- Profile: [`e2e-inline-merge-luna-xhigh.json`](../cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-luna-xhigh.json)
- Subject: `codex-desktop-gpt-5-6-luna-xhigh-dd-flow-0-9-0-beta-11`
- Judge: `codex-desktop-gpt-5-6-sol-high-dd-flow-0-9-0-beta-11`
- Isolated home: `/Users/deksden/.dd-eval/qualification/cp-110-luna`
- Published engine entrypoint (keep this directory until the E2E finishes):
  `/Users/deksden/.dd-eval/qualification/cp-110-luna/published-engine/node_modules/@deksden-com/dd-flow-cli/dist/cli.js`

The old CP-109 home and runs remain immutable. No provider Session is created by
preflight. Product baseline and the actual E2E are deferred until an explicit
launch request.

## Preflight command

```sh
DD_EVAL_HOME=/Users/deksden/.dd-eval/qualification/cp-110-luna \
DD_FLOW_BIN=/Users/deksden/.dd-eval/qualification/cp-110-luna/published-engine/node_modules/@deksden-com/dd-flow-cli/dist/cli.js \
node /Users/deksden/Documents/_Projects/dd-eval/bin/dd-eval.mjs \
  runner eval preflight \
  --profile /Users/deksden/Documents/_Projects/dd-eval/cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-luna-xhigh.json
```

The command must run from a clean committed `dd-eval` tree. It validates the
frozen package, source/flow identity, configured Subject/Judge profiles and
unstarted RUN preparation. A successful receipt records `baseline: not_run` and
`provider_sessions_created: 0`; it is not a live-E2E verdict.

## Launch after preflight

Do not run this during preparation. When explicitly authorized, use the same
isolated `DD_EVAL_HOME` and the committed run profile:

```sh
DD_EVAL_HOME=/Users/deksden/.dd-eval/qualification/cp-110-luna \
DD_FLOW_BIN=/Users/deksden/.dd-eval/qualification/cp-110-luna/published-engine/node_modules/@deksden-com/dd-flow-cli/dist/cli.js \
node /Users/deksden/Documents/_Projects/dd-eval/bin/dd-eval.mjs \
  runner eval run \
  --profile /Users/deksden/Documents/_Projects/dd-eval/cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-luna-xhigh.json
```

Monitor with `runner status --eval <absolute-eval-path>`; do not replay a
provider prompt after an unknown outcome.
