# Native payload selection — plan 052 / A3 qualification gate

Status: **A3 remains open; native base-import gate passed, replacement
selection is not qualified and production native-home selection is unchanged**.
The credential exclusions and `.zcode` project-service selection are independent
fixes. They do not establish that an arbitrary native Session can be restored
from a reduced provider home. Existing recovery behavior must not be replaced
until the appropriate native loader/export roundtrip below passes.

There are three different purposes:

- dd-flow evidence: owned daemon identity, operation receipts, model observations,
  Work/controller state and accepted result inputs. Preserve integrity of the
  sealed copy; do not demand that an entire live provider home stop changing.
- Native continuation: only the state consumed by the actual supported
  same-Session loader/export/import path, including referenced assets.
- Diagnostics: optional logs/cache/debug exports. They are not semantic inputs
  merely because they are located beneath an owned directory.

## Grok Build source inventory

Source root: `/Users/deksden/Documents/_Projects/grok-build`.
Paths in this table are relative to
`crates/codegen/xai-grok-shell/src/session/`.

| Native file(s), relative to one Session directory | Consumer / reason |
| --- | --- |
| `summary.json`, `chat_history.jsonl` | `storage/jsonl/mod.rs:1594,1645`: full/light load; required Session identity and conversation |
| `updates.jsonl` | full load; `ensure_chat_history` can rebuild missing/empty chat history from updates |
| `plan.json`, `plan_mode.json`, `signals.json`, `announcement_state.json`, `goal/state.json` | full/light load optional typed state; optional does not mean disposable when present |
| `workflows/<run>/state.json`, `scripts/<revision:04>.rhai`, `args.json`, `effort`, `cleared` | `load_workflow_runs_sync`: script and args are required; missing either silently skips the entire workflow. The clear tombstone wins over state |
| `rewind_points.jsonl` | full load/rewind; deferred by light resume, so a passing light load alone does not certify rewind |
| `usage.json` | native usage and copy/restamping; needed for billed history/statistics |
| `tool_state.json` | `acp_session_impl/spawn.rs:836`; tool state reinstantiation, also `storage/jsonl/copy.rs:417` |
| referenced `compaction_checkpoints/*.json` | `storage/jsonl/copy.rs`, `storage/jsonl/mod.rs:1978`; references come from native updates |
| compaction transcript segments/index | native copy and transcript consumer, `storage/jsonl/copy.rs:450+` |
| `assets/*` referenced by history | `image_describe.rs:259`; attachment content is not reconstructed from a filename |
| `title_refresh_idx` | `helpers/session_summary.rs:83`; persisted title-refresh watermark, also explicitly preserved by native copy |

This is a consumer inventory, **not a finished allowlist**. Watermarks,
compaction/recap requests, attachment path rebasing, and every native reference
must be reconciled with the source version used by the current binary before
the list becomes executable policy.

The dd-flow adapter currently has `sessionDirectory`, `exportSessionArchive`
and `materializeSessionArchive` in `src/harness-runtime/lib/dd-grok-daemon.mjs`.
They copy one complete Session directory, enforce an exact Grok version and
original `source_cwd`, and do not export a complete root/child tree by themselves.
`session.resume` is currently normalized to inspect, which does **not** prove a
native full/light load after relocation. These facts prevent treating today's
archive/inspect fixture as the required A3 gate.

The native implementation separately exposes `_x.ai/session/state`,
`_x.ai/session/updates` and `_x.ai/session/import`:
`extensions/session_state.rs`, `extensions/session_updates.rs`.
Their support is confirmed in the installed Grok `1.0.41 (4220f3b224a6)`.
Native import rewrites host-specific summary fields and preserves the Session
ID, writes summary last, and reconstructs chat from updates. It is the smallest
existing base for a relocated restore, not the dd-flow same-cwd archive pair.
`session/updates` returns the active replay branch (rewind-dead branches are
filtered), so it is not automatically an exact replacement for raw updates
when qualifying rewind recovery.

The executable probe
`flow:test/fixtures/grok-native-import-gate.mjs` passed on that installed binary:

```sh
DD_GROK_AUTH_SOURCE=/Users/deksden/.grok/auth.json \
DD_GROK_BIN=/Users/deksden/.local/bin/grok \
node test/fixtures/grok-native-import-gate.mjs
```

It imports two synthetic identities, loads each through actual ACP
`session/load`, exports state/transcript, imports to a separate temporary home
and cwd, and loads again. It checks nonempty transcript, nonempty plan and
retained parent identity. It sends no productive prompt, never copies operator
Session data, and removes only its own temporary fixture, including auth copies.
The extended gate also creates a real synthetic image asset and a native-style
absolute `<image_files>` reference for each Session, then removes its own source
home before loading the target. On `1.0.41`, both target native loads succeed
while the asset is absent and the transcript still points to the deleted source.
Its explicit result is `forward_resume_gate: BLOCKED` with
`native_import_load_succeeds_with_missing_asset_and_stale_source_reference`.
This reproduces a forward-continuation defect in treating native import/load
success as proof of a complete portable payload; it is not just an unexecuted
source-code concern. The production selector is deliberately unchanged.
The installed native `session/load` requires auth; unauthenticated import alone
succeeds and is **not** load proof. Auth bytes are never printed/exported.

This is a **base-capability PASS, not full A3 qualification**. Native state
columns omit workflow scripts/state/args, tool state, rewind points,
compaction checkpoints/segments and assets. `session/import` only sanitizes
summary metadata; it does not rewrite absolute image paths stored inside
`<image_files>` in history (`image_describe.rs:251,378` and
`xai-chat-state/src/compaction_image_context.rs`) or the absolute compaction
pointer (`session/compaction_segments.rs:33-49`). Copying asset bytes to a new
home without proving that those native references resolve would be a false
portable-recovery claim. A supplemental exact sidecar manifest must therefore
preserve the loader dependencies above and qualify their references, not merely
check that files exist after copying.

The immediate supported purpose to qualify is **forward continuation from a
stage-entry snapshot**, not arbitrary native rewind or forensic replay. Rewind
points and dead replay branches need a separate capability claim; their absence
must not become an unnecessary gate for forward-only E2E. The remaining sidecar
and path-reference gaps above still affect forward continuation itself (loaded
tool/workflow state and subsequent access to image/compaction context), so this
narrower purpose does not justify dropping them without a native-load test.

The smallest usable existing load entrypoint is the standalone
`dd-grok.mjs::inspectSession`: its `identity()` sends ACP `session/load` when
`liveSession` is false. The daemon's inspect path deliberately sets
`liveSession:true` so observing a running bridge cannot replace its loaded root.
Use the standalone entrypoint in a new temporary provider home for the gate;
do not weaken daemon observation safety or use a live EVAL Session for this test.
The native source also provides `agent/testkit/e2e.rs::load_session_via_agent`
(real ACP initialize/auth/load over in-process pipes with a mock backend), so
an offline loader roundtrip does not require a model prompt or a new framework.

Concrete unsupported pieces of the current dd-flow archive API are tree export
and relocation: export accepts one Session ID, import requires the original cwd,
and no API manifest enumerates retained child archive/asset references. The base
native API probe supplies the portable metadata/transcript primitive, but not
the missing sidecar/reference contract. Do not silently broaden that base
capability into a promise of complete portable native-session restore.

### Smallest remaining forward-resume fix

Native import accepts transcript values, so rebasing a **known** reference before
import is technically possible; the blocker is not an inability to submit changed
updates. The missing contract is the complete set of loader-owned references and
sidecars, including nested tool-resource state. `xai-grok-tools/src/persistence.rs`
loads a nested `HashMap<String, HashMap<String, Value>>`: copying the file does
not prove that every persisted resource is portable. Native
`transform_conversation_cwd` is a workspace substring transform, not a native
home/Session-path transform. Native copy even preserves compaction archives
verbatim. Neither function supplies the missing portable contract.

Prefer a bounded native extension of the existing `session/state` + `import`
pair: a versioned **forward-resume** payload with loader-selected sidecars,
source Session path provenance, native destination rebasing, and lazy-reference
validation before the summary commit marker. Export/import retained children
separately, preserving their parent identities. Reuse the native storage types
and copy-reference validation; do not include auth, caches, arbitrary home files,
or require full rewind history for this purpose. The alternative is a dd-flow
version-pinned implementation of those same native schemas, which is a larger
maintenance surface and still requires equivalent native-load/reference tests.
No Grok source or production payload policy was changed by this investigation.

Useful existing native tests (not executed by this inventory):

- `storage/jsonl/tests.rs`: `load_rebuilds_chat_history_from_updates`,
  `workflow_run_manifest_round_trips_and_clear_tombstone_wins`,
  `load_session_without_updates_defers_rewind_points`.
- `storage/jsonl/copy_tests.rs`:
  `copy_session_data_copies_referenced_compaction_checkpoints`, reference/path
  and symlink negative tests.

Run loader tests against a temporary fixture, with root and retained children,
before/after selected export/import. Compare identity, conversation and active
plan/workflow/tool state; verify lazy references are readable. Missing required
state must fail explicitly. Unknown diagnostic additions must not change the
selection. A productive model prompt is neither required nor allowed by this
offline qualification gate.

## Other adapter recovery contracts

| Harness | Existing native entry point / storage | What remains before reduced-home selection |
| --- | --- | --- |
| Codex | `thread/resume`; managed home shares operator `sessions`/`archived_sessions` through deliberate symlinks | A dd-flow snapshot is not a portable copy of that shared history. Prove retained root/child thread loading and external-history availability without exporting unrelated operator Sessions |
| ZCode | ACP `session/resume`; retained native store belongs to the current ZCode/bridge runtime, not project `.zcode/acp/sandbox.json` | Qualify native Session export/restore or explicitly retain same-host dependency; project service JSON is not Session recovery data |
| AGY | `--gemini_dir=<owned>/gemini --app_data_dir=runtime --conversation <id>` | Inventory actual conversation/brain loader dependencies and child data, then native load in a separate temporary home; transcript text alone is insufficient |
| OpenCode | Native `export <id>` / `import <file>` already used by adapter archive | Prove retained child export completeness, history identity and import to isolated XDG home. Do not substitute raw whole `xdg-data` capture for the native archive contract |
| Droid | `droid.load_session`; `.factory` transcript plus adjacent settings read by adapter | Prove native loader dependencies for root/children and path relocation; copied credentials are never Session payload. Synthetic auth markers already exercise separate snapshot exclusion |

No entries in this table claim newly qualified recovery capability. In
particular, same-host retained-session continuation and portable snapshot
restoration are different claims.

## Release condition

Do not mark A3 complete while the generic blacklist still controls unknown
provider-home content. Do not replace that blacklist with a guessed list either.
After the loader gate passes, use a small purpose-specific selector at the
existing capture/source-proof boundary, selecting retained identities only;
keep sealed historical payload verification unchanged. Auth always comes from
the permitted operator source, never from recovery snapshots.
