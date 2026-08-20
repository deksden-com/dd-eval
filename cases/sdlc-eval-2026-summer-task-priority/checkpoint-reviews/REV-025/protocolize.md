# REV-025 PROTOCOLIZE entry acceptance

Accepted after canonical SPECIFY.

- The accepted SPECIFY records all seven acceptance criteria and the binding
  four-value priority decision from HITL-001.
- The RUN is `specified` and routes to `start_protocolize`; no protocol,
  feature document or feature worktree exists before this stage.
- The frozen entry Subject is an untouched fresh-session fork, matching the
  project policy `workspace.next_stage_session: new_session`.
- Engine `0.8.0-beta.79` and flow beta.82 remain the only canonical pair.
