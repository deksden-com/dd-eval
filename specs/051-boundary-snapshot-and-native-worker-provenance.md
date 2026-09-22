# 051 — Stable boundary snapshots and native worker provenance

Status: implementation in progress; release and fresh qualification pending. Date:
2026-09-22. Follow-up to Plan 050 and the two terminal scored runs on published
`@deksden-com/dd-flow-cli@0.9.0-beta.97` (commit
`4d478c7dd9549a5b81ed5cd77d4f04befebf6f1c`, canon
`678daa038287c948ada5b2d785a6dcc925c7b891`). Paths in the implementation
inventory are relative to `dd-flow-cli`. Do not mutate, resume, or reuse either
failed run; qualification requires fresh homes and EVAL IDs.

## Evidence, primary causes, and limits

| Run | Durable result | Established causal chain | Not established |
| --- | --- | --- | --- |
| Grok CP-136 `EVAL-20260922160326-05f4ffca` | After PROTOCOLIZE, boundary capture repeatedly reported `snapshot_source_changed`, then `recovery_observation_budget_exhausted` at 120 s. The retained tree was settled; this is **not** the Plan 050 `owned_inventory_changed` failure. | `snapshotSourceVersion` hashes live runtime files, including raw primary/nested SQLite and WAL, while `copyRuntimeTree` omits SQLite sidecars and uses `VACUUM INTO`; its copied-file exclusions also differ. Thus the guard can invalidate a consistent capture on physical database churn or excluded runtime changes. Capture's own inspection can write `budget-observations/*.json`; Grok home also had memory/SQLite activity during the capture window. | The receipt stores only one aggregate hash and does not identify which file changed on a particular retry. Do not attribute all four retries solely to a WAL, observation file, or Grok memory writer without a differential repro. |
| AGY CP-137 `EVAL-20260922160325-a042c4e4` | CODE Work remained `created`, while controller failed with `fanout_stage_nonprogressing`. | Shared worker prompt included a coordinator-only fresh-child instruction. Direct child `624409c4…` delegated its own `work start` to grandchild `ebc0c623…`; that grandchild's native pre-tool hook was denied `agy_child_identity_unconfirmed` before CLI. Root settlement labelled the direct child `settled_by_root`; shared fanout removed that child before Work association, masking `unbound_native_delegation_detected`. The pre-CLI denial never entered `hook_events`, so the unchanged-graph check lost the primary error. | AGY root stream did not expose this grandchild as a confirmed descendant. Do not infer that accepting unknown child IDs, increasing the 1 s wait, or changing the native binary would make nested execution safe. |

The AGY `settled_by_root` marker proves terminal tree settlement only, not Work
success. The snapshot boundary still needs a real writer fence; neither an
unconditional exclusion nor a larger observation budget is an acceptable fix.

## Systematic affected-surface inventory

The two focused audits were checked against the exact beta.97 source and run
artifacts. `confirmed` below means a reproduced artifact or direct code path;
`audit` means a structurally similar path requiring a targeted check, not a
claim that another harness already failed.

| Surface | Assessment | Planned disposition |
| --- | --- | --- |
| `services/eval-snapshots.ts`: source version, full-runtime copy, nested SQLite, managed Codex exclusions | Confirmed source/copy-set mismatch; project/workspace/Git and symlink checks remain material | One inclusion policy for copied content and source proof; SQLite semantic check; retain file/Git fence and atomic publication |
| `services/run-controller-capture.ts`, `run-control.ts` | Confirmed retry masks the source component and eventually emits generic budget error; separate owner/DB/native/process fence already exists | Keep bounded retry and writer admission; retain bounded mismatch detail through final error |
| `harness-runtime/lib/managed-daemon.mjs`, `daemon-operations.mjs`, Grok native home | Confirmed inspection can create budget-observation files; native SQLite/memory files changed in the window, exact culprit unrecorded | Classify each file by copied payload semantics; exclude only genuinely uncopied ephemeral material, or stabilize it; test real mutation |
| Other runtime homes (AGY, Droid, ZCode, OpenCode, Codex) | Audit: same snapshot traversal accepts all harness runtime files, with different SQLite/log layouts | Use one cross-harness source/copy contract test; fix the shared traversal, not six filters |
| CLI `snapshot create`, recovery export, bootstrap capture, dd-eval runner | Audit: CLI can invoke the same copy; sealed recovery and pre-RUN bootstrap have different guards; eval consumes receipts | Exercise common copy contract. Treat bootstrap race separately if reproduced; do not replace sealed recovery proof with this boundary check |
| `harness-runtime/lib/delegation-instructions.mjs`, `services/controller-fanout.ts` | Confirmed coordinator wording inside every worker assignment; confirmed `settled_by_root` dropped before common association check | Fix shared prompt and preserve terminal child for association; distinguish unknown outcome from success |
| `services/vnext-fanout.ts`, `work-registry.ts`, `hooks.ts` | Existing unbound-child detector is bypassed; native vs logical parent may diverge for a discovered grandchild | Reuse detector; check direct parent in native dispatch after external/recovery routing audit, preserve foreign/stale/replay rejection |
| `harness-runtime/lib/dd-agy-daemon.mjs`, `bin/dd-agy.mjs` | Confirmed grandchild hook denial before CLI; early catch returns deny without correlated controller outcome; nested observed step currently assigns root as parent | Fail closed; record structured denial and true emitting parent when native evidence supplies one. Do not synthesize parentage |
| Grok/ZCode/Droid/OpenCode/Codex hook entrypoints and controller outcome paths | Audit: hook failures are surfaced by different adapter contracts; Codex has `native_hook_failure` precedent | Matrix of pre-CLI denial propagation; change only demonstrated lost-error paths, preferably through existing receipts/journals |
| Stage fanout for PLAN-REVIEW, CODE, CODE-REVIEW and later continuation | Audit: common worker renderer and child reconciliation serve multiple stages | Test one shared contract plus stage-specific representative cases; no stage-local copies |

## Invariants

1. The boundary publishes one internally consistent payload only after owner,
   generation, process/native inventory, source files and Git state remain valid.
   Productive or external changes during capture reject the copy. SQLite WAL
   checkpoint/physical churn alone is not a productive change.
2. Source proof and copy use the same inclusion policy. Files deliberately
   excluded from the sealed payload cannot repeatedly invalidate its proof;
   copied ordinary files, modes, symlinks and Git identity remain protected.
3. A worker gets a single already-assigned Work and executes its issued
   `work start` itself. Only the coordinator selects native fresh-child mode.
   Workers may not delegate a second child to evade lifecycle admission.
4. Native child ancestry must be proven, not guessed. Unknown, foreign,
   nested-without-authority, stale and replay-conflicting hooks fail closed.
5. Terminal tree settlement does not imply a Work result. Every observed
   terminal child is checked for exactly one valid Work association before the
   controller declares an unchanged graph; a failed hook is reported causally.
6. Old hook denials cannot poison another controller turn or a successful
   successor; cleanup and nonprogress errors cannot replace the primary one.

## Implementation packages, in dependency order

### A. Reproduce and preserve discriminating evidence

- In existing snapshot/controller tests, reproduce `snapshot_source_changed`
  with a live SQLite WAL checkpoint or nested SQLite update during `VACUUM`
  and with a new `budget-observations` file. Assert the old guard's mismatch.
  Separately assert a real committed DB transaction, ordinary file edit,
  mode/symlink change and Git ref/index change are rejected. Record, for each
  mismatch, bounded relative path/component and before/after digest or version;
  never dump native transcript, credentials or arbitrary file content.
- Make a sanitized native-shaped AGY fixture from the direct child/grandchild
  sequence, preserving the fact that the grandchild was not announced in root
  `subagent_info`. Reproduce pre-CLI denial, root `settled_by_root`, missing
  Work binding and the current generic error. Keep exact provider phase/IDs in
  test metadata, but no secrets or task contents.
- Before choosing exclusions, classify each observed changing path as copied
  payload, separately captured consistent SQLite, or excluded transient data.
  If a path is part of required recovery evidence, stabilize or snapshot it;
  do not merely hide it. This gate determines the smallest correct source fix.

### B. Align snapshot proof with actual payload

- Reuse `runtimePayloadAllowed`, SQLite-header detection and managed-Codex
  exclusions from `copyRuntimeTree` in one shared traversal/classifier for
  source proof and copy. Do not introduce a generic snapshot framework or a
  new dependency. Check membership itself before/after so a newly created
  payload file or SQLite database cannot disappear from comparison.
- Hash copied ordinary file bytes, type/mode/link target and Git source state
  before and after. For SQLite that copy materializes with `VACUUM INTO`, use
  consistent read-connection versions or an equivalent semantic fingerprint
  on both sides of copy; do not hash raw WAL/SHM bytes as if copied. Cover
  committed writes from another connection and same-connection changes. Keep
  existing owner/DB/native/process fence and `input.boundary.verify()` before
  and after; preserve partial cleanup, fsync and atomic rename.
- Handle primary `db.sqlite`, resource `runtime.sqlite`, and **nested** native
  databases under the same explicit rules, with their actual copied/excluded
  roles. Scope sidecar suppression to recognized SQLite bases; never ignore
  every filename ending `-wal` or the whole Grok home. Decide the exact
  treatment of `budget-observations` from package A's payload classification.
- Propagate bounded mismatch components through the existing
  `snapshot_source_changed` and `boundary_capture_pending` receipt; on budget
  exhaustion retain the last causal mismatch alongside the budget state.
  Keep the retry bound unchanged.

### C. Repair common worker and child reconciliation contract

- Remove coordinator-only fresh-child wording from `workerDelegationTask`.
  Keep `context: "fresh"` in coordinator assignment data; tell the worker it
  is already the selected leaf, must execute `work start` itself as first
  technical action, and must not create another child. Verify rendered
  assignments for all six supported harnesses and native routing modes.
- Stop discarding `settled_by_root` in `nextControllerFanout`. Pass it to
  `observeVnextNativeChildren` so an unbound terminal child yields the existing
  `unbound_native_delegation_detected` issue; a bound child with unknown
  semantic outcome remains unresolved, not `completed`. Preserve existing
  settled sibling successes and same-child continuations. Test root Stop and
  concurrent sibling cases in the common fanout suite.
- In AGY `observeStep`, bind child to the **emitting** conversation only when
  native step metadata confirms it. Compare provider and logical parent when
  binding a native-dispatched Work. First audit external worker and recovery
  routes so the guard does not reject their legal topology. If AGY supplies
  no ancestry for a grandchild, preserve `agy_child_identity_unconfirmed`.
  Do not implement general nested-worker support for a leaf-only contract.

### D. Carry pre-CLI hook denial to the controller

- Preserve the exact AGY rejection code, conversation, daemon incarnation,
  tool phase and active operation/turn identity in an existing adapter journal
  or prompt receipt before returning native `deny`. Correlate only with the
  current owner/generation/stage/turn; avoid transcript scraping or a new
  error table. Make persistence failure fail closed, not silently report allow.
- Extend existing controller outcome check to consume that trusted denial
  before `fanout_stage_nonprogressing`. A later successful retry of the same
  operation can supersede it; a different turn cannot inherit it. Keep the
  Work graph's unbound-child issue visible even when the exact hook error is
  primary. Test denied grandchild, foreign/stale identity, replay, successful
  successor and unrelated old denial.
- Audit each other adapter's pre-CLI denial path against the same contract.
  Reuse the Codex native-hook-failure pattern where suitable; add fixes only
  where a real early denial can be lost. Do not relax hook identity admission
  or extend the wait to mask missing ancestry. Probe an `invoke_subagent`
  pre-hook guard only if the native AGY contract actually exposes that event;
  otherwise the leaf prompt plus provenance checks are the enforceable layer.

### E. Verify and qualify, without touching the failed runs

- Run focused snapshot, fanout, AGY adapter and continuation-outcome tests
  first; then affected controller/recovery/scope suites and full runtime
  release gate, because B and C change common mechanisms. Verify package
  smoke against the immutable candidate and exact published tuple.
- Assert an idle Grok boundary captures promptly without sacrificing usage
  evidence; a real concurrent DB/file/Git writer still fails. Assert AGY's
  direct child starts/finishes one Work, and forbidden nested child is rejected
  with its primary cause and no false Work success. Exercise at least one
  other harness through the shared worker/terminal-child paths.
- Prepare new, isolated Grok and AGY checkpoints/homes from CP-136/137 inputs;
  copy portable config only, install the verified published engine, run normal
  preflight, then launch fresh scored E2Es. Do not reuse runtime DB, old runs,
  conformance state or a failed EVAL ID. Monitor actual RUN timeline/controller,
  Work graph, native turns, source mismatch details, HITL and process liveness.
  Runtime failure permits read-only investigation only.
- Update the operational runbook with the new distinction:
  `owned_inventory_changed` (Plan 050) versus `snapshot_source_changed`
  (Plan 051), and tree settlement versus a Work result. Report exact receipts,
  not manifest entry-stage or an inferred native model.

## Acceptance checks

- [ ] Minimal beta.97 regressions reproduce both failures; sensitive fixtures
      are sanitized and the differential capture identifies changed components.
- [ ] Repeated idle Grok snapshot succeeds with unchanged payload; WAL
      checkpoint/observation does not self-invalidate it.
- [ ] A real DB, file, symlink/mode or Git writer invalidates the boundary;
      owner/generation and recovery guarantees still hold.
- [ ] All six worker packets keep coordinator launch policy outside worker
      text; a direct worker executes its own lifecycle start.
- [ ] `settled_by_root` terminal children are reconciled, never silently
      discarded or interpreted as Work success.
- [ ] Unknown/nested/foreign AGY child fails closed, with its pre-CLI cause
      correlated to the correct controller turn; unrelated or superseded
      denial is ignored.
- [ ] Local, package and full release gates pass; fresh Grok and AGY E2Es
      cross the previously failing boundaries. A further defect is reported
      separately, not relabelled as success.

## Ponytail review and implementation readiness

The smallest shared changes are a source/copy classifier, one worker wording
correction, one common terminal-child reconciliation correction, and one
trusted early-denial path. Prefer existing SQLite APIs, receipts/journals and
test harnesses. No new dependency, schema, provider framework, blanket
exclusion, timeout increase or broad adapter refactor. Keep each package's
smallest runnable regression. Do not implement optional `invoke_subagent`
interception or bootstrap redesign unless the evidence gates reproduce a
failure and show that existing contracts cannot cover it.

Implementation can begin now. Two decisions are intentionally evidence-gated:
the exact Grok changing file (not retained by beta.97) and whether native AGY
reports an interceptable nested-spawn event. Neither justifies weakening
capture or identity checks while awaiting evidence.

## Implementation record

The engine implementation is isolated on `fix/051-snapshot-worker-provenance`
([PR #13](https://github.com/deksden-com/dd-flow-cli/pull/13)). It shares one
runtime payload classifier between source proof and copy, fingerprints the
logical content of copied SQLite databases, preserves bounded changed-path
proofs through capture receipts, removes coordinator-only text from worker
instructions, reconciles root-settled children, checks direct native ancestry,
and turns an AGY pre-CLI hook denial into a causal prompt error. The old failed
EVALs remain untouched.

Focused capture/fanout/worker suites passed (35/35), the AGY daemon fixture
passed (18/18), and build/typecheck/lint passed locally. The full release
suite, immutable package publication, fresh checkpoints/preflights and scored
Grok/AGY E2Es are still required before this plan can be marked complete.
