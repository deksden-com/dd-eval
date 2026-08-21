# Retrospective evaluation: EVAL-021 / EVAL-022 / EVAL-023

This report applies `evaluation-methodology.md` to the retained Luna, Terra and
Sol candidates. Outcome and Flow are scored independently; Efficiency is raw
evidence and does not compensate for a weak result.

## Conclusion

Terra wins the complete SDLC chain. It is the only model with full E2E Outcome
and Flow scores, and it is also the fastest, cheapest and least tool-intensive:
21.80 minutes, 7.706 million tokens and 170 tool calls.

Sol is second. It preserves the strongest early-stage handoff and ends with a
code-ready plan, but two malformed `run:/` references leave minor traceability
debt. Luna's review is substantively strong, yet the final CODE handoff names
two not-yet-existing files as mandatory inputs. That is a practical blocker,
not a formatting penalty.

| Model | E2E Outcome | E2E Flow | Time | Tokens | Tool calls | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Terra high | 1.000 | 1.000 | 21.80 min | 7.706M | 170 | pass |
| Sol high | 0.875 | 0.863 | 34.27 min | 13.365M | 222 | pass |
| Luna xhigh | 0.625 | 0.725 | 35.50 min | 16.232M | 230 | fail |

## What changed under the new method

- Terra's focused PLAN-REVIEW digest mismatch now lowers Flow closure only. It
  no longer discounts the quality of the corrected plan.
- Sol's malformed source locators are minor because CODE receives the correct
  practical locator and can proceed.
- Luna's missing `must_read` artifacts remain blocking because a literal CODE
  worker cannot start from the supplied handoff.
- The lack of a second semantic review cycle is not penalized: the current flow
  deliberately performs one review wave followed by one coherent correction.

## Stage observations

SPECIFY is not a differentiator here: all three models resolve the material
vocabulary/default gap, preserve stable ordering and produce a portable
handoff. Sol is simply the most efficient at 4.31 minutes, 457K tokens and 16
tool calls.

At PROTOCOLIZE, Sol alone makes the narrow archived-project priority-only
mutation boundary explicit in the durable handoff. Luna and Terra produce
usable vertical protocols, but their missing boundary is a material downstream
risk.

PLAN is the common weak point. Every model reaches 0.625 Outcome: grounding is
strong, but database enforcement, atomic archived mutation, executable legacy
migration evidence and a sufficiently explicit CODE graph remain incomplete.
Terra is markedly more efficient, but efficiency does not lift its Outcome.

PLAN-REVIEW validates the value of independent review. Terra reaches 1.000
Outcome by correcting the substantive risks; its receipt digest mismatch is a
Flow defect. Sol reaches 0.938 Outcome with minor locator debt. Luna also reaches
0.938 after reclassifying the `http.ts` ownership ambiguity as a non-blocking
traceability issue: the owned route/service surfaces can implement the stated
contract without changing that shared helper.

## Evidence limits

This is a retrospective rejudge, not a new execution. It uses immutable
candidate artifacts and accepted independent report@1 findings. No fresh Judge
sessions were run, so `evidence_completeness` is `limited`. Token usage comes
from retained dd-flow records. Tool-call totals were reconstructed from their
recorded Codex JSONL locators and count `custom_tool_call` events for the exact
stage session scope.

## Golden candidates

Two patterns are worth human review, not automatic promotion: Terra's
reset-safe migration plus exact archived PATCH matrix, and Sol's broad review
coverage with duplicate consolidation. A human must accept either proposal in
`assessment.json` in a later commit.
