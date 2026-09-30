# Plan 057 — ZCode 0.52.0 native prerequisite evidence

Observed 2026-09-30. This is a reviewed **no-flow prerequisite**, not a managed
compatibility receipt, profile qualification, published adapter acceptance, or
scored E2E PASS. The exact bridge is `4621fabd3f517ecdd349dfebebae9077c01d2f2b`,
`zcode-acp-server@0.52.0`, `dd-zcode-harness@2`; native is the current
`/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`, version `0.16.9`,
SHA256 `fad4c35c4c36ec210d8a06d3fa0e77de23c8545e2eb6ff90aea1eb38d1e6275f`.

## Real native evidence

Full fanout evidence root:
`/Users/deksden/.dd-eval/qualification/zcode-052-isolated-fanout15-3TDIBY`.
Native root `sess_550eb8b0-e371-4baa-8da6-f1394cb12de3` had **15 simultaneously
running direct children**, not 15 sequential launches. Selective cancellation
removed only `sess_subagent_agent_dcd16b74-6170-4298-93d8-b11faad3665a`, leaving
the exact other 14 identities running. Final native directory: 14 `success`,
one `cancelled`, zero running. All 15 native child records map to the 15 Agent
tool-call IDs; the 14 children that reached Bash carry exact child Session and
parent Agent tool identities (the selected cancelled child stopped before Bash).

Same-child evidence root:
`/Users/deksden/.dd-eval/qualification/zcode-052-isolated-continuation-zt9moA`.
Native root `sess_6288ebc3-a997-4ee3-b9d3-6b172bd30295` used SendMessage to resume
`agent_6c21d59f-c364-4fef-a7d0-0d6b03bab9d9`; TaskOutput returned `CONTINUED`.
Native child identity remained
`sess_subagent_agent_6c21d59f-c364-4fef-a7d0-0d6b03bab9d9`. Only one Agent launch
exists, and the retained child identity set still contains exactly that child.

Both roots cleanly closed and physically stopped their owned bridges. An
independent new bridge read the closed full-fanout tree: all 16 nodes nonresident,
complete 15-child topology, root resident=false both before and after. Outbound
methods were only `initialize`, `zcode/session/resident`, and
`zcode/session/retainedSubagents`; no resolve/resume/new/prompt occurred.

Runnable evidence check:

```sh
node /Users/deksden/.dd-eval/qualification/zcode-052-isolated-fanout15-3TDIBY/verify.mjs
```

It checks real receipts/journals, child provenance, exact selective-cancel sets,
fresh SQLite parent-child rows, actual storage paths, same-child continuation,
closed reads, and physical cleanup. Its derived report is
`native-prerequisite-report.json`, with receipt digests and explicit limitations.
Credentials are not in this report or the receipts.

## Findings and corrections

`ZCODE_HOME` alone did not isolate native artifact storage or SQLite. Native
`env-config.adapter.ts` separately maps `ZCODE_STORAGE_DIR` and
`ZCODE_SESSION_DB_PATH`. Qualifying probes bind all three absolute paths, ending
the bridge home in `.zcode`. Actual fresh root/child paths and SQLite rows were
checked; the exact fresh root does not exist in the ambient output directory.
The initial exploratory ambient-store probe is excluded from the proof above.
The adapter now retains these explicit routes and rejects live/retained route
changes. It adds no default isolation and does not freeze an entire native home.

No-running-children was insufficient for a continuation barrier: ZCode root may
still process automatic completion notifications. The full-fanout root's early
continuation was refused with `tree_not_settled`; no productive retry occurred
after closing it. The separate continuation probe waited for root settlement.

Fresh canonical-provider create-only root
`sess_71004216-a4a9-4c79-8b19-2b53472095f7` in
`/Users/deksden/.dd-eval/qualification/zcode-052-canonical-fixed-create-w7kDTJ`
has exact requested/observed `account:zai-individual-coding-plan`, model
`GLM-5.3-Flash`, reasoning `max`, mode `yolo`, `matched=true`, and **zero prompts**.
This is diagnostic, not a reason to change the public builtin subject profile:
builtin→account routing is explicitly permitted by existing profile semantics;
the fanout/continuation receipts honestly retain `mixed`, `matched=false`.

Create-only exposed a real cleanup edge. Native regular Session create is
resident-only before the first prompt (`server-operations.ts`,
`createSessionWithProjection`); native `listSessionSubagents` requires a durable
parent and returns -32004 without it. Fork `retainedSubagents` intentionally does
not resume it. The fix retains explicit `prompt_dispatched=false` only for a
new root allocated by this daemon; prompt/fork attempts durably invalidate the
fact before dispatch. Only that owned root, no known children, native close=true
and resident=false can prove an empty directory, with ledger provenance. Legacy,
failed-prompt, fork, foreign-owner, and unknown cases remain fail-closed.
Default `daemon.stop` also directly closes this strictly never-prompted owned
root, without a cancellation notification or a native read that would resume
it. Productive/unknown roots keep the existing explicit observation refusal;
default stop does not silently cancel them. Fake bridge tests exercise both
default stop and cancel-tree cleanup, plus create-with-prompt remaining
nonproductive and failed first-prompt/fork invalidation before dispatch.

The first create-only probe in `zcode-052-canonical-create-yBRxSj` was not
retrofitted or resumed. Its official stop refusal and incomplete native-tree
evidence remain; exact owned daemon/provider groups were physically stopped via
the managed stop helper with PID/argv revalidation. The later fresh zero-prompt
probe records clean native+physical cleanup with the new explicit ledger fact.

## Managed qualification still required

After the published adapter, selected tuple/config and profile are reviewed,
run the existing commands from the candidate dd-eval checkout with all four
home/engine/config/resource variables pinned:

```sh
node bin/dd-eval.mjs harness compatibility qualify --profile zcode-acp-zai-glm-5-3-flash-max
node bin/dd-eval.mjs harness capacity check --profile zcode-acp-zai-glm-5-3-flash-max --max 15 --write-profile true
node bin/dd-eval.mjs runner eval preflight --profile cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-zcode-glm-5-3-flash-max.json
```

The native prerequisite permits reviewed bridge-contract admission; it does not
prove managed CLI/hook binding or all E2E behavior. Nested delegation and injected
provider errors were not qualified in these probes. No profile/runtime pin,
case fixture, historical EVAL, or product file was changed by these probes.
