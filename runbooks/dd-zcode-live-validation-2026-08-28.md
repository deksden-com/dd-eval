# dd-zcode daemon: live validation 2026-08-28

Environment:

- ZCode `0.16.5`;
- pinned zcode-acp `0.13.0` from `feat/dd-harness-inspection`;
- provider/model `builtin:zai-coding-plan / GLM-5.3`;
- reasoning `high`, mode `yolo`;
- isolated git workspace and isolated `DD_FLOW_HOME` under
  `live-evidence/zcode-daemon-2026-08-28/`.

## Passed live checks

1. `doctor` matched both pinned versions.
2. Detached `daemon start` returned a live handshake, stable `daemon_id`, PID,
   controlled cwd and exact configuration. A second identical start was
   idempotent and returned the same PID.
3. A native Session was created in one CLI process and prompted/inspected from
   later CLI processes while one app-server remained alive.
4. The observed provider, model, reasoning and mode matched exactly.
5. A foreground ZCode subagent reported the same controlled cwd as the root.
6. A real `dd-flow session register` Bash call was forwarded and retained as
   `harness=zcode-acp`, provider Session
   `sess_58847cc2-7899-4015-b806-83bbdb82fe98`, daemon
   `8950b621-bc8f-4506-938d-62c1d3743285`.
7. A background subagent running `sleep 60` remained visible after the root
   turn returned. A separate `daemon stop` refused with `tree_not_settled`.
8. After the cancellation fixes, a separate CLI process cancelled real task
   `agent_a72b2125-6641-4a65-8d82-ddd4799be533`; evidence showed
   `cancelled:true`, `after.running=[]` and `root_status=idle`.
9. `session fork` with `{ "kind": "latestCheckpoint" }` succeeded in a
   dedicated workspace after a Write tool call created a checkpoint. Parent
   `sess_d03e4c41-cf62-42c2-bcc1-d3bdd73a2e39` produced fresh child
   `sess_b5847e41-4f5e-47c2-ac5a-3e6bf23d847c`.
10. Clean stop removed the socket and left no matching daemon, ACP server or
    ZCode app-server process.
11. Hard-killing a daemon whose tree was unproven caused the next start to fail
    with `invalid_harness_crash`; it did not claim recovery success.
12. A real root GLM-5.3 Session executed a trusted `stage start` on its first
    attempt; `stat run sessions ls` retained harness, native provider ID and the
    verified provider/model/reasoning/mode profile.
13. A real foreground subagent exposed a distinct native `childSessionId` and
    immutable root parent. Its first lifecycle attempt revealed a 1 ms event
    race; after the bounded claim-window fix, a fresh child succeeded on its
    first attempt and the child identity was claimed by `dd-flow`.
14. A fresh daemon turn produced a measured `zcode_session_usage_v1` delta of
    7,162 tokens and one `Bash` tool call; `tool_calls.status` was `measured`.

## Defects found and fixed by the live run

- A long execution path exceeded the macOS Unix-socket path limit. Long state
  paths now use a deterministic, mode-`0600` socket under `/tmp`; exact identity
  remains tied to the state directory hash.
- A built dd-flow `.js` adapter was spawned directly and failed with `EACCES`.
  Script adapters now use the current Node executable.
- Child cancellation could finish while its terminal notification started an
  untracked root turn. `dd-zcode` now requires both an empty child tree and a
  non-running root status. zcode-acp now always sends idempotent backend
  `session/stop`, including when the ACP prompt request has already returned.
- Cold reuse of a stopped state directory exposed persisted ZCode background
  topology that no longer had a live task handle. Clean stop is therefore
  terminal and later start requires a fresh execution state directory.
- Fork without an actual checkpoint returned backend `Internal error`. The
  successful validation used an explicit Write-generated checkpoint; the
  operator contract continues to require an accepted checkpoint and dedicated
  workspace.
- Nested-agent tool notifications can reach the forwarder just after the Bash
  process starts. `dd-flow` now polls for at most 250 ms only when the exact
  matching event is absent, preserving single-use matching and fail-closed
  behavior.
- ZCode token snapshots did not carry comparable tool-call evidence. The daemon
  now counts ACP tool calls and failures cumulatively and `dd-flow` derives the
  same scoped deltas used by eval efficiency reports.

## Automated verification after fixes

- dd-eval: `15/15` tests passed with the real dd-tasks checkout selected.
- dd-flow-cli: `189/189` tests passed; typecheck and production build passed.
- pinned zcode-acp: `799/799` tests passed; typecheck and build passed.

Raw local journals and daemon states are retained in
`live-evidence/zcode-daemon-2026-08-28/`. They are intentionally not committed:
they contain full native Session transcripts and machine-specific paths.
