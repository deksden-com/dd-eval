# Fork-020: environment recovery and check retry

Incident: `EVAL-20260916115920-1afe904c`, fork
`EVAL-20260916-stop-settlement-fork-020`, engine `0.9.0-beta.74`.

## Evidence and root causes

- Five CODE_REVIEW reviewers completed; review returned `repair_required`, not
  final stage success. Repair Work was `WRK-017-code-review-repair`.
- Snapshot filtering removed `.env.example` from both payload and Git index.
  Review consequently discovered a harness-induced missing template.
- Fork entered CODE_REVIEW with intentionally omitted `node_modules`. Controller
  bootstrap only ran at CODE entry, so the repair's browser check RCP-014 failed
  with `ERR_MODULE_NOT_FOUND` for `postgres`.
- Agent installed dependencies and used the returned successor finish command.
  Failed-check caching returned RCP-014 again: tracked input hashes were unchanged.
- Adding the documented `--retry-check` flags changed the command bound to its
  invocation ID, correctly causing `invocation_command_mismatch`. Command binding
  was not the underlying defect; the advertised retry could not make progress.

## Implemented correction

1. Shared check executor only reuses successful, reusable, valid evidence.
   A new finish attempt runs failed/aborted checks again, including after an
   environment-only repair. No automatic retry loop is introduced.
2. Old invocation IDs still replay their retained outcomes. Use the returned
   `retry_command` unchanged; do not append flags or invent IDs.
3. CODE_REVIEW controller entry uses the existing project-declared bootstrap.
   A receipt freshly prepared by that same controller is reusable; imported
   receipts are not. MERGE already bootstraps its target checkout separately.
4. New snapshots retain `.env.example` in payload and Git index. Real `.env`
   and other `.env.*` files remain excluded. No historical snapshot is edited.

## Execution trace after correction

1. Restore a sealed checkpoint into an isolated new RUN/home; old RUN is evidence.
2. Prepare project tooling before CODE_REVIEW agents run. Bootstrap failure is a
   terminal visible error with process/log evidence, not a successful readiness.
3. Review uses the restored source/template; repair Work executes its declared
   checks in the prepared checkout.
4. If a check fails, preserve its receipt and leave Work unfinished. Return an
   authorized successor command; the agent must repair the reported cause first.
5. The exact successor admits one lifecycle execution. Running check ownership
   blocks duplicates; a terminal failure is not cached as a permanent verdict.
6. Fresh passing evidence allows the existing Work acceptance and review follow-up
   logic to continue. Another actual failure remains visible and does not pass.
7. Stage gate uses the same executor. MERGE prepares its own target then runs its
   gate. Nothing in this fix bypasses semantic acceptance or claims E2E success.

## Next live run

- Build and install the changed engine through the existing isolated-engine path.
- A historical checkpoint already missing `.env.example` remains missing it;
  the new filter cannot recreate deleted bytes. Inspect it before choosing the
  checkpoint. Restore intended tracked content through normal Work, or select
  a checkpoint whose payload preserves it; never silently rewrite old evidence.
- Reuse the latest compatible sealed boundary, not an active failed attempt.
- Monitor both `data.error` and `data.result`; correctable lifecycle errors may
  appear only in `data.error`. Distinguish attempt `completed` from EVAL success.
- Deterministic regression tests are verification of these paths, not a claim
  that the entire live ZCode E2E has passed.
