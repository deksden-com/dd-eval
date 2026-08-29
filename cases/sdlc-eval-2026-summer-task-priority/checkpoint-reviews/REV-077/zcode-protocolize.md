# REV-077 · PROTOCOLIZE entry · ZCode

Accepted as the unstarted entry to `PROTOCOLIZE` after a successful `SPECIFY`.

- `SPECIFY` produced a complete, internally consistent contract: 11 requirements,
  9 acceptance criteria, explicit out-of-scope decisions, and no unresolved
  material questions.
- The handoff names the authoritative project sources, the archival-project
  exception, and concrete verification seeds. It is sufficient for an
  independent protocolizing session.
- The RUN is active only because the flow legitimately continues; `SPECIFY` is
  terminal (`done`, `specified`) and the next legal stage is `PROTOCOLIZE`.
- The restored snapshot is portable: it includes the clean `main` Git history at
  `a924495` through the verified Git bundle, plus the isolated runtime and RUN
  artifacts. No child Work or pending HITL interaction exists.
- The frozen provider Session is recorded as ZCode evidence; the configured
  `new_session` handoff will use a fresh Subject for the target stage.
