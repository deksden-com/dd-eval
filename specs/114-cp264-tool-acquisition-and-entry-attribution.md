# 114 — CP264 tool acquisition and failed-entry attribution

Status: ready for implementation; readiness and ponytail review complete.
Authority: CP264 monitor, operator-authorized correction cycle **1 of 3**.
Failed EVAL: `EVAL-20261029141003-2bec686a`; engine beta.159/138ff716,
definition92a5cb82. Preserve this failure and every paid/native operation.
Product code, model, reasoning, Judge, capacity and canon are outside the fix.

## 1. Investigation: facts before interpretation

Times below are UTC on2026-10-29 (Kaliningrad is UTC+2).

| Time | Retained fact |
| --- | --- |
|14:11:41.909|SPECIFY attached; baseline admission had passed.|
|14:14:56.281|Canonical HITL answer applied; same Stage resumed.|
|14:23:30.700|SPECIFY accepted (`stage_completed`, status done).|
|14:23:43.877|Original native Turn completed normally.|
|14:23:50|Accepted boundary captured.|
|14:23:57|Fresh PROTOCOLIZE native Session created.|
|14:24:03|Agent invoked the issued `stage start --stage protocolize`.|
|14:24:04.103|Its CLI emitted `worktrunk-download/probe_started`.|
|14:26:05|Utility observation expired after120s with progress cursor0.|
|14:26:07|Controller interrupted the PROTOCOLIZE Turn and requested recovery.|
|14:26:08|Initial execution failure correctly attributed PROTOCOLIZE.|
|14:26:09 onward|Failure enrichment replaced attribution with SPECIFY.|

The exact failed subprocess was a GET of the pinned Worktrunk0.72.0 Apple
Silicon archive using `curl --fail --location --silent --show-error -o ...`.
No body bytes or diagnostic output were observed during its120-second window.
The engine already samples archive file growth: this is **not** a fixed timeout
mistakenly ignoring live model reasoning. Parent CLI heartbeats are not download
progress and must not reset the transfer observer.

Evidence root:
`/Users/deksden/.dd-eval/qualification/cp264-luna-full/runs/EVAL-20261029141003-2bec686a`.
Read `events.jsonl`, `reports/report.json`, the owning RUN timeline and
controller session1/session2 adapter journals. Lifecycle invocation
`02e4f6ef-5044-4753-b9b4-2be209fc7c6b` records the failed PROTOCOLIZE entry.
Its diagnostic artifact is `executions/e2e/dd-flow-home/diagnostics/cli/7afec6d7-93be-4047-93b5-5c805e0b6517.json`.
The raw native prompt later became interrupted; never replay it to investigate.

### Network hypotheses, not invented certainty

A current provider-free HEAD probe of that exact URL reproduced DNS success
(0.156s) followed by failure to establish TCP within10s: HTTP000, no TLS or
first byte. Historical curl DNS/connect/TLS timing was not retained, so the
historical underlying network phase remains unknown. This does not prove a
global GitHub outage, IPv6 defect, JWT expiry, model overload or authentication
failure. Do not change VPN/proxy/account settings to guess around it.

Primary sources checked: [curl options](https://curl.se/docs/manpage.html),
[GitHub connectivity troubleshooting](https://docs.github.com/en/get-started/using-github/troubleshooting-connectivity-problems),
[official Worktrunk0.72.0 release](https://github.com/max-sixty/worktrunk/releases/tag/v0.72.0).
Curl supports bounded native retries and a connection-phase deadline distinct
from a total transfer deadline. GitHub documents network/proxy/firewall causes;
its community also has release-redirect/JWT reports, but no such HTTP response
exists in our evidence. Keep those hypotheses separate from the confirmed bugs.

## 2. Confirmed systemic defects and smallest fixes

### D1 — per-RUN cache makes a stable prerequisite depend on live network

`dd-flow-cli/src/services/tooling.ts` currently stores Worktrunk under
`context.ddFlowHome/tools/wt/<version>/<platform>`. A fresh EVAL downloads the
same pinned artifact again, after the Subject has already completed SPECIFY.

Use explicit `DD_FLOW_RESOURCE_HOME` as the cache base, falling back to the
legacy Flow home when absent/empty. Keep existing version/platform layout,
manifest archive SHA, metadata schema, actual binary SHA and atomic publication.
Never substitute ambient Homebrew wt0.77 or an unverified binary for pinned0.72.
Do not overwrite a corrupt cache or a conflicting owner.

### D2 — download has no bounded native transient retries; error loses context

Keep the existing byte-growth sliding observer. Add standard curl retries:
initial request plus2 retries, small backoff, connect timeout30s (DNS/TCP/TLS
establishment only), retry connection refusal. No total transfer deadline,
forced IPv4/HTTP version, insecure TLS, mirror or retry-all-errors.
Use a monotonic cursor derived from the nonempty archive's `(size, mtimeNs)`
write marker (`statSync` with bigint). Zero-size resets update the baseline but
do not renew observation. A second attempt's writes renew observation even
below the first attempt's high-water mark or after truncate/regrow between polls.
Keep native curl retry; do not add an outer retry loop or parse progress text.

Catch acquisition observation/exit failures at the **tool capability boundary**,
not in a generic retry of Stage or provider prompts. Preserve tool, pinned
version/platform, URL, cache root, acquisition phase, exit/signal and original
typed cause. Use specific child phases (`tool-download`, archive listing,
extraction, version) instead of undifferentiated utility diagnostics.

Only confirmed stopped/clean acquisition can return `tool_unavailable`,
`phase=prepare`, `effect=no_effect`, `recoverable=true`. This means no productive
Git/Work/Stage effect, not that temporary cache files never existed. Unknown
child cleanup remains unknown/non-replayable. Integrity mismatches never become
successful availability or automatic replacement. Existing lifecycle successor/
retry-command handling is reused; no second retry framework is introduced.

### D3 — shared cache needs owned publication, not an orphanable empty lock dir

Reuse `acquireInstallationLock` with an identity derived from tool/version/
platform/expected archive SHA. Assert ownership before atomic publication and
release only the acquired owner token. Preserve dead-owner quarantine and refuse
unknown/foreign legacy lock objects; never delete another installer's lock.
A live competing installer is a precise preparation-pending/refusal, not tool
corruption or permission to launch a model without readiness. A cache published
in the race can be reverified and reused. Warm the common tool once before
parallel profile preparation; do not build another long-running wait framework.

### D4 — prerequisite acquisition first happens inside paid Stage entry

Add only one narrow provider-free CLI ingress, `tool ensure wt --json`, backed
by the existing installer/validator. Reject unknown tool names before cache or
SQL effects. Do not add a generic tool registry or a redundant status endpoint.

New checkpoints declare `preparation.managed_tools: ["wt"]` in their frozen
value. Validate an optional unique array of supported names at definition load;
reject malformed/duplicate/unknown names before invocation. `dd-eval` uses one
helper to prepare those declared tools:

- provider-free preflight, after exact engine admission and before prepared RUN;
- actual E2E, after exact engine admission and before baseline/Subject dispatch;
- a restored productive execution before dispatch when that checkpoint declares
  the requirement, without adding network work to status/control/recovery/Judge.

Record actual tool availability/version/checksums/cache root.
Do not duplicate the installer's checksum validation in dd-eval: validate the
ordinary CLI receipt shape and retain it; there is no new certificate registry.
Failure blocks
only preparation/dispatch, creates zero provider Sessions and does not revoke
accepted old results. Legacy checkpoints without this declaration keep their
original semantics; no retroactive qualification or relabelled guarantee.
Repeated cache verification is a cheap readiness read, not a test/model suite.

### D5 — failure enrichment regresses a failed next entry to accepted predecessor

`runner.mjs:5195` initially selects PROTOCOLIZE from `context_prepared`.
`enrichFailureEvidence` later calls `latestObservedStage`, which only sees
materialized stage records. Entry never materialized, so it returns accepted
SPECIFY and overwrites correct failure attribution. The projection then stores
that wrong `failure_stage`.

At failure enrichment, preserve the latest proven current context/controller
obligation as failure Stage, and retain accepted predecessor evidence separately.
Do not change `latestObservedStage` globally, infer attachment from a prompt, or
turn an accepted Stage into failed. The report must distinguish failed entry into
PROTOCOLIZE from the last completed SPECIFY. Preserve the freshest validated
execution context/controller obligation, not a static manifest entry-stage;
when none exists retain legacy observed-stage selection. Record
`last_completed_stage` separately and `pending_stage_entry` when the failed
target has not materialized. Test repeated enrichment and projected failure
events, not only a stage-selection helper. No repair/re-execution of SPECIFY
in the historical EVAL.

## 3. Analogous-path audit and boundaries

Main agent independently checked both investigators' findings against source.
`process-json` already renews on stdout, meaningful diagnostics and explicit
progress; no general renewal rewrite is needed. Its callers include tool
download/extraction/version, real lint, Worktrunk commands, engine probes and
dashboard operations. Add operation context only to the tool-acquisition path.
Real check failures still belong to normal agent repair, not operator product fix.

`createManagedWorktree` ensures the capability **before** `wt switch`.
Bootstrap and later Git effects are different: their failures never gain a
blanket no-effect retry. `memory-fix-workspace` may retain an intent before ensure;
preserve that pending intent and its existing replay contract. No rollback or
new intent is inferred from a missing tool. Status and historical recovery must
not acquire tools or start models. Accepted boundary capture succeeded here;
do not change recovery/capture semantics to hide this failure.

## 4. Verification and readiness decisions

Only affected contracts; exact receipts from accepted beta.159 are reused.
No full gate, CI, unchanged capacity/Judge qualification or product suites.

Required regressions:

1. Two fresh Flow homes with one explicit resource home reuse the same verified
   tool without curl; missing resource setting retains legacy local behavior.
2. Cache mismatch/offline miss/unknown tool refuse before productive dispatch;
   no corrupt cache is replaced or executed.
3. Download timeout with confirmed cleanup is typed recoverable preparation;
   unknown cleanup remains non-replayable. Curl retry/connect arguments are
   bounded and progress advances after file reset/regrowth.
4. Concurrent/live/foreign/dead owner cases use the existing lock semantics;
   only one publication, no borrowed lock removal, no false readiness.
5. Preflight and E2E prepare declared tools before Subject; failure means zero
   Subject dispatch. Status/Judge/control and undeclared legacy paths do not
   acquire tools. The same resource home is used by preparation and Stage entry.
6. SPECIFY accepted → PROTOCOLIZE context prepared → entry fails → enrichment
   and event projection retain failure Stage PROTOCOLIZE; accepted SPECIFY stays
   accepted. Other `latestObservedStage` behavior remains unchanged.
7. Actual public lifecycle acquisition failure has no Git/worktree creation;
   its exact issued correction/retry uses existing successor authority. A
   post-worktree effect is not reclassified as no-effect.

One existing offline installed matrix producer is needed only if the new
published component fingerprint changes; do not repeat it otherwise.

### Offline provisioning for the next attempt

A real previously admitted seed exists in CP263's retained runtime:
`/Users/deksden/.dd-eval/qualification/cp263-luna-full/runs/EVAL-20261029062459-fc41adef/executions/e2e/dd-flow-home/tools/wt/0.72.0/darwin-arm64`.
Its archive identity matches the pinned manifest; actual binary SHA is
`8b82df29d57bef8be3cd7bb71ba7f18d666094e8f16d38328303eea55e47fd50`.
Validate through the existing validator, copy only binary+metadata into an
owned staging directory and atomically publish under the shared cache lock.
Never copy RUN/SQLite/Session state or a foreign lock, and never alter CP263.
The current GitHub connection failure therefore need not block a repaired run.

## 5. Acceptance and bounded campaign continuation

Complete readiness review before implementation. Independently review changes
against D1–D5 and regressions before integration. Commit/push/squash merge by
project rules; remove only this task's verified merged branches/worktrees.
Publish a new immutable engine version, refresh installed hooks preserving the
absolute workstation fallback and CPA symlink, pin a fresh checkpoint/home and
retain canon4.1.4/product/flow-pack/profile/capacity3/Judge unchanged. Validate
the exact installed resource and run one preflight, then a fresh full Luna E2E.
Update the existing monitor ledger without resetting cycle1. Stop foreground
after the new launch; continue five-minute monitoring. Do not resume CP264's
interrupted prompt or spend a second repair cycle on this same failure.
