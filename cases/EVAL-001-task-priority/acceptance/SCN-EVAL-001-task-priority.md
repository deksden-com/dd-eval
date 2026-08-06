# Hidden deterministic acceptance contract

Этот файл остаётся в `dd-eval` и не копируется в run repository.

## Gates

1. Source and flow: accepted ready-for-code input, clean final diff, applicable Memory Bank updates and no unrelated dependency/background additions.
2. Database: forward-only migration; priority constrained to the five values; non-null default; existing rows and repeated seed are deterministic.
3. API: every task response includes priority; create omission is `none`; patch omission preserves; every valid value persists; invalid input returns `400 VALIDATION_ERROR` without mutation.
4. Authorization: member behavior stays allowed, archived project returns the existing conflict, cross-workspace access remains `404`.
5. UI: labelled native select on create/detail, default `none`, saved value reloads, list contains a textual label, archived controls are disabled, keyboard and 390px viewport remain usable.
6. Regression: project quality, integration, browser and docs checks pass.

## Fixture expectations

- `task-alpha-one`: `high`.
- `task-beta-one`: `none`.

## Non-goals asserted

No priority sorting/filtering, new endpoint, new dependency, background process, autonomous AI behavior or weakening of existing auth/workspace boundaries.

Executable test injection is intentionally added after the first manual smoke implementation fixes the final public API/UI selector contract. Until then this document is the deterministic contract, not a claimed passing verifier.
