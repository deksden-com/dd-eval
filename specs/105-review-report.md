# Plan 105 — post-implementation review

Date: 2026-10-26. Source implementation reviewed against P1–P4 / D1–D14.
All confirmed substantial gaps below were fixed; no product source, historical
EVAL evidence, provider request, release or new scored EVAL was changed/launched.

## Findings and fixes

1. **Current library authority could outlive its inputs.** Captured identities
   correctly supported historical replay, but also permitted current failed-check
   reuse/repair after helper bytes changed. Current reuse, prepared evidence and
   Work/CODE/CODE-REVIEW/MERGE repair entrypoints now validate current library
   inputs. Registration performs filesystem checks before SQL. Historical replay
   remains valid without a live installation. The connected regression covers
   refusal without registration or receipt mutation, preparation revalidation,
   restored reuse and an explicit fresh retry.
2. **Late OpenCode child discovery bypassed registration.** Completion-notification
   reconciliation used a raw `children().find()` after the normal traversal, so a
   child could reach observation without root binding or fork/cycle guards.
   It now uses the same guarded registration path. A native v2 fixture discovers
   the child only on the third read and checks owned/fork/cycle/foreign cases.
3. **Partial/unavailable metadata could certify intent.** A permission-only
   request or unavailable diagnostic containing requested config could yield
   `matched`. Each assertive Session now needs an explicit model intent from
   configured/request/response evidence; a child cannot borrow its parent's proof.
   Positive identity conflicts still win. Known configured intent does not require
   disclosed response usage or routing metadata.
4. **Canonical ownership was not shared by every native caller.** Some callers
   only compared lexical strings, allowing project/runtime/binding aliases or an
   external attempt before RPC. Capture, recognition, enrichment, cancel, fork,
   recover, cleanup reconcile, status and conformance now validate owned binding
   first. Conformance receives the trusted EVAL root and validates run-home/profile
   paths. Legacy direct cancellation separately validates its private paths while
   retaining the legitimate harness-runtime alias to a verified engine. Negative
   fixtures prove no native read/inspect/stop outside the owned execution.
5. **Recovery could invent a writer-barrier claim.** A missing consistency marker
   received a default, and incomplete/non-restorable headers could be called ready.
   Both explicit engine markers are now required. The original recovery producer
   already emitted them in @5; legitimate historical recovery compatibility is
   preserved. Candidate capture remains a separate path.

P2 normative declarations, shared semantic rule, source freezing, negative corpus
and qualification identities were checked. No additional substantial P2 defect
was established. Live semantic acceptance remains explicitly separate; deterministic
tests are not claimed as a fresh model verdict.

## Scoped acceptance

- Source build PASS: `/tmp/review105-build.log`.
- Engine: seven explicit check/repair contract files, **139/139 PASS**:
  `/tmp/review105-engine-tests/results.json`. This covers the shared proof guard,
  Work finish, aggregate repair/SQL boundaries, CODE preparation and MERGE repair;
  no broad controller/full release gate was run.
- OpenCode: **45/45 native cases PASS** in
  `/tmp/review105-opencode-r2/native-opencode-adapter.tap` (one wrapper PASS).
- EVAL: **14 selected contracts**, **176 PASS + 5 allowed optional real-CLI skips**.
  Receipt: `/private/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-eval-scoped-AsaoCa/receipt.json`.
  All new regressions executed. Final refresh executed three changed contracts and
  reused eleven receipts. Recovery's newly imported native fixture is now in its
  verification input closure, with a key-invalidation regression.
- `git diff --check`, JS syntax checks and generated proof-mirror check PASS.
  Pure proof/producer bytes did not change, so producer/model qualifications were
  not repeated. Original failed attempts are retained: one wrapper-selection env
  typo and incomplete test records/headers were corrected without weakening guards.

## Cleanup boundaries

- Stopped one verified orphan offline AGY fixture (PID 89018, parent 1, started
  2026-10-24, no native children); no working EVAL was interrupted.
- Removed clean `dd-flow-cp250-release`, `dd-flow-cp253-delivery` and
  `dd-tasks-plan105` worktrees, plus merged plan105 task branches. Source remains
  in main/release tags. Three temporary dependency links were unlinked without
  deleting their package directories. The beta.150 release receipt is preserved
  under `~/.dd-eval/cleanup-archive/2026-10-26/dd-flow-cp250-release/`.
- Removed only the stale untracked planning copy in the primary dd-eval checkout;
  its substantive text is committed in plan105, with implementation status updated.
- Review worktrees/branches are removed after integration. Other remaining
  checkouts are not assumed disposable: primary mains contain unique unpublished
  E5 work; CP253/CP254 checkouts are referenced by frozen manifests; CP251/CP253
  candidates contain unintegrated changes or supply the existing dependency cache.
  They are preserved rather than silently discarding work or breaking evidence.
