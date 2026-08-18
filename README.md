# dd-eval

Evaluation workspace for AI coding agents working with the Memory Bank and
`dd-flow` lifecycle.

The evaluated project is [`deksden-com/dd-tasks`](https://github.com/deksden-com/dd-tasks).
This repository owns the evaluation cases, prompts, reference answers, runner
CLI, review rules, and collected results. None of those materials belong in an
agent's task repository.

Flow and engine changes are exercised before canonical release through the
[beta contour](runbooks/beta-contour.md). It reuses project-local flow packs,
router-installed engine snapshots, immutable checkpoints, and the normal eval
runner rather than introducing a separate beta toolchain.

Current beta specifications live under [beta/](beta/README.md); they document
candidate behavior without consuming canonical `SPC-*` numbering.

Repository-level eval design specifications live under [specs/](specs/). The
`sdlc-eval-2026-summer` suite is defined by
[specification 001](specs/001-sdlc-eval-2026-summer.md); its canonical
stage-checkpoint execution model is refined by
[specification 002](specs/002-canonical-stage-checkpoint-evaluation.md) and the
[launch-readiness cutover](specs/003-canonical-eval-launch-readiness.md), plus
the [operator runbook](runbooks/canonical-stage-checkpoints.md). Non-Git attempts,
canonical snapshots and retention follow the [storage runbook](runbooks/eval-storage.md).

## Evaluation model

An evaluation run starts from an immutable `dd-tasks` checkpoint and measures a
specific harness/model profile, not a model in isolation.

The active planning suite follows the actual vNext order:

1. **Planning:** `SPECIFY → PROTOCOLIZE → PLAN → PLAN-REVIEW`. The initial
   request is deliberately incomplete. Score relevant gaps, questions, the
   portable handoff, executable plan, and any material review findings.
2. **Implementation:** is a separate future suite. It will receive an accepted
   `ready_for_code` package and score flow conformance, implementation quality,
   and deterministic acceptance scenarios.

Reviews must distinguish three things:

- the agent found and read the applicable project and flow rules;
- it applied those rules correctly;
- the resulting specification, plan, or code is good.

Hidden checks may hide how a requirement is tested, but must not introduce a
requirement absent from the task, clarification packet, project Memory Bank, or
existing code contract.

Initial profiles:

- canonical: Codex CLI, `gpt-5.6-sol`, reasoning `high`;
- planning comparison: Grok Build, `grok-4.5`;
- implementation comparisons: the two profiles above plus OpenCode,
  `deepseek-v4-flash`, thinking mode.

Every result records the harness and version, model, reasoning mode, tool and
network permissions, flow revision, source checkpoint, prompts, duration, token
usage when available, Git diff, verification output, and review output.

## Harness default

Run an eval in a separate, visible Codex Desktop task by default. It preserves
the real harness session identity, makes progress inspectable, and exercises
the installed hooks as the target environment does. Do not use `codex exec`
for a normal eval run. It is allowed only for an explicitly labelled CLI-harness
case or a narrowly scoped mechanical smoke check; such a run is not comparable
to a Desktop-harness result.

Every delegated agent in a flow eval must correspond to a registered Work.
Its first lifecycle action is the exact token-free `dd-flow work start`
command returned by the engine; its last flow-owned lifecycle action is
`work finish` or `work fail`. The Codex hook, not the model, supplies identity.
Results preserve Session id, provider `session_id`, optional child `agent_id`,
parent Session and transcript path for the root and every child. Provider
`turn_id` remains raw hook/JSONL metadata for usage calculation, not a dd-flow
entity. Work completion does not claim that the external agent has stopped.

## Complete `dd-tasks` product

`dd-tasks` is a small team task tracker. It is intentionally ordinary: enough
real application surface to expose planning and implementation mistakes without
turning the product itself into the experiment.

### Product rules

- A user can belong to multiple workspaces.
- A workspace contains members, projects, tasks, labels, comments, and activity.
- Workspace roles are `owner` and `member`. Owners manage membership; both roles
  can work with projects and tasks.
- Every protected read and write is scoped to a workspace membership.
- Data is persisted in PostgreSQL. The browser never owns canonical task state.
- Destructive actions require explicit confirmation.
- All timestamps are stored in UTC and rendered in the user's local time.
- Concurrent writes must not silently overwrite a newer task version.
- Demo data and AI behavior used by automated tests are deterministic.

### Technology

- TypeScript throughout;
- pnpm workspace monorepo;
- React, Vite, Tailwind CSS, and shadcn/ui for the web application;
- Hono for the HTTP API;
- PostgreSQL with Drizzle ORM and migrations;
- Biome for formatting and linting;
- `tsc --noEmit` for type checking;
- Vitest for unit and integration tests;
- Playwright for end-to-end scenarios;
- isolated Exe.dev deployments with web, API, and PostgreSQL;
- no cron jobs, polling loops, or other idle background work.

The product repository contains only the application and its project Memory
Bank. Evaluation orchestration remains here.

### Epic 1: application foundation

- pnpm workspace with `apps/web`, `apps/api`, and shared packages only when code
  is genuinely shared;
- local development and test commands from the repository root;
- environment validation with safe example values;
- API health endpoint and web error boundary;
- Drizzle schema, migrations, deterministic seed, and database reset command;
- structured API errors with a stable error code and request ID;
- CI-equivalent commands for format, lint, typecheck, test, build, and E2E.

### Epic 2: accounts and workspaces

- register, sign in, sign out, and persistent server-side session;
- create a workspace and switch between accessible workspaces;
- view workspace members;
- owner can invite an existing user by email and remove a member;
- the last owner cannot remove or demote themselves;
- authorization is enforced by the API, not only hidden in the UI.

Email delivery, password recovery, social login, and enterprise identity are out
of scope.

### Epic 3: projects

- create, rename, archive, restore, and list projects;
- project fields: name, optional description, color, archived state, creator,
  created time, and updated time;
- archived projects are read-only until restored and are hidden by default;
- project pages show task counts by status.

### Epic 4: tasks

- create, view, edit, and delete tasks inside a project;
- task fields: title, description, status, priority, assignee, due date, labels,
  creator, timestamps, and version;
- statuses: `todo`, `in_progress`, and `done`;
- priorities: `none`, `low`, `medium`, `high`, and `urgent`;
- assignee must be a current workspace member;
- labels belong to a workspace and have a unique name and color there;
- optimistic UI is allowed, but failed writes restore the last confirmed state;
- stale updates return a conflict that the UI explains and can recover from.

Subtasks, recurring tasks, dependencies, time tracking, attachments, and custom
fields are out of scope.

### Epic 5: task views and discovery

- project list view with sorting and pagination;
- project board with one column per status and drag-and-drop status changes;
- filters for status, priority, assignee, label, and overdue state;
- text search over task title and description;
- filter and search state is reflected in the URL;
- empty, loading, error, and no-results states are explicit;
- saved views and cross-workspace search are out of scope.

### Epic 6: collaboration and history

- add and delete one's own plain-text comments on a task;
- show a chronological task activity feed;
- record task creation and changes to status, priority, assignee, due date, and
  labels;
- activity events are append-only and name the actor and time;
- no mentions, reactions, rich text, notifications, or real-time sockets.

### Epic 7: AI assistance

AI actions are manual, observable, and non-authoritative. They never mutate a
task without user confirmation.

- **Task triage:** suggest priority, labels, assignee, and a short rationale from
  task content and current workspace data. The user can apply all or selected
  suggestions.
- **Project digest:** summarize current project progress, overdue work, and
  blockers on request.
- one shared server-side AI execution path owns provider calls, validation,
  timeouts, retry limits, usage metadata, and error mapping;
- validated structured output is required before suggestions reach the UI;
- each execution records feature, model/provider profile, status, timing, token
  usage when available, and failure code without storing secrets;
- automated tests use a deterministic fake provider; live credentials are only
  needed for an explicit live run;
- no autonomous agent, embeddings, vector database, scheduled digest, or
  background AI processing.

### Epic 8: operations and quality

- readiness endpoint verifies required dependencies without exposing secrets;
- graceful shutdown and useful startup errors;
- request logging with request IDs and redaction of credentials and session
  tokens;
- accessible keyboard operation, visible focus, associated form labels, and
  status messages that do not rely on color alone;
- responsive layouts for laptop and narrow mobile widths;
- deterministic acceptance scenarios cover authentication, workspace isolation,
  core task work, conflict handling, comments/activity, and both AI features;
- no billing, analytics platform, file storage, external integrations, native
  mobile app, localization, or offline mode.

## UI

The UI is built with Tailwind CSS and shadcn/ui components. It is functional
and quiet: neutral surfaces, one accent color, compact controls, readable
typography, and no decorative dashboard widgets. Existing shadcn/ui components
are preferred over custom equivalents.

Primary routes and screens:

- `/login` and `/register`: minimal account forms;
- `/`: redirect to the last workspace or workspace creation;
- `/w/:workspaceId`: workspace overview with active projects and task summary;
- `/w/:workspaceId/projects/:projectId`: list/board switch, search, filters, and
  create-task action;
- `/w/:workspaceId/tasks/:taskId`: task details, editable fields, comments,
  activity, and AI triage;
- `/w/:workspaceId/digest`: on-demand project digest;
- `/w/:workspaceId/settings/members`: membership management.

Persistent layout:

- top bar: workspace switcher, current location, user menu;
- sidebar: overview, projects, digest, and member settings when allowed;
- main content: page heading and primary action followed by the relevant view;
- task details use a normal page on narrow screens and may use a side panel on
  wide screens, while retaining a shareable URL.

Keyboard and screen-reader behavior is part of acceptance, not a later polish
phase. Native controls are preferred over custom widgets.

## Checkpoints

The complete product is reached through small, immutable checkpoints. A
checkpoint is accepted only when code, tests, and the project Memory Bank agree.

Suggested sequence:

1. `checkpoint-00-initial`: repository intent only; no application or Memory
   Bank yet.
2. `checkpoint-01-foundation`: monorepo, web/API/PostgreSQL skeleton, quality
   commands, seed/reset, and initialized Memory Bank.
3. `checkpoint-02-core`: accounts, workspaces, projects, and basic task CRUD.
4. `checkpoint-03-collaboration`: complete task views, filters, comments,
   activity, and conflict handling. This is the primary baseline for feature
   evaluations.
5. `checkpoint-04-ai-foundation`: shared AI execution path and project digest;
   task triage remains available as the first AI feature evaluation case.
6. `checkpoint-05-complete`: all product behavior above is accepted.

Exact case boundaries may change while authoring the canonical implementation,
but a published checkpoint never moves. Use annotated Git tags pointing to an
accepted commit.

## Active SDLC suite

The command-line executable is named `dd-eval`. `dd-deval` is not an alias and
must not appear in manifests, documentation, reports, or automation.

The commands below implement the `case@3` contract from specification 002.
Portable stage fixtures are not executable input for a scored run.

`sdlc-eval-2026-summer-task-priority` is the initial bounded planning case. It
supports independent checks of `SPECIFY`, `PROTOCOLIZE`, `PLAN` and
`PLAN-REVIEW`, plus a pre-CODE end-to-end contour ending at
`plan_review_accepted`.

The case binds its exact product checkpoint, flow-pack commit and engine commit
in `case.json`; checkpoints and product tags remain separate namespaces.

```sh
dd-eval validate --case sdlc-eval-2026-summer-task-priority
dd-eval prepare \
  --case sdlc-eval-2026-summer-task-priority \
  --focus specify,protocolize,plan,plan-review --e2e
```

To evaluate a contiguous handoff in one Subject continuation, prepare it
separately:

```sh
dd-eval prepare \
  --case sdlc-eval-2026-summer-task-priority \
  --segment plan..plan-review
```

Each case has versioned default profiles. The current summer case runs the
Subject as `gpt-5.6-luna` with `xhigh` reasoning and the independent Judge as
`gpt-5.6-sol` with `high` reasoning. Pass any `--controller-profile`,
`--subject-profile`, or `--judge-profile` flag only for an explicit per-run
override; the manifest records both the effective profile and whether it came
from the case default or command line.

`prepare` resolves the selected canonical stage-entry checkpoint, restores an
independent copy of its exact project and RUN, and returns the frozen Subject
checkpoint Session plus ordinary continuation packet. It never reconstructs a
later stage from a portable semantic fixture. The Subject never receives
evaluation wording, rubrics or expectations. Draft checkpoints and draft expectations
fail closed.

The Controller records every root/child session, syncs engine-owned runtime
evidence and usage when available, checkpoints candidate artifacts, then gives
a clean Judge session only the corresponding packet. Final reports are rendered
from accepted Judge results.

The older smoke-run material below is retained as historical evidence; it is
not an active CLI contract.

## Materialized run repositories

The `dd-eval` CLI exports the tree from an exact `dd-tasks` commit into a
new repository. It does not give the agent the canonical repository's history,
remote, later refs, evaluation cases, rubrics, clarification answers, or
reference result.

A run repository starts with one `eval-input` commit. The agent's final state is
tagged or committed as `eval-output`. The run manifest retained here binds both
states to the case, profile, prompts, and verification evidence.

After the smoke run, the next CLI increment validates a case, collects the
result, runs deterministic checks, and produces a report. Automatic harness
execution and Exe.dev lifecycle management are added only after one full manual
evaluation proves the required interface.

### Memory Bank 2.16.0 rerun

The first controlled flow-version rerun keeps `EVAL-001-task-priority` and its
prompts/rubric unchanged while selecting a second immutable checkpoint:

```text
node ./bin/dd-eval.mjs prepare \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-2-16-0 \
  --profile codex-desktop-gpt-5-6-luna-max \
  --track planning \
  --output /absolute/path/to/run-repository
```

`cp-002-mb-2-16-0` has the same application code as `cp-002`; only the project
Memory Bank is upgraded. It resolves to published tag
`eval-cp-002-mb-2-16-0`, commit `65c4e97`, Memory Bank `2.16.0`, and canonical
flow-pack commit `4f98e82`.

The operator runbook is
`cases/EVAL-001-task-priority/runbook-mb-2-16-0.md`. Controller prompts remain
outside the materialized repository. After the run, `dd-eval collect` combines
the sanitized Codex JSONL summary with optional `dd-flow` timeline, usage, and
flag projections. It records unavailable usage honestly and never copies raw
prompt, response, reasoning, or tool-argument content.

### Memory Bank 2.17.0 rerun

The second controlled flow-version rerun uses checkpoint
`cp-002-mb-2-17-0`, published tag `eval-cp-002-mb-2-17-0`, Memory Bank
`2.17.0`, and the same application tree and EVAL-001 user materials. Its
operator runbook is
`cases/EVAL-001-task-priority/runbook-mb-2-17-0.md`.

The controller is deliberately split into two goals. Goal A ends at
`waiting_for_user`; only then does the controller deliver the exact canonical
clarification packet and Goal B continues through PLAN to `ready_for_code`.
The run manifest stores SHA-256 for all operator materials so packet mismatch
is a run-validity failure, not a model-quality defect.

### Memory Bank 2.18.0 rerun

The third controlled flow-version rerun uses checkpoint
`cp-002-mb-2-18-0`, published tag `eval-cp-002-mb-2-18-0`, Memory Bank
`2.18.0`, CLI `0.4.2`, and the unchanged EVAL-001 application tree and operator
materials. Its operator runbook is
`cases/EVAL-001-task-priority/runbook-mb-2-18-0.md`.

This rerun measures the adaptive local-first routing, simplified capacity and
semantic-launch accounting, guarded execution-flag correction, and complete
stage wall-clock observability introduced by the updated flow.

### Memory Bank 3.0.0 Goal-A rerun

The next controlled run uses `cp-002-mb-3-0`, published tag
`eval-cp-002-mb-3-0`, Memory Bank `3.0.0`, and CLI `0.5.0`. It starts with the
incomplete-input SPECIFY goal only. The exact operator procedure and stop gate
are in `cases/EVAL-001-task-priority/runbook-mb-3-0-0-specify.md`; the
clarification packet is deliberately not delivered until that gate passes.

### Memory Bank 3.2.0 Goal-A rerun

The current treatment uses immutable checkpoint `cp-002-mb-3-2-0`, published tag
`eval-cp-002-mb-3-2-0`, Memory Bank `3.2.0`, flow pack commit `2a1aaec`, and
CLI `0.7.0`. It uses the
`codex-desktop-gpt-5-6-luna-max-dd-flow-0-7-0` profile and runs Goal A only:
CLI-owned bootstrap plus SPECIFY, stopping at `waiting_for_user`. The operator
procedure is `cases/EVAL-001-task-priority/runbook-mb-3-2-0-specify.md`.

## Exe.dev checkpoint previews

Canonical checkpoint previews use one isolated Exe.dev VM per accepted source
snapshot. The current `cp-002` reference target is
[`ddtasks-cp02`](https://ddtasks-cp02.exe.xyz): a public Exe.dev HTTPS share with
application registration closed. It is a review environment, not a production
claim. Its manifest binds the VM name, source commit, Memory Bank/flow revision,
URL, access mode, and verification evidence.

One Docker Compose contour on the VM owns:

- PostgreSQL on an internal network with a persistent named volume;
- the Hono API, reachable only from the web proxy/container network;
- the production React build served through a small reverse proxy on port
  `8000`, with `/api` routed to Hono;
- health and deterministic seed/reset commands for preview verification.

Exe.dev terminates HTTPS and proxies the VM hostname to port `8000`. New preview
operations remain private and closed by default; the current public+closed mode
was an explicit deployment decision and does not bypass application login or
workspace authorization. No cron, polling, analytics, worker, or other idle
background workload is added. The preview is rebuilt from its exact source
commit rather than patched by hand.

For later visual comparison, accepted eval outputs may receive separate
short-lived VMs or copies of a prepared VM. Do not create a VM for every failed
or incomplete run: deterministic checks happen first, and deploy is reserved for
results worth inspecting. Current Exe.dev public CLI documentation exposes VM
creation, copy, restart, and deletion, but no stable stop command. Until the
account-specific lifecycle is verified, `dd-eval` must treat delete-and-recreate
as the dependable zero-runtime lifecycle and must not claim pause/resume support.
