# OpenCode harness research — 2026-08-29

Status: transport and portability research passed; model/delegation conformance pending

## Baseline

```text
OpenCode binary: /Users/deksden/.opencode/bin/opencode
OpenCode version: 1.18.23
platform: macOS arm64
source checkout: anomalyco/opencode
source commit: dc4449df0d52199704ea4989a5a993ebbc605612
control candidate: opencode serve over authenticated loopback HTTP/SSE
```

The source checkout explains the pinned binary but is not itself conformance
evidence. Release/API drift is gated by the installed version and a normalized
fingerprint of required `/doc` paths.

## Sources inspected

- official server, CLI, config, provider, agent and plugin documentation;
- installed CLI help for `serve`, `export` and `import`;
- OpenCode plugin types for `tool.execute.before` and
  `tool.execute.after`;
- Session create/fork/children/abort/message and status routes;
- Task/subagent Session creation and native `parentID` behavior;
- native export/import implementation and database conflict behavior;
- XDG/config discovery and `OPENCODE_DISABLE_PROJECT_CONFIG` flags.

## Safe live experiments

All experiments used disposable directories, fresh XDG roots, loopback Basic
Auth and no provider/model turn. They did not modify a canonical case or a
user Session.

### Headless Session smoke

Passed assertions:

- `/global/health` returned version `1.18.23`;
- an idle Session was created through `POST /session`;
- the Session was readable and absent from the busy-status map;
- `POST /session/:id/fork` created an independent idle Session;
- both histories were queryable and empty;
- the fork had `parentID=null` and was absent from `/children`;
- both disposable Sessions were deleted explicitly.

### Configuration leak probe

A normal, non-isolated launch loaded a user plugin (`moshi-hooks.ts`), which
attempted to contact its configured socket during Session deletion. This is
positive evidence that scored work must set all four XDG roots, disable project
config discovery and load only the checksummed eval adapter. `--pure` is valid
for this no-plugin diagnostic but cannot be used by the eval daemon because it
would disable the trusted adapter too.

### Native export/import portability

Passed assertions:

- native export produced one JSON object containing Session info/messages;
- import into a fresh XDG data root preserved the native `ses_*` ID;
- import rebound project/directory to the importing instance;
- a fresh server read the imported Session by the preserved ID;
- a native fork of that imported Session succeeded and still had no
  `parentID`;
- archive SHA-256 was stable for the captured bytes.

macOS canonicalizes temporary directories through `/private/tmp`; validations
must compare canonical filesystem identity rather than lexical `/tmp` strings.

The native unsanitized export is required for continuation context and is
secret-bearing private runtime material. `--sanitize` replaces text/tool/file
content and is suitable only for diagnostics, never a starter.

## Source-confirmed integration facts

- `tool.execute.before` receives native `sessionID`, `callID`, tool name and
  mutable `output.args`; the plugin can apply a returned `--hook-event-id`
  without shell wrapping.
- A thrown/rejected pre-hook blocks the native tool execution.
- `tool.execute.after` receives the resolved args and bounded result object.
- real Task subagents create child Sessions with native `parentID`; a
  conversational fork does not.
- Session/message token and cost fields are cumulative/provider projected;
  message parts expose stable tool-call IDs and terminal states.
- native import preserves Session/message/part IDs and rewrites the Session
  project/directory to the importing instance.

## Decisions produced by this research

1. Use `opencode serve`; do not add ACP over the official server.
2. Keep the Codex Controller/Judge and make OpenCode only the Subject backend.
3. Use an execution-scoped `dd-opencode` daemon with a private Unix control
   socket and one child server.
4. Reuse ZCode/Grok daemon, lifecycle and usage mechanics where semantics
   match.
5. Use `archive_native_fork` for focused starters: native export, fresh-home
   import, then native per-attempt fork.
6. Keep native physical parentage separate from verified seed lineage.
7. Treat SSE as progress/topology evidence and finite HTTP as reconciliation;
   use the synchronous plugin hook for pre-effect lifecycle trust.
8. Prove root-versus-child usage scope in delegated conformance before scoring.

## Remaining live conformance

These tests require an authenticated model call and are deliberately deferred
to implementation:

- exact provider/model/variant/agent receipt after the first assistant turn;
- foreground Task child ID/parent/status and root/child usage scope;
- targeted child cancellation while the root stays controllable;
- pending permission and question endpoint/request shapes;
- trusted first-turn `dd-flow` lifecycle command through the controlled plugin;
- SSE disconnect during a productive turn and finite reconciliation;
- server death with an active tree and fail-closed recovery;
- tool-name/part accounting in normal and code-mode paths;
- fresh-home imported starter through focused SPECIFY and then full E2E.

No scored profile or canonical OpenCode chain is ready until these assertions
pass against the pinned released engine/plugin pair.
