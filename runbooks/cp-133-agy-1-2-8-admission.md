# CP-133: Antigravity CLI 1.2.8 admission

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
- Antigravity CLI: official release `1.2.8`, binary SHA-256
  `b9a0982a7fb09b41f585d93cfa2fe541ec8e4395445a4246973317506477382f`.
- Subject: `gemini-3.1-pro-high`, reasoning `high`, contract
  `dd-agy-harness@1`.
- Home: `/Users/deksden/.dd-eval/qualification/cp-133-agy`; no prior runs,
  runtime database or conformance evidence was copied.

## Qualification

Release 1.2.8 changes long-lived runtime behavior: it fixes per-session
poller/timer leaks, background/subagent trajectory stack overflow, canceled
provisioning that continued in the background, and delayed shutdown. The old
1.1.27 receipt was therefore not reused.

Compatibility passed at
`/Users/deksden/.dd-eval/qualification/cp-133-agy/conformance/harness-compatibility/20260922074212313/antigravity-cli-google-gemini-3-1-pro-high/receipt.json`.
Capacity passed 15 direct children with every child `settled_by_root` and a
clean, settled daemon at
`/Users/deksden/.dd-eval/qualification/cp-133-agy/conformance/native-subagents/20260922074300421/antigravity-cli-google-gemini-3-1-pro-high/capacity.json`.
Native child hooks do not expose model identity, so attribution remains
explicitly incomplete rather than inferred; the requested profile is retained
as configuration evidence only.

After CP-132 launches, pin this checkpoint in a separate committed definition,
run preflight with explicit CP-133 paths, and launch exactly one scored E2E only
after PASS. Monitor using `runbooks/e2e-monitoring.md`; runtime failure
investigation is read-only.

## Receipts

Preflight and launch receipts will be appended after admission.
