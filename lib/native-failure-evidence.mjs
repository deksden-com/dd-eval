import path from 'node:path';
import { resolveBoundSnapshot, withFrozenRuntimeDatabase, frozenFile } from './recovery-safety.mjs';
import { hashJson } from './runner-events.mjs';

// Traverse only causal contract fields, never arbitrary Subject JSON or cleanup.
export function causalNodes(value) {
  const nodes = [], seen = new Set(); let incomplete = false;
  function visit(node, depth, ancestors) {
    if (!node || typeof node !== 'object') return;
    if (ancestors.has(node)) { incomplete = true; return; }
    if (seen.has(node)) return;
    if (depth > 12 || nodes.length >= 256) { incomplete = true; return; }
    seen.add(node); nodes.push(node);
    const next = new Set(ancestors); next.add(node);
    for (const child of [node.cause, node.details?.cause, node.details?.primary_error, node.details?.controller?.error, node.details?.error]) visit(child, depth + 1, next);
  }
  visit(value, 0, new Set());
  return { nodes, incomplete };
}

export const nativeBindingFields = ['project_id', 'run_id', 'stage', 'parent_work_id', 'work_id', 'work_session_id', 'harness_id', 'parent_provider_session_id', 'provider_session_id', 'terminal_turn_id', 'controller_id', 'generation', 'stage_attempt_id', 'stage_cycle'];

// trustedFacts must come from the runner's verified owned frozen capture, not
// the authored result. Matching fields within an error is not provenance.
export function validateNativeFailureEvidence(error, trustedFacts = []) {
  const { nodes, incomplete } = causalNodes(error);
  if (incomplete || nodes.some(node => Array.isArray(node.details?.failures) && node.details.failures.length > 64)) return { status: 'unconfirmed', reason: 'causal_evidence_incomplete' };
  const failures = nodes.flatMap(node => Array.isArray(node.details?.failures) ? node.details.failures : []);
  const bindings = failures.filter(failure => failure?.status === 'failed' && failure.native_binding?.schema_id === 'dd-flow/native-work-failure@1');
  if (!bindings.length) return { status: 'unconfirmed', reason: 'native_failure_evidence_unconfirmed' };
  const valid = bindings.every(failure => {
    const binding = failure.native_binding;
    const carriers = nodes.filter(node => node.details?.failures?.includes(failure));
    if (carriers.some(node => ['run_id','stage','parent_work_id'].some(key => node.details[key] !== undefined && node.details[key] !== binding[key]))) return false;
    if (failure.work_id !== binding.work_id || failure.terminal_turn_id !== binding.terminal_turn_id) return false;
    if (!Number.isInteger(binding.generation) || binding.generation < 0 || nativeBindingFields.filter(key => key !== 'generation').some(key => typeof binding[key] !== 'string' || key !== 'stage_cycle' && !binding[key] || binding[key].length > 512)) return false;
    return trustedFacts.some(fact => fact.outcome === 'failed' && nativeBindingFields.every(key => fact[key] === binding[key]));
  });
  return { status: valid ? 'confirmed' : 'unconfirmed', reason: valid ? 'owned_native_execution_failed' : 'native_failure_evidence_unconfirmed' };
}

const verifiedResults = new WeakMap();
const verificationKey = result => {
  const causal = causalNodes(result);
  if (causal.incomplete || causal.nodes.some(node => Array.isArray(node.details?.failures) && node.details.failures.length > 64)) return null;
  try { return JSON.stringify([result.execution,result.run_id,result.lifecycle?.run_id,result.recovery?.snapshot,result.recovery?.manifest,result.recovery?.manifest_sha256,result.recovery?.recovery_id,result.recovery?.control_id,result.recovery?.generation,hashJson(result.recovery?.settlement ?? null),
    causal.nodes.map(node => node.code), causal.nodes.flatMap(node => Array.isArray(node.details?.failures) ? node.details.failures : []).map(failure => [failure?.status,failure?.work_id,failure?.terminal_turn_id,
      nativeBindingFields.map(key => failure?.native_binding?.[key]),safeNativeError(failure?.provider_error),failure?.terminal_observed_at])]); }
  catch { return null; }
};
export const hasVerifiedNativeFailure = result => result && typeof result === 'object' && verifiedResults.has(result) && verifiedResults.get(result) === verificationKey(result);
const nativeErrorFields = ['type','code','codexErrorInfo','source','reason','errorPhase','exceptionKind','providerId','modelId','providerKind','transport','retryable','willRetry','statusCode','resets_at','retryAfter','retry_after','retryAfterMs','resetAt'];
function safeNativeError(value, depth = 0) {
  if (!value || typeof value !== 'object') return null;
  const result = Object.fromEntries(nativeErrorFields.filter(key => typeof value[key] === 'boolean' || typeof value[key] === 'number' && Number.isFinite(value[key]) || typeof value[key] === 'string' && value[key].length <= 256).map(key => [key,value[key]]));
  if (typeof value.codexErrorInfo?.code === 'string' && /^[\w-]{1,128}$/.test(value.codexErrorInfo.code)) result.codexErrorInfo = {code:value.codexErrorInfo.code};
  if (depth === 0 && value.attribution) result.attribution = safeNativeError(value.attribution,1);
  return result;
}
const equalNativeError = (a,b) => JSON.stringify(safeNativeError(a)) === JSON.stringify(safeNativeError(b));

/** Reverify immutable publication, registries, reconciliation and native journal.
 * No claimed flag serialized in a Subject result grants this authority. */
export async function verifyCapturedNativeFailure({ evalRoot, result }) {
  verifiedResults.delete(result);
  const causal = causalNodes(result);
  if (causal.incomplete || causal.nodes.some(node => Array.isArray(node.details?.failures) && node.details.failures.length > 64)) return { status:'unconfirmed',reason:'causal_evidence_incomplete' };
  const candidates = causal.nodes.flatMap(node => Array.isArray(node.details?.failures) ? node.details.failures : []).filter(item => item?.status === 'failed' && item.native_binding);
  if (!candidates.length) return { status: 'unconfirmed', reason: 'native_failure_evidence_unconfirmed' };
  try {
    const capture = await resolveBoundSnapshot({ evalRoot, execution: result.execution, result, checkpoint: result.recovery, purpose: 'recovery' });
    const { snapshot, data } = capture;
    const runRoot = path.join(snapshot, 'runtime', 'projects', data.project_id, 'runs', data.run_id);
    const timeline = JSON.parse('[' + (await frozenFile(snapshot, path.join(runRoot, 'timeline.jsonl'))).text.trim().split('\n').join(',') + ']');
    const facts = [];
    for (const failure of candidates) {
      const b = failure.native_binding;
      if (b.project_id !== data.project_id || b.run_id !== data.run_id) continue;
      const controller = await withFrozenRuntimeDatabase(snapshot, db => {
        const c = db.prepare('SELECT * FROM run_controllers WHERE controller_id=? AND project_id=? AND run_id=? AND generation=?').get(b.controller_id, b.project_id, b.run_id, b.generation);
        const ws = db.prepare(`SELECT ws.*, s.provider_session_id,s.harness,s.parent_session_id,s.provider_parent_session_id FROM work_sessions ws JOIN works w ON w.work_id=ws.work_id JOIN sessions s ON s.session_id=ws.session_id AND s.project_id=w.project_id WHERE ws.id=? AND w.work_id=? AND w.parent_work_id=? AND w.project_id=? AND w.run_id=? AND ws.status='failed' AND w.status='failed'`).get(b.work_session_id, b.work_id, b.parent_work_id, b.project_id, b.run_id);
        const membership = db.prepare('SELECT * FROM stage_work_memberships WHERE project_id=? AND run_id=? AND work_id=? AND stage=? AND attempt=? AND cycle=?').get(b.project_id,b.run_id,b.work_id,b.stage,b.stage_attempt_id,b.stage_cycle);
        if (!c || !ws || !membership || ws.harness !== b.harness_id || ws.provider_session_id !== b.provider_session_id) return null;
        const parent = db.prepare('SELECT provider_session_id FROM sessions WHERE session_id=? AND project_id=?').get(ws.parent_session_id,b.project_id);
        const state = JSON.parse(c.state_json);
        if (parent?.provider_session_id !== b.parent_provider_session_id || state.stage !== b.stage || state.sessions?.[state.current_session]?.id !== b.parent_provider_session_id) return null;
        return state.sessions[state.current_session];
      });
      if (!controller) continue;
      const reconciled = timeline.some(event => event.run_id === b.run_id && event.stage === b.stage && event.type === 'native_child_reconciliation'
        && event.reconciled?.some(entry => entry.outcome === 'failed' && nativeBindingFields.every(key => entry.native_binding?.[key] === b[key]))
        && event.observations?.harness_id === b.harness_id && event.observations?.parent_session_id === b.parent_provider_session_id
        && event.observations?.children?.some(child => child.status === 'failed' && child.session_id === b.provider_session_id && child.parent_session_id === b.parent_provider_session_id && child.terminal_turn_id === b.terminal_turn_id && equalNativeError(child.provider_error,failure.provider_error) && child.terminal_observed_at === failure.terminal_observed_at));
      if (!reconciled) continue;
      const journalRelative = path.relative(data.dd_flow_home, controller.journal ?? '');
      if (!journalRelative || path.isAbsolute(journalRelative) || journalRelative.split(path.sep).includes('..')) continue;
      const journal = (await frozenFile(snapshot,path.join(snapshot,'runtime',journalRelative))).text.trim().split('\n').filter(Boolean).map(JSON.parse);
      // Codex has an actual thread/read protocol; never invent a generic native
      // RPC for adapters that cannot independently prove their terminal Turn.
      const inspectRequests = new Set(); let nativeDescendant = false;
      for (const event of journal) {
        const p = event.payload;
        if (b.harness_id === 'codex-desktop' && event.kind === 'outbound' && p?.method === 'thread/read' && p.params?.threadId === b.provider_session_id) inspectRequests.add(p.id);
        if (event.kind !== 'inbound' || !inspectRequests.has(p?.id)) continue;
        if (p?.result?.thread?.id === b.provider_session_id && p.result.thread.turns?.some(turn => turn.id === b.terminal_turn_id && turn.status === 'failed' && equalNativeError(turn.error,failure.provider_error))) nativeDescendant = true;
      }
      if (nativeDescendant) { facts.push({ ...b,outcome:'failed' }); continue; }
      if (b.harness_id !== 'zcode-acp') continue;
      const daemonRelative = path.join(path.dirname(journalRelative), 'daemon.json');
      const daemon = JSON.parse((await frozenFile(snapshot,path.join(snapshot,'runtime',daemonRelative))).text);
      const nativeRoot = daemon.sessions?.find(session => session.provider_session_id === b.parent_provider_session_id && session.root_provider_session_id === b.parent_provider_session_id)?.adapter_session_id;
      const requests = new Map(); let terminal = null; const failedLifetimes = [];
      for (const event of journal) {
        const p = event.payload;
        if (event.kind === 'outbound' && p?.method === 'zcode/session/retainedTerminal' && p.params?.sessionId === b.provider_session_id) requests.set(p.id, {kind:'terminal',params:p.params});
        if (event.kind === 'outbound' && ['zcode/session/subagents','zcode/session/retainedSubagents'].includes(p?.method) && nativeRoot && p.params?.sessionId === nativeRoot) requests.set(p.id, {kind:'topology'});
        const request = requests.get(p?.id);
        if (event.kind === 'inbound' && request?.kind === 'terminal' && p.result?.available === true && p.result.sessionId === b.provider_session_id && p.result.terminal_turn_id === b.terminal_turn_id
          && p.result.startedAt === request.params.startedAt && p.result.endedAt === request.params.endedAt && p.result.terminal_observed_at === failure.terminal_observed_at && equalNativeError(p.result.provider_error,failure.provider_error)) terminal = p.result;
        const topology = p?.result?.topology ?? p?.result;
        if (event.kind === 'inbound' && request?.kind === 'topology') for (const child of topology?.ended?.items ?? []) if (child.status === 'failed' && child.childSessionId === b.provider_session_id) failedLifetimes.push(child);
      }
      if (terminal && failedLifetimes.some(child => child.startedAt === terminal.startedAt && child.endedAt === terminal.endedAt)) facts.push({ ...b, outcome: 'failed' });
    }
    const verdict = validateNativeFailureEvidence(result, facts);
    if (verdict.status === 'confirmed') verifiedResults.set(result,verificationKey(result));
    return verdict;
  } catch (error) { return { status: 'unconfirmed', reason: 'native_failure_capture_unavailable', code: typeof error?.code === 'string' ? error.code : 'capture_read_failed' }; }
}
