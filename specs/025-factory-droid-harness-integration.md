# 025 — Factory Droid harness integration

Status: adapter implemented; native transport, tree cancellation, same-ID
resume and capacity 15 verified on 2026-09-06. Generated-hook smoke also passed; scored
E2E has a separate receipt; native probes alone do not imply those gates.

## Scope

Add `droid-cli` (`droid` family alias), adapter `dd-droid`, and native runtime
option `--droid-bin`. Initial profile: OpenAI `gpt-5.6-sol`, reasoning `high`,
mode `auto-high`. Runtime receipt keys are `droid=0.212.0`,
`factory_protocol=1.201.0`, `dd_harness_contract=dd-droid-harness@1`.

Use a durable execution-scoped adapter daemon owning native
`droid exec --input-format stream-jsonrpc --output-format stream-jsonrpc`.
Runtime settings are supplied through JSON-RPC. Do not use deprecated
stream-json input, interactive terminal automation, or Factory Missions.
Existing operation identity, ownership, runtime drift and unknown-outcome
recovery rules remain authoritative.

## Verified native behavior

Local OAuth works with API_KEY environment values absent. A private
`FACTORY_HOME_OVERRIDE` can contain only copied authentication, isolated
configuration and generated droids; real HOME stays unchanged. Native
initialize/load restore the same physical root identity and settings.

Task background children expose `child_session_available` with childSessionId
and toolUseId under the parent's session notification. Child transcripts
independently record callingSessionId/callingToolUseId. Execute hooks identify
the physical child; PreToolUse updatedInput rewrites commands. SubagentStop was
observed on the root with empty task_result and is not a child identity or
Work acceptance signal.

Root interrupt stops its turn but leaves background children running. A
separate close_session settled a live child Droid plus its Execute supervisor
and Python process within an eight-second observation; the exited root was
then reaped. No external signal was needed in that case. A new process loaded
the same root only after the old tree was absent; history/settings survived,
the child invocation was cancelled, no child resurrected, and a new nonce
recall turn completed without replaying the original work.

Normal root inclusive usage matched the sum of physical root and children.
After cancellation it omitted the running child's persisted spend, even after
close. Record physical per-session totals and reconcile the discovered tree;
never add inclusive totals to physical child usage. Unavailable/incomplete
counters must remain explicitly partial.

Private probe receipts are retained under DD_EVAL_HOME/conformance/droid-probes
and droid-recovery-20260906; they are not portable scored fixtures.

## Required adapter behavior

- Isolate Factory state, disable automatic updates, cloud session sync and
  builtin skills; use explicit empty MCP and generated worker configuration.
  Remove temporary credential copies on final cleanup. Do not claim that one
  smoke proves isolation of every possible instruction source.
- Generate `dd-flow-worker` with the selected model and reasoning. Both capacity
  and productive coordinators use Task subagent_type `dd-flow-worker` without
  complexity override. Verify observed child settings because Factory can
  fall back from unavailable model selections.
- Use runtime hook identity for flow commands; preserve native relation and
  turn IDs. Task-completion turns are distinct from the submitted prompt turn.
- Tree cancellation interrupts, closes, waits for owned process settlement,
  then escalates only within verified ownership if necessary. Cancellation
  must preserve native root history for later same-ID load; no new model
  prompt is used for cleanup. Reload remains forbidden while a prior owner
  might still be alive. Process groups of Execute descendants may differ from
  the root process group.
- Selective cancellation of one ordinary Task child is not a supported claim.
  The SDK's kill_worker_session is Mission-oriented; do not substitute it for
  TaskStop or invent a generic tool-execution RPC.
- Technical diagnostics/capacity use explicit `--no-flow`; productive runs
  receive the normal isolated dd-flow home and project-root contract.

## Adapter verification

The deterministic suite covers physical usage/caches/thinking, malformed partial
transcripts, profile/identity drift, exact terminal correlation, durable native
outcome recovery, disconnected observers and at-most-once dispatch. Fake native
process tests verify cancel/load ordering and retained child ownership after
root exit. The full repository suite passed 180 tests.

Live adapter receipts under `DD_EVAL_HOME/conformance/droid-adapter-20260906`
show two completed native children with separate physical counters, a live
Execute child cancelled by native close without forced signals (eight owned
processes observed), then same-ID load and nonce recall without old children
resurrecting. Final stop was clean and removed copied authentication.
The standard capacity command started and completed 15/15 children using the
same generated worker, with clean shutdown; the profile records capacity 15.

A live generated-hook smoke (`conformance/droid-hook-live-20260906`) used one
real Execute against a deliberately absent Work. The engine persisted native
identity/model/transcript and returned the same one-use hook event key in
updatedInput. The command reached the expected not-found response; this proves
transport/rewrite, not successful Work acceptance. Physical usage and tool
failure counts were retained; cleanup removed private authentication and both
owned daemon/provider processes.

## Remaining qualification gates

Run successful productive Work binding and the
existing E2E qualification. Independent focused cells require an accepted
portable entry pack; the current case has none. E2E uses its new immutable
input checkpoint and does not qualify focused cells by inference.

## Primary references

- [Factory Exec](https://docs.factory.ai/droid-exec/overview)
- [Factory SDK](https://docs.factory.ai/sdk/typescript)
- [Native Task subagents](https://docs.factory.ai/harness/subagents)
- [Lifecycle hooks](https://docs.factory.ai/harness/hooks)
