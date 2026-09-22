# CP-132: Grok Build 1.0.40 admission

Date: 2026-09-22. Qualification passed; preflight and scored E2E pending.

## Immutable tuple

- Product source: `deksden-com/dd-tasks`
  `924ef61752b642f06c2c326b444ed7a3239f20ff`, tag
  `eval/cp-074-source-final`.
- Flow pack: `53d4b76943900f122957c78cc0fefa2051bd7b1a`, canon
  `4.1.1` / `d1a6081ab15ab92ac917ff5d037121a40c709db1`.
- Engine: `@deksden-com/dd-flow-cli@0.9.0-beta.95`, commit
  `4c8c5e8456d684a7887c8bfdd1afc24ae874ff6c`, installed full-content
  SHA-256 `2a12a82a250b8b96bbbca09c4ffbd28a4e46b74cf783b61ac6c218c3a23c3221`.
- Grok Build: `1.0.40` (`eb1a2256660d`), binary SHA-256
  `3f2aef9618191a2c60d18a5044fa462c9c77bdc4187b02ed716b0394e8d4fef2`.
- Subject: `grok-4.7`, reasoning `high`, ACP `1`, contract
  `dd-grok-harness@1`.
- Home: `/Users/deksden/.dd-eval/qualification/cp-132-grok`; no prior runs,
  runtime database or conformance evidence was copied.

## Qualification

The old `grok-4.6` profile was not silently reused. Native initialization under
Grok Build 1.0.40 advertised `grok-4.6`, then authoritative session info and
usage reported `grok-4.7` / `grok-4.7-build`. CP-132 therefore uses a new
`grok-4.7` profile and run profile instead of mislabelling the experiment.

Runtime compatibility passed at
`/Users/deksden/.dd-eval/qualification/cp-132-grok/conformance/harness-compatibility/20260922073900830/grok-acp-xai-grok-4-6-high/receipt.json`.
The subsequent exact-model capacity probe passed 15 direct child admissions
with clean daemon settlement at
`/Users/deksden/.dd-eval/qualification/cp-132-grok/conformance/native-subagents/20260922074107848/grok-acp-xai-grok-4-7-high/capacity.json`.

After this definition is merged, run preflight with explicit CP-132 paths and
launch exactly one scored E2E only after PASS. Monitor using
`runbooks/e2e-monitoring.md`; runtime failure investigation is read-only.

## Receipts

Preflight and launch receipts will be appended after admission.
