# Plan 062 — implementation and verification

2026-10-02. Implementation is under final verification; this report is not a claim of completion or scored E2E success.

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

## Compatibility / risk-only review

AGY and Droid retain their native correlated transports; only typed error preservation changes. OpenCode retains its implementation and gains a generated-plugin ingress typed-error regression. Manual Stage successors, current-stage finish, hook-only/bootstrap evidence, paused resume and child Work routing remain separate from coordinator handoff authority. No blanket retry, parser rewrite, authority replacement framework or new dependency was added.

## Verification ledger

- Typecheck: PASS after removing redundant narrowed comparison.
- Lint: PASS.
- Strict canon build: PASS; final rebuild required after last native diagnostic patch.
- Release gate: 2 Node tests + 8 Vitest tests PASS before final native patch; final rerun pending.
- Integration gate: first consolidated run accumulated failure markers under heavy host load and was stopped (exit 143) to obtain a diagnostic first-failure report; NOT PASS. Final complete rerun pending.
- Runtime-sensitive gate: pending.
- EVAL full offline gate with built FLOW and fixture adapter: pending.

Diagnostic reruns: first-failure integration found the SQL defect above (61 PASS / 1 FAIL before bail). After its fix, another first-failure run reached 53 PASS then timed out in the unchanged duplicate-protocol CLI test. An isolated rerun of that test passed at the unchanged 120s limit (119.456s). Its 21 manual CLI calls do not enter managed admission/receipt waiting. These diagnostic runs are not a full integration PASS.

Earlier targeted agent runs are diagnostic only, not final acceptance. Initial runs under heavy host load included timeout failures and obsolete assertions; assertions were corrected only where the new proven-scope contract changed the expected error. Test timeouts and mandatory suite selection were not relaxed.

## Delivery boundary

Historical CP190 definitions, EVAL homes and runtime databases are unchanged. This implementation uses a separate EVAL source worktree. No new scored E2E, paid/live Judge qualification, engine publication, installed hook update, or historical run recovery is authorized by this delivery.
