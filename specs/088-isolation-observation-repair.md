# Isolation observation ownership repair

CP229 ZCode stopped before Subject dispatch although quality51/browser6 passed.
The isolation assertions passed, but the wrapper reported cleanup failure.
Independent diagnostics on the same source reproduced cleanup_unconfirmed in
2/5 runs. Both native worlds were actually cleaned.

Cause: two parallel worlds inherited the same ready/final proof paths, as well
as the runner-report and progress channel. A later write from another owner
could pair readiness from one world with cleanup from the other. The strict
wrapper correctly rejected that mismatched proof; the producer routing was wrong.

Fix in dd-tasks PR11: each child receives its own observation paths. The
orchestrator settles and validates both worlds before aggregate success. The
ordinary wrapper and multi-world orchestrator share the same cleanup validator;
foreign, malformed and unclean proofs remain failures. Aggregate error/cleanup
does not overwrite a primary exception. No product feature code changed.

Verification: 23/23 tooling tests with PostgreSQL, including deterministic reverse
proof order and negative cases; five real world-isolation invocations passed.
Affected formatting/lint and API/web typecheck passed. The clean tooling-only
source f361454 repeats 23/23 and real isolation PASS independently. Historical
failed EVAL evidence and working OpenCode CP229 remain unchanged.

Checkpoint CP230 pins this tooling-only source and the unchanged public beta.138.
Installed engine/matrix qualification and native capacity remain valid; no engine
republish or unrelated Judge qualification is required. New EVALs still execute
their complete baseline. Reuse the same scoped fixture and Judge contracts.

Keep the already-running CP229 OpenCode rather than create a duplicate. Launch
fresh ZCode/AGY/Luna/Grok homes with CP230; never resume the failed CP229 ZCode.
These attempts differ from OpenCode only by the documented tooling correction.
All use the same retained shared resource registry and campaign PostgreSQL55437.
Stop that container only after its last active consumer/capture/Judge settles.

Evidence: /Users/deksden/.dd-eval/implementation-evidence/plan-088-isolation/;
the earlier reproductions are under plan-087-release/isolation-repro*.
