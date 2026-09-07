# 029 — Implementation evidence

2026-09-07. Delivery in progress: E2E qualification is not yet accepted.

## Implemented

- A: cancellation uses retained ownership, joins concurrent stop, attempts every owned child despite inspection/cancel errors, and never starts a daemon just to stop it. Unknown settlement remains unconfirmed. Native-dispatch guards invalidate prompt preparation already in flight.
- B: execution terminal state and candidate finalization use shared locks and generation checks. Cancellation/fatal/completion races, crash and late replies cannot authorize another candidate or silently rerun Judge.
- C: durable session-scoped model observations preserve requested versus native configured/response evidence. Fallback is allowed, appears in progress and model attribution, and retains unknown cause/usage explicitly. Native identity violations still fail closed.
- D: baseline test invocations own separate PostgreSQL databases, migration input and API/Web ports, including same-checkout concurrency. Cleanup checks ownership. Browser receipts retain actual endpoints. Preview scenarios exclude duplicate compose-world ownership before Docker access.
- E: checkpoint pins exact engine content; router executes the selected artifact even at the same version. Preflight, launch and recovery verify identity; canonical resume checks retained admission. Case-owned baseline commands run before Subject. Functional browser persistence and native keyboard qualification are separate.

## Tests and boundaries

dd-eval initial full suite: 227/227, `/tmp/dd-eval-029-final-suite.log`.
After the native dispatch guard, corrected Codex fixture and guard regression:
23/23 `/tmp/dd-eval-029-codex-fence-target.log`; AGY and guard: 8/8
`/tmp/dd-eval-029-dispatch-fence-target.log`. Final integrated suite is recorded
in `/tmp/dd-eval-029-delivery-suite.log`: 228 passed and one stale checkpoint assertion failed. The updated cp-074 assertion and its suite passed 64/64 (`/tmp/dd-eval-029-checkpoint-target.log`).

dd-flow full run: 303 passed, two old fixture failures. Both corrected fixtures
passed together (2/2), `/tmp/dd-flow-engine-targeted.log`. Full log:
`/tmp/dd-flow-engine-artifact-test.log`. Typecheck and lint passed.

Baseline quality, format, docs and browser passed. Browser concurrent invocations:
6/6 each, `/tmp/dd-tasks-browser-concurrent-a.log` and `-b.log`. Different migration
inputs and killing one invocation without affecting the other passed both within
one checkout and across two actual Git worktrees (`/tmp/dd-tasks-world-isolation.log`,
`/tmp/dd-tasks-two-checkouts-world.log`). Foundation scenario all six phases passed
(`/tmp/dd-tasks-foundation-world.log`). Preview exclusion regression passed.

Native keyboard qualification on macOS Chromium 151.0.7922.34 reported
`qualified:false`: ArrowDown+Enter did not change the standalone select.
This is preserved as one skipped qualification, not accessibility acceptance.

## Live root read and cancellation

All paths below are under `~/.dd-eval/conformance/live-029/`, ending in the
profile's `receipt.json`. They prove native marker read and owned-root cancellation,
not all providers' hidden routing or child capacity.

| Harness | Receipt root | Result |
| --- | --- | --- |
| Droid | `cf7c661b-8a29-4c27-9b97-02a68c03889c/droid-cli-openai-gpt-5-6-sol-high` | Native read and cancel passed; redundant second stop failed because daemon already stopped |
| Grok | `f1e5ebd0-1a56-4a1b-8037-4b8401c11f84/grok-acp-xai-grok-4-6-high` | Passed |
| AGY | `f1e5ebd0-1a56-4a1b-8037-4b8401c11f84/antigravity-cli-google-gemini-3-1-pro-high` | Passed |
| Codex | `f1e5ebd0-1a56-4a1b-8037-4b8401c11f84/codex-desktop-gpt-5-6-sol-high-dd-flow-0-9-0-beta-11` | Passed |
| OpenCode | `952f7627-0ccd-4161-b48e-b1a560095085/opencode-server-opencode-big-pickle-default` | Passed |
| ZCode | `3d1d7a54-a314-4034-8e5c-25c78a4ad52d/zcode-acp-zai-glm-5-3-high` | Passed |

Droid emitted actual native settings transition Sol → Kimi K3. Both models were
retained and progress displayed the change. Cause is unknown; quota exhaustion
was neither induced nor inferred. Native configured evidence does not prove
hidden response routing. Earlier unsuccessful smoke receipts were preserved;
cleanup addenda record subsequent cleanup without rewriting them.

## Release

CLI `0.9.0-beta.21`, source `2350e9cbeddba31e283d27384163b2bb44690d46`, published to
npm beta, Git main and annotated `v0.9.0-beta.21` pushed. Installed engine content:
`1daa9865f52088ae76a82cd26aeaf6b85399fa401dea0bc15e1c04d3d6903bb1`.
Build metadata pins canon 4.0.6 at `2aafb30d23e3f646b736b7ead25438cab97b16bf`.

Baseline source: `eval/cp-074-source-final` (separate branch from historical
`44939e9`), flow pack remains `f4d613d5b933aa7e0c77895e84dc9b8d24e4ffc9`.
Historical checkpoints and scored workspaces were not modified.
