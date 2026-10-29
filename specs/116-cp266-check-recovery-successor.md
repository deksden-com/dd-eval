# 116 — CP266 check recovery successor

## Scope and authority

Final authorized correction cycle 3/3 of CP264 campaign. No product edits,
historical RUN replay, full gate or GitHub CI. Current failed attempt:
`EVAL-20261029191656-2a1b9f81`, published engine beta.161 / source
`367b9cb844aa34fd36d0a00cf059160377d10bdd`. Final Judge completed at
2026-10-29T21:36:53.919Z. Owned physical/native retirement is confirmed by
the retained receipt; report projection has the separate defect below.
Do not rewrite historical results. Implementation readiness is reviewed below; release
acceptance remains a separate receipt.

## Reconstructed facts

- Baseline and SPECIFY through CODE-REVIEW passed. MERGE attached
  2026-10-29T21:19:11.061Z, Work WRK-020-merge started 21:19:11.441Z.
- Integrated browser check passed six of seven tests. Remaining test waits for
  a world-specific live inspection note. Existing `core.spec.ts` function
  `retainLiveInspection` polls `.test-worlds/<world>/scn-002-live-inspection.md`
  for five minutes; it requires CODE-owner completion evidence on each check
  execution with DD_FLOW_EVIDENCE_DIR. This is not proof of a product regression.
  Operator must not alter this evaluated product/test to obtain PASS.
- Subject diagnosed the missing inspection handoff and wrote recovery evidence,
  but changed the returned reason-file path from absolute RUN artifact root to
  the project workspace. Its native retry command was therefore not identical
  to `continuation.command_after_input`.
- Hook rejected the retry in 403 ms, with `invocation_assignment_missing`:
  short call has no unique issued RUN assignment. No native receipt was inserted.
  CLI consequently returned `invocation_receipt_missing`, no_effect,
  recoverable=false. This is not a hook timeout or uncertain paid dispatch.
- Independently inspected SQL shows a deeper runtime contradiction: settlement
  retained a single issued successor using `--reason 'Recheck after diagnosis
  and correction of the failed check'`, not the `--reason-file` command returned
  in the needs-input continuation. Even obeying that continuation exactly would
  not match the retained authority. Subject path drift is an additional error,
  not a sufficient root-cause explanation.
  Primary independently reopened the original `db.sqlite` read-only and verified
  predecessor `5337d28b-9834-45e9-849f-538efe2e2b09` and sole successor
  `508eb266-e5d2-4119-b272-e7331cb369a8`; no original row was modified.
- Native Turn completed 21:29:52.384Z; EVAL launch failed 21:29:54.221Z.
  Recovery sealed 21:29:59.606Z, capture ready 21:30:21.249Z.

## Root-cause trace confirmed in source

`vnext-merge.ts:finishVnextMerge` constructs needs-input via
`recoveryEvidenceInput` and `finishCommand`, which uses `checkRetryArgs`.
The latter correctly renders an absolute RUN `--reason-file`.

`lifecycle-invocations.ts:settleLifecycleRejection` then deletes the staged
producer continuation authority and independently constructs a replacement via
`successorLifecycleInvocationCommand`. That function replaces retry options
with a canned literal `--reason`. The serialized error still retains the first
producer's `continuation.command_after_input`. Two public next actions describe
different argv, but only one has committed authority. This is a publication /
custody disagreement between help and the only executable successor.

Analogous paths already identified: CODE and CODE-REVIEW finish also use
`checkRetryArgs`; all failed lifecycle checks share rejection settlement.
Native hook assignment rejection is masked downstream as receipt absence.
The action guard itself is useful: never admit arbitrary changed retry argv.

### Additional confirmed cleanup-projection defect

After Final Judge completed, owned cleanup attempt
`0cc578cde55fe1c371991ea0b4380f98e0133a0baae883c67a8df08498cd055d`
retained `physical_stopped:true`, `native_settled:true`, `cleanup_state:settled`,
but `projection_error: Cannot read properties of undefined (reading 'admission')`.
The report therefore stayed cleanup-pending despite the settled retirement proof.
This is not a native cleanup failure and does not turn MERGE failure into PASS.

`dd-eval/lib/eval-resume-worker.mjs` local_retirement branch calls
`lease.admission()` before the productive observer lease is created later in
runWorker. That branch returns before lease initialization on every cleanup run.
Primary and independent cp266_cleanup_projection traced runnerCleanup:
with requestId omitted/null it validates frozen manifest/admission under the
lifecycle lock, skips execution recovery/native cleanup retry and calls
finalizeRunProjection with cleanupOnly:true. It cannot dispatch a Subject or a
missing Judge. Every remaining admission call is after actual lease setup.

Fix the ownership mismatch by removing that one nonexistent productive lease
admission, not registering a dummy observer or weakening the manifest/lifecycle
guards. Keep physical retirement outcome and optional projection_error handling
independent. Add a real detached cleanup-worker regression: exact manifest-bound
projection with no requestId, no runtime lease registration, and projection
failure still retains truthful completed physical cleanup. This sibling's RCA,
plan and readiness are complete; it belongs to the same reserved cycle3.

## Implementation plan and readiness decisions

1. One committed successor must be the sole source for every exposed recovery
   command, including nested needs-input continuation. Preserve action scope,
   exactly-once settlement, original failed receipts and unknown-effect fences.
2. Preserve meaningful diagnosis evidence: do not replace the needs-input
   evidence file with fabricated generic reason text. Reuse existing
   `recoveryEvidenceInput` / retry-argument construction, not a new retry system.
   Only a needs-input check continuation requires this file transport; registered
   repair continuations keep their existing verified repair/result contract.
   Derive the evidence path from the retained invocation scope and bound RUN,
   never trust a serialized continuation's path as authority. Missing RUN root
   fails closed; no fabricated generic reason fallback for needs-input.
3. Audit all check-failure producers and consumers, direct and managed CLI,
   serialization/recovery and stdin/redirection-preserving successor paths.
4. The missing per-world inspection note is a fixture/check orchestration issue
   diagnosed by the subject, not an operator-authorized product change. Existing
   MERGE instructions already distinguish environment restoration and source
   repair. Preserve them; no speculative prompt addition or case-specific engine
   logic. No browser test edits or weaker acceptance.
5. Reuse hook_events.outcome_json.lifecycle_observation and
   observedLifecycleDiagnostic for typed assignment refusal. Persist diagnostic
   only after native ownership/project scope is proven; it is not a receipt
   capability. CLI preserves the refusal code instead of renaming it missing
   receipt or shell syntax. No fuzzy suggestions or auto-admission of drift.
6. On fatal/unknown-effect rejection strip nested command_after_input as well as
   top-level retry promises, while preserving non-executable diagnosis/evidence
   and registered repair metadata. Repeated reads never create another successor.

Required focused regression: returned needs-input command exactly matches its
committed executable successor, fails safely before evidence input exists,
then executes once after actual evidence, preserving stdin/route/targets and old
receipt. Include repeated settlement, path drift, unknown effect, registered
repair and analogous CODE/CODE-REVIEW behavior. Select existing suites only.

Ponytail applied: reuse shared settlement and existing evidence-input helper;
no new scheduler, authority type, dependency, limits or global flow gate.
Independent RCA agent cp266_retry_rca; primary verified the named code paths.
### Readiness review

Primary and independent cp266_retry_rca traced producer, settlement, hook and
CLI. Decisions: one atomic successor, generated RUN file path, existing repair
authority preserved, changed argv still rejected, no unknown-effect retry,
typed diagnostics restricted to proven scope. Native double-delivery cannot
grant authority; historical outcomes/capture remain immutable. Tests must cover
fatal nested help and serialization in addition to positive returned-command
matching. Existing repair and stdin/heredoc tests remain required affected checks.
No web search needed for the deterministic source/SQL contradiction; no uncertain
provider/network hypothesis is used. Ponytail review removes speculative browser
prompt work and avoids global gates/new diagnostic storage.

RCA, plan and readiness complete. Implementation is in progress. Independent
implementation review found a substantive coverage gap: direct service tests
do not exercise returned public command → native hook → CLI file preparation.
Add this positive regression (including absent evidence and exactly-once retry)
before declaring implementation complete. Merge, release and fresh full E2E
remain outstanding.

The public-boundary gap is now covered by merge-recovery-cli116.test.ts: real
managed process ownership, native hook, CLI preparation and MERGE execution.
Missing evidence and changed path admit no check; the canonical input succeeds;
late replay after native root sealing is refused without another check. Focused
regression 1/1 PASS, TypeScript/affected ESLint PASS. No lifecycle scope mocks.
The detached cleanup-worker regression and existing cleanup observation tests
also pass 7/7. Full affected three-file verification is still in progress;
integration/publication are not claimed complete.

### Expanded analog audit requested before launch

The three affected original files passed 304/304 cases (session50649,1080.07s).
This does not prove absence of all similar defects. A further source audit found
confirmed siblings before merge: hook-only repeated/fatal/persistence outcomes
removed top-level retry help but retained nested command_after_input; response
overlay and persistence failure could retain the original help after cleaning a
clone. Reuse removeRetryPromises at each authority-removal boundary and replace
response promises from the authoritative clone, preserving diagnostic input_file.

Proven native directory refusals also escaped before event persistence in shared
Codex/ZCode/Grok and controlled OpenCode/AGY/Droid paths, masking their typed error
at CLI admission. Reuse the existing non-capability diagnostic with exact native
scope/fingerprint and original directory provenance. CLI accepts only explicit
known refusal codes, not arbitrary diagnostic execution or fuzzy assignment.
Readiness requires fatal/rollback/original-response and shared/controlled directory
regressions, duplicate idempotency, foreign-scope exclusion and zero invocations.
These are cycle3 additions, not another budget reservation or product change.

Cleanup sibling audit: every remaining lease.admission in eval-resume-worker is
after the productive lease assignment; no second pre-initialization call found.
Additional focused checks and final review remain pending; no blanket no-bugs or
full E2E PASS claim is made. Ponytail: reuse existing helper/storage and guards,
no new framework, retry limits, model/capacity changes or full gate.
