# CP-235 release preparation

Candidate, not E2E acceptance. Engine 0.9.0-beta.141 identifies
`c370c6e9beaefba2216bbf5bbadac02e4827768f` (release PR 89).
Public tarball SHA256:
`4ddb8db8c8840bc93c02ab06e65db0d01e177e0042eb0ae5318accf4bf59088f`.
Checkpoint stores the independently verified installed-engine checksum.

Local release fallback: GitHub Actions could not start due to account billing.
Typecheck, lint, strict-canon build, hybrid 66, release contracts, complete
integration inventory (171 files / 2887 cases) and runtime-sensitive (48 cases)
passed before accepting and publishing the frozen candidate. Public registry
bytes and immutable release tag were read back by the standard publisher.
Technical published-byte matrix lifecycle: PLAN/CODE/MERGE passed; owning Stage
packets are retained beside the qualification receipt. CODE-REVIEW was explicitly
off in this technical fixture, not in the scored profiles.

Product base and flow pack are unchanged. Source checkpoint selects the reviewed
Plan 091 tooling overlay. Each scored workspace must pass its own baseline.
PostgreSQL uses the existing isolated EVAL service on loopback 55437; unrelated
project service on 55433 must not be touched.

Global CLI and fresh campaign packages select beta.141. Both Codex homes retain
their shared hooks.json target and unrelated handlers. Nonparticipating hook
checks passed under minimal PATH; an absent explicit pin fails without fallback.
Historical EVAL runtimes remain unchanged. Scoped cleanup retired old failed
AGY/OpenCode local processes without changing their historical outcome.

Full profiles: OpenCode and ZCode GLM-5.3-Flash/max; AGY
gemini-3.8-flash/high; Codex gpt-6-luna/xhigh; Grok grok-4.7/high.
All Judges use gpt-6.1-sol/high. Existing Luna/ZCode Decisions profiles retain
gpt-6-luna and confidence threshold 0.7. No stop_after is selected.

Private local gate/qualification receipts:
`_artifacts/dd-flow-beta141-acceptance.JRWaA5/`.
Fresh homes: `~/.dd-eval/qualification/cp-235-<harness>-full`.
Compatibility/capacity, definition admission, preflight and actual launch remain
separate checks; this record does not claim they all completed.
