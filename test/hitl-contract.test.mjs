import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, symlink, readFile, open } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import { buildHitlPacket, validateHitlPacket, validateGroundedHitl, hitlMatchContract, interactionGroundedPrompt } from "../lib/hitl-contract.mjs";

const responses = [{ id: "a", topic: "value", applicability: "value", answer: "Closed tasks may change priority. No colors." }, { id: "b", topic: "default", applicability: "default", answer: "Default is normal." }];
const atom = (source_quote, classification = "covered_by_canonical_response", extra = {}) => ({ source_quote, decision: source_quote, classification, reference_bindings: [], answer_evidence: classification === "covered_by_canonical_response" ? [{ response_id: "a", answer_quote: "Closed tasks may change priority." }] : [], scope_evidence: [], rationale: "Exact supplied evidence", ...extra });
const raw = atoms => ({ schema_id: hitlMatchContract, atoms });
const packet = question => buildHitlPacket({ stage: "specify", question, responses });

test("shared Judge prompt structure preserves materiality/reference policy, not live semantic proof", async () => {
  const prompt = interactionGroundedPrompt("packet.json");
  assert.match(prompt, /Do not turn each proposed option or its dependent details into unconditional decisions/);
  assert.match(prompt, /explicit refusal of separate control ordering/);
  assert.match(prompt, /independently requested delivery time remains a gap/);
  assert.match(prompt, /one contiguous substring/);
  assert.match(prompt, /Copy its source_quote from the original question before describing the decision/);
  assert.match(prompt, /invalid because it adds punctuation/);
  assert.match(prompt, /Before returning, verify each source_quote occurs literally in packet.question/);
  assert.doesNotMatch(prompt, /Before returning, use available local tools/);
  assert.match(prompt, /Write your proposed raw JSON to draft.json/);
  assert.match(prompt, /neither determines semantic classes nor proves completeness/);
  assert.match(prompt, /finite vocabulary from an ordered scale/);
  assert.match(prompt, /Subject's assertion/);
  assert.match(prompt, /scope_evidence/);
  assert.match(prompt, /Reserve unnecessary_question for an explicit request to reconfirm an already agreed decision/);
  assert.match(prompt, /scope restriction is not proof that this clarification was already asked and answered/);
  assert.match(prompt, /Canonical responses are available answers, not evidence that the Subject already received them/);
  assert.match(prompt, /only an extra unaccepted decision without an exact resolving answer is out_of_scope/);
  const corpus = JSON.parse(await readFile(new URL("../cases/sdlc-eval-2026-summer-task-priority/entry-pack-source/interactions/qualification.json", import.meta.url)));
  const fixtures = JSON.parse(await readFile(new URL("../cases/sdlc-eval-2026-summer-task-priority/entry-pack-source/interactions/specify.json", import.meta.url)));
  const item = corpus.items.find(item => item.id === "luna-cp190-exact");
  const p = await buildHitlPacket({ stage: "specify", question: item.question, responses: fixtures.responses });
  const answer = p.responses.find(response => response.id === "clarification-task-priority").answer;
  const quote = "Перечень кодов и подписей — фиксированный словарь, а не требование нового порядка задач или отдельного порядка UI-контрола.";
  assert.ok(answer.includes(quote));
  assert.equal(validateGroundedHitl(raw([atom("порядок от low к urgent", undefined, { decision: "Need an additional order?", answer_evidence: [{ response_id: "clarification-task-priority", answer_quote: quote }] })]), p).status, "matched");
});

test("native draft checker reuses final validation, rejects changed citation bytes and never rewrites inputs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hitl-draft-"));
  try {
    const p = await buildHitlPacket({ stage: "specify", question: "Need ordered labels?", responses,
      subjectContext: { objective: "Labels\nonly." } });
    const packetFile = path.join(root, "packet.json"), draftFile = path.join(root, "draft.json");
    const packetBytes = JSON.stringify(p);
    await writeFile(packetFile, packetBytes);
    const check = value => {
      const bytes = JSON.stringify(value);
      return writeFile(draftFile, bytes).then(async () => {
        const result = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/check-hitl-draft.mjs", import.meta.url)), packetFile, draftFile], { encoding: "utf8", cwd: root });
        assert.equal(await readFile(packetFile, "utf8"), packetBytes);
        assert.equal(await readFile(draftFile, "utf8"), bytes);
        return result;
      });
    };
    assert.equal((await check(raw([atom(p.question)]))).status, 0);
    const gap = atom(p.question, "fixture_gap", { scope_evidence: [{ kind: "context", field: "objective", quote: "Labels\nonly." }] });
    // Even an authored wrong semantic class passes structural validation: no expected-answer leak.
    assert.equal((await check(raw([gap]))).status, 0);
    gap.scope_evidence[0].quote = "Labels only.";
    const invalid = await check(raw([gap]));
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Invalid accepted-scope evidence/);
    assert.equal((await check(raw([atom(p.question + "?")]))).status, 1);
    assert.equal((await check(raw([atom(p.question, undefined, { answer_evidence: [{ response_id: "a", answer_quote: "No\ncolors." }] })]))).status, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("qualification prompt template separates semantic policy from checkout locations", () => {
  const prompt = interactionGroundedPrompt("<packet>", "<checker>");
  assert.ok(prompt.includes('node "<checker>" "<packet>" draft.json'));
  assert.ok(!prompt.includes(fileURLToPath(new URL("..", import.meta.url))));
});

test("nonadjacent canonical evidence is separate quotes, never a stitched quotation", async () => {
  const question = "Кто сможет закрывать и открывать задачу, нужен ли отдельный workflow?";
  const answer = "Owner и member могут закрыть задачу. Приоритет сохраняется. Отдельный workflow не нужен.";
  const p = await buildHitlPacket({ stage: "specify", question, responses: [{ id: "state", answer }] });
  const value = atom("Кто сможет закрывать и открывать задачу", undefined, { answer_evidence: [{ response_id: "state", answer_quote: "Owner и member могут закрыть задачу." }, { response_id: "state", answer_quote: "Отдельный workflow не нужен." }] });
  assert.equal(validateGroundedHitl(raw([value]), p).status, "matched");
  const stitched = structuredClone(value); stitched.answer_evidence = [{ response_id: "state", answer_quote: "Owner и member могут закрыть задачу. Отдельный workflow не нужен." }];
  assert.throws(() => validateGroundedHitl(raw([stitched]), p), { code: "judge_result_invalid" });
  assert.throws(() => validateGroundedHitl(raw([{ ...value, source_quote: value.source_quote + "?" }]), p), { code: "judge_result_invalid" });
});

test("derived projections retain shared quotes, precedence and fixture order", async () => {
  const p = await packet("Can closed tasks change priority and what is default? What about that case?");
  const quote = "Can closed tasks change priority and what is default?";
  const result = validateGroundedHitl(raw([atom(quote, undefined, { decision: "Default", answer_evidence: [{ response_id: "b", answer_quote: "normal" }] }), atom(quote, undefined, { decision: "Closed priority" }), atom("What about that case?", "ambiguous")]), p);
  assert.deepEqual(result.response_ids, ["a", "b"]);
  assert.deepEqual(result.covered_questions, [quote, quote]);
  assert.equal(result.status, "unmatched"); assert.equal(result.classification, "ambiguous");
  assert.deepEqual(validateGroundedHitl(result, p, { stored: true }), result);
  const forged = structuredClone(result); forged.status = "matched";
  assert.throws(() => validateGroundedHitl(forged, p, { stored: true }), { code: "judge_result_invalid" });
});

test("validator rejects invented provenance, unsupported coverage and duplicate evidence", async () => {
  const p = await packet("Closed tasks?\r\nПриоритет 👋?");
  for (const edit of [a => { a.source_quote = "invented"; }, a => { a.answer_evidence = []; }, a => { a.answer_evidence[0].answer_quote = "invented"; }, a => { a.answer_evidence[0].response_id = "unknown"; }, a => { a.answer_evidence.push({ ...a.answer_evidence[0] }); }, a => { a.reference_bindings = [{ reference_quote: "Closed", source_id: "canonical-response", evidence_quote: "Closed" }]; }, a => { a.extra = true; }]) {
    const a = atom("Closed tasks?"); edit(a);
    assert.throws(() => validateGroundedHitl(raw([a]), p), { code: "judge_result_invalid" });
  }
  assert.equal(validateGroundedHitl(raw([atom("Приоритет 👋?", "ambiguous")]), p).response_ids.length, 0);
  assert.throws(() => validateGroundedHitl(raw([atom("Closed tasks?"), atom("Closed tasks?")]), p));
  const corrupted = structuredClone(p); corrupted.grounding_sources[0].text += "x";
  assert.throws(() => validateGroundedHitl(raw([atom("Closed tasks?")]), corrupted));
  assert.throws(() => validateGroundedHitl({ schema_id: "dd-eval/hitl-match@1", status: "matched", covered_questions: ["priority"], response_ids: ["a"] }, p));
});

test("resolved references use exact supplied context, never answer namespace", async () => {
  const p = await buildHitlPacket({ stage: "code", question: "Can that task change priority?", responses, subjectContext: { accepted_decisions: ["That task is closed."], roots: {} } });
  const a = atom("Can that task change priority?", undefined, { reference_bindings: [{ reference_quote: "that task", source_id: "context", evidence_quote: "That task is closed." }] });
  assert.equal(validateGroundedHitl(raw([a]), p).status, "matched");
  a.reference_bindings[0].source_id = "a";
  assert.throws(() => validateGroundedHitl(raw([a]), p), { code: "judge_result_invalid" });
});

test("malformed context/source and undecodable bytes fail with retained context identity", async () => {
  const build = subjectContext => buildHitlPacket({ stage: "code", question: "Which default?", responses, subjectContext, readRegularFile: readFile });
  for (const context of ["bad", [], { roots: [] }, { sources: "bad" }, { sources: [null] }, { task_input: [1] }, { roots: { secret: "/" }, sources: [{ root: "secret", path: "x" }] }]) await assert.rejects(build(context), { code: "judge_context_invalid" });
  const root = await mkdtemp(path.join(os.tmpdir(), "hitl-utf8-"));
  try {
    await writeFile(path.join(root, "input"), Buffer.from([0xc3, 0x28]));
    await assert.rejects(build({ roots: { project: root }, sources: [{ path: "input" }] }), { code: "judge_context_invalid" });
    await writeFile(path.join(root, "input"), "\ufeffПривет\r\n👋");
    const result = await build({ roots: { project: root }, sources: [{ path: "input" }] });
    assert.equal(result.grounding_sources[2].text, "\ufeffПривет\r\n👋");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("source allowlist freezes bytes, verifies digest/containment and deduplicates physical sources", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hitl-ground-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "hitl-outside-"));
  try {
    await writeFile(path.join(root, "source.txt"), "Accepted closed task behavior.");
    const context = { roots: { project: root }, objective: "priority", sources: [{ root: "project", path: "source.txt" }], task_input: [{ path: "source.txt" }] };
    const readRegularFile = async file => { const fd = await open(file); try { assert.equal((await fd.stat()).isFile(), true); return await fd.readFile(); } finally { await fd.close(); } };
    const build = subjectContext => buildHitlPacket({ stage: "code", question: "What about that behavior?", responses, subjectContext, readRegularFile });
    const p = await build(context);
    assert.deepEqual(p.subject_context, context);
    assert.equal(p.grounding_sources.length, 3);
    assert.deepEqual(p.grounding_sources[2].origin.roles, ["source", "task_input"]);
    assert.equal(p.grounding_sources[1].text.includes(root), false);
    const forged = structuredClone(p); forged.grounding_sources[2].origin.path = "undeclared";
    assert.throws(() => validateGroundedHitl(raw([atom("What about that behavior?", "ambiguous")]), forged), { code: "judge_result_invalid" });
    await writeFile(path.join(root, "source.txt"), "Changed later");
    const a = atom("What about that behavior?", "ambiguous", { reference_bindings: [{ reference_quote: "that behavior", source_id: "source-0", evidence_quote: "Accepted closed task behavior." }] });
    assert.equal(validateGroundedHitl(raw([a]), p).classification, "ambiguous");
    await writeFile(path.join(outside, "secret"), "secret"); await symlink(path.join(outside, "secret"), path.join(root, "link"));
    for (const source of [{ path: "link" }, { path: "../escape" }, { path: "missing" }, { path: "source.txt", sha256: "0".repeat(64) }]) await assert.rejects(build({ ...context, sources: [source], task_input: [] }), { code: "judge_context_invalid" });
    const optional = await build({ ...context, sources: [{ path: "missing", optional: true }], task_input: [] });
    assert.equal(optional.grounding_sources.length, 2); assert.equal(optional.unavailable_sources.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test("v3 schema distinguishes raw and stored contracts and agrees on structural rejection", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/hitl-match.v3.schema.json", import.meta.url), "utf8"));
  const ajv = new Ajv({ strict: false }); const check = ajv.compile(schema); const stored = ajv.compile({ ...schema, $id: "stored-test", $ref: "#/$defs/stored" });
  const p = await packet("Closed tasks?"); const value = raw([atom("Closed tasks?")]);
  assert.equal(check(value), true); assert.equal(stored(validateGroundedHitl(value, p)), true);
  for (const bad of [raw([]), raw([atom("Closed tasks?", undefined, { answer_evidence: [] })]), raw([atom("Closed tasks?", "ambiguous", { answer_evidence: [{ response_id: "a", answer_quote: "No colors." }] })]), { ...value, status: "matched" }]) { assert.equal(check(bad), false); assert.throws(() => validateGroundedHitl(bad, p)); }
  const prompt = interactionGroundedPrompt("packet.json"); assert.match(prompt, /never from canonical responses/); assert.match(prompt, /untrusted data/); assert.match(prompt, /dd-eval\/hitl-match@3/);
});

test("v3 rejects malformed semantic fields and response identity before retaining a packet", async () => {
  for (const context of [{ objective: [] }, { accepted_decisions: [{}] }, { accepted_decisions: [""] }, { accepted_decisions: "scope" }]) await assert.rejects(buildHitlPacket({ stage: "specify", question: "Which default?", responses, subjectContext: context }), { code: "judge_context_invalid" });
  for (const invalid of [[responses[0], responses[0]], [{ id: "", answer: "yes" }], [{ id: "a", answer: "" }], [{ id: "a", answer: "yes", applicability: {} }]]) await assert.rejects(buildHitlPacket({ stage: "specify", question: "Which default?", responses: invalid }), { code: "judge_context_invalid" });
  const p = await packet("Closed tasks?");
  for (const edited of [{ ...p, schema_id: "dd-eval/interaction-judge-packet@99" }, { ...p, required_result: {} }, { ...p, responses: [...p.responses, p.responses[0]] }]) assert.throws(() => validateHitlPacket(edited), { code: "judge_context_invalid" });
});

test("scope evidence is typed exact provenance, not a deterministic entailment verdict", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hitl-scope-"));
  try {
    await writeFile(path.join(root, "accepted.md"), "Accepted conflicting simultaneous updates.");
    const p = await buildHitlPacket({ stage: "specify", question: "Which concurrent value?", responses, subjectContext: { objective: "Resolve concurrent updates.", accepted_decisions: ["Concurrent updates need a conflict rule."], roots: { project: root }, sources: [{ path: "accepted.md" }] } });
    const schema = JSON.parse(await readFile(new URL("../schemas/hitl-match.v3.schema.json", import.meta.url), "utf8"));
    const check = new Ajv({ strict: false }).compile(schema);
    const variants = [{ kind: "context", field: "objective", quote: "concurrent updates" }, { kind: "context", field: "accepted_decisions", index: 0, quote: "conflict rule" }, { kind: "source", source_id: "source-0", quote: "conflicting simultaneous updates" }, { kind: "response", response_id: "a", quote: "Closed tasks may change priority." }];
    for (const evidence of variants) {
      const value = raw([atom(p.question, "fixture_gap", { scope_evidence: [evidence] })]);
      assert.equal(check(value), true); assert.equal(validateGroundedHitl(value, p).classification, "fixture_gap");
    }
    // Valid quoted provenance alone does not prove the decision is necessary.
    for (const evidence of [{ kind: "context", field: "objective", index: 0, quote: "concurrent" }, { kind: "context", field: "accepted_decisions", index: -1, quote: "conflict" }, { kind: "source", source_id: "question", quote: "Which" }, { kind: "context", field: "reason", quote: "concurrent" }, { kind: "response", response_id: "unknown", quote: "Closed" }, { kind: "source", source_id: "source-0", quote: "invented" }, { kind: "context", field: "accepted_decisions", index: 1, quote: "conflict" }]) assert.throws(() => validateGroundedHitl(raw([atom(p.question, "fixture_gap", { scope_evidence: [evidence] })]), p), { code: "judge_result_invalid" });
    for (const evidence of [[], [variants[0], { quote: variants[0].quote, field: "objective", kind: "context" }]]) assert.throws(() => validateGroundedHitl(raw([atom(p.question, "fixture_gap", { scope_evidence: evidence })]), p), { code: "judge_result_invalid" });
    assert.throws(() => validateGroundedHitl(raw([atom(p.question, "ambiguous", { scope_evidence: [variants[0]] })]), p));
    assert.equal(check(raw([atom(p.question, "fixture_gap")])), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("historical v2 structural reader is explicit, never a version downgrade", async () => {
  const current = await packet("Closed tasks?");
  const old = { ...current, schema_id: "dd-eval/interaction-judge-packet@2" }; delete old.directory_sources;
  const value = atom(old.question); delete value.scope_evidence;
  const rawV2 = { schema_id: "dd-eval/hitl-match@2", atoms: [value] };
  const v2 = new Ajv({ strict: false }).compile(JSON.parse(await readFile(new URL("../schemas/hitl-match.v2.schema.json", import.meta.url), "utf8")));
  assert.equal(v2(rawV2), true);
  assert.equal(validateGroundedHitl(rawV2, old, { historical: true }).status, "matched");
  assert.throws(() => validateGroundedHitl(rawV2, old), { code: "judge_result_invalid" });
  assert.throws(() => validateGroundedHitl(rawV2, current, { historical: true }), { code: "judge_result_invalid" });
  assert.throws(() => validateGroundedHitl(raw([atom(current.question)]), old, { historical: true }), { code: "judge_result_invalid" });
});
