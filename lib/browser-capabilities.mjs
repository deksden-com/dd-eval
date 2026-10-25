import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandJson } from './process-json.mjs';
import { checkResourceEnvironment } from './check-resources.mjs';
import { resolveFixtureAssessment, verifyFixtureAssessment } from './fixture-assessment.mjs';
import { hashJson, sha256, writeJsonAtomic } from './runner-events.mjs';

const probe = fileURLToPath(new URL('../tools/browser-capability-probe.mjs', import.meta.url));
export async function assessBrowserCapabilities({ projectRoot, checkResources }) {
  const env = checkResourceEnvironment(checkResources);
  let inputs, probeSha256, identity;
  try {
    inputs = await commandJson(process.execPath, [probe, projectRoot, '--identity-only'], { cwd: projectRoot, env });
    if (!inputs.identity) return { schema_id: 'dd-eval/browser-capabilities@1', ...inputs };
    probeSha256 = sha256(await readFile(probe));
    identity = hashJson({ ...inputs.identity, probe_sha256: probeSha256 });
    const reference = await resolveFixtureAssessment({ identity, assess: async evidence => {
      const result = await commandJson(process.execPath, [probe, projectRoot], { cwd: projectRoot, env });
      if (hashJson(result.identity) !== hashJson(inputs.identity)) throw Object.assign(new Error('Browser capability environment changed during probe'), { code: 'browser_environment_changed' });
      if (result.probe_executed !== true || !['supported', 'unsupported'].includes(result.outcome)) throw Object.assign(new Error('Browser capability probe could not complete'), { code: 'browser_capability_unavailable' });
      await writeJsonAtomic(path.join(evidence, 'browser-capabilities.json'), result);
      return result;
    } });
    const retained = await verifyFixtureAssessment(reference, identity);
    return { schema_id: 'dd-eval/browser-capabilities@1', ...retained.result, assessment_status: 'observed', probe_sha256: probeSha256, identity_sha256: identity, reference };
  } catch (error) {
    // Failed/unknown cache evidence stays failed and is not silently rerun.
    // It is an unavailable environment fact, not a new mandatory product gate.
    return { schema_id: 'dd-eval/browser-capabilities@1', ...(inputs?.identity ? { identity: inputs.identity, identity_sha256: identity, probe_sha256: probeSha256 } : {}), probe_executed: false, outcome: 'unknown', assessment_status: 'unavailable', reason: ['browser_environment_changed', 'browser_capability_unavailable'].includes(error.code) ? error.code : 'assessment_unavailable' };
  }
}

export async function browserCapabilitySource({ baseline, runRoot }) {
  if (!runRoot) return null; // dry-run has no actual RUN or promised source.
  const { reference, ...capability } = baseline?.browser_capabilities ?? { schema_id: 'dd-eval/browser-capabilities@1', probe_executed: false, outcome: 'unknown', reason: 'retained_baseline_has_no_capability' };
  // The RUN is portable. A cache file locator is not a future allowed-read path
  // for Subject/Judge; retain its digest, not an absolute host/cache reference.
  const fact = { ...capability, ...(reference ? { assessment_receipt_sha256: reference.sha256 } : {}) };
  let relative = 'environment/browser-capabilities.json', file = path.join(runRoot, relative);
  const bytes = `${JSON.stringify(fact, null, 2)}\n`;
  await mkdir(path.dirname(file), { recursive: true });
  try {
    const old = await readFile(file, 'utf8');
    if (old !== bytes) {
      let prior; try { prior = JSON.parse(old); } catch { throw new Error('Retained browser capability fact changed'); }
      if (prior.identity_sha256 === fact.identity_sha256) throw new Error('Retained browser capability fact changed');
      // A scoped re-probe on fork/resume publishes a new immutable fact. It
      // never overwrites the original context's evidence or historical hash.
      relative = `environment/browser-capabilities-${sha256(bytes)}.json`; file = path.join(runRoot, relative);
      try { if (await readFile(file, 'utf8') !== bytes) throw new Error('Retained browser capability fact changed'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; await writeJsonAtomic(file, fact); }
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; await writeJsonAtomic(file, fact); }
  return { role: 'browser_environment_capabilities', path: relative, root: 'run', required: true, sha256: sha256(bytes),
    reason: 'Environment fact, not a product decision. Only the exact probe operation is qualified. selectOption is not keyboard-only proof. Unsupported/unknown operations require a supported environment or an explicit tooling blocker, not product repair or a fabricated PASS.' };
}

/** Diagnostic comparison only. It never changes FLOW repair authority, grants
 * keyboard acceptance or attributes a generic assertion from platform alone. */
export function browserCapabilityDiagnostic(fact, failure) {
  const unavailable = { status: 'unassessable', attribution: 'undetermined' };
  if (fact?.schema_id !== 'dd-eval/browser-capabilities@1' || fact.probe_executed !== true || fact.outcome !== 'unsupported'
    || !/^[a-f0-9]{64}$/.test(fact.probe_sha256 ?? '') || hashJson({ ...fact.identity, probe_sha256: fact.probe_sha256 }) !== fact.identity_sha256
    || failure?.code !== 'native_select_keyboard_mismatch' || !failure.browser_identity || !failure.browser_operation
    || hashJson(failure.browser_identity) !== hashJson(fact.identity)
    || hashJson(failure.browser_operation) !== hashJson(fact.identity?.operation)) return unavailable;
  return { status: 'matching_unsupported_operation', attribution: 'tooling_evidence', capability_sha256: fact.identity_sha256,
    instruction: 'Independent environment proof matches this exact failed operation. This diagnostic does not change the retained check verdict or satisfy keyboard acceptance.' };
}
