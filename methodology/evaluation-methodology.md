# Evaluation methodology

This is the normative method for every `dd-eval` case. It evaluates the
result of an SDLC flow, not textual similarity to a reference answer.

## Three independent views

1. **Outcome quality** is the primary result: whether the resulting decision,
   handoff or plan is correct, grounded, practical and sufficiently deep.
2. **Flow reliability** is execution discipline: legal flow transitions,
   correct HITL handling, durable handoffs and usable evidence.
3. **Efficiency** is reported as facts: elapsed time, tokens, tool calls,
   sessions, retries and waits. It never compensates for weak outcome quality.

Reports compare candidates in that order: outcome first, flow second, then
efficiency as a tie-breaker for materially comparable results. No blended score
is used.

## Criterion scale

Each applicable outcome and flow criterion is scored from 0 to 4.

| Score | Meaning |
| --- | --- |
| 0 | Missing, unsafe or contradicts the task. |
| 1 | Major gaps or unsupported decisions. |
| 2 | Usable but needs material correction. |
| 3 | Strong, grounded and free of material gaps. |
| 4 | Exceptionally complete and practical; adds a useful, justified insight. |

Extra prose, needless architecture and additional subagents do not improve a
score. A score of 4 requires a concrete improvement to the decision, evidence
or risk posture.

`not_applicable` is valid only when the criterion truly does not apply and the
Judge explains why. Missing evidence for an applicable criterion is not N/A.

## Findings and gates

- **blocking**: the result cannot safely proceed; Outcome verdict is `fail`.
- **material**: a meaningful defect that must be corrected. An essential
  criterion with a material defect cannot receive a full pass.
- **minor**: a local weakness without a meaningful downstream consequence.
- **cosmetic**: wording or formatting without a practical consequence.

Formal defects are classified by effect. A malformed path that blocks a CODE
worker is material; an equivalent harmless typo is cosmetic. Flow compliance
can never make up for a poor semantic result.

## Golden reference

Each case has one accepted `assessment.json`. It contains required outcomes,
accepted strong decisions, valid alternatives and known risks for each scope.
It is a semantic baseline, not a prescribed answer. A Judge first evaluates the
candidate on its own merits, then checks coverage against the reference and may
recognize a grounded alternative.

Judges may propose golden candidates. They never mutate the reference. A human
accepts a proposal by editing `assessment.json` in a new Git commit.

## Roles

- **Controller** materializes attempts and records facts; it makes no semantic
  evaluation.
- **Stage Judge** is a fresh, read-only Session per focused stage.
- **E2E Judge** is a fresh, read-only Session for the full chain.
- **Grand Judge** compares anonymized completed reports, audits interpretation
  and may propose golden or methodology changes. It does not overwrite the
  original stage or E2E judgments.

The Judge receives mechanical evidence calculated by the tools. It must not
repeat checksum or lifecycle bookkeeping instead of reviewing the substance.

## Evidence and rejudging

Candidate artifacts and their receipt are immutable. A later Judge result is a
new numbered judgment over the same candidate, carrying the assessment and
methodology hashes. Exact reruns use canonical stage-entry checkpoints. Static
rejudging uses retained candidate evidence; a report must state whether that
evidence is `complete` or `limited`.

## Reporting

Outcome and flow have separate score vectors. Efficiency remains raw data.
Radar charts may show a 0–4 vector only when all displayed models share the
same axes. Time, tokens and tool calls use bars or tables, never a radar.
