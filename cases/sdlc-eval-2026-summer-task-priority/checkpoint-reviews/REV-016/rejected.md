# REV-016 — canonical chain rejected

Do not use REV-016 as an evaluation input. Its manually materialized project
was initialised on the host default branch `master`, while the project's
machine-readable workspace policy requires integration branch `main`.
PROTOCOLIZE correctly rejected that inconsistent stable checkout before it
could create a worktree. REV-017 rebuilds the full chain from a clean `main`
checkout; REV-016 records are retained only as diagnostic history.
