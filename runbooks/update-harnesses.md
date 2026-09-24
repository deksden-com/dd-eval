# Updating harness integrations

Use this procedure for a native harness, transport bridge or adapter update.
Provider-specific details live in [update-zcode.md](update-zcode.md).
Git integration and release rules live in [git-workflow.md](git-workflow.md).

## Discover and inventory

Review official native runtime releases, bridge releases where applicable,
adapter changes and dependency/security notices. Record the sources and date
checked. Release discovery produces a candidate, not automatic production
admission. Scheduled discovery, if configured, should notify only about new
relevant releases or compatibility breakage; this document creates no monitor.

Record the accepted tuple and candidate tuple: native version/binary checksum,
bridge upstream base/downstream commit/artifact checksum, extension contract,
published adapter/engine version and commit, engine full-content digest,
Node/package-manager versions, OS/architecture and requested provider/model/
reasoning/mode. Include profile and qualification-receipt paths. Credentials
must never enter the record. Read pins from the chosen profile and installed
artifacts rather than copying a version from prose documentation.

## Prepare and qualify

1. Check repository status and active runs. Preserve unrelated changes. Use a
   fresh candidate checkout and home; do not replace binaries used by active
   runs. Copy only portable configuration/resources, never runs, runtime DBs,
   session state or old conformance directories as new evidence.
2. Review behavior changes and the affected contracts. Preserve source, flow
   pack and memory-bank inputs when measuring a harness upgrade. Explain any
   additional input changes in the receipt.
3. Build/test bridge and adapter changes in their repositories. Install the
   released candidate engine with explicit homes; verify tag, commit, package
   integrity and installed full-content digest. Do not install into the default
   global home accidentally.
4. Qualify compatibility and actual native child capacity in the candidate
   environment. Inspect evidence for identity/profile readback, concurrent
   children, continuation, tool/lifecycle observations, cancellation/closure,
   usage and cleanup. Record unsupported capabilities explicitly. If admission
   blocks a new tuple, collect controlled diagnostic evidence first, then make
   a reviewed adapter admission change and release it. Never mark an untested
   tuple qualified just to pass preflight.
5. Pin the candidate profile and checkpoint to the verified artifacts. Compute
   checkpoint hashes mechanically. Update case references and relevant contract
   checks. Commit the definition and qualification receipt references.
6. Run preflight, then launch exactly one scored E2E only after PASS. Capture
   EVAL ID/path and installed tuple. Follow [execute-eval.md](execute-eval.md)
   and [e2e-monitoring.md](e2e-monitoring.md).

### Codex CLI / dd-flow hook refresh

When the candidate engine is published, refresh the installed Codex hook
runtime before qualification. Update both Codex homes (`~/.codex` and
`~/.codex-cpa`); `cx` must continue to select `CODEX_HOME=~/.codex-cpa`.
The active hook command must call the absolute installed binary
`/Users/deksden/Library/pnpm/dd-flow`, not an older copied `dist/cli.js` or a
PATH-dependent command. Verify the binary version and hook target in both
homes, then run one normal dd-flow command to complete the hook-store migration
before starting a native Codex session. Do not replace an engine or hook under
an active EVAL home; candidate EVAL homes must use their own published engine.

Commands below assume all four variables are explicitly set to the candidate's
absolute paths: `DD_EVAL_HOME`, `DD_FLOW_BIN`, `DD_FLOW_CONFIG_HOME` and
`DD_FLOW_RESOURCE_HOME`. `profile_id` names a harness profile; `run_profile`
is a run-profile JSON path. Set `capacity` to the actual required fan-out.

```sh
node bin/dd-eval.mjs harness compatibility qualify --profile "$profile_id"
node bin/dd-eval.mjs harness capacity check --profile "$profile_id" --max "$capacity" --write-profile true
node bin/dd-eval.mjs runner eval preflight --profile "$run_profile"
# Only after reviewing PASS:
node bin/dd-eval.mjs runner eval run --profile "$run_profile"
node bin/dd-eval.mjs runner status --eval "$eval_path"
```

## Accept or reject

Keep qualification PASS, preflight PASS, launch and completed E2E acceptance
as distinct states. Promote a candidate only with reviewed completion and the
required semantic/evidence checks; a running process is not acceptance.
The receipt records old/new tuples, source refs, changes, checks, evidence paths,
EVAL result, known limits and the accepted rollback tuple.

On failure preserve the candidate and primary error, investigate read-only and
record rejection. Do not silently resume/retry or substitute another provider.
Rollback means selecting the previous verified tuple for a fresh run; it never
means replacing binaries or state beneath an active run. Retain old artifacts
until their dependent runs and retention requirements are finished.
