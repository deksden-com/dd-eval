# CP-117 Luna CLI prepare readiness — 2026-09-18

Status: prepared, not started. No provider Session or product baseline was
started during preparation.

## Frozen inputs

- Case: `sdlc-eval-2026-summer-task-priority`.
- Checkpoint: [`cp-117-task-priority-cli-prepare-flow-4-1-1-engine-0-9-0-beta-75.json`](../checkpoints/cp-117-task-priority-cli-prepare-flow-4-1-1-engine-0-9-0-beta-75.json).
- Product source: `dd-tasks` commit
  `924ef61752b642f06c2c326b444ed7a3239f20ff`, tag
  `eval/cp-074-source-final`.
- Project flow pack: `dd-tasks` commit
  `9b121e24f94ac56c2a076cd95e84f427eeea8c6d`, Memory Bank `4.1.1`.
- Engine: `@deksden-com/dd-flow-cli@0.9.0-beta.75`, commit
  `fa2ad3092d8f74c872b4d085e4ab984f5a24b13e`, immutable checksum
  `d2a3ed865d397fcf391b807c68d0fec503e6715e553d399ff1c0bbcb935f7a38`.
- Checkpoint checksum:
  `2aa331eba47f45b3481b778ee98b8d138def025f6a329967d3cb98a6799bdbb6`.

## Selected run

- Profile: [`e2e-inline-merge-luna-xhigh.json`](../cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-luna-xhigh.json).
- Subject: Codex `0.154.0`, Luna `xhigh`.
- Interaction Judge and result Judge: Sol `high` through the same Codex runtime.
- Isolated home: `/Users/deksden/.dd-eval/qualification/cp-117-luna`.
- Local committed engine entrypoint:
  `/Users/deksden/Documents/_Projects/dd-flow-cli/dist/cli.js`.

The exact adapter doctor passed. The E2E preflight then installed the local
committed engine into a new isolated runtime, matched its checksum to CP-117,
restored the frozen product and flow-pack inputs, prepared
`RUN-001-eval-preflight`, and passed both Luna and Sol doctors. It created zero
provider Sessions and left baseline admission as `not_run`, as required before
an authorized live run.

Successful receipt:
`/Users/deksden/.dd-eval/qualification/cp-117-luna/conformance/e2e-preflight/1789760589966-93818a07/e2e-inline-merge-luna-xhigh/receipt.json`.

An earlier failed receipt in the same home deliberately remains as diagnostic
evidence. It was produced without `DD_FLOW_BIN` and therefore selected an
ambient same-semver engine with different bytes. It is not a candidate run and
must not be launched.

## Launch after explicit authorization

Run from `/Users/deksden/Documents/_Projects/dd-eval`:

```sh
DD_EVAL_HOME=/Users/deksden/.dd-eval/qualification/cp-117-luna \
DD_FLOW_BIN=/Users/deksden/Documents/_Projects/dd-flow-cli/dist/cli.js \
DD_FLOW_CONFIG_HOME=/Users/deksden/.dd-eval/qualification/cp-117-luna/engine-config \
DD_FLOW_RESOURCE_HOME=/Users/deksden/.dd-eval/qualification/cp-117-luna/resources \
node bin/dd-eval.mjs runner eval run \
  --profile /Users/deksden/Documents/_Projects/dd-eval/cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-luna-xhigh.json
```

The live run must use the same environment and committed profile. Its own
baseline admission runs before Subject dispatch. Monitor the returned EVAL root
through `runner status`; do not replay a provider turn after an unknown outcome.
