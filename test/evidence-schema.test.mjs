import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { buildEvidencePacket, buildReport, buildRunCandidate, frozenCandidate, subjectHistoryEvents, validateHitlMatch, resolveHitlJudgment, isInfrastructureFailure, failureAttribution, failureDiagnostic, failureEvidenceRevision } from "../lib/runner.mjs";
import { appendEvent, hashJson, readEvents } from "../lib/runner-events.mjs";
import { buildHitlPacket, validateGroundedHitl } from '../lib/hitl-contract.mjs';

const schemaRoot = path.resolve(import.meta.dirname, "..", "schemas");
test('Final Judge has explicit frozen decision packet paths for fast and fallback exchanges', () => {
  const hitl = ['semantic_decision', 'interaction_judge'].map(decision_source => ({ stage: 'specify', pause_id: decision_source,
    decision_source, receipt_file: `/owned/${decision_source}/result.json`, coverage_filter: { confidence: 0.88 } }));
  const result = { execution: 'e', state: 'candidate_ready', hitl };
  const packet = buildEvidencePacket({ manifest: { run_id: 'EVAL-audit', executions: [{ id: 'e' }] }, results: [result], candidate: { immutable_hash: 'a'.repeat(64) } });
  for (const [i, item] of packet.executions[0].hitl.entries()) {
    assert.equal(item.packet_file, `/owned/${hitl[i].decision_source}/packet.json`);
    assert.equal(item.coverage_filter.confidence, 0.88);
  }
  assert.equal(hitl[0].packet_file, undefined, 'projection must not mutate frozen exchanges');
});
async function validator(file) {
  const schema = JSON.parse(await readFile(path.join(schemaRoot, file), "utf8"));
  return new Ajv2020({ allErrors: true }).compile(schema);
}

test('report and Judge use one subject event cut, retain recovery and never double-count usage', async () => {
  const manifest = { run_id: 'EVAL-history', executions: [{ id: 'e' }] };
  const launch = `${manifest.run_id}:e:launch`, recovery = `${launch}:recover:RCV-one`;
  const event = (id, type, operation_id, data = {}) => ({ id, executionid: 'e', type: `dev.dd.eval.${type}`, time: '2026-10-07T00:00:00Z', data: { operation_id, ...data } });
  const subject = [event('s1', 'operation.started', launch), event('s2', 'operation.failed', launch, { error: { code: 'quota' } }),
    event('s3', 'execution.failed', undefined, { execution_operation_id: launch, code: 'quota', recovery: { recovery_id: 'RCV-one' } }),
    event('s4', 'operation.started', recovery), event('s5', 'operation.completed', recovery, { result: { state: 'candidate_ready' } })];
  const appended = [...subject, event('judge', 'operation.started', `${manifest.run_id}:judge:hash`),
    event('cleanup', 'operation.completed', `${manifest.run_id}:e:cleanup`), event('other', 'operation.started', 'EVAL-other:e:launch')];
  assert.deepEqual(subjectHistoryEvents(appended, manifest), subject);
  const statistics = { collected_at: 'latest', usage: { totals: { total_tokens: 12 } } };
  const results = [{ execution: 'e', state: 'candidate_ready', stage: 'merge', statistics }];
  const candidate = await buildRunCandidate({ runId: manifest.run_id, manifest, results, historySha256: hashJson(subject) });
  const packet = buildEvidencePacket({ manifest, results, candidate, events: appended });
  const report = buildReport({ root: '/owned', manifest, results, candidate, state: 'completed', events: subject });
  assert.deepEqual(packet.subject_history.executions, report.execution_history);
  assert.equal(candidate.subject_history_sha256, packet.subject_history.sha256);
  assert.deepEqual(packet.subject_history.event_ids, subject.map(item => item.id));
  assert.equal(report.reliability, 'recovered');
  assert.equal(report.recovery_count, 1);
  assert.deepEqual(report.execution_history[0].usage_accounting.usage, statistics.usage);
  assert.throws(() => buildEvidencePacket({ manifest, results, candidate }), { code: 'judge_evidence_mismatch' }, 'a caller cannot omit the frozen subject cut');
  const legacy = { ...candidate }; delete legacy.subject_history_sha256;
  assert.deepEqual(buildEvidencePacket({ manifest, results, candidate: legacy }).subject_history.executions.map(item => item.history_coverage), ['incomplete']);
  assert.equal((await validator('evaluator-evidence.v2.schema.json'))(packet), true);
});

test('candidate freezes subject history, ignores Judge append and leaves predecessor bytes intact after recovery', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'history-candidate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = { run_id: 'EVAL-history', evidence_contract: 'dd-eval/evaluator-evidence@2', executions: [{ id: 'e' }] };
  const results = [{ execution: 'e', state: 'candidate_ready', stage: 'merge' }];
  const file = path.join(root, 'events.jsonl'), launch = `${manifest.run_id}:e:launch`;
  const emit = (type, operation_id) => appendEvent(file, { source: 'test', runId: manifest.run_id, executionId: 'e', type: `dev.dd.eval.${type}`, data: { operation_id } });
  await emit('operation.started', launch); await emit('operation.completed', launch);
  const first = await frozenCandidate({ root, manifest, results }), original = await readFile(first.candidate.file);
  await emit('operation.completed', `${manifest.run_id}:judge:hash`);
  assert.equal((await frozenCandidate({ root, manifest, results })).candidate.immutable_hash, first.candidate.immutable_hash);
  await emit('operation.started', `${launch}:recover:RCV-one`); await emit('operation.completed', `${launch}:recover:RCV-one`);
  const second = await frozenCandidate({ root, manifest, results });
  assert.notEqual(second.candidate.immutable_hash, first.candidate.immutable_hash);
  assert.equal(second.candidate.parent_candidate_sha256, first.candidate.immutable_hash);
  assert.equal(second.candidate.subject_history_sha256, hashJson(subjectHistoryEvents(await readEvents(file), manifest)));
  assert.deepEqual(await readFile(first.candidate.file), original);
  assert.equal((await frozenCandidate({ root, manifest, results })).created, false);
});

test("partial HITL is schema-valid evidence, never a deliverable answer", async () => {
  const validate = await validator("hitl-match.v1.schema.json");
  const fixture = { responses: [{ id: "priority", answer: "canonical" }], sha256: "a".repeat(64) };
  const verdict = { schema_id: "dd-eval/hitl-match@1", status: "unmatched", classification: "fixture_gap", response_ids: ["priority"], covered_questions: ["values"], uncovered_questions: ["independent decision"], rationale: "values covered; independent decision missing" };
  assert.equal(validate(verdict), true, JSON.stringify(validate.errors));
  assert.equal(validateHitlMatch(verdict, fixture, null, { historical: true }), verdict);
  assert.throws(() => validateHitlMatch(verdict, fixture), { code: 'judge_result_invalid' });
  assert.throws(() => resolveHitlJudgment({ fixture, judgment: { verdict }, question: "compound", stage: "specify" }), { code: "judge_result_invalid" }, 'historical verdict cannot authorize new issuance');
  const packet = await buildHitlPacket({ stage: 'specify', question: 'values; independent decision', subjectContext: { objective: 'Accepted independent decision' }, responses: fixture.responses });
  const grounded = validateGroundedHitl({ schema_id: 'dd-eval/hitl-match@3', atoms: [
    { source_quote: 'values', decision: 'values', classification: 'covered_by_canonical_response', reference_bindings: [], scope_evidence: [], answer_evidence: [{ response_id: 'priority', answer_quote: 'canonical' }], rationale: 'covered' },
    { source_quote: 'independent decision', decision: 'independent decision', classification: 'fixture_gap', reference_bindings: [], scope_evidence: [{ kind: 'context', field: 'objective', quote: 'Accepted independent decision' }], answer_evidence: [], rationale: 'missing' }
  ] }, packet);
  assert.throws(() => resolveHitlJudgment({ fixture, judgment: { verdict: grounded, packet }, question: packet.question, stage: packet.stage }), { code: 'interaction_fixture_gap' });
  for (const invalid of [{ ...verdict, covered_questions: [] }, { ...verdict, covered_questions: [""] }, { ...verdict, response_ids: ["priority", "priority"] }, { ...verdict, status: "matched" }]) {
    assert.equal(validate(invalid), false);
    assert.throws(() => validateHitlMatch(invalid, fixture, null, { historical: true }), { code: "judge_result_invalid" });
  }
  assert.throws(() => validateHitlMatch({ ...verdict, uncovered_questions: ["values"] }, fixture, null, { historical: true }), { code: "judge_result_invalid" }, "cross-array disjointness is enforced by runtime");
});

test('qualification mismatch diagnostic is neutral infrastructure and retains bounded comparison metadata', () => {
  const error = { code: 'definition_qualification_mismatch', message: 'Judge verdict differs from authored expectation', details: {
    item_id: 'item', stage: 'specify', qualification_key: 'a'.repeat(64), verdict_contract: 'dd-eval/hitl-match@3', receipt_file: '/owned/result.json', packet_file: '/owned/packet.json',
    comparison: { passed: false, mismatch_kind: 'coverage', missing_obligation_ids: ['q2', 'q3'],
      expected: { status: 'matched', classification: 'covered_by_canonical_response', response_ids: ['a'] },
      observed: { status: 'unmatched', classification: 'fixture_gap', response_ids: ['a'] },
      extra_atoms: [{ source_quote: 'private question', classification: 'fixture_gap' }] } } };
  assert.equal(failureAttribution(error), 'evaluation_infrastructure');
  const diagnostic = failureDiagnostic(error);
  assert.equal(diagnostic.details.item_id, 'item');
  assert.equal(diagnostic.details.comparison.mismatch_kind, 'coverage');
  assert.deepEqual(diagnostic.details.comparison.missing_obligation_ids, ['q2', 'q3']);
  assert.equal(diagnostic.details.comparison.extra_atom_count, 1);
  assert.doesNotMatch(JSON.stringify(diagnostic), /private question/);
  assert.equal(diagnostic.code, error.code, 'not mislabeled as a runtime fixture gap');
  const cleanup = { code: 'judge_cleanup_failed', message: 'Owned stop failed', details: { semantic_mismatch: error } };
  const retained = failureDiagnostic(cleanup);
  assert.equal(retained.code, 'judge_cleanup_failed', 'cleanup remains primary dispatch failure');
  assert.equal(retained.details.semantic_mismatch.code, error.code);
  assert.deepEqual(retained.details.semantic_mismatch.details.comparison.missing_obligation_ids, ['q2', 'q3']);
  assert.doesNotMatch(JSON.stringify(retained), /private question/);
});

test("owned runtime ambiguity retains attribution through raw, wrapped and diagnostic evidence", () => {
  const issued = { code: "invocation_ambiguous", message: "two exact scoped runtime assignments", details: { lifecycle_assignment: { issuer: "dd-flow", scope: { projectRoot: "/owned/project", daemonId: "daemon", rootSessionId: "root", runId: "RUN", generation: 2 } } } };
  assert.equal(isInfrastructureFailure("invocation_ambiguous"), false);
  assert.equal(isInfrastructureFailure({ code: "invocation_ambiguous", details: { lifecycle_outcome: { disposition: "fatal" } } }), false);
  assert.equal(isInfrastructureFailure({ code: 'invocation_ambiguous', details: { source: { kind: 'dd-flow', path: '/claimed/runtime' } } }), false, 'source-shaped claim is not issued scope');
  assert.equal(isInfrastructureFailure({ ...issued, details: { lifecycle_assignment: { issuer: 'dd-flow', scope: { daemonId: 'claimed' } } } }), false, 'partial claimed scope is not proof');
  assert.equal(isInfrastructureFailure({ ...issued, details: { ...issued.details, native_hook_binding: { schema_id: 'dd-flow/hook-request@1', request_id: 'request', operation_id: 'operation', daemon_id: 'foreign', root_provider_session_id: 'root', tool_call_id: 'tool', turn_generation: 2 } } }), false, 'contradicting native receipt does not bind issuer');
  for (const error of [issued, { code: "wrapper", cause: issued }, failureDiagnostic(issued)]) assert.equal(failureAttribution(error), "evaluation_infrastructure");
  assert.equal(isInfrastructureFailure({ ...issued, run_id: "foreign" }), false);
  assert.equal(isInfrastructureFailure({ code: 'wrapper', run_id: 'foreign', cause: issued }), false, 'wrapped foreign RUN proof cannot acquire attribution');
  const mismatch = { ...issued, code: 'invocation_argument_mismatch', details: { invocation_id: 'issued', lifecycle_assignment: { ...issued.details.lifecycle_assignment, phase: 'issuance' } } };
  assert.equal(failureAttribution(failureDiagnostic(mismatch)), 'evaluation_infrastructure');
  assert.equal(failureAttribution({ ...mismatch, details: { ...mismatch.details, lifecycle_assignment: { ...mismatch.details.lifecycle_assignment, phase: 'model-input' } } }), 'undetermined');
  const result = { ...issued, execution: "e2e", state: "failed", run_id: "RUN" };
  const noProof = { ...result, details: {} };
  assert.notEqual(failureEvidenceRevision(result), failureEvidenceRevision(noProof));
  const report = buildReport({ root: "/eval", manifest: { run_id: "EVAL", executions: [{ id: "e2e" }] }, state: "completed_with_failures", results: [result] });
  assert.equal(report.run_validity, "invalid_infrastructure_flow");
  assert.equal(report.executions[0].failure.diagnostic.details.lifecycle_assignment.issuer, "dd-flow");
});

test("actual Judge error report validates strict quota projection and infrastructure validity", async () => {
  const validate = await validator("report.v2.schema.json");
  const manifest = { run_id: "EVAL-error", executions: [{ id: "e2e" }] };
  const result = { execution: "e2e", state: "failed", code: "native_outcome_observation_failed", error: "observation failed", details: { native_outcome: { status: "completed" } } };
  const report = buildReport({ root: "/owned", manifest, state: "completed_with_failures", executionState: "failed", cleanupState: "settled", results: [result], judgeError: { code: "agy_provider_quota_exhausted", message: "Individual quota reached. Resets in 3h12m12s", details: { observed_at: "2026-10-01T16:18:41.330Z", provider_session_id: "judge" } } });
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
  assert.equal(report.run_validity, "invalid_infrastructure_flow");
  assert.equal(report.judge_provider_limit.reset_estimated, true);
  assert.equal(validate({ ...report, unexpected: true }), false);
});

test("actual candidate, report and Judge evidence producers satisfy their schemas with and without case acceptance", async () => {
  const validators = await Promise.all(["run-candidate.v2.schema.json", "report.v2.schema.json", "evaluator-evidence.v2.schema.json"].map(validator));
  const manifest = { run_id: "EVAL-test", case_id: "sdlc-eval-2026-summer-task-priority", executions: [{ id: "e2e" }], case_acceptance: { checker: "task-priority@1" } };
  const hash = "a".repeat(64);
  const basic = { execution: "e2e", state: "candidate_ready", stage: "merge", run_id: "RUN-test", candidate: { manifest_sha256: hash } };
  for (const enabled of [false, true]) {
    const result = enabled ? { ...basic, case_acceptance: { file: "/checkpoint/acceptance.json", sha256: hash, receipt: { schema_id: "dd-eval/case-acceptance@1", status: "passed", immutable_hash: hash } } } : basic;
    const selected = enabled ? manifest : { ...manifest, case_acceptance: undefined };
    const candidate = await buildRunCandidate({ runId: selected.run_id, manifest: selected, results: [result] });
    const report = buildReport({ root: "/checkpoint", manifest: selected, state: "completed", executionState: "completed", cleanupState: "settled", results: [result], candidate });
    const evidence = buildEvidencePacket({ manifest: selected, results: [result], candidate });
    for (const [index, value] of [candidate, report, evidence].entries()) assert.equal(validators[index](value), true, JSON.stringify(validators[index].errors));
    assert.equal("case_acceptance" in candidate.executions[0], enabled);
    assert.equal("case_acceptance" in report, enabled);
    assert.equal("case_acceptance" in evidence.executions[0], enabled);
  }
});

test("V3 Judge receives exact frozen matrix and source paths without deriving a live home", async () => {
  const hash = "a".repeat(64), snapshot = "/eval/executions/e2e/boundaries/frozen";
  const json = "runtime/projects/PRJ-1/runs/RUN-1/07-merge/verification/final/verification-matrix.json";
  const markdown = json.replace(/\.json$/, ".md");
  const result = { execution: "e2e", state: "candidate_ready", stage: "merge", run_id: "RUN-1", candidate: { manifest: `${snapshot}/snapshot.json`, manifest_sha256: hash },
    case_acceptance: { file: "/eval/acceptance.json", sha256: hash, receipt: { schema_id: "dd-eval/case-acceptance@1", checker: "task-priority@3", status: "passed", immutable_hash: hash, facts: { consumed_sha256: { [json]: hash, [markdown]: hash, "workspace/.memory-bank/protocol/PRT-1-plan/plan.json": hash } } } } };
  const manifest = { run_id: "EVAL-test", executions: [{ id: "e2e" }] };
  const candidate = await buildRunCandidate({ runId: manifest.run_id, manifest, results: [result] });
  const packet = buildEvidencePacket({ manifest, candidate, results: [result] });
  assert.deepEqual(packet.executions[0].verification_matrix_sources.map(source => source.path), [path.join(snapshot, json), path.join(snapshot, markdown), path.join(snapshot, "workspace/.memory-bank/protocol/PRT-1-plan/plan.json")]);
  const check = await validator("evaluator-evidence.v2.schema.json");
  assert.equal(check(packet), true, JSON.stringify(check.errors));
});
