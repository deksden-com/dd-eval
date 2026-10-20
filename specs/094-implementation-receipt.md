# 094 — implementation and verification receipt

Date: 2026-10-20. Engine implementation: `7f9562e3` + `79325143` in dd-flow-cli;
integration uses the repositories' PR/squash workflow. This receipt records
implementation, not a newly published engine or successful live E2E acceptance.
The canonical schema copy and generated inventory are synchronized in
dd-memorybank `c46098d`; no prompt behavior or qualification identity was changed
there. Engine, canon and EVAL are integrated as one coordinated source change.

## Scope closure

| Plan | Implemented shared boundary and caller coverage |
| --- | --- |
| A | Native hook admission uses the existing shell parser before loading the stateful graph. Extracted existing project/session/recovery/Memory helpers into dependency-light leaves, preserving re-exports. OpenCode, Grok, AGY, ZCode native hook and ACP observer, Droid use the same remaining deadline, including cleanup. Codex ingress retains its separate host contract and gains request-bound phase diagnostics. Stop/after-tool/ambiguous/managed events cannot take the cheap bypass. |
| B | AcpBridge journals exact connection/request/operation/generation outcomes before projecting them; Grok persists the projection and drains it before tree/shutdown receipts. Root, child and grandchild remain independently settled. Later productive root activity invalidates terminal evidence. ZCode uses the same bridge; no provider outcome becomes Work success or replaces the primary hook error. |
| C | Shared classifier recognizes actual AGY 503 envelopes. AGY stream requests have tagged local ordered proof, not invented native Turn IDs. A successful boundary requires the exact claimed hook and settled lifecycle invocation plus current RUN/attempt/Work/generation. Root controller, external Work, MERGE and recovery share this check; fatal hook/auth/quota/storage errors take priority. Memory init retains ordinary technical-probe semantics. EVAL Judge accepts the same exact stream proof but does not inherit agent boundary/continuation authority. Decisions retain their existing bounded HTTP policy. |
| D | Current instructions are published as complete Markdown with an absolute `prompt_delivery` locator and digest, visible before verbose metadata. Controller entry/resume and common delegation completion instructions use this delivery; legacy packet compatibility remains. Stage resume retains the full accepted continuation in the same SQL commit and can reconcile it without reissuing commands. Recovery cannot fall back to a pre-answer prompt. Symlink delivery directories and foreign retained locators are rejected. |
| E | Weak fresh-world and strong retained-row upgrade bundles reach the owned Judge evidence unchanged, with distinct provenance and proof limitations. Existing review instructions already require migration proof; no product code or historical verdict was changed. Live semantic acceptance remains pending. |

The apparent nested PROTOCOLIZE delivery gap was disproved by inspecting its sole
caller: it discards the helper directive and returns `currentStagePrompt` at the
top level. No unused recursive publisher was added.

Independent reviews additionally caught and corrected the AGY `:before` event
key, fatal-hook/terminal race, command argument index, native-ID precedence,
ordinary `{ result }` settlement compatibility, resume commit/publication crash
gap, delivery directory escape and locator clipping. Regression tests exercise
positive and negative cases rather than relaxing admission to obtain PASS.

The full gate additionally exposed fixture observation defects. The Memory observer
ignored independently progressing child Work and expired before its native
request finished; its cleanup then caused the secondary recovery-guard error.
It now reuses the common Stage/Work observer plus exact controller operations,
scoped by project/RUN (foreign same-ID RUNs and heartbeat timestamps do not renew).
Recovery setup previously treated one unavailable physical observation as final;
it now reuses the existing bounded physical-observation retry and closes only its
own unconfirmed registrations after the exact held ChildProcess closes. Historical
`ps` error/status were not retained, so a particular OS timeout is not claimed.
The SDK fixture now waits for actual admission after a legal bounded `pending`
response instead of treating it as synchronous failure. Recovery admission probes
publish existing request-bound progress only after each completed negative proof;
ordinary maintenance diagnostics do not count as native activity.

Repeated real engine/native-binary checksum scans also reused progress markers.
The setup observer correctly rejected duplicates, but consequently ignored later
completed scans. Scan-local ordinal markers fix both producers without changing
observer limits or timeouts; repeated notifications within one scan stay duplicates.

## Verification

Final gate results will be completed here before integration. Already verified:

- EVAL full default suite: 955 tests, 940 PASS, 15 existing opt-in skips, 0 FAIL.
- EVAL affected capacity/supplement suites with the actual selected source policy:
  49/49 PASS; additional AGY exact/foreign stream-proof controls: 2/2 PASS.
- Engine E2: 136 tests, 135 PASS, 1 existing skip, 0 FAIL.
- Engine E4: 80 tests, 79 PASS, 1 existing signed-artifact skip, 0 FAIL.
- Engine hybrid/canon with the synchronized schema: 71/71 PASS.
- AGY actual handler/SQLite/settlement regressions: 20/20 PASS.
- Current delivery regressions: 6/6 PASS; Grok fixture contracts: 27/27 PASS;
  terminal projection regressions: 6/6 PASS.

The Grok fixture correction preserves the stronger runtime guarantee: returned
task objects, root idle, cancel ACK and an empty running list are not exact child
terminal proof. Missing connection/request/receive-sequence identity fails closed.

Optional signed
old/new artifact qualification and live semantic/EVAL acceptance are separate
from the default source gate and were not requested in this task.

An additional explicitly enabled supplemental lint probe found the installed
`mb-lint@0.4.0` does not support `--config`; its four opt-in scenarios cannot run
with that executable. The default suite marks that capability-dependent probe
as skipped. No linter was replaced, no expectations were weakened and no claim
of installed supplemental-linter qualification is made.

No old EVAL, native home, installed hook or published pin was modified. No new
EVAL, live Judge/model qualification or release was started.
