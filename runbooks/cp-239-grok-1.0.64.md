# CP239 Grok 1.0.64 candidate

Operator requested fresh full E2E after restoring authentication. Installed
Grok had also changed from 1.0.63 to 1.0.64; retained EVALs were not changed.

- Engine: published `0.9.0-beta.144`, checkpoint `cp-239-runtime`.
- Subject: `grok-4.7`, reasoning `high`, ACP1, native capacity 4.
- Interaction/Final Judge: unchanged `gpt-6.1-sol/high`; existing semantic
  qualification reused, no new Judge qualification calls.
- Compatibility PASS: `cp-239-grok-full/conformance/harness-compatibility/20261020092430416/grok-acp-xai-grok-4-7-high/receipt.json` below `~/.dd-eval/qualification`.
- Capacity PASS: `cp-239-grok-full/conformance/native-subagents/20261020093643855/grok-acp-xai-grok-4-7-high/capacity.json` below the same root: requested/started/completed 4, failed/cancelled 0; physical and native cleanup settled.
- Profile/corpus checks: 29 passed, 0 failed/skipped.

This admits a fresh experiment, not full-cycle product acceptance. Use a clean
committed checkout, existing published engine and isolated campaign PostgreSQL
port 55438. Do not resume failed EVALs or change running ZCode/OpenCode.
