# Antigravity CLI fork validation — 2026-08-29

Status: completed exploratory validation; native headless fork rejected;
interactive native fork proven; automated TUI control remains experimental

## Environment

```text
platform: macOS arm64
binary: /Users/deksden/.local/bin/agy
version: 1.1.22
model: gemini-3.7-flash-low
workspace: disposable /tmp directory
Gemini directory: disposable absolute /tmp directory
app data directory: runtime
```

The experiment used a clean provider workspace and a dedicated provider data
root. It did not address or mutate any pre-existing user conversation.

Provider IDs are shortened in this runbook:

```text
source:  8a583269...333a
child:   ed4b361e...2232
sibling: ba04db0d...48e9
```

## Isolation prerequisite

### Replacement HOME

A clean replacement `HOME` could not list models. Copying the following
file-backed account metadata was still insufficient:

```text
oauth_creds.json
google_accounts.json
google_account_id
user_id
installation_id
state.json
```

The cause was independently confirmed: macOS Keychain lookup for the existing
Antigravity credential succeeded with normal `HOME` and failed with the
replacement home search list.

### Isolated Gemini directory

The installed binary exposes hidden flags:

```text
--gemini_dir
--app_data_dir
```

This command succeeded while keeping the normal home/keychain:

```bash
agy \
  --gemini_dir=<absolute-disposable-directory> \
  --app_data_dir=runtime \
  models
```

All observed generated configuration and runtime state was written below the
disposable Gemini directory:

```text
config/
runtime/conversations/
runtime/brain/
runtime/cache/
runtime/log/
runtime/conversation_summaries.db
```

This is the accepted isolation direction for implementation. Because the
flags are undocumented, doctor must verify their behaviour against the pinned
binary before every scored execution.

## Source conversation

The source was created in one-shot JSON mode with a marker prompt. Result:

```text
status: SUCCESS
num_turns: 1
response marker: AGY_FORK_SOURCE_READY
```

It was then resumed by exact conversation ID and asked to recall the marker.
Result:

```text
same conversation ID: yes
status: SUCCESS
num_turns: 2
marker recalled: yes
```

Usage increased cumulatively from the first to the second result, matching the
documented session-wide accounting model.

## Headless `/fork`

### One-shot print mode

Command shape:

```bash
agy -p /fork \
  --conversation <source-id> \
  --output-format json
```

Observed result:

```text
exit: 2
status: ERROR
conversation_id: empty
tokens: 0
error: /fork is not available in print mode
```

Passing a real, settled source ID does not change this result.

### Streaming input mode

Input:

```json
{"event":"user","message":{"content":"/fork"}}
```

Observed sequence:

```text
init(source conversation ID)
result(ERROR, /fork is not available in print mode)
process exit 2
```

No child conversation was created.

Conclusion:

```text
native_headless_fork = false
```

## Interactive native fork

The same settled source was opened in the TUI and `/fork` was entered once.
The provider reported `Forked conversation` and switched the active TUI to a
new conversation. The source remained available through `/resume`.

Observed provider-store changes:

```text
before: one source conversation database
after:  source plus one new child conversation database
```

Verification:

- source had 5 completed stored steps at the fork boundary;
- the child had the same 5-step prefix immediately after fork;
- every compared field and blob in all 5 source/child prefix rows was exactly
  identical;
- child provider storage had one parent-reference row containing the source
  conversation ID;
- child received a new provider conversation ID;
- a child-only prompt completed without changing the source step count;
- later headless resume of the child succeeded;
- the child recalled the pre-fork source marker.

Conclusion:

```text
interactive /fork is a native conversational clone
```

The relation is seed provenance. It must be recorded as
`seed_source_session_id`, not physical `parent_session_id`.

## Automated PTY probe

The TUI was also placed under the system `/usr/bin/script` pseudo-terminal and
fed `/fork` through stdin.

First attempt:

```text
input sent approximately 3 seconds after launch
new conversation: no
```

Second attempt:

```text
input sent after a longer startup allowance
provider conversation stores: 2 -> 3
exactly one new sibling: yes
source steps: 5
sibling steps: 5
identical prefix steps: 5
provider parent reference contains source ID: yes
process exit: 0
```

This proves that a native fork can be driven through a program-owned PTY
without manual keyboard input. It does not prove a production-ready barrier:
the successful probe depended on startup timing, and fixed sleeps are not
acceptable for scored work.

Required promotion work:

1. mechanically detect a fully rendered, input-ready TUI;
2. fail if onboarding, consent, auth or permission screens appear;
3. send `/fork` exactly once;
4. require exactly one new provider conversation store;
5. verify exact source-history prefix and unchanged source;
6. close the TUI and prove no process remains;
7. repeat successfully at least three times.

Until those gates pass:

```text
native_tui_fork = experimental
starter_mode = deterministic_replay
```

## Onboarding finding

A fresh isolated Gemini directory supported headless authenticated calls, but
the first TUI launch presented onboarding and data-use controls. The experiment
did not accept terms or change telemetry settings. It reused the existing
already-onboarded CLI receipt for the controlled TUI run.

Implementation must never select consent on the user's behalf. Missing or
drifting onboarding state makes experimental native TUI fork unavailable; it
does not block headless productive work or deterministic replay.

## Additional profile finding

Combining `--mode plan` with `--disable-slash-commands` emitted:

```text
--mode plan has no effect while slash command expansion is disabled
```

The scored profile must not combine those flags. Streaming input already
rejects CLI slash commands, so disabling slash expansion is unnecessary.

## Accepted decision

For the initial integration:

- productive work uses official headless NDJSON only;
- clean E2E uses one persistent conversation and needs no fork;
- canonical starters use `deterministic_replay`;
- `dd-agy session fork` returns a capability error in the scored profile;
- native TUI fork remains an optional version-pinned extension;
- no provider SQLite or protobuf state is modified by `dd-agy`.

Raw disposable provider state and terminal logs were removed after the
non-secret findings were recorded here.

