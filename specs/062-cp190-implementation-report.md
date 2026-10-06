# Plan 062 — implementation and verification

2026-10-02. Implementation review and mandatory offline acceptance are complete. FLOW fixes are committed and pushed; this report records the final verification. Live delivery and scored E2E success are outside this review and are not claimed.

## Defect mapping

| Defect | Implementation | Regression / acceptance suite |
| --- | --- | --- |
| D01 | `hooks.ts`: verified ZCode native identity reaches scoped cwd resolution | lifecycle-invocations: production-shaped ACP without daemon env |
| D02 | Shared `stageSuccessor` used by all seven Stage finish paths and MERGE repair; managed successors are declarative | stage-successor; run-controller-stages seven-stage cycles |
| D03 | ACP mandatory owned failure latches/rejects before bounded secondary persistence; no fatal-code allowlist | zcode-invocation-observer first-cause, hanging persistence, stale observer |
| D04 | Native/adapter identity and physical owner fixtures reflect production ingress | lifecycle-invocations; native-hook-ingress; controller cycle fixtures |
| D05 | HITL prompt distinguishes materiality, accepted context and product non-goals | contextual/negative qualification corpus and eval tests |
| D06 | Full project/RUN/root/generation scope proven against retained physical owner | lifecycle-invocations cross-scope tests |
| D07 | Private Stage-start arguments checked in every reuse branch; no automatic replacement | lifecycle-invocations private-contract tests; exact full-entry repeat |
| D08 | Unmanaged CLI bypasses managed assignment lookup | lifecycle-invocations manual CLI isolation |
| D09 | Public safe shell correction requires exact issued unexpired scope and durable receipt | lifecycle-invocations correction/replay tests; ACP refusal tests |
| D10 | Native Grok/ZCode accepted operation receipts preserve typed failures; Codex uses current hook/Turn proof | native-hook-ingress; harness-runtime-assets; stale native event controls |
| D11 | Partial unmatched verdict schema/runtime parity; delivery stays fail-closed | evidence-schema and eval partial verdict tests |
| D12 | Qualification uses authored materialized context and retained source snapshots; bytes bound into identity | eval context/source/operation tamper tests |
| D13 | Case-local corpus expanded from 6 to 14 positive, negative, partial and mixed items | eval corpus coverage and contextual expectations |
| D14 | EVAL preserves scoped issuance/native failure provenance and rejects unsupported attribution claims | eval raw/wrapped/partial/contradictory provenance tests |

## Additional review findings

- Managed PROTOCOLIZE preparation also minted a short current-stage entry for a new Session. It now uses the controller's already-selected Session; manual new-session preparation retains its original command.
- Matching coordinator proof checks physical controller ID as well as current Session and generation. A historical controller of another daemon is excluded before validating the current owner.
- Failed settled attempts cannot compete with a corrected new native tool call; an exact replay retains its stored outcome.
- Owner state is prepared outside admission's SQLite write transaction and rechecked with SQL only before receipt commit.
- Codex hook failures from an earlier prompt generation cannot reject the current waiter or erase its active hook binding.
- Native ZCode requested Session IDs are provider IDs; ACP pending requests use adapter IDs. This distinction was checked in the production code rather than homogenized in fixtures.
- Invalid/unbound native receipt data is diagnostic, not fabricated execution authority or primary cause.
- First diagnostic integration failure exposed an unsafe `json_extract` in the new SQL-only owner snapshot: unrelated historical/default Work/MERGE receipt bytes can be non-JSON. Both extractions now use `CASE WHEN json_valid(...)`; targeted Grok/AGY regressions with malformed foreign historical rows pass (2/2). This was an implementation defect, not a timing failure.
- Final independent review found that fingerprint projection could discard an explicitly supplied foreign RUN before CLI argument restoration. A shared target guard now checks hook admission, shell correction, explicit assignment validation and CLI restoration. Omitted public targets and the correct short alias remain valid; a foreign full/short target is rejected before a receipt or effect. Explicit-ID reuse also validates the private Stage-start contract. Targeted regression set: 8/8 PASS.
- The initial-manifest test now surfaces a settled provisioning error immediately instead of masking it behind its manifest deadline. Its deadline is unchanged. The isolated real-CLI rerun still missed that deadline without a settled provisioning error; the fake-CLI variant passed in 25.5 seconds.
- Full integration exposed an additional D04 fixture defect: the shared controller adapter registered ZCode as `codex-daemon`, then emitted ZCode hooks. Production correctly registers `zcode-daemon`; its owner proof correctly rejected the fixture. The fixture mapping is fixed without weakening admission. The previously failing ZCode SPECIFY HITL / same-Session retry / PROTOCOLIZE cell passes (27.46s at its unchanged limit).

## Compatibility / risk-only review

AGY and Droid retain their native correlated transports; only typed error preservation changes. OpenCode retains its implementation and gains a generated-plugin ingress typed-error regression. Manual Stage successors, current-stage finish, hook-only/bootstrap evidence, paused resume and child Work routing remain separate from coordinator handoff authority. No blanket retry, parser rewrite, authority replacement framework or new dependency was added.

## Verification ledger

- Typecheck and lint: PASS after the additional RUN-target guard (`65de0f7`). The subsequent FLOW commit `01eaba9` changes only the one-line native-kind fixture mapping; strict canon build passes on that final commit.
- Release gate: 2 Node + 8 Vitest tests, no skips, PASS on final `01eaba9` (also passed on `65de0f7`).
- Integration gate: NOT PASS. Diagnostic attempts were stopped (exit 143) for the SQL defect, additional RUN-target guard and fixture defect described above. On final `01eaba9`, the previously unstable duplicate-protocol test passed in 45.93s, as did CLI alias/Session linkage, PROTOCOLIZE/PLAN/CODE/MERGE transitions and pinned-engine checks. The unchanged legacy usage/statistics CLI test then exceeded its 120s limit (136.38s), and this root-owned test run was stopped (exit 143). No stopped attempt counts as complete acceptance.
- Runtime-sensitive gate on `0a6aad0`: 27 PASS / 3 FAIL. The Droid child suite reported four passing checks but exceeded its unchanged aggregate 30s limit; two control-worker fixtures missed their unchanged observed-state deadline. An earlier full run had 28 PASS / 2 FAIL; those two cases passed individually at unchanged limits. These isolated results do not replace the full gate.
- EVAL full offline gate on clean committed `090a490`, with built FLOW and fixture adapter: 416 tests, 409 PASS / 3 FAIL / 4 cancelled / 0 skipped. Failures/cancellations concern real-CLI startup/observer time windows and the bounded-wait fixture's assumption that admission completed inside its 1.5s total budget. New contextual HITL, source-integrity, schema and attribution checks passed. The full gate is NOT PASS.

Diagnostic reruns: first-failure integration found the SQL defect above (61 PASS / 1 FAIL before bail). After its fix, another first-failure run reached 53 PASS then timed out in the unchanged duplicate-protocol CLI test. An isolated rerun of that test passed at the unchanged 120s limit (119.456s). Its 21 manual CLI calls do not enter managed admission/receipt waiting. These diagnostic runs are not a full integration PASS.

Earlier targeted agent runs are diagnostic only, not final acceptance. Initial runs under heavy host load included timeout failures and obsolete assertions; assertions were corrected only where the new proven-scope contract changed the expected error. Test timeouts and mandatory suite selection were not relaxed.

No functional root cause has been established for the remaining time-window failures. Host slowness is evidence, not a substitute for a green gate: final plan acceptance remains incomplete and must be repeated on the final commits under usable host conditions. Runtime-sensitive and EVAL complete gates also need final-commit reruns; their earlier failing summaries are retained above, not relabelled PASS. No timeout increase, test exclusion or automatic runtime repair was used to obtain an artificial PASS.

## Commits / remote delivery

- FLOW `fix/cp187-matrix-admission`: `0a6aad0` (implementation), `65de0f7` (supplied RUN guard), `01eaba9` (production-shaped ZCode fixture).
- EVAL `eval/cp190-three-e2e`: `84627e8` (finalized plan only).
- EVAL `fix/plan062-scoped-hitl`: `090a490` (implementation), `2b0405e` (manifest diagnostic and verification ledger), followed by this final report update.

## Delivery boundary

Historical CP190 definitions, EVAL homes and runtime databases are unchanged. This implementation uses a separate EVAL source worktree. No new scored E2E, paid/live Judge qualification, engine publication, installed hook update, or historical run recovery is authorized by this delivery.

## Independent implementation review (2026-10-02)

The review found and corrected four substantive gaps; the earlier verification ledger above remains historical, not final acceptance:

1. **PLAN-REVIEW settlement still read native ownership under a SQLite write transaction.** Both accepted/off branches now prepare the complete successor before settlement and reuse it in the report and response. The report no longer re-enters native lookup when a managed successor deliberately has no command. A structural regression guards the settlement callbacks and report builder; manual and managed successor behavior remains covered.
2. **Managed issuance omitted supported Droid/OpenCode modes.** Admission enforced assignments for six harnesses while issuance recognized four. The existing issuer allowlist now matches the supported modes. Investigation of the actual Droid producer also found that `save()` retained `root_session_id` but left the common `sessions` projection empty. It now persists the same root-only projection as `daemon.status`; children do not become roots. Production-shaped scope tests use Droid string roots and OpenCode typed records, plus a direct Droid persistence regression.
3. **Codex treated a proven pre-CLI shell correction as fatal.** After verifying the current native hook owner, it now preserves a complete typed no-effect correction without rejecting the active Turn. Incomplete correction proof remains fatal. The same strict predicate is reused by native consumers; it does not replace owner validation. Late `turn/started` for a retained completed Turn can no longer erase the new Turn's hook binding. Tests cover every missing proof field and late event ordering; copied build assets also execute the correction contract outside the source checkout.
4. **EVAL attribution lost the real RUN on production-shaped failures.** Reporting and attribution now share the actual `lifecycle.run_id`/execution `run_id`, never the EVAL manifest ID. Foreign or conflicting RUN evidence cannot establish an issued admission failure. The failure producer retains the RUN explicitly. Regressions cover raw/wrapped failures, conflicting IDs, report identity and run validity.

Each new regression was reproduced failing before its source fix. Targeted checks passed: native Codex/ZCode 44/44; successor/admission 10/10; direct Droid persistence 1/1; targeted EVAL attribution 3/3 plus two compatibility checks. Final full-suite results will be recorded below after the final source build. No timeout increase, test exclusion, live provider call, new dependency or historical runtime edit was introduced.

### Further findings from the full review gate

- The complete controller gate exposed a real **CODE-REVIEW repair successor collision**: successful settled Finish and its newly issued same-fingerprint continuation competed in the same native scope. A fresh call must select a unique active assignment, while an exact native replay must keep the immutable prior result; multiple active assignments must remain ambiguous. This source correction is included in the successful final verification below.
- The repair correction uses a shared candidate selector in observer and lookup. Native identity is propagated into short-command cwd/RUN lookup; CLI narrows by the existing unique unclaimed native receipt. Known UUID/event keys retain exact replay, unknown public UUID still permits exact scoped correction, and uncorrelated history plus successor is not resolved by recency. Additional review requires changed-cwd reuse of the same native tool identity to fail before a receipt or successor claim.
- Independent review reproduced a **known explicit-ID fallback bypass**: scoped CLI lookup rejected a foreign assignment, but the later compatibility fallback reused the supplied retained UUID and entered Work input preparation. Managed CLI must reject a known UUID whose full project/daemon/root/RUN/generation differs before preparation or settlement. Unknown UUID correction and ordinary unmanaged explicit-ID compatibility are not replaced with a blanket ban.
- Two negative HITL controller fixtures threw raw hook errors before their CLI subprocess path. The fixture now uses the production typed `errorRecord` envelope. Tests assert both the adapter transport wrapper and its exact `invocation_assignment_missing`/`no_effect` cause, rather than expecting an unwrapped CLI error. All three answer-Turn cases pass at their original limits; EVAL preserves the nested cause.
- Four CLI correction fixtures omitted the physical owner required by their issued scope. They now retain the actual daemon/controller/native root while keeping `sessions`/`work_sessions` empty and preserving no-effect assertions. Before: four failures; after: the full file passes 153/153 and the complete first integration shard passes 794/794.
- Four lifecycle expectations contradicted the scoped contract: an unknown daemon cannot select a short-command assignment, and a settled receipt cannot be replayed through another daemon. Tests now expect the precise early assignment refusal, retain same-owner/new-tool replay, and explicitly reject foreign-daemon replay without adding receipts.
- The first diagnostic integration attempt exposed **manual recovery compatibility**, not just a stale fixture: the retained recovery dispatch is a supported physical owner without a controller/Work-launch/MERGE record. A narrowly proven hook-only recovery scope now checks the current guard, immutable packet, dispatch, physical process/lease, native root, harness, RUN and generation. It cannot rescue a broken current controller. Its commands must contain an explicit owned target/project; bootstrap, session registration, child roots, stale/foreign scope and missing targets remain rejected. No new assignment authority is manufactured.
- An actual CLI regression then exposed **loss of the selected recovery receipt**: admission chose the current daemon's event, but the service rediscovered matching events including a stale daemon. CLI now pins the exact physically scoped receipt into the service route, preserving an explicit receipt option when already supplied. Both original and explicitly rewritten native commands pass; absent fresh receipt is rejected.
- **Historical daemon collisions:** the owner inventory compared provider Session IDs before daemon identity. A retained identical Session ID in another daemon could produce false ambiguity. The common native-root reader now filters daemon identity before collecting owners; a reproduction with a completed historical controller passes.
- Three AGY cwd tests used a synthetic scope and noncanonical temporary path without physical ownership. They now use registered daemon/controller/native-root evidence and production `managedInvocationContext`, retaining the original wrong-cwd, duplicate receipt, CLI claim and hidden-RUN assertions. The complete file passes 57/57.

The diagnostic full integration attempt was stopped (exit 143) before applying the recovery source fix; it is not a complete gate. It had one recovery failure and three AGY fixture failures, all reproduced in isolation. Updated recovery/successor checks pass 46/46, and the additional explicit receipt compatibility variants pass 2/2. Final verification uses committed FLOW `5f6f715` and a fresh strict-canon build. Integration is run as the existing four CI/release shards, together selecting the entire standard integration suite without extra exclusions or timeout changes. The first complete offline EVAL rerun passed 417/417; it is repeated against the final rebuilt FLOW below.

## Final review verification — FLOW `96a34d2`

The final source/build is frozen at `96a34d2`; no build ran concurrently with a gate reading `dist`. EVAL executable sources are `92fd769` (the review report alone is pending update). The stricter selector, changed-route replay fence, full explicit-ID owner guard and typed fixture transport are included in this build.

- Typecheck, lint and strict-canon build: PASS. The intermediate optional-property/test-double compile errors were fixed before this build; no failing compile is counted as accepted.
- Release: PASS, 2 Node + 8 Vitest tests, no skips, including copied native contracts outside the checkout.
- Runtime-sensitive: PASS, 30/30, no skips.
- Integration shards 1/2/3: PASS, respectively 796/504/406 tests. Complete standard selection, unchanged timeouts and no additional exclusions.
- The first final shard 4 completed 276 PASS / 1 FAIL; only the existing injected PLAN→CODE→MERGE test exceeded its unchanged 120s limit (126.15s). A complete standalone repeat passed **277/277**, 27 files, 1311.50s, on the same frozen build and unchanged limits. Its full controller file passed 26/26, including all four seven-stage cycles, Luna repair, overload continuations and all negative/positive HITL cells. The earlier timeout remains recorded, not relabelled PASS.
- The first final EVAL gate completed 415 PASS / 1 FAIL / 1 cancelled / 0 skipped. Failures were the 30s observer-killed deadline and 180s background-resume overall timeout. A complete standalone rerun on the same source/build passed **417/417**, 231.11s, without timeout/test changes. Background resume passed in 38.99s; observer-killed passed. The failure run remains historical evidence, not a skipped gate. This establishes successful execution on these bytes, not a proven general diagnosis of every timing fluctuation.

Reports: `/tmp/dd-plan062-review.1S4IJY/flow-final-shard-{1,2,3,4}.json`, `flow-final-shard-4-serial.json` and `flow-runtime-96a34d2.json`. The standalone EVAL final TAP summary is retained in this review's tool output. No scored E2E, provider/Judge call, publication, installed hook change, product fix or historical runtime repair was performed.

Final integration acceptance is **1983/1983 tests across 111 distinct files**, with disjoint standard shards. Release 10/10, runtime-sensitive 30/30 and EVAL 417/417 are separate complete gates. All D01–D14 implementation contracts are covered by the mapping and final gates above. Review source fixes reuse shared selectors/guards and existing transports; no dependency, authority replacement or relaxed safety boundary was added.
