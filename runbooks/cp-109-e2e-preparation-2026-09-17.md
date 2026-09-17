# CP-109 ZCode E2E preparation — 2026-09-17

## Scope

This preparation creates a fresh ZCode E2E definition and isolated home. It does
not start a provider session, run the baseline, or execute the live E2E.

## Immutable pins

- Source task: `dd-tasks@924ef61752b642f06c2c326b444ed7a3239f20ff`
- Flow pack: `dd-tasks@9b121e24f94ac56c2a076cd95e84f427eeea8c6d`, MemoryBank `4.1.1`
- Engine: `@deksden-com/dd-flow-cli@0.9.0-beta.74`
- Engine commit: `b9495b1c198fded3294040d1dfdc34d36e6aa809`
- Engine artifact SHA-256: `fb71236510a0b15272b77be4305f5fddaf0169d4024026349f3638a9271f6ee1`
- Checkpoint: `cp-109-task-priority-observability-flow-4-1-1-engine-0-9-0-beta-74`

The package was published by the trusted-publisher GitHub Actions workflow
(`35167227530`) and its beta dist-tag/readback were verified before pinning.

## Isolated preparation home

- Eval home: `/Users/deksden/.dd-eval/qualification/cp-109-zcode`
- Persistent published CLI: `/Users/deksden/.dd-eval/qualification/cp-109-zcode/published-engine/node_modules/@deksden-com/dd-flow-cli/dist/cli.js`
- Resource home: `/Users/deksden/.dd-eval/qualification/cp-109-zcode/resources`
- Run profile: `cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-zcode-glm-5-3-flash-max.json`

The old `cp-108` checkpoint and qualification home were not modified.

## Non-generative checks completed

Preflight receipt:

`/Users/deksden/.dd-eval/qualification/cp-109-zcode/conformance/e2e-preflight/1789606409032-f468cf9a/e2e-inline-merge-zcode-glm-5-3-flash-max/receipt.json`

The receipt confirms:

- the committed definition tree is `dd-eval@ef3bf243507cc5a0f241f12827ae0c10af38629e`;
- the selected engine version and artifact checksum match CP-109;
- the runtime project is registered as `PRJ-001-project` in the isolated home;
- ZCode doctor is `compatible: true` with ZCode `0.16.5`, ACP `0.13.1`, native
  lifecycle qualification `qualified`, and `dd-zcode-harness@1`;
- the Judge doctor is green for Codex CLI `0.154.0`;
- `provider_sessions_created` is `0` and `baseline_admission.status` is
  `not_run`, as required before a live E2E;
- Postgres `127.0.0.1:55433` is reachable and healthy; ZCode ACP is `0.13.1`.

## Remaining action

The setup is ready for an explicit live E2E launch. The launch must use this
profile, CP-109, the isolated eval home, and the persistent published CLI. Do
not run an additional quality/browser gate before dispatch; the trusted-publisher
release already executed the guarded package gate once, and the live E2E will
perform its own baseline admission in the execution workspace.
