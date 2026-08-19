# REV-016 · PROTOCOLIZE entry

Accepted. SPECIFY is complete with a valid result, deterministic reports and
one recorded HITL exchange. The RUN is waiting exclusively for
`start_protocolize`; there is no active child Work or pending question.

The checkpoint intentionally still names the stable project checkout. The
project's machine-readable workspace policy requires the feature branch,
worktree and bootstrap to be created by the deterministic PROTOCOLIZE-start
handler, before the agent writes a durable protocol document.
