import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

/** References select authored expectations, never manufacture an issued answer. */
export async function validateCanonicalResponseRefs(root, assessment, allowedStages = null) {
  const refs = assessment.canonical_response_refs ?? [];
  const invalid = () => { throw Object.assign(new Error('Invalid own-case canonical response reference'), { code: 'canonical_response_ref_invalid' }); };
  if (!Array.isArray(refs)) invalid();
  const seen = new Set();
  for (const ref of refs) {
    if (!ref || Object.keys(ref).some(key => !['stage', 'response_id', 'purpose'].includes(key))
      || !/^[a-z][a-z-]{0,63}$/.test(ref.stage ?? '') || !/^[\w-]{1,120}$/.test(ref.response_id ?? '')
      || typeof ref.purpose !== 'string' || !ref.purpose.trim() || ref.purpose.length > 256) invalid();
    const key = `${ref.stage}:${ref.response_id}`;
    if (allowedStages && !allowedStages.includes(ref.stage)) invalid();
    if (seen.has(key)) invalid();
    seen.add(key);
    let fixture;
    try {
      const file = await realpath(path.join(root, 'entry-pack-source', 'interactions', `${ref.stage}.json`));
      if (!file.startsWith(`${await realpath(root)}${path.sep}`)) invalid();
      fixture = JSON.parse(await readFile(file, 'utf8'));
    }
    catch { invalid(); }
    if (!fixture || typeof fixture !== 'object' || fixture.stage !== ref.stage || !Array.isArray(fixture.responses)
      || fixture.responses.some(item => !item || typeof item !== 'object' || typeof item.id !== 'string')
      || new Set(fixture.responses.map(item => item.id)).size !== fixture.responses.length
      || fixture.responses.filter(item => item.id === ref.response_id && typeof item.answer === 'string' && item.answer.trim()).length !== 1) invalid();
  }
  return assessment;
}
