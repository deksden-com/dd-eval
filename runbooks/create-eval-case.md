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

Project/RUN checkpoint archives remain immutable canonical inputs. They do not
need a duplicate starter layer: `dd-eval prepare` always restores them into a
new attempt directory.

## Case files

Commit these definition files under `cases/<case-id>/`:

```text
case.json
checkpoints/<stage>.json       canonical and frozen checkpoint Session IDs
starter-sessions.json          current starter Session IDs
scenarios/                      versioned comparison plans
prompts/                       versioned ordinary Subject inputs
interactions/                  declared HITL responses
rubrics/                       Judge criteria
expectations/                  accepted references when available
```

`starter-sessions.json` is deliberately small:

```json
{
  "schema_id": "dd-eval/starter-sessions@1",
  "case_id": "<case-id>",
  "canonical_chain_id": "<chain-id>",
  "sessions": {
    "specify": {
      "checkpoint_id": "<checkpoint-id>",
      "session_id": "<starter-session-id>"
    }
  }
}
```

Add one entry for every runnable stage. Do not copy canonical Session IDs into
this registry; they already live in the checkpoint records. An attempt copies
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

1. Freeze the case inputs: project checkpoint, matched engine/flow pack,
   profiles, prompts, interactions and rubrics.
2. Build the single canonical Subject chain using
   [the eval execution runbook](execute-eval.md).
3. At every accepted stage entry, store the moving canonical Session ID and
   untouched frozen checkpoint Session ID in
   `checkpoints/<stage>.json`.
4. For each accepted checkpoint, fork the frozen Session once, title the child
   `START <case-id> <STAGE>-entry`, and send it no message.
5. Record only that child ID and checkpoint identity in
   `starter-sessions.json`.
6. Verify every starter is reachable, idle and directly parented by the
   expected frozen checkpoint Session.
7. Commit and push the case definition and current starter registry.
8. Run authoring/scored validation before the first attempt.

If the case will compare a fixed profile matrix, add one scenario under
`scenarios/`. Keep generic lifecycle rules in `runbooks/execute-eval.md`; the
scenario contains only the concrete profiles, selections, order and comparison
policy.

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
