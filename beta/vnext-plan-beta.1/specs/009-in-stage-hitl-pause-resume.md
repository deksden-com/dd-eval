---
file: 'beta/vnext-plan-beta.1/specs/009-in-stage-hitl-pause-resume.md'
description: 'A user answer pauses and resumes the current stage; it never creates a flow transition.'
status: 'DRAFT'
supersedes:
  - 'waiting_for_user stage-finish routes in beta vNext specifications'
---

# 009 — In-stage HITL pause and resume

## Goal

Make a material user question a normal interruption of the current work, not
a completed stage or a synthetic edge in the Flow graph.

```text
stage start → agent work → stage pause → user answer → stage resume → agent work → stage finish
```

`stage finish` is reserved for an actual outcome. `waiting_for_user` is not a
vNext stage outcome and is not a graph transition.

## Contract

`dd-flow stage pause <RUN> --stage <stage> --work <WORK> --question-stdin`
accepts the exact user-facing question packet and:

- writes it under `RUN/intake/hitl/HITL-NNN-<stage>/question.md`;
- sets the current Work and stage to `paused` without closing its
  `work_sessions` link or completing its attempt;
- derives RUN status from unfinished leaf Works: it is `paused` only when all
  such Works are paused, otherwise it remains `running`;
- appends `stage_waiting_for_user` to the RUN timeline;
- returns `user_message`, an exact `resume_command`, and a heredoc-ready
  `resume_command_template`.

The returned command must include `DD_FLOW_HOME=<selected-home>` whenever the
runtime is not the default home. The agent does not reconstruct identifiers or
choose a new workspace.

After the user answers, the next agent Turn first runs:

`dd-flow stage resume <RUN> --stage <stage> --work <WORK> --answer-stdin`

with the complete raw answer. `resume` requires a fresh matching PreToolUse
hook event, stores `answer.md` next to the question, restores the same Work and
stage to `running`, appends `user_answer_received` and `stage_resumed`, and
returns the original stage prompt plus a bounded HITL context block. No new
RUN, Work, attempt, or stage-start action is created.

The normal path uses the same provider Session and keeps its open Work/Session
link. If an explicit fresh Session resumes the Work, the engine closes only the
old execution link and opens one replacement link from the trusted hook; the
Work and attempt remain the same.

## Flow consequences

Every vNext user question is handled by the stage that discovered it:

- SPECIFY pauses and resumes SPECIFY;
- PROTOCOLIZE pauses and resumes PROTOCOLIZE;
- PLAN pauses and resumes PLAN;
- PLAN-REVIEW pauses and resumes PLAN-REVIEW.

In particular, remove `PROTOCOLIZE.requirement_gap → SPECIFY.remediation` and
all fictional `*.answer`/`*.wait_user` entries. Re-entering an earlier stage
would repeat grounding and deterministic preparation, risk duplicate durable
writes, and make the current Work/attempt ambiguous.

An inter-stage edge is legal only after a real `stage finish` outcome.

## Acceptance checks

1. A pause creates no stage report, receipt, or archived attempt.
2. The question and answer are preserved byte-for-byte in RUN intake.
3. The resumed stage retains its stage directory and attempt id.
4. The Work is `paused → running`; its normal Session link remains open for a
   same-session resume.
5. The hook observes and claims the resume command, so session and later usage
   evidence remain attributable.
6. The continuation packet tells the agent to continue the same stage and
   contains the original prompt, question, answer, and exact completion path.
