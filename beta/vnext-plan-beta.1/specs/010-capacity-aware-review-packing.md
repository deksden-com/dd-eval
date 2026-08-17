---
file: 'beta/vnext-plan-beta.1/specs/010-capacity-aware-review-packing.md'
description: 'PLAN receives the measured capacity and groups compatible review aspects into the fewest practical waves.'
status: 'DRAFT'
---

# 010 — Capacity-aware review packing

## Problem

beta.50 measured six fresh-subagent slots but exposed only that capacity was
"recorded". PLAN created seven thematic review groups for thirteen applicable
aspects. PLAN-REVIEW therefore ran six reviewers and a one-reviewer tail wave,
although compatible light aspects could have fit in one wave.

The defect is at PLAN, where semantic groups are chosen. PLAN-REVIEW must not
rewrite them after the fact.

## Routing rule

The PLAN packet and `work-context.json` expose the exact measured capacity `C`.
PLAN groups every applicable aspect exactly once, with one to three
semantically compatible aspects per reviewer, using this priority order:

1. preserve genuine trust, irreversible, high-risk and hard-dependency
   boundaries;
2. minimize `W = ceil(review_group_count / C)`;
3. within the same `W`, minimize reviewer count.

One wave is the preferred result whenever safe grouping permits it. An
avoidable `C + 1` tail is a routing defect. An underfilled final wave is valid
when real semantic boundaries prevent further grouping. Exact multiples of
capacity are not a goal: the flow never creates extra reviewers merely to fill
unused slots.

PLAN-REVIEW executes the accepted groups in exactly `ceil(group_count / C)`
capacity-bounded waves. It does not regroup, retry or create filler reviewers.

## Acceptance

1. PLAN start reports the numerical capacity in JSON, trusted prompt context
   and `work-context.json`.
2. The task-priority case with capacity six and thirteen compatible applicable
   aspects produces no more than six review groups unless the map records a
   genuine boundary that makes a second wave necessary.
3. Prompts state the optimization order and explain that quality boundaries
   outrank speed.
4. PLAN-REVIEW runs no more waves than `ceil(group_count / capacity)` and never
   adds reviewers to fill a wave.
