# Test-world qualification — 2026-09-08

Plan 032 / R09: local baseline qualification, not main integration or full
runtime/release acceptance.

Delivery update: infrastructure integration is now published on `dd-tasks`
main at `69ebee20485b8bc6b221d5ef561f96df5df8b2c9`, with exact remote readback.
The original baseline and all immutable checkpoint tags remain unchanged.
Sections below retain the intermediate evidence; the final delivery section
supersedes their earlier pending-main statements. Full runtime/release
acceptance and native keyboard accessibility are not claimed.

Source: clean `dd-tasks` branch `fix/eval-isolated-test-world`, commit
`924ef61752b642f06c2c326b444ed7a3239f20ff`, at
`/Users/deksden/Documents/_Projects/_worktrees/dd-tasks-eval-test-world`.
The baseline is already pinned by CP-074 through CP-087 variants; these
immutable checkpoints were not changed. The separate main checkout remained
at `f4d613d`; no merge, tag change or publication was performed here.

## Executed gates

| Command | Result |
| --- | --- |
| `pnpm test:world` | PASS: two concurrent invocations of the same source tree use distinct databases and migration digests; cancelling one preserves the other's data |
| `DD_TASKS_SECOND_CHECKOUT=/tmp/dd-tasks-world-qualification.T1jHtF pnpm test:world` | PASS: same check across two separate source trees |
| `node --test scripts/preview-lease.test.mjs` | 1 passed: duplicate preview-world lease rejected; explicit release permits reuse |
| `pnpm quality` | PASS: format, lint, typecheck, 29 API unit + 11 Web unit + 10 API integration tests, API/Web builds, value-absence check |
| `pnpm test:browser` | 6 passed, Chromium; production assets and API/Web endpoints isolated to the browser invocation |
| `pnpm docs:check` | PASS: 30 required paths, 22 frontmatter documents, durable links and scenario matrix |
| `pnpm qualify:keyboard` | NOT QUALIFIED: 1 skipped, with explicit evidence; see below |

The second tree was extracted with `git archive HEAD` from the exact clean
source commit. Only dependency directories were symlinked to the installed
packages; source files and test-world directories were independent. The older
dirty `/private/tmp/dd-tasks-world-conformance-029` checkout was not modified
or used as qualification evidence.

## Cleanup readback

All six new invocation receipts report `state: cleaned`. A separate read-only
query of PostgreSQL's database catalog found none of their exact database names
remaining (`checked: 6`, `remaining: []`). This was not inferred from receipt
text alone. The invocation tokens are:

- same-tree concurrency: `9a7c76544c21495b862d5f601c813544`, `b3a8c65085784da9b90c5f9ae9163a11`;
- separate-tree concurrency: `3cad42b65d464aa6aa7125d181fc5dda`, `ddbf41c6792a494d855a5de774a42570`;
- full integration: `7251d124d9754aca9adcf73cf9ff5cd3`;
- browser: `91871e9d10a54a1ab42fd54e95828e1a`.

Receipts remain under each tree's `.test-worlds/<token>/receipt.json`.
Browser readback used API port 53462 and Web port 53463, both HTTP 200 before
the invocation cleaned up. No unrelated database was selected for deletion.

## Native keyboard limitation

On `darwin`, Chromium `151.0.7922.34`, focusing the native select and pressing
`ArrowDown`, then `Enter`, left its value at `one` instead of `two`.
The qualification artifact records `qualified: false`; the test is skipped,
not passed. This does not prove product accessibility. Product browser tests
use semantic option selection for persistence and retain a separate keyboard
focus test; all six product/browser tests passed.

## Remaining R09 work

Source-branch integration under repository policy and any required upgrade/
preview acceptance remain open. Preserve the native keyboard limitation in
delivery evidence. This report does not close the shared controller, migration,
mixed execution, live recovery/control, or published-artifact gates in plan 032.

## Current-main integration candidate

Commit `acc1d944e61af51152cdfa81b38360e403d4cdc4` on
`fix/test-world-main-integration` applies the two infrastructure commits
`f474acd` and `924ef61` to current main
`f4d613d5b933aa7e0c77895e84dc9b8d24e4ffc9`. The original baseline branch and
immutable checkpoints remain unchanged. This is a clean local candidate at
`/Users/deksden/Documents/_Projects/_worktrees/dd-tasks-test-world-main`,
not a main merge or remote-delivery claim.

Integration retains main's priority browser tests and unique task names, adds
the original-title wait before editing, and routes the DB-backed API unit
command through the existing test-world launcher. Flow suffix suppression now
matches only the exact invocation database, rather than every URL while a
test-world environment variable is present. A regression covers this boundary.

Fresh gates: `pnpm quality` passed, including the 14 integration tests and
the existing 0001-to-0002 priority upgrade case; `pnpm test:browser` passed
8/8 after the final code fix. Same-checkout isolation and cross-checkout
isolation against the unchanged baseline branch passed. Docs and preview-lease
checks passed. PostgreSQL catalog readback found all nine newly created
invocation databases absent; every receipt reports `cleaned`.

Final browser invocation: `054ccb5453334bcd80fb2722169677a8`.
Cross-checkout pair: `6908c2c3fc714df5b77cc01d2171fc33` and
`fd7f973a61a540dd81cb443c9deb3551`.
Final quality database invocations: `79991812a2d142d9b2793b7b067be4c1`
and `82b4c27ea00142678ebbd4cc6abba7d4`.

Remaining: applicable source-package scenario gates, fast-forward main
integration with post-merge checks, and exact remote readback. Native keyboard
qualification is still limited as documented above; no new product checkpoint
or provider deployment is claimed.

### Source-package scenario follow-up

`RUN-20260908-901__SCN-001` passed all six foundation phases: isolated world,
schema migration, API contract, browser, evidence collection and cleanup.
The exact database `dd_tasks_foundation_local_5cac73b7d48a4956afc30d00d3bc9730`
was also absent in a separate PostgreSQL catalog query after the scenario.
This is local foundation acceptance, not provider or full product acceptance.

Follow-up commit `69ebee20485b8bc6b221d5ef561f96df5df8b2c9` excludes the new
`.test-worlds` directory from Docker build context and preview source digest
calculation. Without both exclusions, ignored local verification artifacts
would become part of the preview build inputs. The integration branch remains
clean; neither main nor immutable baseline tags were moved.

Preview qualification `R09-20260908-main-902`, profile `preview-eval-output`,
passed all six phases against that commit on the local Docker Desktop engine. It used
port 55249 and the exact compose project
`dd_tasks_preview_eval_output_r09_20260908_mai_25c258b7bf`; the matching
containers and volume were absent before launch. Separate Docker readback after
completion found no matching containers or volume; cleanup recorded exit 0.
The source digest is
`sha256:25db802cbac30b35c05f45fe790782ae0af8b5b6e2ef6b9aa00b37ef7968c4e4`;
the built image identity is
`sha256:07afb4ab5389be3cace42b5c9f47303427344110a10095ae86d657e1cef4f855`.

Checkpoint restart qualification `R09-20260908-main-903` passed as
`preview-checkpoint`, port 55557, compose project
`dd_tasks_preview_checkpoint_r09_20260908_mai_e96676e38b`. Its exact resources
were absent before launch. Its down/up/migrate operations all exited 0 and
readiness returned HTTP 200 with the expected source revision and digest after
the retained-volume restart. Independent Docker queries found no matching
containers or volume after final cleanup. This does not prove a provider deploy.

## Final infrastructure delivery

The clean candidate was fast-forward integrated from `f4d613d` to `69ebee2`
in the stable main checkout. Fresh post-merge `pnpm quality`,
`pnpm test:browser` (8 passed), `pnpm docs:check`, and `pnpm test:world`
all passed. A separate PostgreSQL catalog query confirmed absence of all five
post-merge invocation databases, and their receipts report `cleaned`:

- `31c7351c7dc2420e9c39ba1715b25dd9`;
- `4e103730b78b47a9ab298049e93a8a1e`;
- `79b78d3fcb6f4848a67f27d10d77880b`;
- `b7527149999a42579540b5fcae95be15`;
- `db202f9bde624ffba10a8e2c43eb1eb5`.

`git push origin main` succeeded. `git ls-remote origin refs/heads/main`
returned `69ebee20485b8bc6b221d5ef561f96df5df8b2c9`. No force update,
checkpoint-tag change, product baseline replacement, or provider deployment
was performed. The integration worktree is retained temporarily with its local
scenario evidence until final cross-repository evidence export; the immutable
baseline worktree remains separate.
