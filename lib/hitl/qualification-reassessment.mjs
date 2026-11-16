import path from "node:path";
import { readdir, realpath } from "node:fs/promises";
import { qualificationJudgeInput } from "../harness/driver-bindings.mjs";
import { hitlPacketContract } from "../hitl-contract.mjs";
import { collectHitlSources } from "./sources.mjs";
import { assertJudgePreparationCleanup } from "../judge/cleanup.mjs";
import { readJson } from "../json-file.mjs";
import { assertQualificationPreparationRecovery } from "../qualification-recovery.mjs";
import { hashJson, sha256 } from "../runner-events.mjs";
import { qualificationGrounding } from "./qualification-context.mjs";
import { hitlQualificationHome } from "./qualification-home.mjs";
import { hitlQualificationContract, hitlQualificationPromptVersion, qualificationTask, contextGrounding } from "./qualification-contract.mjs";
import { qualificationNativeChain, qualificationSample } from "./judge-retained.mjs";
import { verifyQualificationSample } from "./qualification-sample.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };

/** Deterministic only: preserve every matching observation, including failed
 * expectations. A retained native final is never replaced to obtain PASS. */
export async function reassessHitlQualification(qualified) {
  const found = new Map(Object.values(qualified.tasks).map(task => [task.key, new Map()]));
  const intents = [];
  const home = hitlQualificationHome();
  // ponytail: scan the small local qualification archive; add a rebuildable
  // per-case index only if archive size makes this measurable.
  for (const directory of (await readdir(home)).filter(name => /^[a-f0-9]{64}$/.test(name)).sort()) {
    const root = path.join(home, directory);
    const files = [path.join(root, "receipt.json")];
    for (const name of (await readdir(root)).filter(name => /^operation-/.test(name)).sort()) {
      const operation = path.join(root, name);
      files.push(path.join(operation, "failure.json"));
      const intentRoot = path.join(operation, "native-intents");
      for (const name of await readdir(intentRoot).catch(error => { if (error.code === "ENOENT") return []; throw error; })) {
        const intent = await readJson(path.join(intentRoot, name));
        if (name.endsWith(".reconciliation.json")) continue;
        if (hashJson(intent.identity) !== intent.native_key || name !== `${sha256(intent.id)}.json`) fail("Retained Judge task intent is corrupt", "definition_qualification_invalid");
        if (found.has(intent.native_key)) intents.push({ ...intent, operation, intentFile: path.join(intentRoot, name) });
      }
    }
    for (const file of files) {
      const record = await readJson(file).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      if (!record || !["dd-eval/hitl-qualification@3", hitlQualificationContract].includes(record.schema_id)) continue;
      if (record.identity && (hashJson(record.identity) !== record.key || record.key !== directory)) fail("Archived qualification identity is corrupt", "definition_qualification_invalid");
      if (record.immutable_hash) { const { immutable_hash, ...content } = record; if (hashJson(content) !== immutable_hash) fail("Archived qualification receipt is corrupt", "definition_qualification_invalid"); }
      if (record.identity?.contract === "dd-eval/hitl-qualification@3"
        && (record.identity.prompt_sha256 !== hitlQualificationPromptVersion || hashJson(qualificationJudgeInput(record.identity.judge_profile)) !== hashJson(qualificationJudgeInput(qualified.profile)))) continue;
      for (const result of record.results ?? []) {
        if (result.samples && !found.has(result.native_key)) continue;
        for (const original of result.samples ?? [result]) {
          const operation = original.operation ?? record.operation ?? path.dirname(file);
          if (typeof original.receipt_file !== "string" || !operation.startsWith(`${root}${path.sep}`) && !result.samples
            || !original.receipt_file.startsWith(`${path.join(operation, "interaction-judge")}${path.sep}`)) fail("Archived Judge receipt has foreign ownership", "definition_qualification_invalid");
          const homeReal = await realpath(home), receiptReal = await realpath(original.receipt_file);
          if (!receiptReal.startsWith(`${homeReal}${path.sep}`)) fail("Archived Judge receipt escapes qualification home", "definition_qualification_invalid");
          const packetFile = path.join(path.dirname(original.receipt_file), "packet.json"), packet = await readJson(packetFile);
          const verdict = await readJson(original.receipt_file);
          let nativeKey = result.native_key;
          if (!result.samples) {
            if (packet.schema_id !== hitlPacketContract) continue;
            const chainFiles = (await readdir(path.dirname(packetFile))).filter(name => /^capacity-[a-f0-9]{64}\.json$/.test(name));
            if (chainFiles.length !== 1) fail("Archived Judge outcome has no unique native operation", "definition_qualification_invalid");
            const chain = await readJson(path.join(path.dirname(packetFile), chainFiles[0])), paid = chain.turns?.at(-1);
            if (!await qualificationNativeChain(path.dirname(packetFile), packetFile, verdict.session_id)) continue;
            if (paid?.state !== "completed") fail("Archived Judge outcome is unknown; do not dispatch a replacement", "definition_qualification_outcome_unknown");
            if (hashJson(qualificationJudgeInput(paid.result?.requested_profile ?? {})) !== hashJson(qualificationJudgeInput(qualified.profile))) continue;
            const binding = record.identity?.contexts?.[result.id];
            const grounding = packet.subject_context ? binding ? contextGrounding(binding)
              : qualificationGrounding(await collectHitlSources(packet.subject_context), packet.subject_context.roots.project) : null;
            nativeKey = hashJson(qualificationTask({ stage: packet.stage, question: packet.question, responses: packet.responses,
              context: packet.subject_context?.source_context_sha256 ?? null, grounding, profile: qualified.profile, requiredResult: packet.required_result }));
          }
          if (!found.has(nativeKey)) continue;
          const fixtureHash = record.identity?.fixture_sha256;
          const sample = result.samples ? original : await qualificationSample(original, operation, record.identity?.judge_profile ?? { ...qualified.profile, id: verdict.profile_id }, typeof fixtureHash === "string" ? fixtureHash : fixtureHash?.[packet.stage]);
          const previous = found.get(nativeKey).get(sample.receipt_file);
          if (previous && hashJson({ ...previous, comparison: null, assessment_observed: null }) !== hashJson({ ...sample, comparison: null, assessment_observed: null })) fail("Archived references disagree about the same native observation", "definition_qualification_invalid");
          found.get(nativeKey).set(sample.receipt_file, sample);
        }
      }
    }
  }
  for (const intent of intents) {
    if (hashJson(intent.identity) !== intent.native_key) fail("Retained Judge task intent is corrupt", "definition_qualification_invalid");
    if (![...found.get(intent.native_key).values()].some(sample => sample.operation === intent.operation && sample.original_item_id === intent.id)) {
      if (await assertQualificationPreparationRecovery({ intentFile: intent.intentFile, home })) continue;
      // Legacy intents and the dispatch/crash boundary remain unknown. A
      // prepared marker alone (including empty Sessions) cannot authorize retry.
      if (intent.schema_id === "dd-eval/qualification-intent@2" && intent.state === "prepared"
        && typeof intent.judge_root === "string" && path.dirname(intent.judge_root) === path.join(intent.operation, "interaction-judge")
        && intent.profile_id === qualified.profile.id && /^[a-f0-9]{64}$/.test(intent.packet_sha256 ?? "")) {
        const rootReal = await realpath(intent.judge_root), operationReal = await realpath(intent.operation), homeReal = await realpath(home);
        const packet = await readJson(path.join(intent.judge_root, "packet.json"));
        if (!operationReal.startsWith(`${homeReal}${path.sep}`) || !rootReal.startsWith(`${operationReal}${path.sep}`) || hashJson(packet) !== intent.packet_sha256
          || packet.question !== intent.identity.question || packet.stage !== intent.identity.stage
          || hashJson(packet.responses) !== hashJson(intent.identity.responses)) fail("Prepared Judge packet escaped or changed", "definition_qualification_invalid");
        await assertJudgePreparationCleanup(intent.judge_root, intent.profile_id);
        continue;
      }
      throw Object.assign(new Error("Retained Judge task has no confirmed native final; reconcile it, never repeat it"), { code: "definition_qualification_outcome_unknown",
        details: { item_id: intent.id, native_key: intent.native_key, operation: intent.operation, dispatch_state: intent.state ?? "legacy_unknown" } });
    }
  }
  const results = [];
  for (const item of qualified.corpus.items) {
    const task = qualified.tasks[item.id], samples = [...found.get(task.key).values()];
    const checked = [];
    for (const sample of samples) checked.push(await verifyQualificationSample(qualified, item, sample, { requirePassed: false }));
    results.push({ id: item.id, stage: item.stage ?? qualified.corpus.stage, native_key: task.key,
      samples: checked, passed: checked.length > 0 && checked.every(sample => sample.comparison.passed) });
  }
  return { results, missing: results.filter(item => !item.samples.length).map(item => item.id) };
}
