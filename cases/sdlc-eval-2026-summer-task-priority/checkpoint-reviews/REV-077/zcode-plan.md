# REV-077 · PLAN entry · ZCode

Accepted as the unstarted entry to `PLAN` after successful `PROTOCOLIZE`.

- A single executable vertical-slice protocol (`PRT-007-task-priority`) owns
  every requirement and acceptance criterion from SPECIFY; there are no
  uncovered obligations or cross-protocol dependencies.
- The protocol is materialized inside the declared feature worktree, rather
  than the stable checkout, and identifies the existing task CRUD scenario as
  its verification foundation.
- The feature link and the protocol summary are present and correctly express
  the narrow archived-project exception without expanding the scope.
- `PROTOCOLIZE` is terminal and the next legal stage is `PLAN`; no HITL request
  or child Work remains. The snapshot preserves the registered Git repository,
  the feature worktree/RUN state, and the isolated runtime.
