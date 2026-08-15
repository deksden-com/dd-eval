---
file: 'beta/vnext-protocolize-beta.1/specs/002-protocolize-documents-and-acceptance.md'
description: 'PROTOCOLIZE responsibilities, document triggers and acceptance decomposition.'
status: 'DRAFT'
---

# 002 — PROTOCOLIZE documents and acceptance

## Required input

PROTOCOLIZE receives the accepted `specify.md`, stable `R-*`/`AC-*` identifiers,
delivery-document indexes, compact content and exact paths for relevant
epics/features, project/product map, project policy and known durable
spec/ADR/scenario references. A list of epic directory names alone is not
sufficient grounding. It excludes the full discussion transcript and
implementation grounding.

## Required output

The semantic result declares one of:

- a single executable PRT; or
- a PSET and executable member PRTs.

It records only material delivery decisions: a `scope_sizing_verdict`, narrow
goals and roles, explicit hard dependencies, primary acceptance for every PRT,
request-acceptance coverage, and durable links. The raw user intake is copied
beside the first PRT only when it is materially useful.

A PSET additionally records why it is needed, which members are startable now,
and a pre-code execution topology: dependency graph, feasible and excluded
modes, selected mode, workspace owner and the `before_first_code` confirmation
gate. It must not be used merely to manufacture parallelism.

The agent uses slugs/temporary member keys. CLI allocates all EP/FT/PRT/PSET
ids, replaces temporary keys in durable output, renders documents, validates
them, updates indexes and registers runtime. A material requirement conflict
returns `requirement_gap` to SPECIFY without creating delivery documents.

## Positive document triggers

- An epic is created or updated only for a value area containing multiple
  independent features.
- A feature is created or updated for a user-visible capability when the
  project enables its catalog.
- A spec, ADR or standalone scenario is created only when its own trigger is
  satisfied; none is a checklist artifact.
- An internal refactor does not require an epic or feature.

Linking an existing feature updates its reciprocal `related_protocols` link
idempotently. A `link` action is not only an existence check. The result
contract must support every advertised epic/feature create, link or update
action; unsupported actions must not be promised by the prompt.

## Acceptance chain

SPECIFY owns request-level acceptance with stable `AC-*` identifiers.
PROTOCOLIZE maps every material request criterion by ID to one or more PRTs,
and every PRT has exactly one independently
verifiable primary acceptance contract. PLAN later makes those contracts
executable; it does not rewrite product behavior.

If PROTOCOLIZE returns a requirement gap or user question, the returned resume
entry must already exist and be executable. A declarative transition without a
working answer/remediation lifecycle is invalid.
