# CP229 five-harness E2E readiness

Engine beta.138, source `c1a9786d04e0944daac204e1c767414904d9ced2`.
Published artifact, immutable tag and registry consumer match engine checksum
`3dd46bae5cbf1e58f2cc13a68078e7c39f3dc850a50d1dc5855765821eccdbee`.
Source baseline is tooling-only tag `eval/plan-086-review-clean-tooling` at
`b68b95e086e76440117b03644661ab15d2d1d24b`; product code is not operator-repaired.

## Evidence

- Typecheck, lint, hybrid and release-contract checks passed.
- Required integration union: 164 files, 2785 cases, zero failures/skips.
- Runtime-sensitive: 2 files, 47 cases, zero failures/skips.
- Installed repair smoke: 19 passed; 38 deliberately filtered cases are not PASS.
- Installed verification-matrix qualification passed through owning Stage reports.
- EVAL affected definition contracts: 25 passed, 4 optional-input skips.
- Every selected Subject and Judge passed native capacity with settled cleanup.
  AGY's first account-eligibility refusal is preserved; its operator-authorized
  fresh attempt qualified four children. Root settlement is not Work success.
- All five preflights passed before publication against the same verified bytes;
  final committed pins are checked again before launch. Baseline is not shared.
- Unchanged modern HITL qualification was reused with zero native Judge calls.
  AGY/Grok now explicitly select the shared `dd-eval/hitl-coverage@1` contract;
  historical unresolved legacy qualification evidence remains unchanged.

Raw evidence is retained at
`/Users/deksden/.dd-eval/implementation-evidence/plan-087-release/`.
GitHub Actions could not start because of account billing; required suites ran
locally with trusted receipts and verified complete discovery/union.

## Campaign

Full E2E, no stop-after, existing committed run profiles:

| Subject | Model/reasoning | Semantic decisions |
| --- | --- | --- |
| OpenCode 2.0.29 | GLM-5.3-Flash / max | Judge |
| ZCode 0.16.9 + bridge 0.52.0 `9c5ca6c` | GLM-5.3-Flash / max | Luna / 0.7 |
| AGY 1.3.5 | Gemini 3.8 Flash / high | Judge |
| Codex 0.162.1 via cx/CPA | gpt-6-luna / xhigh | Luna / 0.7 |
| Grok 1.0.60 | grok-4.7 / high | Judge |

Final/Interaction Judge: gpt-6.1-sol / high via cx with `.codex-cpa`.
Fresh homes: `/Users/deksden/.dd-eval/qualification/cp-229-<harness>-full`.
Shared resource registry retains the existing host-wide registry. The isolated
campaign PostgreSQL owns loopback 55437 and volume `dd_eval_cp229_pgdata`.
Do not stop unrelated `project-postgres-1` on 55433. Prior CP228 executions have
settled cleanup; their unused CP227 ZCode PostgreSQL was stopped, volume retained.

Launch only after final preflight, stagger baseline admission, preserve each EVAL
ID in its home, and stop campaign PostgreSQL after the last consumer settles.
Live resources are retained only for these active runs; historical runtimes stay
unchanged. Use the standard status/cleanup commands, never ad-hoc repair.
