import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hashJson, writeJsonAtomic } from "./runner-events.mjs";
import { withRunnerLock } from "./runner-lock.mjs";
import { isTerminalRunState } from "./completion-scope.mjs";
import { executionAdmissionHash, executionFixtureHash } from "./execution-contract.mjs";

const fail = (message, code = "comparison_blocked") => { throw Object.assign(new Error(message), { code }); };
const read = async file => JSON.parse(await readFile(file, "utf8"));
const stamp = () => new Date().toISOString();

// Variant labels/acceptance references name the attempt, not execution semantics.
export function comparisonProfile(profile) {
  const value = structuredClone(profile);
  delete value.id; delete value.semantic_decisions;
  if (value.operational_decision?.acceptance) delete value.operational_decision.acceptance.reference;
  if (value.selection?.e2e !== true || value.selection.stop_after !== "specify" || value.selection.repetitions !== 1)
    fail("Comparison requires one E2E repetition with stop_after=specify", "comparison_input_invalid");
  return value;
}

function verifyAck(variant, ack) {
  if (!/^EVAL-[A-Za-z0-9-]+$/.test(ack?.run_id ?? "") || ack.root !== path.join(variant.home, "runs", ack.run_id))
    fail("Run acknowledgment escaped the recorded isolated home", "comparison_ack_invalid");
  return { root: ack.root, run_id: ack.run_id };
}

async function verifyManifest(variant, root) {
  const manifest = await read(path.join(root, "manifest.json"));
  if (hashJson(manifest.profile) !== variant.profile_sha256 || manifest.execution_contract?.semantic_sha256 !== variant.contract_sha256
    || executionAdmissionHash(manifest.execution_contract) !== variant.admission_sha256
    || executionFixtureHash(manifest.interaction_fixtures, manifest.stage_context_sha256) !== variant.fixture_sha256
    || hashJson(manifest.input_checkpoint) !== variant.checkpoint_sha256)
    fail("Prepared EVAL does not match the retained comparison inputs", "comparison_binding_mismatch");
  return verifyAck(variant, { root, run_id: manifest.run_id });
}

async function reconcile(variant) {
  let entries;
  try { entries = await readdir(path.join(variant.home, "runs"), { withFileTypes: true }); }
  catch (error) { if (error.code !== "ENOENT") throw error; entries = []; }
  const roots = entries.filter(entry => entry.isDirectory() && /^EVAL-/.test(entry.name));
  if (roots.length !== 1) fail("Launch acknowledgment missing: inspect isolated home; no launch will be repeated", "comparison_launch_unknown");
  return verifyManifest(variant, path.join(variant.home, "runs", roots[0].name));
}

function ownedPreparation(status, ack, active) {
  const runId = ack?.run_id;
  const live = status.live, inventory = live?.inventory;
  if (status.state !== "awaiting_provider" || !runId || live?.unavailable || inventory?.ok !== true
    || inventory.scope_id !== runId || inventory.dispatch_blocked || inventory.fence || inventory.control
    || live.journal?.unavailable || live.continuations?.some(item => item.unavailable)
    || !live.executions?.length || !live.executions.every(execution => !execution.unavailable || execution.error?.code === "ENOENT"
      && execution.error.message?.includes(path.join(ack.root, "executions")) && execution.error.message.includes("managed-runtime.json"))
    || !Array.isArray(inventory.provider_turns) || !inventory.processes?.length) return false;
  // Scope inventory selects native resources by retained budget, not owner ID:
  // controller/daemon owners differ from the EVAL observer during RUN publication.
  if (!inventory.processes.every(record => {
    if (["eval-observer", "eval-baseline"].includes(record.kind)) return record.owner_id === runId;
    try { return JSON.parse(record.metadata_json).budget?.scope_id === runId; } catch { return false; }
  }) || !inventory.provider_turns.every(turn => turn.scope_id === runId && inventory.processes.some(record => record.id === turn.process_id))) return false;
  const processes = inventory.processes.filter(record => !["stopped", "failed"].includes(record.state));
  return active.length > 0 && active.every(attempt => attempt.live_owner?.state === "alive"
    && Number.isInteger(attempt.owner_pid) && typeof attempt.owner_started_at === "string"
    && processes.some(record => record.kind === "eval-observer" && record.pid === attempt.owner_pid
      && record.pid_started_at?.replace(/\s+/g, " ").trim() === attempt.owner_started_at.replace(/\s+/g, " ").trim()))
    && processes.length > 0 && processes.every(record => ["starting", "running"].includes(record.state) && Date.parse(record.lease_expires_at) > Date.now());
}

function attention(status, ack) {
  if (status.cleanup_state === "blocked") return "cleanup blocked";
  if (["stopped", "paused", "recovery_blocked", "recovery_failed", "failed", "completed_with_failures"].includes(status.state)) return status.state;
  const attempts = status.runner_attempts ?? [];
  if (attempts.some(attempt => attempt.unavailable || attempt.error || ["failed", "recovery_blocked"].includes(attempt.last_recorded_status))) return "runner attempt blocker";
  const active = attempts.filter(attempt => !["requested", "completed", "superseded"].includes(attempt.last_recorded_status));
  const unavailable = status.live?.unavailable || status.live?.observation_complete === false
    && (status.state === "awaiting_provider" || isTerminalRunState(status.state));
  if ((active.length || status.state === "awaiting_provider") && unavailable && !ownedPreparation(status, ack, active)) return "status ownership unavailable";
  if (active.length && !active.some(attempt => attempt.live_owner?.state === "alive")) return "runner owner unavailable";
  return null;
}

export function comparisonMeasurements(status) {
  return (status.execution_results ?? []).map(result => ({ execution: result.execution,
    completion_scope: result.completion_scope ?? null,
    conformance: result.experiment_conformance ?? result.conformance ?? null,
    stages: (result.lifecycle?.status?.index?.stage_runs ?? []).map(stage => ({ stage: stage.stage,
      started_at: stage.started_at ?? null, completed_at: stage.completed_at ?? null,
      duration_ms: stage.status === "done" && stage.started_at && stage.completed_at ? Date.parse(stage.completed_at) - Date.parse(stage.started_at) : null,
      paused_ms: stage.paused_ms ?? null })),
    decisions: (result.hitl ?? []).map(hitl => ({ source: hitl.decision_source ?? null,
      provider: hitl.coverage_filter?.provider ?? null, http_latency_ms: hitl.coverage_filter?.http_latency_ms ?? null,
      total_ms: hitl.coverage_filter?.total_ms ?? null, backoff_ms: hitl.coverage_filter?.backoff_ms ?? null,
      attempts: hitl.coverage_filter?.attempts?.length ?? null })) }));
}

/** CLI exit is submission acknowledgment only; status owns completion/settlement. */
export async function runSpecifyComparison({ profileFiles, campaignDir, baseHome, preflight, run, status,
  signal, pollMs = 5000, wait = delay, onStatus = () => {} }) {
  campaignDir = path.resolve(campaignDir); baseHome = path.resolve(baseHome);
  if (!profileFiles?.length || !Number.isFinite(pollMs) || pollMs < 1) fail("Profiles and positive poll interval required", "comparison_input_invalid");
  const inputs = await Promise.all(profileFiles.map(async file => ({ file: path.resolve(file), profile: await read(file) })));
  const common = hashJson(comparisonProfile(inputs[0].profile));
  if (inputs.some(input => hashJson(comparisonProfile(input.profile)) !== common)) fail("Only semantic_decisions may differ between comparison profiles", "comparison_input_mismatch");
  const identity = { base_home: baseHome, profiles: inputs.map(input => ({ file: input.file, sha256: hashJson(input.profile) })) };
  const expectedVariants = inputs.map((input, ordinal) => ({ ordinal, profile_file: input.file, profile_sha256: hashJson(input.profile),
    home: path.join(baseHome, `comparison-${hashJson(campaignDir).slice(0, 16)}`, `variant-${ordinal + 1}`) }));
  await mkdir(campaignDir, { recursive: true });
  const file = path.join(campaignDir, "receipt.json");
  return withRunnerLock(file, async () => {
    let receipt;
    try { receipt = await read(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (receipt && hashJson(receipt.inputs) !== hashJson(identity)) fail("Campaign inputs changed; use a new campaign directory", "comparison_input_mismatch");
    if (receipt && (receipt.schema_id !== "dd-eval/specify-comparison@1" || !Array.isArray(receipt.variants)
      || receipt.variants.length !== expectedVariants.length || receipt.variants.some((variant, index) => !variant
        || Object.entries(expectedVariants[index]).some(([key, value]) => variant[key] !== value)
        || variant.launch_intent && variant.launch_intent.profile_sha256 !== variant.profile_sha256)))
      fail("Campaign receipt does not match its recorded inputs/homes", "comparison_receipt_invalid");
    if (!receipt) receipt = { schema_id: "dd-eval/specify-comparison@1", inputs: identity, state: "prepared", variants: expectedVariants.map(variant => ({ ...variant, state: "prepared" })) };
    for (const variant of receipt.variants) if (variant.ack) {
      if (!variant.launch_intent) fail("Acknowledgment has no retained launch intent", "comparison_receipt_invalid");
      verifyAck(variant, variant.ack);
    }
    const save = () => writeJsonAtomic(file, { ...receipt, updated_at: stamp() });
    await save();
    try {
      receipt.state = "running"; delete receipt.error; await save();
      // Admit the entire matrix before the first paid submission.
      for (const variant of receipt.variants) {
        signal?.throwIfAborted();
        if (variant.contract_sha256 && variant.admission_sha256 && variant.fixture_sha256 && variant.checkpoint_sha256) continue;
        if (variant.launch_intent) fail("Launch has no retained admission", "comparison_binding_mismatch");
        await mkdir(variant.home, { recursive: true });
        const check = await preflight(variant);
        if (check.ok !== true || !check.execution_contract?.semantic_sha256 || !check.execution_contract?.integrity_sha256 || !check.input_checkpoint
          || !check.interaction_fixtures || typeof check.interaction_fixtures !== "object" || !/^[a-f0-9]{64}$/.test(check.stage_context_sha256 ?? "")) fail("Preflight has no authoritative comparison contract", "comparison_admission_invalid");
        variant.contract_sha256 = check.execution_contract.semantic_sha256;
        variant.contract_integrity_sha256 = check.execution_contract.integrity_sha256;
        variant.admission_sha256 = executionAdmissionHash(check.execution_contract);
        variant.fixture_sha256 = executionFixtureHash(check.interaction_fixtures, check.stage_context_sha256);
        variant.checkpoint_sha256 = hashJson(check.input_checkpoint.id && check.input_checkpoint.sha256 ? check.input_checkpoint : { id: check.input_checkpoint.id, sha256: check.input_checkpoint_sha256 });
        if (!check.input_checkpoint.sha256 && !check.input_checkpoint_sha256) fail("Preflight must expose checkpoint reference hash", "comparison_admission_invalid");
        variant.admitted_at = stamp(); await save();
      }
      const first = receipt.variants[0];
      if (receipt.variants.some(variant => variant.contract_sha256 !== first.contract_sha256 || variant.admission_sha256 !== first.admission_sha256
        || variant.fixture_sha256 !== first.fixture_sha256 || variant.checkpoint_sha256 !== first.checkpoint_sha256)) fail("Effective profiles, compatibility policy, fixtures or checkpoint differ", "comparison_input_mismatch");
      for (const variant of receipt.variants) {
        signal?.throwIfAborted();
        if (!variant.ack) {
          if (variant.launch_intent) variant.ack = await reconcile(variant);
          else {
            const runs = await readdir(path.join(variant.home, "runs")).catch(error => { if (error.code === "ENOENT") return []; throw error; });
            if (runs.length) fail("Variant home is not fresh", "comparison_home_not_empty");
            variant.launch_intent = { at: stamp(), profile_sha256: variant.profile_sha256 }; await save();
            variant.ack = verifyAck(variant, await run(variant));
            await verifyManifest(variant, variant.ack.root);
          }
          await save();
        }
        await verifyManifest(variant, variant.ack.root);
        for (;;) {
          signal?.throwIfAborted();
          const observed = await status(variant);
          variant.last_observation = { at: stamp(), state: observed.state, cleanup_state: observed.cleanup_state ?? null };
          await save(); onStatus({ ...variant.last_observation, ...variant.ack });
          if (isTerminalRunState(observed.state)) {
            if (observed.state !== "finished") fail(`EVAL ${variant.ack.run_id} ended ${observed.state}`);
            if (observed.cleanup_state === "settled") {
              variant.measurements = comparisonMeasurements(observed);
              if (variant.measurements.length !== 1 || variant.measurements[0].completion_scope?.target_reached !== true
                || variant.measurements[0].completion_scope?.stage_outcome !== "done")
                fail("Finished EVAL has no confirmed completed SPECIFY sample", "comparison_sample_invalid");
              if (variant.measurements.some(sample => sample.conformance?.state !== "matched"))
                fail("Finished EVAL has no matched experiment conformance", "comparison_conformance_invalid");
              variant.state = "settled"; await save(); break;
            }
          }
          const reason = attention(observed, variant.ack);
          if (reason) fail(`EVAL ${variant.ack.run_id}: ${reason}`);
          await wait(pollMs, undefined, { signal });
        }
      }
      receipt.state = "finished"; delete receipt.error; await save(); return receipt;
    } catch (error) {
      receipt.state = signal?.aborted ? "cancelled" : "blocked";
      receipt.error = { code: error.code ?? "comparison_failed", message: error.message };
      await save(); throw error;
    }
  }, { signal });
}
