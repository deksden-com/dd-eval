# Canonical checkpoint review — SPECIFY entry

- Revision: `REV-060`
- RUN: `RUN-001-task-priority`
- Pair: flow pack `3.2.0-vnext-plan-review-beta.117`; engine `0.8.0-beta.116`

The captured project is clean on `main` at the pinned flow-pack commit.  The
isolated runtime contains exactly one RUN, has no stage attempts, active Work,
or bound Session, and declares `start_specify` as the only legal next action.
The Subject discussion has settled the four priority values and default without
creating a protocol or product artifact.  The frozen Session is an untouched
fork of that idle discussion state.

Accepted as the immutable entry for SPECIFY.
