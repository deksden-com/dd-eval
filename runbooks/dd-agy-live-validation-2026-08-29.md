# dd-agy live validation — 2026-08-29

Qualified baseline: Antigravity CLI `1.1.22`, `gemini-3.1-pro-high`, effort
`high`, mode `accept-edits`, permission mode `always-proceed`.

## Results

- `doctor` verified the pinned version, model availability, isolated
  `--gemini_dir`, isolated `--app_data_dir=runtime`, and existing Keychain auth.
- A real two-turn streaming smoke retained one PID and one conversation ID.
  Cumulative usage advanced from 14,203 to 16,512 tokens and the second turn
  reported cache reads. The daemon stopped cleanly.
- A disposable `dd-tasks` worktree completed exactly one focused SPECIFY. It
  paused once at `HITL-001`, accepted the option-1 fixture (Low/Medium/High,
  default Medium), finished SPECIFY, and stopped with
  `next_action=start_protocolize`; PROTOCOLIZE was not started.
- Trusted lifecycle identity was `antigravity-cli:6add0b70-0789-4c16-9c93-9961c67f6b51`.
  The final external usage snapshot contained 153,445 total, 126,172 input,
  27,273 output, 21,650 reasoning tokens and 20 tool calls. `dd-flow stat usage`
  reconciled the Session as measured with source
  `antigravity_cli_session_usage_v1`.
- The output included schema-valid `dd-flow/specify@1`, its Markdown
  projection, and the stage-report JSON/Markdown/HTML set.

## Defects found and fixed

1. The daemon initially asserted effort without passing `--effort`; the pinned
   effort is now sent to the provider.
2. The Stop hook returned a non-contract value; it now returns `{}`.
3. Canonical bootstrap `--intake-stdin` heredocs were misclassified as compound
   lifecycle calls by the external adapter. One Antigravity bootstrap heredoc
   is now accepted and regression-tested; arbitrary compound commands remain
   rejected.
4. Raw Antigravity usage was stored but omitted from RUN reconciliation.
   `antigravity-cli` is now a first-class external harness in token/tool windows.

Headless native fork remains intentionally unsupported. Focused starters use
`deterministic_replay`; this validation did not claim or exercise native fork.
