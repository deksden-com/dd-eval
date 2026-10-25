import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, lstat, readdir, readlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { commandText } from './process-json.mjs';
import { withRunnerLock } from './runner-lock.mjs';
import { writeJsonAtomic } from './runner-events.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
export async function fixtureInputs(projectRoot, patterns) {
  const files = (await commandText('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: projectRoot })).split('\0').filter(Boolean).sort();
  const hash = createHash('sha256');
  for (const file of files.filter(file => patterns.some(pattern => path.matchesGlob(file, pattern)))) {
    const absolute = path.join(projectRoot, file), stat = await lstat(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Unsafe fixture input: ${file}`);
    hash.update(file).update(String(stat.mode & 0o111)).update(await readFile(absolute));
  }
  return hash.digest('hex');
}
async function evidenceDigest(directory) {
  const hash = createHash('sha256');
  async function walk(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        // The real producer links its disposable candidate's dependencies.
        // Retain the original link spelling without following a live workspace;
        // the immutable native reports/source proofs do not need it for replay.
        if (entry.name !== 'node_modules') throw new Error('Assessment evidence contains an undeclared symlink');
        hash.update(path.relative(directory, file)).update('dependency-link').update(await readlink(file)); continue;
      }
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) hash.update(path.relative(directory, file)).update('\0').update(await readFile(file)).update('\0');
    }
  }
  await walk(directory); return hash.digest('hex');
}
export async function verifyFixtureAssessment(reference, identity) {
  if (reference.groups) {
    if (!reference.groups.length || new Set(reference.groups.map(group => group.id)).size !== reference.groups.length
      || sha(JSON.stringify(reference.groups.map(group => [group.id, group.identity]))) !== identity) throw new Error('Fixture assessment group identity differs');
    for (const group of reference.groups) await verifyFixtureAssessment(group.reference, group.identity);
    return { identity, status: 'passed' };
  }
  const bytes = await readFile(reference.file);
  if (sha(bytes) !== reference.sha256) throw new Error('Fixture assessment receipt changed');
  const receipt = JSON.parse(bytes);
  if (receipt.schema_id === 'dd-eval/fixture-assessment@2') {
    if (receipt.status !== 'passed' || receipt.identity !== identity || !receipt.execution || !receipt.validation_identity) throw new Error('Fixture assessment validation does not qualify these inputs');
    const executionBytes = await readFile(receipt.execution.file);
    if (sha(executionBytes) !== receipt.execution.sha256) throw new Error('Fixture assessment execution changed');
    const execution = JSON.parse(executionBytes);
    if (execution.schema_id !== 'dd-eval/fixture-execution@2' || execution.status !== 'passed' || execution.identity !== identity || sha(JSON.stringify(execution.execution_manifest)) !== identity
      || !path.isAbsolute(execution.evidence_root) || await evidenceDigest(execution.evidence_root) !== execution.evidence_sha256
      || sha(JSON.stringify(receipt.validation_manifest)) !== receipt.validation_identity) throw new Error('Fixture assessment execution does not qualify these inputs');
    return { ...receipt, result: execution.result, evidence_root: execution.evidence_root, evidence_sha256: execution.evidence_sha256 };
  }
  if (receipt.schema_id !== 'dd-eval/fixture-assessment@1' || receipt.status !== 'passed' || receipt.identity !== identity
    || !path.isAbsolute(receipt.evidence_root) || await evidenceDigest(receipt.evidence_root) !== receipt.evidence_sha256) throw new Error('Fixture assessment does not qualify these inputs');
  return receipt;
}
export async function resolveFixtureAssessment({ identity, assess, home = process.env.DD_EVAL_FIXTURE_ASSESSMENT_HOME ?? path.join(os.homedir(), '.dd-eval', 'fixture-assessments') }) {
  if (!path.isAbsolute(home) || !/^[a-f0-9]{64}$/.test(identity)) throw new Error('Invalid assessment home/identity');
  const root = path.join(home, identity), current = path.join(root, 'current.json');
  await mkdir(root, { recursive: true });
  // Existing PID/birth-fenced lock; never steal a live owner or silently rerun a
  // failed/unknown assessment. Another launch can retry admission after it ends.
  return withRunnerLock(path.join(root, 'assessment'), async () => {
    let retained;
    try { retained = JSON.parse(await readFile(current, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (retained) { await verifyFixtureAssessment(retained, identity); return { ...retained, source: 'reused_fixture_assessment' }; }
    const attempt = path.join(root, randomUUID()), file = path.join(attempt, 'assessment.json'), evidence = path.join(attempt, 'evidence');
    await mkdir(evidence, { recursive: true });
    const record = { schema_id: 'dd-eval/fixture-assessment@1', status: 'running', identity, evidence_root: evidence };
    const save = async () => { await writeJsonAtomic(file, record); const reference = { file, sha256: sha(await readFile(file)) }; await writeJsonAtomic(current, reference); return reference; };
    await save();
    try {
      record.result = await assess(evidence);
      record.evidence_sha256 = await evidenceDigest(evidence);
      record.status = 'passed';
      return { ...await save(), source: 'executed' };
    } catch (error) { record.status = 'failed'; record.error = { code: error.code ?? 'fixture_assessment_failed' }; await save(); throw error; }
  }, { timeoutMs: Infinity }); // The assessor owns inactivity/cleanup budgets; a live single-flight is not a second failed assessment.
}

/** Execution belongs to its physical inputs; a new reader validates those same
 * immutable reports, never silently runs the product again or revives old PASS. */
export async function resolveFixtureValidation({ executionManifest, validationManifest, assess, validate, home = process.env.DD_EVAL_FIXTURE_ASSESSMENT_HOME ?? path.join(os.homedir(), '.dd-eval', 'fixture-assessments') }) {
  const identity = sha(JSON.stringify(executionManifest)), validationIdentity = sha(JSON.stringify(validationManifest));
  if (!path.isAbsolute(home)) throw new Error('Invalid assessment home');
  const root = path.join(home, identity), current = path.join(root, 'execution.json');
  await mkdir(root, { recursive: true });
  return withRunnerLock(path.join(root, 'assessment'), async () => {
    let executionRef, execution;
    try { executionRef = JSON.parse(await readFile(current, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    let executed = false;
    if (executionRef) {
      const bytes = await readFile(executionRef.file);
      if (sha(bytes) !== executionRef.sha256) throw new Error('Fixture assessment execution changed');
      execution = JSON.parse(bytes);
      if (execution.schema_id !== 'dd-eval/fixture-execution@2' || execution.identity !== identity || execution.status !== 'passed' || sha(JSON.stringify(execution.execution_manifest)) !== identity
        || await evidenceDigest(execution.evidence_root) !== execution.evidence_sha256) throw new Error('Fixture assessment execution is failed, unknown or changed');
    } else {
      const attempt = path.join(root, randomUUID()), file = path.join(attempt, 'execution.json'), evidence = path.join(attempt, 'evidence');
      await mkdir(evidence, { recursive: true });
      execution = { schema_id: 'dd-eval/fixture-execution@2', status: 'running', identity, execution_manifest: executionManifest, evidence_root: evidence };
      const save = async () => { await writeJsonAtomic(file, execution); executionRef = { file, sha256: sha(await readFile(file)) }; await writeJsonAtomic(current, executionRef); };
      await save();
      try { execution.result = await assess(evidence); execution.evidence_sha256 = await evidenceDigest(evidence); execution.status = 'passed'; await save(); executed = true; }
      catch (error) { execution.status = 'failed'; execution.error = { code: error.code ?? 'fixture_execution_failed' }; await save(); throw error; }
    }
    const directory = path.join(root, 'validations', `${executionRef.sha256}-${validationIdentity}`), file = path.join(directory, 'assessment.json');
    let retained;
    try { retained = await readFile(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (retained) { const reference = { file, sha256: sha(retained) }; await verifyFixtureAssessment(reference, identity); return { ...reference, source: 'reused_fixture_assessment' }; }
    await mkdir(directory, { recursive: true });
    const receipt = { schema_id: 'dd-eval/fixture-assessment@2', identity, validation_identity: validationIdentity, validation_manifest: validationManifest, execution: executionRef, status: 'running' };
    await writeJsonAtomic(file, receipt);
    try { receipt.result = await validate(execution.result); receipt.status = 'passed'; }
    catch (error) { receipt.status = 'failed'; receipt.error = { code: error.code ?? 'fixture_validation_failed' }; await writeJsonAtomic(file, receipt); throw error; }
    await writeJsonAtomic(file, receipt);
    return { file, sha256: sha(await readFile(file)), source: executed ? 'executed' : 'revalidated_fixture_assessment' };
  }, { timeoutMs: Infinity });
}
