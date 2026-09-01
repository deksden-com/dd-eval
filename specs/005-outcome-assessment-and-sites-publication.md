---
file: 'specs/005-outcome-assessment-and-sites-publication.md'
description: 'Outcome-first scoring, unified case assessment, immutable rejudging, Grand Judge comparison and optional Sites publication.'
status: 'ACCEPTED'
suite_id: 'sdlc-eval-2026-summer'
supersedes: 'the scoring, oracle/reference and report-rendering sections of specifications 001 and 003'
---

# 005 — Outcome assessment and Sites publication

## Decision

The suite scores outcome quality, flow reliability and efficiency separately.
Outcome is the only primary quality verdict. Flow is a separate discipline
vector; efficiency is factual comparison data and never compensates for a
weaker result.

The active case is `dd-eval/case@7`. It has one accepted
`assessment.json`, replacing per-stage rubric, expectation and oracle files.
The assessment records each scope's weighted outcome/flow criteria, required
outcomes, accepted alternatives and known risks. It is a semantic baseline, not
an exact-output contract.

## Contracts

- `dd-eval/judge-result@2` is one contract for focused stages and E2E.
- `dd-eval/comparison-result@1` is the only separate contract because a Grand
  Judge compares several completed candidates rather than one candidate.
- `dd-eval/report@2` contains separate outcome, flow and efficiency sections.
- A later judgment is stored next to, never over, the first judgment.
- `prompts/roles/judge-prime.md` governs both focused-stage and E2E Judges;
  `prompts/roles/grand-judge-prime.md` governs the anonymized comparison.

`dd-eval` calculates weighted vectors from the Judge's 0–4 classifications.
The Judge receives mechanical evidence but does not repeat tool-checkable
checksum, lifecycle or session bookkeeping.

## Reuse and retention

Canonical stage-entry snapshots remain the sole exact rerun mechanism. A
candidate receipt plus retained compact artifacts supports static rejudging;
the report declares evidence completeness. Full attempt directories are
archived only for forensic replay under the existing storage policy.

`dd-flow` remains the source for session and usage facts. Its transcript parser
may add tool-call counts to the existing run-usage response, but no eval usage
database or parallel collector is introduced.

## Publication

An eval website is optional. On an explicit user request, the Site-owning agent
uses Sites with the accepted report, Judge results and the report-site prompt.
The site is an editorial projection, not a `dd-eval` renderer. It presents
infographics first and the full standardized textual report after them.

The publishing receipt is stored beside the report and identifies the report
and methodology hashes, URL, access mode and publication time. Publishing
never modifies the immutable report or candidate evidence.

## Acceptance

1. The active case validates as `case@7` with one assessment file.
2. A Judge result must contain complete 0–4 outcome and flow vectors.
3. `finalize` produces distinct outcome, flow and efficiency fields.
4. `judge prepare --rejudge` adds an immutable second result for one candidate.
5. Grand Judge packets anonymize compared candidates and only propose golden
   changes.
6. Usage reports can surface tool-call facts when transcripts provide them.
7. Publication follows the Sites report method only when requested by a user.
