# EVAL-005 review criteria

Verify independently that the run:

- entered flow through SPECIFY from the supplied discussion;
- produced grounded accepted SPECIFY, PROTOCOLIZE and PLAN artifacts;
- left every delegated PLAN aspect `pending` until reviewer evidence was
  accepted;
- kept proposed CODE Work absent until PLAN-REVIEW;
- selected a review mode consistent with the RUN setting and task risk;
- performed no capacity probe for a local-only route, or exactly one RUN-level
  capacity observation before the first delegated Work;
- used fresh, read-only reviewer sessions when review was enabled;
- associated each reviewer Work with a stored Session containing provider
  `session_id`, child `agent_id`, parent Session and transcript;
- kept Work parentage and Session parentage in their separate stored
  hierarchies, with participation represented only by Work/Session links;
- used the exact `work start` command as each subagent's first action and a
  validated `work finish` or `work fail` as its final flow-owned lifecycle
  action;
- recorded an evidence-backed reduction and opened CODE exactly once;
- preserved truthful Work, Session and source-based usage evidence without
  treating provider turns as dd-flow entities;
- obtained final usage through one controller-side `stat usage` call after all
  root/child responses returned;
- left no created/running Work when the stage or RUN reached a terminal gate.

Separate material semantic defects from cosmetic report issues and from
controller/harness failures.
