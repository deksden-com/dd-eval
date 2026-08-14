---
file: 'beta/vnext-specify-beta.7/specs/001-canonical-specify-semantic-parity.md'
description: 'Ports the full canonical SPECIFY semantic scope into the vNext proof flow.'
purpose: 'Make a fresh PROTOCOLIZE worker able to continue from SPECIFY without recovering lost requirements analysis from an agent conversation.'
status: 'IMPLEMENTED'
---

# Canonical SPECIFY semantic parity

The beta proof flow keeps the new order `SPECIFY → PROTOCOLIZE`; it does not
copy the old protocol-first runtime or its report bureaucracy. It does preserve
the canonical work performed during SPECIFY.

## Required semantic result

`vnext-specify-result@2` records one portable problem-space contract:

- problem, goal, actors, requirements, constraints, scope/non-goals;
- acceptance criteria, an observable acceptance scenario and verification
  contour, including fixtures and eval/experiment need;
- assumptions and stable fixed/open `Q-*` questions;
- bounded research routing, method applicability, one consolidated gap ledger
  and happy/alternate/error coverage;
- design-aspect decisions, independent assessment axes and the legacy
  projection needed by later routing;
- delivery shape (`single_protocol` or vertical `protocol_set` slices);
- a compact PROTOCOLIZE handoff: preserve, read, remaining gates and
  verification seeds.

Runtime state, reports, stage identity and lifecycle transitions remain owned
by `dd-flow`; they are not duplicated in the semantic artifact.

## Canonical gap pass

The stage prompt requires baseline scanning, a named-question research gate,
the full nine-row applicability matrix before method-file reads, one shared
ledger and the canonical resolution/question gate. It lists exact method paths
and makes specialized reads conditional on `light` or `full` applicability.
This retains adaptive depth rather than forcing all methods.

## Grounding and continuation

The engine packet supplies compact Memory Bank navigation excerpts for the
project, structure, policy, MBB, spec, scenario, DEF, protocol and plan
indexes. The worker follows only material links. Selected evidence is recorded
in the result and its compact handoff, so a new PROTOCOLIZE session does not
need the original discussion context.

## Validation

Each RUN validates the result through its bound engine snapshot. This makes the
strict semantic schema reproducible even if the project pack changes later.
`stage finish` remains the single lifecycle completion command.
