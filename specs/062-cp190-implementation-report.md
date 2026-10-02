# Plan 062 — implementation and verification

2026-10-02. Implementation changes are committed and pushed; full plan acceptance is incomplete. This report is not a claim of green mandatory gates or scored E2E success.

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
