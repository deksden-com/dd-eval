import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const zones = [
  [/^retire-eval\.mjs$/, /eval-retirement|control-retirement|retirement-proof|cleanup|runner|recovery|managed|eval\.test/],
  [/^prior-owners\.mjs$/, /plan110-admission|eval-retirement|retirement-proof|cleanup|runner|recovery|managed|eval\.test/],
  [/^managed-run\.mjs$/, /memory-run|diagnostic-run|delivery|interactive|tool-preparation|case-definition|runner|recovery|managed|canonical|fork|eval\.test/],
  [/^retirement-proof\.mjs$/, /retirement-proof|eval-retirement|control-retirement|cleanup|runner|recovery|managed|eval\.test/],
  [/^worker-attempt\.mjs$/, /eval-resume|eval-worker|runner|recovery|managed|cleanup/],
  [/^worker-spawn\.mjs$/, /eval-resume|eval-worker|runner|recovery|managed|cleanup/],
  [/^launch-retirement\.mjs$/, /retirement|cleanup|runner|recovery|managed|eval\.test/],
  [/^cleanup-receipt\.mjs$/, /retirement|cleanup|runner|recovery|managed|eval\.test/],
  [/^acceptance-(?:v2|policy)\.mjs$/, /case-acceptance|case-definition|verification|runner|recovery|fork|eval\.test/],
  [/^journal-(?:hash|projection)\.mjs$/, /execution-state|runner|recovery|managed|retirement|cleanup|execution|completion-scope|evidence|eval\.test|canonical|fork|judge|hitl/],
  [/^cleanup-binding\.mjs$/, /control-retirement|eval-retirement|retirement-proof|cleanup|runner|recovery|managed|eval\.test/],
  [/^launch-resources\.mjs$/, /plan110-admission|admission104|retirement|cleanup|runner|recovery|managed|eval\.test/],
  [/^worker-outcomes\.mjs$/, /cleanup-observation|plan110-recovery|eval-worker|runner|recovery|managed|cleanup/],
  [/^failed-check-evidence\.mjs$/, /case-acceptance|native-failure|verification|runner|recovery|fork|eval\.test/],
  [/^final-matrix\.mjs$/, /final-matrix|case-acceptance|verification|runner-proof|runner|recovery|fork|eval\.test/],
  [/^final-receipt-index\.mjs$/, /case-acceptance|verification|runner|recovery|fork|eval\.test/],
  [/^frozen-authority\.mjs$/, /case-acceptance|verification|runner|recovery|fork|eval\.test/],
  [/^frozen-evidence\.mjs$/, /frozen-evidence|case-acceptance|verification|runner|recovery|fork|eval\.test/],
  [/^runner-status\.mjs$/, /monitoring-status|runner-health|cleanup|technical-notes107|evidence|runner|recovery|managed|eval\.test/],
  [/^control-status\.mjs$/, /runner-control|monitoring-status|eval-worker|runner|recovery|managed|eval\.test/],
  [/^control-resume\.mjs$/, /runner-control|runner-cancel|admission|runner|recovery|managed|eval\.test/],
  [/^control-reconcile\.mjs$/, /runner-control|runner-cancel|judge|admission|runner|recovery|managed|eval\.test/],
  [/^control-request\.mjs$/, /runner-control|runner-cancel|admission|runner|recovery|managed|eval\.test/],
  [/^fork-inputs\.mjs$/, /fork|checkpoint|snapshot|engine-admission|runner|recovery|managed|eval\.test/],
  [/^coverage-qualification\.mjs$/, /hitl|coverage|qualification|judge|runner|recovery|managed|eval\.test/],
  [/^qualification-reassessment\.mjs$/, /hitl|coverage|qualification|judge|runner|recovery|managed|eval\.test/],
  [/^qualification-inputs\.mjs$/, /hitl|coverage|qualification|judge|runner|recovery|managed|eval\.test/],
  [/^qualification-sample\.mjs$/, /hitl|coverage|qualification|judge|runner|recovery|managed|eval\.test/],
  [/^qualification-contract\.mjs$/, /hitl|coverage|qualification|judge|runner|recovery|managed|eval\.test/],
  [/^judge-retained\.mjs$/, /judge|hitl|coverage|qualification|runner|recovery|managed|eval\.test/],
  [/^failure-enrichment\.mjs$/, /tool-preparation114|technical-notes107|evidence|runner|recovery|managed|hitl|eval\.test/],
  [/^capture-evidence\.mjs$/, /recovery-finalization105|managed-resume|runner-recovery|cleanup|technical-notes107|runner|recovery|managed|eval\.test/],
  [/^execution-cleanup\.mjs$/, /cleanup|retirement|technical-notes107|runner|recovery|managed|eval\.test/],
  [/^capacity-codex-home\.mjs$/, /capacity-codex-home|capacity|eval\.test|runner|recovery|managed/],
  [/^canonical-pack\.mjs$/, /canonical|entry-pack|case-definition|runner|recovery|managed|eval\.test/],
  [/^canonical-recovery\.mjs$/, /canonical|runner-lock|runner|recovery|managed|eval\.test/],
  [/^canonical-operations\.mjs$/, /canonical|engine|runner|recovery|managed|eval\.test/],
  [/^canonical-boundary\.mjs$/, /canonical|entry-pack|runner|recovery|managed|eval\.test/],
  [/^canonical-entry-acceptance\.mjs$/, /canonical|entry-pack|runner|recovery|managed|eval\.test/],
  [/^run-contract-resolution\.mjs$/, /execution-contract|memory|canonical|runner|recovery|managed|fork|eval\.test/],
  [/^memory-runtime-setup\.mjs$/, /memory|diagnostic|interactive|delivery|canonical|runner|recovery|managed|fork|eval\.test/],
  [/^canonical-bootstrap\.mjs$/, /canonical|memory|entry-pack|engine-admission|runner|recovery|managed|fork|eval\.test/],
  [/^canonical-build\.mjs$/, /canonical|memory|entry-pack|engine-admission|runner|recovery|managed|fork|eval\.test/],
  [/^materialize-input\.mjs$/, /memory-input|memory-upgrade|diagnostic-run|delivery-case|memory-case|task-input|case-definition|canonical|runner|recovery|managed|fork|eval\.test/],
  [/^runner-entry\.mjs$/, /entry-pack|focused-entry|case-definition|runner|recovery|managed|canonical|fork|eval\.test/],
  [/^stage-restore\.mjs$/, /runtime-restore|snapshot|entry-pack|canonical|runner|recovery|managed|fork|eval\.test/],
  [/^runtime-provision\.mjs$/, /runtime-restore|tool-preparation114|engine-admission|runner|recovery|managed|canonical|fork|eval\.test/],
  [/^runtime-shim\.mjs$/, /runtime-restore|tool-preparation114|harness|runner|recovery|managed|canonical|fork|eval\.test/],
  [/^runtime-setup\.mjs$/, /runtime-restore|tool-preparation114|harness|droid|runner|recovery|managed|canonical|fork|judge|eval\.test/],
  [/^runtime-binding\.mjs$/, /judge|hitl|coverage|qualification-owner|runner|recovery|managed|eval\.test/],
  [/^fixture-validation\.mjs$/, /fixture|entry-pack|case-definition|canonical|runner|recovery|managed|fork|eval\.test/],
  [/^source-validation\.mjs$/, /case-definition|memory|task-input|canonical|runner|recovery|managed|fork|eval\.test/],
  [/^dispatch-barrier\.mjs$/, /runner-cancel|hitl|coverage|semantic|dispatch|runner|recovery|execution|managed|eval\.test/],
  [/^capacity-qualification\.mjs$/, /capacity|eval\.test|runner|recovery|managed|judge/],
  [/^qualification\.mjs$/, /capacity|qualification|eval\.test|runner|recovery|managed|judge/],
  [/^engine-snapshot\.mjs$/, /engine-admission|canonical|snapshot|runtime-restore|runner|recovery|managed|fork|eval\.test/],
  [/^canonical-state\.mjs$/, /canonical|entry-pack|case-definition|runner|recovery|managed|fork|eval\.test/],
  [/^qualification-context\.mjs$/, /hitl|coverage|case-definition|eval\.test|runner|recovery|managed/],
  [/^qualification-home\.mjs$/, /hitl|coverage|profile|runner|recovery|managed|eval\.test/],
  [/^selection\.mjs$/, /selection|completion-scope|focused-entry|execution-contract|runner|recovery|execution|managed|canonical|fork|eval\.test/],
  [/^selection-scope\.mjs$/, /selection|completion-scope|execution-contract|runner|recovery|execution|managed|canonical|fork|eval\.test/],
  [/^completion-scope\.mjs$/, /completion-scope|execution-contract|runner|recovery|execution|managed|canonical|fork|eval\.test/],
  [/^continuation-admission\.mjs$/, /runner|recovery|execution|managed|fork|eval\.test/],
  [/^eval-inputs\.mjs$/, /runner|recovery|execution|managed|canonical|fork|eval\.test/],
  [/^contract-input-hash\.mjs$/, /execution-contract|comparison|runner|recovery|managed|canonical|eval\.test/],
  [/^retained-cleanup\.mjs$/, /judge|cleanup|retirement|runner|recovery|managed|eval\.test/],
  [/^final-assessment\.mjs$/, /judge|supplement|hitl|runner|recovery|managed|eval\.test/],
  [/^cleanup\.mjs$/, /judge|cleanup|hitl|runner|recovery|managed|eval\.test/],
  [/^supplement\.mjs$/, /judge|supplement|runner|recovery|managed|eval\.test/],
  [/^capacity\.mjs$/, /judge|capacity|hitl|runner|recovery|managed|eval\.test/],
  [/^provider-limit\.mjs$/, /provider|capacity|judge|hitl|runner|recovery|managed|eval\.test/],
  [/^driver-recovery\.mjs$/, /driver|native-dispatch|operation-progress|control-plane|runner|recovery|managed|eval\.test/],
  [/^driver-call\.mjs$/, /driver|native|operation-progress|process-json|runner|recovery|managed|eval\.test/],
  [/^process-(?:support|failure|diagnostics|policy)\.mjs$/, /process-json|baseline-admission|runner|recovery|managed|eval\.test/],
  [/^daemon-control\.mjs$/, /daemon|control-plane|runner|recovery|managed|eval\.test/],
  [/^qualification-owner\.mjs$/, /qualification-owner|qualification|harness|runner|recovery|managed|eval\.test/],
  [/^sources\.mjs$/, /hitl|coverage|judge|canonical|runner|recovery|eval\.test/],
  [/^completion-evidence\.mjs$/, /completion-scope|technical-notes107|runner|recovery|execution|managed|eval\.test/],
  [/^execution-conformance\.mjs$/, /model-observations|runner-execution-contract|evidence-schema|execution-contract|eval\.test|runner|recovery|managed|fork/],
  [/^managed-contract\.mjs$/, /managed-contract|execution-contract|memory|runner|recovery|managed|canonical|fork|eval\.test/],
  [/^flow-observation\.mjs$/, /flow-observation|tool-preparation114|runner|recovery|execution|managed|canonical|eval\.test/],
  [/^infrastructure-stop\.mjs$/, /infrastructure-stop|native-failure|runner|recovery|execution|managed|eval\.test/],
  [/^runtime-environment\.mjs$/, /runtime-environment|runner|recovery|managed|canonical|fork|execution|homes|check-resources|eval\.test/],
  [/^profile-loading\.mjs$/, /profile|case-definition|eval\.test|runner|recovery|managed|canonical|fork|judge/],
  [/^load-case\.mjs$/, /case-definition|checkpoint|tool-preparation114|eval\.test|runner|recovery|managed|canonical|fork|hitl/],
  [/^input-checkpoint\.mjs$/, /case-definition|checkpoint|tool-preparation114|eval\.test|runner|recovery|managed|canonical|fork/],
  [/^managed-tools\.mjs$/, /tool-preparation114|case-definition|eval\.test|runner|recovery|managed|canonical|fork/],
  [/^hitl-retained\.mjs$/, /hitl|coverage|judge|evidence-schema|technical-notes107|eval\.test|runner|recovery|managed|canonical/],
  [/^entry-snapshot\.mjs$/, /entry-pack|snapshot-version|runtime-restore|canonical|runner|recovery|fork|eval\.test/],
  [/^interaction-cleanup\.mjs$/, /technical-notes107|hitl|judge|cleanup|runner|recovery|managed|eval\.test/],
  [/^technical-notes\.mjs$/, /technical-notes107|tool-preparation114|runner-health|runner-recovery|qualification-owner090|evidence-schema|eval\.test|runner|recovery|managed/],
  [/^answer-evidence\.mjs$/, /answer-evidence|hitl|coverage|judge|eval\.test|runner|recovery|managed|canonical/],
  [/^acceptance-receipts\.mjs$/, /acceptance-receipts|case-acceptance|runner|recovery|managed|evidence-schema|eval\.test/],
  [/^flow-status\.mjs$/, /tool-preparation114|eval\.test|runner|recovery|managed|canonical|fork/],
  [/^result-projection\.mjs$/, /execution-state|completion-scope|runner|recovery|managed|technical-notes107|monitoring-status|eval\.test/],
  [/^failure-(?:classification|diagnostic)\.mjs$/, /native-failure083|check-diagnostic086|proof-limits091|judge-contract|evidence-schema|technical-notes107|work-failure112|eval\.test|runner|recovery|managed|hitl/],
  [/^model-progress\.mjs$/, /model-observations|runner-execution-contract|eval\.test|runner|recovery|managed/],
  [/^qualify-live-harnesses\.mjs$/, /model-observations|capacity|runner|eval\.test/],
  [/^observation-summary\.mjs$/, /observation-summary|model-observations|work-failure112|evidence-schema|eval\.test|runner|recovery|managed/],
  [/^model-observations\.mjs$/, /model-observations|observation-summary|work-failure112|droid-runner|evidence-schema|runner-execution-contract|eval\.test|runner|recovery|managed/],
  [/^canonical-qualification\.mjs$/, /canonical|entry-pack|completion-scope|case-definition|eval\.test|runner|recovery|managed|fork/],
  [/^qualification-recovery\.mjs$/, /canonical|qualification|runner|recovery|managed|eval\.test/],
  [/^preparation-recovery\.mjs$/, /hitl|qualification|runner|recovery|managed|eval\.test/],
  [/^dd-eval\.mjs$/, /cli-input|homes|comparison-admission|judge-supplement|droid-runner|runner|recovery|managed|eval\.test/],
  [/^framed-snapshot-hash\.mjs$/, /recovery-safety|snapshot-version|case-acceptance|materialization-evidence|recovery|runner|fork|judge|eval\.test/],
  [/^snapshot-version\.mjs$/, /snapshot-version|snapshot-observation|case-acceptance|materialization-evidence|recovery|runner|fork|judge|eval\.test/],
  [/^judge-receipt\.mjs$/, /judge-profile-contract|judge-capacity|judge-contract|hitl|coverage|eval\.test|runner|recovery|managed/],
  [/^native-children\.mjs$/, /capacity-transcript|capacity-policy|judge-capacity|eval\.test|runner|recovery|managed|native/],
  [/^execution-scheduling\.mjs$/, /execution-scheduling|entry-pack|execution-contract|capacity|eval\.test|runner|recovery|managed|canonical|fork|judge|hitl/],
  [/^interaction-fixtures\.mjs$/, /interactive|interaction|hitl|execution-contract|completion-scope|memory-case-definition|droid-runner|capacity|eval\.test|runner|recovery|managed|canonical|fork/],
  [/^resolve-judgment\.mjs$/, /hitl|coverage|evidence-schema|eval\.test|runner|recovery|managed|canonical/],
  [/^runner-events\.mjs$/, /runner|recovery|managed|retirement|cleanup|execution|completion-scope|evidence-schema|technical-notes|eval\.test|canonical|fork|judge|hitl/],
  [/^json-file\.mjs$/, /json|runner|recovery|managed|retirement|cleanup|execution|evidence|technical-notes|eval\.test|canonical|fork|judge|hitl/],
  [/^runner-launch-observation\.mjs$/, /runner-launch-observation/],
  [/^execution-state\.mjs$/, /execution-state|completion-scope|runner-cancel|runner-control|runner-recovery|runner-health|runner-launch-observation|managed|retirement|tool-preparation114|hitl-reattach|eval\.test/],
  [/^admission\.mjs$/, /execution-state|completion-scope|runner-cancel|runner-control|runner-recovery|managed-resume|runner|recovery|eval\.test/],
  [/^recovery-source\.mjs$/, /runner-recovery|runner-control|managed-resume|recovery-finalization105|eval\.test|runner|recovery|managed|fork/],
  [/^cleanup-observation\.mjs$/, /cleanup-observation|technical-notes107|monitoring-status|runner-health|runner|recovery|managed|retirement|cleanup|eval\.test/],
  [/^profile-capacity\.mjs$/, /execution-contract|memory-case-definition|droid-runner|capacity|eval\.test|runner|recovery|managed|canonical|fork|baseline-admission/],
  [/^report-projections\.mjs$/, /evidence-schema|native-failure083|judge-contract082|check-diagnostic086|proof-limits091|technical-notes107|tool-preparation114|execution-state|completion-scope|model-observations|hitl|coverage|eval\.test|runner|recovery|managed|fork/],
  [/^model-conformance\.mjs$/, /model-observations|runner-execution-contract|evidence-schema|technical-notes|eval\.test|runner|recovery|managed|fork/],
  [/^evidence-journals\.mjs$/, /model-observations|evidence-schema|runner-execution-contract|technical-notes|eval\.test|runner|recovery|managed|fork/],
  [/^(?:eval-worker-status|runner-health)\.mjs$/, /eval-worker-status|e2e-reliability|runner-health|eval-resume|runner|recovery|managed|cleanup-worker/],
  [/^(?:run-candidate|stage-attribution)\.mjs$/, /eval\.test|evidence-schema|execution-state|completion-scope|tool-preparation114|technical-notes107|case-definition|canonical|runner|recovery|managed|fork|baseline-admission/],
  [/^driver-bindings\.mjs$/, /eval\.test|droid-runner|plan-024-regressions|runtime-restore|runner|recovery|managed|canonical|fork|capacity|hitl|judge|baseline-admission/],
  [/^workspace-hooks\.mjs$/, /workspace-hooks|runner|recovery|managed|canonical|fork|eval\.test/],
  [/^(?:snapshot-tree|materialization-evidence|recovery-safety)\.mjs$/, /case-acceptance|recovery|runner|fork|judge-supplement|materialization-evidence|engine-admission|eval\.test/],
  [/^verification-matrix-(?:schema|checks)\.mjs$/, /case-acceptance|engine-admission|runner-proof|verification-components|runner|recovery|fork|eval\.test/],
  [/^task-input\.mjs$/, /task-input|eval\.test|canonical|fork|runner|recovery|managed|baseline-admission|e2e-reliability|memory-run-preparation/],
  [/^definition-identity\.mjs$/, /eval\.test|canonical|fork|runner|recovery|managed|baseline-admission|e2e-reliability/],
  [/^recovery-observation-budget\.mjs$/, /plan110-recovery|runner-recovery|eval-retirement090|process-json/],
  [/technical-notes|baseline-admission|^runner\.mjs$/, /technical-notes107|tool-preparation114/],
  [/technical-notes/, /runner-health|runner-recovery|qualification-owner090/],
  [/snapshot-observation/, /recovery-finalization105|runner-recovery|cleanup-observation/],
  [/model-observations/, /model-observations|runner-execution-contract/],
  [/^operation-errors\.mjs$/, /operation-errors|capacity-policy/],
  [/^check-diagnostic\.mjs$/, /check-diagnostic086|browser-capabilities103/],
  [/^capacity-policy\.mjs$/, /capacity-policy|judge-capacity|capacity-transcript|semantic-decisions/],
  [/^(?:decision-transport|semantic-decisions)\.mjs$/, /semantic-decisions/],
  [/^native-failure-evidence\.mjs$/, /native-failure083/],
  [/^native-failure\.mjs$/, /native-failure|evidence|runner|recovery|managed|eval\.test/],
  [/browser-capabilit|entry-pack/, /browser-capabilit|entry-pack/],
  [/check-runner-proof|runner-proof-sources|sync-runner-proof|case-acceptance|composite-runner103/, /case-acceptance|runner-proof103|engine-admission/],
  [/baseline-admission|fixture-assessment|world-readiness|check-resources/, /baseline-admission|fixture-assessment102|fixture-validation103|check-resources|runner-compatibility101/],
  [/engine-admission|verification-components|(?:qualify|rebind)-verification-matrix/, /engine-admission|verification-components(?:102|103)/],
  [/hitl|coverage|judge|decision/, /hitl|coverage|judge|decision/],
  [/retirement|cleanup|process|daemon|lease|runner-lock|qualification-owner|qualification-intent|qualification-recovery/, /retirement|cleanup|process|daemon|lease|runner-lock|qualification-owner|qualification-intent|qualification-recovery|admission104|plan110-admission/],
  [/runner\.mjs|eval-resume|eval-worker|execution|canonical|comparison|compare|run-specify/, /runner-native|comparison-admission|runner-resume|runner-control|runner-recovery|runner-execution-contract|recovery-finalization105|managed-resume|canonical|fork|stop-after/],
  [/verification-policy|verification\.mjs|verification-jobs/, /verification-policy102|verification104/],
  [/case-definition/, /definition|case-acceptance|baseline-admission/],
];
// The control/recovery tests exercise these shared runner helpers directly.
// Keep their explicit closure local; unrelated libs are not a whole-suite key.
const controlContracts = ['test/runner-control.test.mjs','test/managed-resume.test.mjs','test/recovery-finalization105.test.mjs'];
const controlInputs = ['lib/judge/final-assessment.mjs','lib/recovery/cleanup-receipt.mjs','lib/harness/qualification.mjs','lib/harness/driver-call.mjs','lib/cases/canonical-build.mjs','lib/recovery/worker-attempt.mjs','lib/harness/process-support.mjs','lib/completion-scope.mjs','lib/harness/qualification-owner.mjs','lib/qualification-owner.mjs','lib/harness/daemon-control.mjs','lib/daemon-control.mjs','lib/harness/driver-recovery.mjs','lib/hitl/preparation-recovery.mjs','lib/qualification-recovery.mjs','lib/harness/provider-limit.mjs','lib/json-file.mjs','lib/recovery/launch-retirement.mjs','lib/evidence/native-failure.mjs','lib/hitl/sources.mjs','lib/hitl-sources.mjs','lib/judge/capacity.mjs','lib/judge-capacity.mjs','lib/judge/supplement.mjs','lib/judge-supplement.mjs','lib/judge/cleanup.mjs','lib/judge-cleanup.mjs','lib/judge/retained-cleanup.mjs','lib/execution/eval-inputs.mjs','lib/harness/workspace-hooks.mjs','lib/cases/canonical-entry-acceptance.mjs','lib/cases/canonical-boundary.mjs','lib/cases/qualification-recovery.mjs','lib/cases/canonical-operations.mjs','lib/execution/continuation-admission.mjs','lib/runner.mjs','lib/cases/managed-run.mjs','lib/execution/journal-hash.mjs','lib/execution/journal-projection.mjs','lib/evidence/runner-status.mjs','lib/execution/control-status.mjs','lib/execution/control-resume.mjs','lib/execution/control-reconcile.mjs','lib/execution/control-request.mjs','lib/recovery/fork-inputs.mjs','lib/hitl/coverage-qualification.mjs','lib/hitl/qualification-reassessment.mjs','lib/hitl/qualification-inputs.mjs','lib/hitl/qualification-sample.mjs','lib/hitl/qualification-contract.mjs','lib/hitl/judge-retained.mjs','lib/evidence/failure-enrichment.mjs','lib/recovery/capture-evidence.mjs','lib/recovery/execution-cleanup.mjs','lib/harness/capacity-codex-home.mjs','lib/cases/canonical-pack.mjs','lib/cases/canonical-recovery.mjs','lib/execution/run-contract-resolution.mjs','lib/memory-runtime-setup.mjs','lib/cases/materialize-input.mjs','lib/recovery/stage-restore.mjs','lib/execution/runtime-provision.mjs','lib/execution/runtime-shim.mjs','lib/harness/runtime-setup.mjs','lib/judge/runtime-binding.mjs','lib/cases/fixture-validation.mjs','lib/cases/source-validation.mjs','lib/execution/dispatch-barrier.mjs','lib/execution/engine-snapshot.mjs','lib/cases/canonical-state.mjs','lib/hitl/qualification-context.mjs','lib/hitl/qualification-home.mjs','lib/execution/selection.mjs','lib/execution/completion-evidence.mjs','lib/evidence/execution-conformance.mjs','lib/execution/managed-contract.mjs','lib/execution/flow-observation.mjs','lib/execution/infrastructure-stop.mjs','lib/execution/runtime-environment.mjs','lib/cases/profile-loading.mjs','lib/cases/load-case.mjs','lib/cases/input-checkpoint.mjs','lib/cases/managed-tools.mjs','lib/recovery/entry-snapshot.mjs','lib/hitl/interaction-cleanup.mjs','lib/technical-notes.mjs','lib/hitl/answer-evidence.mjs','lib/cases/acceptance-receipts.mjs','lib/execution/result-projection.mjs','lib/evidence/failure-classification.mjs','lib/evidence/failure-diagnostic.mjs','lib/harness/model-progress.mjs','lib/evidence/model-observations.mjs','lib/evidence/observation-summary.mjs','lib/cases/canonical-qualification.mjs','lib/recovery/snapshot-version.mjs','lib/judge/judge-receipt.mjs','lib/judge/final-judge-contract.mjs','lib/harness/native-children.mjs','lib/execution/execution-scheduling.mjs','lib/hitl/interaction-fixtures.mjs','lib/hitl/resolve-judgment.mjs','lib/execution/admission.mjs','lib/recovery/recovery-source.mjs','lib/execution/profile-capacity.mjs','lib/evidence/report-projections.mjs','lib/evidence/model-conformance.mjs','lib/evidence/evidence-journals.mjs','lib/recovery/eval-worker-status.mjs','lib/recovery/runner-health.mjs','lib/evidence/run-candidate.mjs','lib/evidence/stage-attribution.mjs','lib/harness/driver-bindings.mjs','lib/recovery/snapshot-tree.mjs','lib/verification-matrix-schema.mjs','lib/verification-matrix-checks.mjs','lib/cases/task-input.mjs','lib/cases/definition-identity.mjs','lib/eval-retirement.mjs','lib/eval-resume-worker.mjs','lib/recovery/cleanup-observation.mjs','lib/recovery/snapshot-observation.mjs','lib/recovery/recovery-safety.mjs','lib/execution/execution-state.mjs','lib/execution-contract.mjs','lib/entry-pack.mjs','lib/engine-admission.mjs','lib/baseline-admission.mjs','lib/runtime-maintenance.mjs','lib/managed-flow-client.mjs','lib/homes.mjs','lib/hitl-contract.mjs','lib/hitl/hitl-retained.mjs','lib/native-failure-evidence.mjs','lib/driver-recovery.mjs','lib/operation-context.mjs'];
const repoGit = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio:['ignore','pipe','pipe'] }).trimEnd();
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function verificationSelection(base = null, { root = process.cwd(), env = process.env } = {}) {
  const git = (...args) => repoGit(root, ...args);
  if (!base) {
    try { base = git('merge-base', 'HEAD', 'origin/main'); }
    catch { base = git('rev-list', '--max-parents=0', 'HEAD').split('\n')[0]; }
  }
  const paths = [...new Set([...git('diff', '--name-only', '--no-renames', '-z', base, '--').split('\0'), ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0')].filter(Boolean))].sort();
  const available = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(file => /^test\/[^/]+\.test\.mjs$/.test(file));
  const tests = new Set(), reasons = [];
  for (const file of paths) {
    if (/^(?:README|CHANGELOG)|^(?:runbooks|specs)\/.*\.md$/.test(file)) continue;
    if (available.includes(file)) { tests.add(file); continue; }
    if (controlInputs.includes(file)) controlContracts.filter(test=>available.includes(test)).forEach(test=>tests.add(test));
    if (file==='lib/runner.mjs' && available.includes('test/baseline-admission.test.mjs')) tests.add('test/baseline-admission.test.mjs');
    if (/^(?:cases|schemas|profiles|checkpoints)\//.test(file)) {
      for (const test of available.filter(file => /definition|case-acceptance|baseline-admission/.test(file))) tests.add(test);
      reasons.push({ file, owner: 'definitions' }); continue;
    }
    if (file === 'package.json') {
      const current = JSON.parse(fs.readFileSync(path.join(root, file))), previous = JSON.parse(git('show', `${base}:${file}`));
      delete current.version; delete previous.version;
      if (JSON.stringify(current) === JSON.stringify(previous)) continue;
      // Script wiring is exercised by the policy's own tests. Runtime/dependency
      // changes require explicit ownership instead of a fallback whole suite.
      delete current.scripts; delete previous.scripts;
      assert.deepEqual(current, previous, 'classify changed EVAL dependencies before verification');
      tests.add('test/verification-policy102.test.mjs'); continue;
    }
    const match = zones.find(([source]) => source.test(path.basename(file)));
    assert.ok(match, `Unclassified EVAL impact: ${file}; declare affected contracts in scripts/verification-policy.mjs`);
    const consumers = [...new Set([...available.filter(test => match[1].test(path.basename(test)) && (!test.includes('/installed-') || paths.includes(test))), ...(controlInputs.includes(file)?controlContracts.filter(test=>available.includes(test)):[])])];
    assert.ok(consumers.length, `No contracts for ${file}`);
    consumers.forEach(file => tests.add(file)); reasons.push({ file, owner: String(match[0]) });
  }
  const files = [...tests].sort();
  return { schema_id: 'dd-eval/verification-selection@2', base, head: git('rev-parse', 'HEAD'), paths, files, reasons,
    required_contracts: files.map(file => contractDescriptor(file, { root, env })), status: tests.size ? 'required' : 'not_required' };
}

const processHelpers = ['lib/harness/process-support.mjs','lib/json-file.mjs','lib/process-json.mjs','lib/operation-errors.mjs','lib/runner-events.mjs','lib/managed-daemon.mjs','lib/runtime-maintenance.mjs','lib/runner-lock.mjs','lib/process-snapshot.mjs','lib/observation-clock.mjs'];
const fixtureOwners = [
  [/maintenance-/, /baseline-admission|e2e-reliability|runner|retirement|control|managed|lease|admission|engine-admission/],
  [/capacity-policy\.mjs|judge-cleanup\.mjs/, /capacity|hitl|judge|semantic|eval\.test|runner|control|managed|recovery-finalization105|technical-notes107/],
  [/composite-runner/, /case-acceptance|engine-admission|runner-proof|composite-runner/],
  [/hitl-/, /hitl|coverage|judge|canonical/],
  [/memory-upgrade\//, /memory-upgrade/],
  [/memory-grounding\//, /memory-grounding/],
  [/diagnostic\//, /diagnostic/],
  [/intent-preservation/, /intent-preservation/],
  [/migration-proof/, /judge-supplement|migration/],
  [/check-proof-limits/, /check-runner|runner-proof/],
];
export function contractDescriptor(file, { root = process.cwd(), env = process.env } = {}) {
  assert.match(file, /^test\/[A-Za-z0-9_.-]+\.test\.mjs$/);
  const owners = zones.filter(([, consumer]) => consumer.test(path.basename(file)));
  assert.ok(owners.length, `Unclassified EVAL contract: ${file}; declare source/test ownership`);
  const all = [...new Set(repoGit(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean))].sort();
  const technical = /verification-policy102|verification104/.test(file);
  const processConsumer = /runner|recovery|baseline|fixture-validation|admission|capacity|judge|hitl|control|managed|lease|retirement|cleanup|process|semantic/.test(file);
  const fixtures = all.filter(input => input.startsWith('test/fixtures/') && fixtureOwners.some(([pattern, consumer]) => pattern.test(input.slice('test/fixtures/'.length)) && consumer.test(file)));
  const inputs = [...new Set([file, ...fixtures, ...(file==='test/runner-launch-observation.test.mjs'?['scripts/fixtures/runner-launch-observation.mjs']:[]), ...(processConsumer ? processHelpers : []), ...(controlContracts.includes(file)?controlInputs:[]), ...(file==='test/baseline-admission.test.mjs'?['lib/runner.mjs']:[]), ...all.filter(input =>
    /^(lib|bin)\//.test(input) && owners.some(([source]) => source.test(path.basename(input)))
    || technical && /^(?:scripts\/verification(?:-policy)?\.mjs|tools\/verification-jobs\.mjs)$/.test(input)
    || /case-acceptance|case-definition|memory-case-definition|hitl105/.test(file) && /^(?:cases|schemas)\//.test(input))])].sort();
  const records = inputs.map(input => {
    const absolute = path.join(root, input), stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
    if (!stat) return [input, 'absent'];
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), `unsafe verification input: ${input}`);
    return [input, stat.mode & 0o111, sha(fs.readFileSync(absolute))];
  });
  const pkgFile = path.join(root,'package.json'), pkg = fs.existsSync(pkgFile) ? JSON.parse(fs.readFileSync(pkgFile)) : {};
  const lockFile = path.join(root,'package-lock.json');
  const lock = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile)) : null;
  const dependencies = { dependencies: pkg.dependencies, devDependencies: pkg.devDependencies,
    packages: lock ? Object.entries(lock.packages ?? {}).filter(([name])=>name).map(([name,p])=>[name,{version:p.version,integrity:p.integrity,dependencies:p.dependencies,optionalDependencies:p.optionalDependencies}]) : null,
    ...(technical ? { scripts: pkg.scripts } : {}) };
  const declaration = owners.map(([source,consumer])=>[source.source,consumer.source]);
  const runner = { command:'node', args:['--test','--test-concurrency=1','--test-reporter=tap'] };
  const executionKey = sha({ file, records, declaration, dependencies, runner, node:process.version, platform:process.platform, arch:process.arch,node_options:env.NODE_OPTIONS??null,
    environment:Object.fromEntries(Object.keys(env).filter(key=>/^DD_EVAL_(TEST_|PROBE_|LEGACY_REPORT_DIR$)/.test(key)).sort().map(key=>[key,sha(env[key])])) });
  const reader = path.join(root,'scripts/verification.mjs'), helper = path.join(root,'tools/verification-jobs.mjs');
  const validationKey = sha({ format:'complete-tap@2',reader:fs.existsSync(reader)?sha(fs.readFileSync(reader)):null,helper:fs.existsSync(helper)?sha(fs.readFileSync(helper)):null });
  return { id:`eval:${path.basename(file)}`, files:[file], inputs, execution_key:executionKey, validation_key:validationKey,
    declaration_sha256:sha(declaration), runner, execution_class:technical || /fixture-assessment102/.test(file) ? 'isolated':'exclusive', prerequisites:[] };
}
