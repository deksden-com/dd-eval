# CP-109 Codex Luna E2E preparation — 2026-09-17

## Scope

Prepared the dedicated Luna live-E2E home without starting a provider session,
baseline admission, or live E2E.

## Pins and profile

- Checkpoint: `cp-109-task-priority-observability-flow-4-1-1-engine-0-9-0-beta-74`
- Engine: `@deksden-com/dd-flow-cli@0.9.0-beta.74`
- Engine commit: `b9495b1c198fded3294040d1dfdc34d36e6aa809`
- Engine artifact SHA-256: `fb71236510a0b15272b77be4305f5fddaf0169d4024026349f3638a9271f6ee1`
- Subject profile: `codex-desktop-gpt-5-6-luna-xhigh-dd-flow-0-9-0-beta-11`
- Run profile: `e2e-inline-merge-luna-xhigh`
- Judge: `codex-desktop-gpt-5-6-sol-high-dd-flow-0-9-0-beta-11`

## Isolated home

- Eval home: `/Users/deksden/.dd-eval/qualification/cp-109-luna`
- Resource home: `/Users/deksden/.dd-eval/qualification/cp-109-luna/resources`
- Persistent published CLI: `/Users/deksden/.dd-eval/qualification/cp-109-zcode/published-engine/node_modules/@deksden-com/dd-flow-cli/dist/cli.js`

The ZCode qualification home and historical `cp-108` homes remain untouched.

## Preflight receipt

`/Users/deksden/.dd-eval/qualification/cp-109-luna/conformance/e2e-preflight/1789606879433-ede48042/e2e-inline-merge-luna-xhigh/receipt.json`

The receipt confirms:

- engine version/checksum match CP-109;
- project registration succeeded as `PRJ-001-project`;
- Luna Codex doctor is green with Codex CLI `0.154.0` and
  `dd-codex-harness@1`;
- Judge doctor is green;
- `provider_sessions_created` is `0`;
- baseline admission remains `not_run` until the actual E2E workspace starts.

## Remaining action

The Luna E2E can be launched explicitly using this profile and isolated home.
No additional quality/browser gate is required before launch; the package
release gate already ran once and the live run owns its baseline admission.
