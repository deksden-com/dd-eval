# Specification 011: Planned verification materialization

## Goal

Evaluate whether a PLAN can select evidence that is both substantively useful
and executable without turning the CLI into a test-selection heuristic.

## Contract under evaluation

`protocol-plan@5` owns one `checks[]` catalogue. Requirements and acceptance
criteria reach checks through `check_refs`. A check is either available now or
is a future named `@check/...` alias with an exact definition and provider
PLAN item. A consumer of that future alias is ordered after its provider.

The agent selects the proof and can plan a new test/alias when project checks
do not cover the needed behavior. The CLI validates the graph, materializes
the packet, runs due commands and persists receipts. It never labels a check
as too expensive or substitutes a different gate.

## Judge method

Score separately:

1. semantic adequacy — whether `R/AC → Work → CHK` proves the requested
   behavior, including meaningful negative cases where applicable;
2. execution integrity — correct provider ordering, exact alias
   materialization, receipts and honest proof limits;
3. efficiency — observed tools, time and token use, reported independently
   rather than treated as a quality penalty by itself.

## Acceptance

- a focused diagnostic covers an available check and a newly materialized
  planned alias;
- a planned raw command, missing definition, missing provider or missing edge
  is rejected deterministically;
- readiness checks execute at CODE entry; CODE checks and policy gates execute
  at CODE finish;
- the stage and E2E Judge receive the above criteria in their generated review
  packet;
- only then is a new canonical E2E checkpoint chain accepted.
