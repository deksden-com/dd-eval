# 037 — Check execution deduplication and canonical observation

Status: implemented and locally validated, 2026-09-17. No new live E2E launched.

## Confirmed evidence and causes

Fork-024 completed MERGE and Judge. RCP-029/RCP-032 ran `pnpm quality`,
RCP-030/RCP-033 ran `pnpm docs:check`, on identical before/after fingerprints.
`effectiveCheckDeclarations` combines code and merge policies. `deduplicate`
includes run_at in its key; generated policies have no deterministic reuse.
The labels of obligations therefore become distinct physical executions.

Judge's 5/20 coverage comes from tool counters, not missing session files.
The database has usage snapshots for five roots and none for fifteen children.
Copied journals contain events for all fifteen children (5 PLAN review,
3 CODE, 7 CODE review/repair). ZCode's observeToolCall keys by ACP transport
sessionId, ignoring childSessionId. Usage is exported for addressed roots only.
Grok imports the same AcpBridge, so changing that class affects another adapter.
resolveEvidenceJournals selects only current controller sessions and always
labels available tool evidence partial. Fork deliberately archives old controller
authority in snapshot-imports; copied historical journals remain evidence.

## 1. One execution can prove several obligations

Primary files: dd-flow-cli/src/services/code-checks.ts, vnext-merge.ts;
tests: code-checks.test.ts and existing MERGE tests.

- Keep declaration IDs and run_at as obligation metadata. Group equivalent
  executions within one runCodeChecks invocation independently of run_at.
- Execution equivalence requires resolved command, inputs, artifact contract,
  resource/port requirements and compatible reuse policy. Workspace/environment
  come from the invocation. No grouping across different workspaces or calls.
- All grouped declarations contribute check_refs to one receipt. Acceptance and
  reporting must use these refs, not infer obligations from its singular gate.
  Audit gate consumers (hash, verification_epoch, retries, receipt bindings,
  readiness and merge acceptance) before changing grouping. Retain a stable
  representative gate for legacy storage; do not use it to discard other refs.
- Separate within-invocation grouping from reuse across calls. No blanket
  deterministic policy, no global cache, no reusing old CODE evidence merely
  because MERGE command text matches. A later invocation remains a fresh gate
  unless existing explicit deterministic reuse permits otherwise.
- Stable grouping/order and shared execution-key helper must be used by normal
  execution, retry matching and acceptance validation. Retain the existing
  stale-input check if intervening commands change the declared inputs.
- Regression: code+merge quality/docs execute once each and cover all four refs;
  distinct inputs/artifacts/resources stay separate; changed tree and later
  default invocation rerun; failed grouped check retries once and retains refs;
  MERGE acceptance and restored historical receipts remain readable.

## 2. Normalize native observations at adapter boundaries

Reuse NativeSessionIdentity {harness_id, session_id}, existing parent topology,
owned adapter journals and model-observations conventions. Do not replace the
lifecycle/control protocol or introduce a second controller/event bus.

Introduce one small shared tool-observation reducer and schema for adapters:
- physical session identity, optional parent, transport ID kept separately;
- tool invocation ID scoped to physical session (and native execution epoch if
  the provider reuses IDs), tool name, start/update/terminal kind and outcome;
- source journal reference and position/native event identity, observed time;
- explicit unavailable/partial reason when ownership or outcome is unknown.
Deduplicate delivery by source identity; count one invocation despite updates
or reconnect replay. Identical invocation IDs in different children are distinct.
Out-of-order updates cannot turn a completed tool back into running. Keep
unknown outcomes unknown. A child event lacking identity must not become root.

Adapter normalization owns interpretation of native fields. Shared reduction,
coverage and reporting never read zcodeRuntime or infer native session IDs.
Keep raw journals for audit; canonical summaries are rebuildable projections.
Prefer replaying the retained journal over a new mutable counter database.
If normalized records are persisted, use the existing journal infrastructure
and distinguish them from raw envelopes to avoid counting both.

Tokens and tools have separate measurement contracts: origin, interval,
cumulative versus delta, physical_session versus execution_tree_inclusive,
and completeness. Do not copy token usage_scope onto tool measurements blindly.
Never sum an inclusive root aggregate with its children. Lack of tool evidence
does not imply zero, and lack of token usage must not suppress tool evidence.

Adapter adoption checklist (no claims of identical native capabilities):
- ZCode: map ACP transport to root, take verified childSessionId for descendants;
  use the same identity resolver for lifecycle and observations; publish/replay
  per-child tools independently of root-only native token snapshots.
- Grok: explicit normalizer at shared AcpBridge boundary; preserve inclusive
  native usage semantics and eliminate fallback aggregation across sessions.
- Droid: reuse its physical-session transcript/topology reader; map output to
  shared reducer/summary without replacing correct existing native handling.
- OpenCode: map native message/session/tool-part identities and updates.
- Antigravity: inspect current observation capability and expose supported
  measurements or explicit unsupported/partial, never synthetic completeness.
- Codex desktop/Luna: retain transcript identity and Work windows; normalize
  function/custom tool calls and outputs through the same summary contract.
Locate each live and replay entrypoint; shared contract tests must cover every
adapter, with unsupported capabilities explicitly tested where applicable.

## 3. Preserve evidence lineage independently of live ownership

Primary files: eval-snapshots.ts, usage.ts, dd-eval/lib/runner.mjs;
reuse snapshot-runtime-lineage and existing session identities.

Publish a RUN-scoped evidence-source inventory from current controller sessions
plus imported lineage. Use portable paths relative to the owning home and
explicit current/inherited provenance. Restore maps evidence paths to copied
files; it must not rewrite historical journals or reactivate source controllers.
Legacy snapshots: derive the inventory read-only from their archived lineage.
Resolve only sources belonging to this RUN and its copied ancestry; no broad
scan of the user's homes and no following stale absolute source-home paths.
Deduplicate repeated ancestry by source identity, not current pathname. Include
sessions with no journal so missing evidence has a reason rather than vanishing.

Judge and reports consume the same inventory and summaries. Separate journal
availability, tool attribution, terminal outcomes, token coverage and model
attribution; also separate current-execution and inherited-history coverage.
Remove the unconditional partial flag. Explain denominator and reasons; a
missing counter is not a missing journal. Missing historical observations lower
assessment confidence but never retroactively revoke a completed MERGE.

## Execution trace checked during design

1. MERGE collects code+merge declarations; physical groups retain all refs.
2. Each equivalent group runs once on target; failed group returns existing
   repair/retry outcome, success proves every bound obligation.
3. Native root and child updates enter adapter normalizer; their transport may
   be identical but physical identities differ. Shared reducer keeps them apart.
4. Duplicate/update events do not increment invocation count. Unknown terminals
   remain visible. Root-inclusive tokens are not added to physical child totals.
5. Snapshot retains evidence and inventories; fork detaches executable authority
   while remapping copied evidence sources. Repeated forks do not duplicate tools.
6. Judge reads current and inherited sources, reports what was observed and what
   is unknown. Old root tool counters cannot be combined with reconstructed
   children: use one canonical reconstruction or label the legacy aggregate.
7. Completion stops live sessions; evidence inspection uses files, not new
   provider prompts or polling already-finished turns.

## Delivery and validation

Implement in order: check grouping; shared observation contract/reducer and
adapter mappings; usage projection; lineage inventory; Judge/report integration.
Update schemas and compatibility readers only where persisted shapes change.
Do not fabricate missing native history; preserve old evaluation reports and
publish any recomputed Fork-024 analysis separately with provenance.

Run focused checks/merge tests, shared adapter contract/replay tests, snapshot
lineage and model-observation tests; then affected type/syntax/lint checks.
Replay Fork-024 read-only: verify current MERGE evidence and attribute the 15
historical children from retained events, reporting any actual gaps. No live
E2E or full product gate is necessary to verify accounting or duplicate delivery.
Do not claim live execution deduplication from replay alone: its proof is the
execution-count regression; a subsequent authorized E2E confirms integration.

Done: one equivalent execution per gate with all obligations covered; no native
field interpretation above adapters; all adapters use the shared observation
contract; inherited journals reach Judge without reviving owners; per-session
counts and coverage distinguish unavailable from zero and avoid double counting.

## Implementation and validation results

- `code-checks.ts` groups within one gate by execution contract, not stage label.
  All obligation refs survive in a single receipt. Explicit deterministic reuse
  remains opt-in. Retrying a historical pre-grouping receipt preserves its input
  identity and binds all equivalent current obligations to the new execution.
- `tool-observations.mjs` is the shared physical-session reducer/normalizer for
  ZCode, Grok (bridge and daemon), Droid, OpenCode, Antigravity and Codex.
  It handles duplicate delivery, colliding IDs across sessions, late starts,
  orphan results, incomplete records and unknown outcomes. Tool accounting does
  not inherit token aggregation scope. Native tool failure is evidence, not a
  reason to retroactively invalidate a completed stage.
- Droid/OpenCode retain normalized facts in their existing adapter journal,
  because their native transcript/API responses are not otherwise guaranteed
  to be portable. Only changed facts are appended; replay/restart deduplicates.
  Old journals without those facts remain explicitly incomplete.
- `run-observations.ts` publishes `dd-flow/run-observations@1`: relative owned
  sources, current/inherited provenance, canonical tool summary and explicit
  missing-session identities. It reads archived snapshot lineage without
  resurrecting owners or opening old homes. Native IDs are scoped by harness.
  Missing optional controller tables do not break unmanaged/local RUNs.
- RUN usage exports canonical counters when available and labels old counters
  `legacy_tool_calls`; Judge consumes the canonical inventory, never adds the
  old inclusive totals, and separates journal, tool, and model completeness.
  Native Codex Work-window accounting remains in the existing usage reader,
  using the common reducer. External non-copied transcript paths are not
  followed through a fork inventory; their absence is reported explicitly.

Focused validation: 87 check/runtime/inventory tests; all 15 existing native
adapter contract fixtures; 40 tests for changed daemon paths; three canonical
observation tests; four dd-eval evidence/model tests; five PLAN/CODE/MERGE
integration cases including injected failure and review-off; historical grouped
retry regression; TypeScript typecheck/build. No full product gate was repeated.

Read-only Fork-024 replay (original DB opened with `readOnly: true`; no original
artifact or report changed): **785 tools, 6 failures, 0 pending; 20/20 physical
sessions**, versus the former 5/20 snapshot coverage. Judge resolves 1/1 current
and 4/4 inherited journals. Tool evidence is complete; model attribution covers
20 identities but remains incomplete according to its independent evidence
contract. These are reconstruction results, not a new live E2E result.
