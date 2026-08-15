---
file: 'beta/vnext-protocolize-beta.1/specs/002-protocolize-documents-and-acceptance.md'
description: 'PROTOCOLIZE responsibilities, document triggers and acceptance decomposition.'
status: 'DRAFT'
---

# 002 — PROTOCOLIZE documents and acceptance

## Required input

PROTOCOLIZE receives the accepted `specify.md`, delivery-document indexes,
project/product map, project policy and known durable references. It excludes
the full discussion transcript and implementation grounding.

## Required output

The semantic result declares one of:

- a single executable PRT; or
- a PSET and executable member PRTs.

It records only material delivery decisions: narrow goal, explicit hard
dependencies, primary acceptance for every PRT, aggregate acceptance for a
PSET, and durable-document actions.

The agent uses slugs/temporary member keys. CLI allocates all EP/FT/PRT/PSET
ids, renders documents, validates them, updates indexes and registers runtime.

## Positive document triggers

- An epic is created or updated only for a value area containing multiple
  independent features.
- A feature is created or updated for a user-visible capability when the
  project enables its catalog.
- A spec, ADR or standalone scenario is created only when its own trigger is
  satisfied; none is a checklist artifact.
- An internal refactor does not require an epic or feature.

## Acceptance chain

SPECIFY owns request-level acceptance. PROTOCOLIZE maps every material request
criterion to one or more PRTs, and every PRT has exactly one independently
verifiable primary acceptance contract. PLAN later makes those contracts
executable; it does not rewrite product behavior.
