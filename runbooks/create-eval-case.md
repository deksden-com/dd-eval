# Create an eval case

This runbook creates a versioned eval case, its canonical stage checkpoints and
the starter Sessions used by routine eval runs.

## Session layers

Each focused stage has three Session layers:

```text
frozen canonical checkpoint Session
  -> untouched starter Session
    -> disposable evaluated Session
```

- The canonical Session is recovery material. Routine Controllers neither
  inspect it nor fork it.
- The starter Session is an untouched buffer. Routine Controllers know and
  fork only its ID.
- The evaluated Session is a fresh child created for one attempt. All Subject
  prompts and work go there.

Starter Sessions have no revisions. If one is accidentally advanced, replace
it with a new untouched fork of the same canonical checkpoint Session.

The starter is model-neutral conversational history. A routine attempt forks
it, then explicitly selects the evaluated model and reasoning effort on the
first new message. Therefore a stage has one starter, not one starter per
model. The observed provider profile is checked before the result is scored.

Project/RUN checkpoint archives remain immutable canonical inputs. They do not
need a duplicate starter layer: `dd-eval prepare` always restores them into a
new attempt directory.

## Case files

Commit the case files and its one shared input checkpoint:

```text
checkpoints/<input-id>.json                 SSOT for the project, flow-pack and engine pair
cases/<case-id>/case.json                   points to that input checkpoint by id
cases/<case-id>/checkpoints/<stage>.json    canonical and frozen checkpoint Session IDs
cases/<case-id>/starter-sessions.json       current starter Session IDs
cases/<case-id>/scenarios/                  versioned comparison plans
cases/<case-id>/prompts/                    versioned ordinary Subject inputs
cases/<case-id>/interactions/               declared HITL responses
cases/<case-id>/assessment.json             accepted criteria and golden reference
```

`starter-sessions.json` is deliberately small and stage-keyed:

```json
{
  "schema_id": "dd-eval/starter-sessions@3",
  "case_id": "<case-id>",
  "revision": "REV-<NNN>",
  "sessions": {
    "specify": {
      "session_id": "<starter-session-id>",
      "parent_session_id": "<frozen-checkpoint-session-id>"
    }
  }
}
```

Add one entry for every runnable stage. `revision` must equal the one shared by
all canonical checkpoint records and every parent is that stage's frozen
checkpoint Session. An attempt copies
the resolved starter ID into its own `sessions.json` together with the new
evaluated child ID and their parent relationship.

ID ownership is fixed:

| ID | File | Reader |
| --- | --- | --- |
| moving canonical-chain Session | `checkpoints/<stage>.json` | checkpoint maintenance |
| frozen canonical checkpoint Session | `checkpoints/<stage>.json` | starter creation/recovery |
| current starter Session | `starter-sessions.json` | `dd-eval prepare` and Controller |
| evaluated Subject child and starter parent | attempt `sessions.json` | Controller, Judge and report renderer |
| Judge parent/child | attempt `sessions.json` | Controller and report renderer |

Do not add a revision field to a starter entry. Git history records ID
replacement, while the Session content remains defined by its canonical
checkpoint.

## Creation procedure

1. Create one immutable input checkpoint at
   `checkpoints/<input-id>.json`. It is the sole source of truth for the
   evaluated project source/tag/commit and its matched flow-pack and engine
   version/tag/commit. Put only `checkpoint.id` in `case.json`; do not repeat
   a pair SHA, version or tag in the case, a scenario, or a profile. Before
   creating the canonical chain, verify that this pinned pair is also declared
   by the archived project's `compatibility.json` and `manifest.json`, and that
   the isolated runtime contains exactly that engine. This prevents a
   plausible-looking archive and separately installed engine from failing at
   the first normal `stage start`.
2. Freeze the profiles, prompts, interactions and one accepted assessment.
   The assessment defines outcome/flow criteria, golden decisions, valid
   alternatives and known risks. Profiles describe
   the Desktop harness, model and reasoning only; they do not select an engine.
   Candidate files must include every semantic SSOT needed by the Judge and any
   deterministic projection whose integrity is scored as flow evidence. For the
   specification-006 contour this means both `specify.json` and `specify.md`,
   while `code-work-batch.json` is retained as generated evidence rather than a
   second semantic answer.
3. Build the single canonical Subject chain using
   [the eval execution runbook](execute-eval.md).
4. At every accepted stage entry, store the moving canonical Session ID and
   untouched frozen checkpoint Session ID in
   `checkpoints/<stage>.json`.
5. Fork every frozen checkpoint Session once. Title each untouched child
   `START <case-id> <STAGE>-entry` and send it no message.
7. Register each child by calling:

   ```sh
   dd-eval starter set --case <case-id> --stage <stage> \
     --session-id <starter-session-id> \
     --parent-session-id <frozen-checkpoint-session-id>
   ```

   The command checks the declared parent against the accepted frozen
   checkpoint and updates `starter-sessions.json`.
8. Verify every starter is reachable, idle and directly parented by its
   protected source Session.
9. Commit and push the input checkpoint, case definition and current starter
   registry.
10. Run authoring/scored validation before the first attempt.

If the case will compare a fixed profile matrix, add one scenario under
`scenarios/`. Keep generic lifecycle rules in `runbooks/execute-eval.md`; the
scenario contains only the concrete profiles, selections, order and comparison
policy. Resolve profile IDs from the current case; a scenario must never copy
the input checkpoint's beta version, tag or SHA.

## Starter recovery

Use this only when a starter was advanced, deleted or became unreachable:

1. stop routine launches for the affected stage;
2. read its canonical checkpoint record;
3. verify the frozen checkpoint Session and archive still match the accepted
   checkpoint;
4. fork that frozen Session and send the child no message;
5. give it the normal `START <case-id> <STAGE>-entry` title;
6. replace only that stage's `session_id` in `starter-sessions.json`;
7. verify parentage and idleness, then commit and push the registry change;
8. resume routine launches.

Do not create a new canonical-chain revision merely because a starter was
replaced. A canonical revision changes only when canonical conversation,
project/RUN state, engine/flow identity or accepted stage content changes.

## Routine launch boundary

The Controller follows
[the eval execution runbook](execute-eval.md). It obtains the
starter ID from `dd-eval prepare`; `prepare` reads it from the committed
`starter-sessions.json` and does not accept a manual override. The Controller
forks that Session, records the new child
with `parent_session_id=<starter-session-id>`, and sends the generated Subject
continuation only to the child.

The Controller must not read canonical Session IDs from checkpoint records.
Canonical access belongs only to case creation and starter recovery.
