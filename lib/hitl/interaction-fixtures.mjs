import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { stages } from "../entry-pack.mjs";
import { flowStageCatalog } from "../flow-boundaries.mjs";
import { readJson } from "../json-file.mjs";
import { hashJson } from "../runner-events.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const sha256 = value => createHash("sha256").update(value).digest("hex");
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/**
 * Load and validate canonical stage responses, defaulting missing fixtures to forbidden.
 * @param {string} caseRoot Case definition root.
 * @param {string} stage Selected stage.
 * @param {string|null} expectedSha256 Optional retained fixture hash.
 * @returns {Promise<object>} Validated response fixture and hash.
 */
export async function interactionFixture(caseRoot, stage, expectedSha256 = null) {
  const file = path.join(caseRoot, "entry-pack-source", "interactions", `${stage}.json`);
  const value = (await exists(file)) ? await readJson(file) : { schema_id: "dd-eval/canonical-responses@1", stage, mode: "forbidden", max_rounds: 0, responses: [] };
  if (!isObject(value) || Object.keys(value).some((key) => !["schema_id", "stage", "mode", "max_rounds", "responses"].includes(key)) || value.schema_id !== "dd-eval/canonical-responses@1" || value.stage !== stage || !Array.isArray(value.responses)) fail(`invalid interaction fixture for ${stage}`, "interaction_fixture_invalid");
  const responses = value.responses.map((response) => {
    if (!isObject(response) || Object.keys(response).some((key) => !["id", "topic", "applicability", "answer", "input_kind"].includes(key)) || !response.id || !response.topic || !response.applicability || !response.answer || [response.id, response.topic, response.applicability, response.answer].some((item) => typeof item !== "string")
      || response.input_kind !== undefined && (stage !== 'interactive' || !['turn', 'finish'].includes(response.input_kind))) fail(`invalid interaction response for ${stage}`, "interaction_fixture_invalid");
    return response;
  });
  const mode = value.mode ?? "optional"; const maxRounds = value.max_rounds ?? 1;
  if (new Set(responses.map(({ id }) => id)).size !== responses.length || !["forbidden", "optional", "required"].includes(mode) || !Number.isInteger(maxRounds) || maxRounds < 0 || (mode === "forbidden" ? maxRounds !== 0 || responses.length !== 0 : maxRounds < 1 || responses.length === 0)) fail(`invalid interaction policy for ${stage}`, "interaction_fixture_invalid");
  const fixtureSha256 = hashJson(value);
  if (expectedSha256 && fixtureSha256 !== expectedSha256) fail(`interaction fixture changed after the run was planned: ${stage}`, "interaction_fixture_checksum_mismatch");
  return { mode, max_rounds: maxRounds, responses, file: (await exists(file)) ? file : null, sha256: fixtureSha256 };
}

/**
 * Select the case-authored input kind for matched canonical response IDs.
 * @param {object} fixture Validated response fixture.
 * @param {string[]} responseIds Matched unique response identifiers.
 * @returns {string} Explicit turn or finish kind; throws on ambiguity.
 */
export function interactiveInputKind(fixture, responseIds) {
  if (!Array.isArray(responseIds) || !responseIds.length || new Set(responseIds).size !== responseIds.length) fail('Interactive input requires matched canonical responses', 'interactive_input_kind_invalid');
  const kinds = responseIds.map(id => fixture.responses.find(response => response.id === id)?.input_kind);
  if (kinds.some(kind => !['turn', 'finish'].includes(kind)) || new Set(kinds).size !== 1) fail('Interactive responses require one explicit turn/finish kind', 'interactive_input_kind_invalid');
  return kinds[0];
}

/**
 * Read the paused question only when the fixture authorizes another HITL round.
 * @param {object} input Fixture, stage, pause and prior round count.
 * @returns {Promise<string>} Question text; throws on invalid or forbidden interaction.
 */
export async function authorizeHitl({ fixture, stage, pause, rounds }) {
  if (!pause?.id || typeof pause.question_path !== "string" || !pause.question_path) fail(`HITL question is missing at ${stage}`, "hitl_pause_invalid");
  let question;
  try { question = await readFile(pause.question_path, "utf8"); }
  catch (error) { fail(`HITL question is unavailable at ${stage}: ${error.message}`, "hitl_pause_invalid"); }
  if (fixture.mode !== "forbidden" && rounds < fixture.max_rounds) return question;
  const error = new Error(`unexpected HITL at ${stage}: ${fixture.mode === "forbidden" ? "forbidden" : "max_rounds_exceeded"}`);
  error.code = "unexpected_hitl";
  error.hitl = { stage, pause_id: pause.id, question_path: pause.question_path, question_sha256: sha256(question), rounds, max_rounds: fixture.max_rounds, reason: fixture.mode === "forbidden" ? "forbidden" : "max_rounds_exceeded" };
  throw error;
}

/**
 * Enumerate stages reachable by the selected execution ranges.
 * @param {object[]} executions Selected execution stage ranges.
 * @param {string[]} flowContour Ordered flow stage catalog.
 * @returns {string[]} Unique reachable stages; throws for invalid ranges.
 */
export function executionStages(executions, flowContour = stages) {
  const catalog = flowStageCatalog(flowContour);
  const selected = new Set();
  for (const execution of executions) {
    const from = catalog.indexOf(execution.stage); const to = catalog.indexOf(execution.terminal_stage);
    if (from < 0 || to < from) fail("execution has an invalid stage range", "selection_invalid");
    for (let index = from; index <= to; index += 1) selected.add(catalog[index]);
  }
  return [...selected];
}

/**
 * Pin selected fixture hashes, checking inherited pins on fork and resume.
 * @param {string} caseRoot Case definition root.
 * @param {object[]} executions Selected execution stage ranges.
 * @param {object|null} retained Existing manifest with inherited fixture pins.
 * @param {string[]} flowContour Ordered flow stage catalog.
 * @returns {Promise<object>} Fixture hashes keyed by reachable stage.
 */
export async function interactionFixtureManifest(caseRoot, executions, retained = null, flowContour = stages) {
  const selected = executionStages(executions, flowContour);
  return Object.fromEntries(await Promise.all([...selected].map(async (stage) => {
    const fixture = await interactionFixture(caseRoot, stage, retained === null ? null : fixtureHash(retained, stage));
    return [stage, { interaction_fixture_sha256: fixture.sha256 }];
  })));
}

/**
 * Read a retained fixture pin for a stage.
 * @param {object} manifest Retained EVAL manifest.
 * @param {string} stage Selected stage.
 * @returns {string} SHA-256 fixture hash; throws if the pin is missing or invalid.
 */
export function fixtureHash(manifest, stage) {
  const value = manifest?.interaction_fixtures?.[stage]?.interaction_fixture_sha256;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(`run manifest does not pin the interaction fixture for ${stage}`, "interaction_fixture_invalid");
  return value;
}

/** Reject selected HITL-enabled stages without a configured interaction Judge. */
export async function assertInteractionJudgePreflight({ caseRoot, executions, runProfile, flowContour = stages }) {
  const policies = await Promise.all(executionStages(executions, flowContour).map(async (stage) => [stage, await interactionFixture(caseRoot, stage)]));
  if (policies.some(([, fixture]) => fixture.mode !== "forbidden") && typeof runProfile.value.interaction_judge?.profile_id !== "string") {
    fail("selected stages permit HITL but interaction_judge.profile_id is missing", "interaction_judge_missing");
  }
}
