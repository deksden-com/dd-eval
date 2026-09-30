# Updating the ZCode integration

Apply [the common upgrade procedure](update-harnesses.md). This document owns
system operations; [the adapter contract](https://github.com/deksden-com/dd-flow-cli/blob/main/src/harness-runtime/DD-ZCODE.md)
owns integration semantics, and [fork maintenance](https://github.com/deksden-com/zcode-acp/blob/main/docs/FORK-UPDATES.md)
owns downstream patch rebasing.

## Two external release streams

Inspect both ZCode's official runtime release information and
[upstream zcode-acp releases](https://github.com/william0wang/zcode-acp/releases).
Upstream bridge updates often repair compatibility with newer native runtimes.
An update to either component requires reviewing the complete tuple. Preserve
the exact native binary: discovery from an auto-updated desktop app bundle can
change the runtime even when our bridge is pinned. Record binary checksum and
verify it again before execution; detect drift rather than accepting it.

The recorded v0.43.2 overlay is based on upstream
`54acb495c30966f3d22d48ec09bbd749fd2d9475` with downstream head
`8c0a893f3c26a0b96cb138acf762db84c800298b` at immutable tag
`archive/dd-eval-v0.43.2-overlay` (the former branch has been retired).
This is a historical candidate reference, not a moving latest/supported claim.
Consult the selected profile and receipts for the accepted tuple.

The native-recovery integration must also be qualified against the installed
tuple: delayed create response/rejection, bridge restart with unresolved
allocation, reverse RPC ID collision, close during a prompt, and inferred versus
native-confirmed completion. `native_outcome_unknown` is not permission to retry
or delete an allocation intent. A late identity receipt is evidence only, not a
request to replay productive work. Preserve these cases when upgrading upstream.

## Candidate sequence

1. Inventory native ZCode, bridge, extension contract, published dd-flow adapter
   and profile. Review both release streams. Choose an exact upstream tag and
   ask the fork maintenance procedure to produce a tested downstream artifact.
2. Audit the fork's committed patches and any outstanding uncommitted work
   separately. Upstream-equivalent fixes can disappear; consumer policy belongs
   in dd-zcode. Do not include dirty working-tree changes in the qualified build.
3. Configure absolute `adapter_command` and `runtime_command` paths in the
   candidate `harnesses.json`. The former is the published engine's dd-zcode;
   the latter is the candidate bridge. Bind native binary discovery to the
   recorded ZCode artifact (`ZCODE_BIN`/`ZCODE_NODE` as supported by that bridge).
   Use a fresh execution daemon and fresh runtime state.
4. Verify `--dd-harness-version`, `--dd-harness-commit` and native version/hash.
   Run `dd-zcode doctor --zcode-acp-bin <absolute-bridge> --json`. The adapter
   currently admits exact native SHA/bridge-commit tuples: even a bridge docs
   commit can change the identity if rebuilt. Reuse an immutable qualified
   artifact or qualify the new identity; do not spoof an earlier commit.
5. Follow common compatibility/capacity qualification. Specifically verify:
   native versus adapter session IDs and workspace routing; observed provider,
   model, reasoning and mode; root and concurrent child tool events; exact
   invocation receipts; child continuation; background ownership; selective
   cancellation versus whole-tree cancellation; close/resident/retained reads
   without implicit resume; causal provider errors; usage scope/completeness and
   request/cache/reasoning counters; clean process/tree settlement.
6. If the adapter requires a contract/admission change, test and release dd-flow
   first, then install and verify that published artifact. Update profile runtime
   pins/capacity only from the candidate receipts. Keep evidence limitations
   explicit, including unsupported nested delegation.
7. Create the new engine checkpoint when the engine tuple changes; preserve
   source/flow inputs and compute its checksum. If only the harness changes,
   retain the engine checkpoint and record the changed harness profile/tuple.
   Preflight and launch use the exact candidate homes and published engine.

For a qualification that claims a **fresh native data store**, bind all three
native routing paths explicitly (absolute paths): `ZCODE_HOME=<fresh>/.zcode`,
`ZCODE_STORAGE_DIR=<fresh>/.zcode`, and
`ZCODE_SESSION_DB_PATH=<fresh>/.zcode/cli/db/db.sqlite`. `ZCODE_HOME` alone selects
bridge configuration/account data; its `ZCODE_DATA_BASE_DIR` translation does
not select native CLI artifact storage or the SQLite Session store. Check the
actual paths for the exact newly created root/child identities, not just paths
rendered in model output. Copy portable configuration only, never historical
Sessions or SQLite databases. Keep credentials outside qualification receipts
and runtime snapshots. Do not override `HOME` or scan/freeze the whole native
home. Normal EVALs may use explicitly reported harness-owned ambient storage;
that is distinct from a fresh-store qualification claim. The daemon retains
explicit routing paths and rejects changed routes on retained restart.

For the current Task Priority scenario the run profile is
`cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-zcode-glm-5-3-flash-max.json`.
Read its subject profile reference instead of assuming every ZCode profile uses
the same runtime or model. Use [monitoring](e2e-monitoring.md) to follow actual
RUN stage/controller, Work attempts, native events and process liveness; manifest
entry-stage is not current stage. Register quiet monitoring for the concrete
EVAL, report transitions/failure/completion and avoid duplicate launches.

Do not count compatibility or capacity PASS as completed E2E qualification.
On failure retain the original causal evidence and use the common rejection and
rollback procedure. Promotion requires an explicit acceptance receipt.

## Recorded v0.52.0 source upgrade

[The candidate receipt](receipts/zcode-acp-v0.52.0.json) records the reviewed
upstream port, immutable artifact identity, local/GitHub checks and isolated
native diagnostics. Fork PR #6 is merged; accepted profiles and installed bridge
selection are unchanged. Root/tool completion, two concurrent children,
same-child continuation and clean diagnostic shutdown passed. This does not
qualify capacity=15 or managed lifecycle forwarding. Complete the remaining
promotion gates before admitting the commit or launching a scored E2E. Keep the
artifact's actual source identity distinct from later merge commits, even when
their source trees match.
