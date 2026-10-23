# 099 — Implementation and acceptance

Subsequent review/native probes: [099 review result](099-review-and-native-p3-result.md).
The original implementation evidence below remains historical; P3 is still blocked.

Дата: 2026-10-23. Code implementation; not a release or live AGY qualification.

Engine commit: `b90bcdce`, branch `fix/099-execution-resource-boundaries`.
EVAL consumer changes and this plan/report: branch `fix/099-native-cleanup-consumers`.
Both branches retain the earlier local 098 followup commits as dependencies.

## Implemented

- Engine native tree settlement is `@2`, explicitly scoped to required execution.
  Resource snapshots have independent ownership, revision, coverage and native
  classification. Historical explicit @1 proof cannot be silently decorated @2.
- All six inspect producers use the shared helper. Existing native pending,
  ancestry, budget and request-binding checks remain authoritative. Unsupported
  service classification is explicit, not inferred from command text.
- Shutdown @2 retains owned process birth identities before provider close,
  including adapters which close inside prepare; ancestry is computed per
  snapshot, never joined across recycled parent PIDs. Inventory is persisted
  before destructive actions. Remaining phases can be retried without a Turn.
- Required execution, owned resources, provider and daemon resource phases are
  independent. Native uncertainty survives physical cleanup. Birth identity is
  rechecked before TERM and KILL. New activity cannot be cleared to manufacture
  execution readiness. No global process/container/port-based kill was added.
- Native support services without a verified physical identity/retirement API
  remain cleanup-unproven. A completed ordinary required task is not reclassified
  as a persistent service merely because a historical RUNNING record remains;
  its native drain and scoped OS cleanup are checked independently.
- AGY bounded canonical transcript capture retains typed IsDaemon facts and
  source-bound native creation edges; nested hooks require recursive ancestry.
  Ambiguous multi-call correlation, partial transcripts, cycles and contradictions
  do not grant authority. No FIFO inference for concurrent tool results.
- AGY activity/cancel and admission now consistently publish native revision;
  late activity cannot be hidden by provider-finalization clearing active_tree.
  Empty execution before the first Turn requires fresh native admission, keeps
  result:null and does not fabricate semantic SUCCESS. Cleanup retries retain
  the committed control fence instead of invalidating their own generation proof.
- AGY capability/evidence @2 separates live readiness/service-retirement cases
  from deterministic error/timeout/fence safety cases. Fatal tool exit and
  native executor error are distinct. The old real 1.4.6 counterexample is
  retained unchanged; it is not silently converted into a qualification.
- Controller, recovery, scope stop/resume, capacity probe and retained history
  use the shared shutdown validator. EVAL imports that validator from exact
  pinned engine bytes rather than maintaining a competing implementation.
- EVAL cancellation, cleanup observation and Judge publication no longer infer
  physical stop from settled/stopped. Current incarnation, durable phases and
  generation fence are checked. A successful paid verdict remains retained
  when cleanup fails; cleanup never replays its productive request.
- Copied-runtime cleanup imports only the already verified canonical engine;
  symlink/ownership guards were not relaxed. No resource handoff between Work,
  new service manager, database, scheduler or dependencies were introduced.

## Harness boundaries

| Harness | Required execution source | Resource scope |
| --- | --- | --- |
| Codex/Luna | Native Turn/session observations and retained subtree | Owned local process inventory; unsupported service classification stays explicit |
| ZCode | Native close/tree inspection with completeness and revision checks | Identities retained before bridge/provider close |
| Grok | Native session/subagent observations with retained ancestry | Owned local processes; no heuristic service exemption |
| OpenCode | Native session status, pending requests/tools and retained children | Owned local processes; cancel retains cwd and ownership |
| Droid | Owned Task/session inventory and retained descendants | Native close outcome separate from physical child lifetime |
| AGY | Qualified native idle plus exact request/revision and required subtree | Typed native task inventory; unmapped daemon retirement stays unknown |

## Deterministic acceptance

- Engine `gate:merge`: typecheck, lint, 770 fast tests and 66 hybrid contracts PASS.
- AGY native inspection/qualification: 19/19 PASS. AGY state-boundary fixtures:
  41/41 PASS before final correlation tightening; focused correlation negatives
  PASS; final bundled wrapper included in the concluding adapter run.
- Shared shutdown/provider adapter fixtures: 33/33 PASS, including real disposable
  local service reparenting, incomplete native resource cleanup and @1 rejection.
  Process birth/signal focused tests PASS. These use fake/local processes, not
  a provider/model session.
- Engine lifecycle/capacity/controller affected suites were run and initial stale
  positive fixtures corrected to carry actual @2 proof. The four-suite lifecycle
  set and six-suite controller/capacity set were covered by initial runs plus
  targeted reruns of every failure, without repeating unchanged expensive cases.
- EVAL affected run covered 150 tests. Five positive fixtures relied on the
  removed settled→physical inference; they were corrected. Recovery/control
  rerun 70/70 PASS; other 80 had passed. Final generation-fence changes additionally
  passed cleanup/supplemental/retry and Judge cleanup tests.
- Root verification after rebuild: EVAL installed-contract/control/Judge tests
  13/13 PASS, 0 skips; this imports the built engine's actual @2 validator.
- Expanded native adapter wrappers initially found seven failing fixture groups.
  This also identified two real omissions of the mandatory provider phase in
  Droid/ZCode; both fixed, not bypassed. Six groups passed a selective wrapper
  repeat; the final AGY tool-replacement case passed repeatedly and is included
  in the combined native/tool tests. A further post-persistence race check was
  added: activity during durable clean publication invalidates the reply too.
  Final combined run with that check: **67/67 PASS, 0 skips**.
  Other initial groups
  had passed and were not rerun merely for a new aggregate green label.
- Concluding AGY/package wrappers: 2 selected tests PASS; 21 unrelated wrapper
  cases excluded by the deliberate filter (their earlier evidence retained).
  AGY same-Session replacement additionally passed three consecutive directed
  checks; both stop results are explicitly asserted clean before restart.
- Final typecheck/lint/build and installed source/built/copied byte smoke PASS
  (2/2 installed/publication contract tests). The full release profile was not
  run and no release-accepted status is claimed.

## Live AGY P3 — deliberately not claimed complete

No native probe or EVAL was launched in this implementation task. Live P3 is
the separately permitted acceptance step in plan 099, not a synthetic PASS.
Old evidence has the old policy identity; native-task/service PID containment
and unambiguous grandchild evidence are still necessary for a real @2 receipt.
The adapter has no proven general mapping from native task id to production OS
PID. For an unmapped persistent daemon it will retain cleanup uncertainty;
we did not substitute fixture output/PID guesses or registry finish for proof.

Therefore: implementation and deterministic safety can be accepted separately;
**AGY P3 blocker is not removed**, no qualification receipt minted. No npm
release, pins/hooks changes, GitHub CI, merge or cleanup of other worktrees.
Changes include the explicitly identified unmerged 098 followup dependencies.
