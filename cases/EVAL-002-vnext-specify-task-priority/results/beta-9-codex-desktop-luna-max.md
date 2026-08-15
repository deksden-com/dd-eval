# Beta 9 native-fork SPECIFY run

- Checkpoint: `cp-002-vnext-specify-beta-9`
- Engine: `dd-flow-cli@0.8.0-beta.8`, bound integrity
  `c50ae96869836c2e54049dc76c37773aa7f55f0b6836b3876f0988f5fb43f825`
- Flow pack: `3.2.0-vnext-specify-beta.9`
- Forked worker session: `01a001ce-44ed-7f31-9028-ea57c264fe91`
- Parent primed-discussion session: `01a001c8-b6f4-7cd3-bc18-e5fb9df27c73`
- RUN: `RUN-001-task-priorities`
- Work: `WORK-26dae725-2987-46ff-92c1-e0860d8b127f`

## Mechanical outcome

Passed on the intended normal route: prime the project, discuss the feature,
fork the session, then send only “Ок, давай оформим протокол.” The worker
started SPECIFY through `dd-flow stage start`, wrote the semantic result and
finished through the one allowed `dd-flow stage finish` invocation. No
clarification packet, manual session id or runtime-state patch was used.

The run is `done` / `specified`; `next_action` is `start_protocolize`. The
measured stage duration is 332855 ms; the forked worker session took about
428480 ms end-to-end.

## Semantic outcome

The result correctly applies `use_case_analysis` and
`entity_operation_crud_plus` as light methods, marks all other methods
inapplicable with reasons, and resolves three non-blocking/defaultable gaps.
It preserves the requested vertical slice: `low`/`medium`/`high`, default
`medium` for new and legacy tasks, create/edit/list surfaces, unchanged
authorization and archived-project behavior, invalid-value rejection, and no
sorting or filtering. It supplies a compact PROTOCOLIZE handoff with an
acceptance scenario and verification seeds.

Beta-9 additions are present: policy facts are held in
`policy_context.findings`, and the actor-visible journey makes
`use_case_analysis` applicable rather than silently skipping it.

## Observability findings

The hook bound the real fork session automatically; `timeline.jsonl` records
`session_bound`, `stage_attached`, `work_waiting_for_agent`,
`stage_completed`, `session_stopped`, `run_completed` and `work_completed` in
order. The run records measured stage timing and the actual worker session.

Two remaining engine defects were observed:

- `run.json.artifacts` advertises `stage-report.json`, `stage-report.md`,
  `stage-report.html` and `summary.md`, but none was materialized in the RUN
  home. The per-stage deterministic `specify-result.md` exists.
- `usage_coverage` in `run.json` remains at its initial `unavailable` value,
  although SQLite contains measured run-start, stage-start, stage-finish and
  run-finish snapshots for the bound Codex JSONL. This is a stale projection,
  not missing usage. The lifecycle snapshot also precedes the worker's final
  textual response, so it omits the post-`stage finish` tail of the agent turn.

## Evidence

- [Result JSON](/Users/deksden/.dd-flow/projects/PRJ-043-run/runs/RUN-001-task-priorities/01-specify/specify-result.json)
- [Result Markdown](/Users/deksden/.dd-flow/projects/PRJ-043-run/runs/RUN-001-task-priorities/01-specify/specify-result.md)
- [Rendered worker prompt](/Users/deksden/.dd-flow/projects/PRJ-043-run/runs/RUN-001-task-priorities/01-specify/prompt.md)
- [Run state](/Users/deksden/.dd-flow/projects/PRJ-043-run/runs/RUN-001-task-priorities/run.json)
- [Timeline](/Users/deksden/.dd-flow/projects/PRJ-043-run/runs/RUN-001-task-priorities/timeline.jsonl)
