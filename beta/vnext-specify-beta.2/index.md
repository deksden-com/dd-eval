# vnext-specify-beta.2

This repair iteration keeps the vNext SPECIFY flow and case from beta.1. It
fixes only the engine boundary discovered by the first real router launch.

| Component | Exact candidate |
| --- | --- |
| `dd-tasks` | flow pack `3.2.0-vnext-specify-beta.2`, tag `eval-mb-3.2.0-vnext-specify-beta.2` |
| `dd-flow-cli` | engine `0.8.0-beta.2`, tag `eval-engine-0.8.0-beta.2` |

## Change

An already-existing `~/.dd-flow/db.sqlite` did not have the two tables added
for `Work` and `Agent Turn`, so a correctly routed `flow launch` failed before
the flow could begin. `flow launch` now idempotently creates only those tables
and indexes before it materializes the root Work. The engine test begins with
those tables removed and proves launch restores them.

No agent instruction, product code, flow semantics, or case input changed.
Beta.1 tags remain immutable evidence of the failure.

## Acceptance

1. A router-dispatched `flow launch` succeeds against the normal existing
   runtime database.
2. It selects exactly engine `0.8.0-beta.2` for the beta.2 pack.
3. The resulting RUN still has no protocol before the worker result.
4. The normal case materializes a stage-only `specify` track with no hidden
   planning/reference input.
