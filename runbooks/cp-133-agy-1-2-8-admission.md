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

Preflight `1790063483401-980d7862` passed against definition
`eaada533935f35519cc615f836d783315afaa448` and tree
`02fb200d36559922b73fe8072500a05ecbbc00ec`. Receipt root:
`/Users/deksden/.dd-eval/qualification/cp-133-agy/conformance/e2e-preflight/1790063483401-980d7862/e2e-inline-merge-agy-gemini-3-1-pro-high`.
The exact AGY and Sol judge doctors passed, isolated Gemini/app-data roots and
authentication were verified, `gemini-3.1-pro-high` was present in the native
model catalog, no provider Session was created, and baseline remained
`not_run` before execution-workspace creation.

Scored E2E `EVAL-20260922075252-129d85b8` was launched once from definition
`1e9b31f52b652751d558b917a97dd73857524136` and tree
`e9987f4416c5af217f8e62cb75c608e24c64843e`. Root:
`/Users/deksden/.dd-eval/qualification/cp-133-agy/runs/EVAL-20260922075252-129d85b8`.
The accepted launch entered `awaiting_provider`; observer PID `58940` was alive
with a current lease while the isolated baseline process was being admitted.
No provider Session existed yet, so this is launch evidence rather than a stage
or quality verdict.
