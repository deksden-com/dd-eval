# Eval storage and cleanup

## Root and retention

Use an absolute `DD_EVAL_HOME` (default `~/.dd-eval`) for all mutable EVAL data:

~~~text
canonical/<case>/REV-<NNN>/   immutable accepted project/runtime snapshots
runs/<EVAL-id>/              isolated executions, journals and evidence
tmp/                        disposable command staging
~~~

Keep definitions, accepted checkpoints and compact results in Git. Do not create
EVAL checkouts under `_Projects` or use `canonical/` as a writable runtime.
Retain compact verdicts/timings/defect evidence; keep full executions while needed
for investigation or recovery. Never delete credentials, accepted qualifications,
current canonical revisions or engine snapshots referenced by retained runs.

## Before every campaign

1. List previous EVALs in the relevant homes and inspect `runner status`, retained
   daemon ownership and OS process identity (PID **and start time**). An old
   timestamp, quiet root or expired lease alone does not prove a hung agent.
2. Stop leftover daemons of completed/failed/explicitly abandoned EVALs through
   their retained owner, using the commands below. Include Subject, children,
   Final/Interaction Judge and qualification attempts; they have separate owners.
   Verify process exit and owned-resource settlement before deleting their files.
3. Close deferred investigation cleanup. Remove disposable invocation/test
   databases from previous attempts once no retained investigation or live owner
   needs them; keep the shared foundation database. See database rules below.
4. Clean disposable execution data older than 30 days. Use a fixed UTC cutoff and
   the last terminal/cleanup timestamp, not the directory name. Use existing GC;
   its default plan has **no age filter** and also
   selects recent runs. Restrict the plan before applying it. Failed, blocked or
   resumable runs require explicit retirement, not deletion based on age.
5. Reuse/start only the project-owned PostgreSQL service. Do not launch into an
   unresolved old owner/resource conflict; unrelated active EVALs are not garbage.

~~~sh
node bin/dd-eval.mjs storage ls
node bin/dd-eval.mjs storage status
node bin/dd-eval.mjs gc plan
node bin/dd-eval.mjs gc apply --plan <reviewed-plan-file>
~~~

Run each command with the selected `DD_EVAL_HOME`. GC rechecks runtime ownership;
never recursively delete the home or remove a live daemon's state/socket files.

## Stop leftover daemons

Use the retained EVAL's pinned engine, configuration and resource home:

~~~sh
node bin/dd-eval.mjs runner status --eval <absolute-eval-root>
node bin/dd-eval.mjs runner control stop --eval <absolute-eval-root> --request-id <new-id>
node bin/dd-eval.mjs runner control status --eval <absolute-eval-root>
~~~

For an already failed EVAL with an existing stop control or a retained Final
Judge verdict, `runner cleanup --eval <root> --request-id <new-id>` reconciles
owned shutdown; it is **not** a general daemon sweep. Interaction/qualification
Judges need their own retained adapter's scoped `daemon stop`, bound to their
state directory, runtime and owner configuration. Do not invent ownership or
use a global replacement adapter. Unknown ownership or an unreachable live
endpoint needs scoped investigation, not `pkill`, a PID-only kill or a restart.
Preserve the original failure/verdict; cleanup never sends a productive prompt.

If a historical pinned CLI cannot retire its failed native owner, use a checked
newer maintenance CLI's `runtime scope stop --scope-id <EVAL-id> --request-id <id>`
with a separate maintenance `DD_FLOW_HOME` and the **original** resource home.
Keep the old RUN engine, adapter, Sessions and evidence unchanged. This path must
verify retained registration, lease token and physical birth before stopping an
owner; never substitute a PID-only kill. Retain the stop receipt and verify exit.
`physical_stopped=true` permits a fresh isolated campaign after resource-conflict
checks; `settled=false` still records unresolved native shutdown, not clean PASS
or permission to resume/delete the old evidence.

## Database rules

- Target the verified local project server, not an ambient/remote `DATABASE_URL`.
  Protect templates, `postgres`, `dd_tasks_foundation_local` and unrelated data.
- Drop only exact disposable test/invocation databases with proven ownership,
  no retained dependency, clients or prepared transactions. Recheck name/OID/owner
  immediately before quoted `DROP DATABASE`, without `FORCE`; verify absence.
- For legacy/unreceipted databases, prove both test-fixture identity and age over
  30 days; dump and verify a backup first. PostgreSQL has no catalog creation
  date: names/OIDs are not age evidence. Use retained timestamps, or old fixture
  initialization plus pre-inspection file timestamps. Uncertain targets stay.
- Never delete PostgreSQL files directly, remove a shared volume or kill foreign
  connections. Age is a cleanup candidate, not authority to erase unknown data.

## Container retirement after an eval

After **success, error, cancellation or failed preparation**, save the result and
stop owned daemons, workers/checks and the PostgreSQL container. Wait for required
capture/Final Judge to finish first; a semantic verdict is not physical shutdown.

For a shared container, stop after its **last consumer**, including local
development, has finished. Check owners/processes as well as `pg_stat_activity`:
zero connections alone does not prove nobody will reconnect.

~~~sh
docker stop <verified-container-id>
docker inspect --format '{{.State.Running}}' <verified-container-id>
~~~

Keep volumes/images. Preserve investigation data in stopped storage or a verified
dump by default; keep a live daemon/DB only when the investigation actually needs
it. Note the EVAL, exact resource and reason in the work summary, then close that
deferral **before the next campaign using those resources**. Do not interrupt an
unrelated live owner. Cleanup failure stays visible separately from the verdict.
No broad Docker prune, `down -v` or force-removal.
