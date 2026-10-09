import path from "node:path";
import { readdir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readRegularFile } from "./regular-file.mjs";
import { hashJson, sha256, writeJsonAtomic } from "./runner-events.mjs";
import { withRunnerLock } from "./runner-lock.mjs";
import { inspectDaemonOperation } from "./daemon-operations.mjs";
import { commandJson } from "./process-json.mjs";
import { processRetired, processSnapshot } from "./process-snapshot.mjs";
import { profileSemanticHash } from "./execution-contract.mjs";

const fail = message => { throw Object.assign(new Error(message), { code: "definition_qualification_outcome_unknown" }); };
const read = async file => JSON.parse(await readRegularFile(file, "utf8"));
const optional = async file => { try { return await read(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; } };
const recoveryFile = file => `${file}.reconciliation.json`;
const binding = (record, home) => createHash("sha256").update(JSON.stringify([home, record.id, record.kind, record.owner_id, record.lease_token, record.pid, record.pid_started_at, record.project_id, record.run_id, record.work_id, record.check_id, record.operation_id, record.metadata_json])).digest("hex");

/** Native model requests are never replayed. This narrower recovery closes a
 * sealed, Session-less preparation whose create failed at ownership admission.
 * Codex is the only inspected adapter contract here; unknown contracts fail closed. */
async function preparation(intentFile, home, root) {
  const operation = path.dirname(path.dirname(intentFile));
  const relative = path.relative(home, operation).split(path.sep);
  if (relative.length !== 2 || !/^[a-f0-9]{64}$/.test(relative[0]) || !/^operation-[A-Za-z0-9-]+$/.test(relative[1])
    || path.basename(path.dirname(intentFile)) !== "native-intents" || !/^[a-f0-9]{64}\.json$/.test(path.basename(intentFile))
    || path.dirname(root) !== path.join(operation, "interaction-judge")
    || !(await realpath(intentFile)).startsWith(`${await realpath(operation)}${path.sep}`)
    || !(await realpath(root)).startsWith(`${await realpath(operation)}${path.sep}`)
    || !(await realpath(operation)).startsWith(`${await realpath(home)}${path.sep}`)) fail("Preparation has foreign qualification ownership");
  const intent = await read(intentFile), packet = await read(path.join(root, "packet.json"));
  const native = await read(path.join(root, "native-intent.json"));
  const profile = native.profile_snapshot;
  if (path.basename(intentFile) !== `${sha256(intent.id)}.json` || hashJson(intent.identity) !== intent.native_key
    || intent.identity.judge?.harness !== "codex-desktop" || profile?.harness !== "codex-desktop"
    || native.profile_id !== profile.id || native.profile_sha256 !== profileSemanticHash(profile)
    || Object.entries(intent.identity.judge).some(([key, value]) => value !== (key === "permission_mode" ? profile.permission_mode ?? profile.permission : profile[key]))
    || native.packet_sha256 !== hashJson(packet) || packet.question !== intent.identity.question || packet.stage !== intent.identity.stage
    || hashJson(packet.responses) !== hashJson(intent.identity.responses) || hashJson(packet.required_result) !== hashJson(intent.identity.required_result)
    || (packet.subject_context?.source_context_sha256 ?? null) !== intent.identity.context_sha256
    || await optional(path.join(root, "result.json")) || (await readdir(root)).some(name => /^capacity-.*\.json$/.test(name))) fail("Preparation input/profile changed or a model request exists");
  const stateDir = path.join(root, "daemon"), state = await read(path.join(stateDir, "daemon.json"));
  const owner = state.config?.runtime_owner, shutdown = state.shutdown;
  if (!owner || owner.schema_id !== "dd-flow/runtime-owner@1" || owner.role !== "judge" || owner.owner_id !== `judge:${sha256(stateDir)}`
    || owner.operation_id !== owner.owner_id || owner.state_dir !== stateDir || owner.dd_flow_home !== path.join(operation, "dd-flow-home")
    || owner.dd_flow_bin !== path.join(owner.dd_flow_home, "bin/dd-flow") || !path.isAbsolute(owner.resource_home ?? "")
    || owner.adapter_executable !== path.join(owner.dd_flow_home, "harness-runtime/bin/dd-codex.mjs")
    || state.config.cwd !== root || state.config.resourceHome !== owner.resource_home || !Number.isSafeInteger(state.pid) || state.pid < 1
    || !Array.isArray(state.sessions) || state.sessions.length || state.active_operation !== null || state.active_tree !== false
    || shutdown?.schema_id !== "dd-flow/daemon-shutdown@1" || shutdown.daemon_id !== state.daemon_id || shutdown.result?.clean !== true
    || !Number.isFinite(Date.parse(shutdown.tree_observed_at)) || !Array.isArray(shutdown.required_phases)
    || !["tree", "provider", "provider_resource", "daemon_resource"].every(phase => shutdown.required_phases.includes(phase))
    || shutdown.required_phases.some(phase => phase !== "daemon_resource" && shutdown.phases?.[phase] !== true)) fail("Preparation has no sealed native tree or exact runtime owner");
  const ledger = [];
  for (const name of (await readdir(path.join(stateDir, "operations"))).sort()) {
    if (!/^[a-f0-9]{64}$/.test(name)) fail("Preparation has an unreadable native operation");
    const request = await read(path.join(stateDir, "operations", name, "requested.json"));
    if (sha256(request.operation_id) !== name) fail("Preparation operation identity changed");
    const observed = await inspectDaemonOperation(stateDir, request.operation_id);
    if (observed.operation === "daemon.start") {
      if (observed.state !== "completed" || observed.started_daemon_id !== state.daemon_id || observed.result?.daemon_id !== state.daemon_id
        || observed.result.pid !== state.pid || observed.result.cwd !== root) fail("Preparation startup is not bound to its incarnation");
    } else if (observed.daemon_id !== state.daemon_id || !["failed", "completed"].includes(observed.state)) fail("Preparation has an unsettled or foreign operation");
    if (observed.operation === "session.create") {
      const diagnostics = observed.error?.cause?.details?.hook_diagnostics;
      const details = observed.error?.details;
      // A bound admission ACK can fail its final timeliness check before the
      // native create. It has no failed child trace, but retains the same exact
      // process/no-dispatch proof. Neither case authorizes replay of a Turn.
      const rejectedAdmission = details?.action === "admission" && details.native_dispatch_started === false
        && ["committed", "no_effect"].includes(details.effect);
      const rejectedHeartbeat = Array.isArray(diagnostics) && diagnostics.length > 0
        && diagnostics.every(value => value.native_dispatch_started === false && value.process_id === state.resource_process.id && value.action === "heartbeat");
      if (observed.state !== "failed" || observed.session_id !== null || observed.error?.code !== "process_ownership_unknown"
        || details?.process_id !== state.resource_process?.id || !rejectedAdmission && !rejectedHeartbeat) fail("Native create was not rejected before model dispatch");
    } else if (!["daemon.start", "daemon.stop"].includes(observed.operation)) fail("Preparation has a model/native request; do not repeat it");
    ledger.push(observed);
  }
  if (ledger.filter(value => value.operation === "daemon.start").length !== 1 || !ledger.some(value => value.operation === "daemon.stop")) fail("Preparation lacks a unique startup and sealed stop");
  return { intent, state, owner, root, binding_sha256: hashJson({ intent, packet, native, state, ledger }) };
}

async function ownedRecords(prepared, invoke) {
  const { owner, state } = prepared;
  const env = { DD_FLOW_HOME: owner.dd_flow_home, DD_FLOW_CONFIG_HOME: owner.dd_flow_home, DD_FLOW_BIN: owner.dd_flow_bin, DD_FLOW_RESOURCE_HOME: owner.resource_home };
  const run = args => invoke(owner.dd_flow_bin, ["runtime", "process", ...args], { cwd: prepared.root, env, timeoutMs: 60_000 });
  const inventory = await run(["status"]);
  if (inventory.ok !== true || !Array.isArray(inventory.processes)) fail("Preparation resource registry cannot be inspected");
  if (inventory.processes.filter(record => record.owner_id === owner.owner_id).length !== 2) fail("Preparation has unexpected owned resources");
  const records = [state.resource_process, state.provider_process].map(reference => {
    const record = inventory.processes.find(value => value.id === reference?.id);
    const metadata = record && JSON.parse(record.metadata_json);
    if (!record || record.lease_token !== reference.lease_token || record.owner_id !== owner.owner_id
      || record.kind !== (record.id === state.resource_process.id ? "codex-daemon" : "codex-provider")
      || record.operation_id !== `${owner.operation_id}:${record.id === state.resource_process.id ? "codex-daemon:daemon" : "codex-provider"}`
      || !record.pid || !record.pid_started_at || !reference.registration_sha256
      || reference.registration_sha256 !== binding(record, owner.resource_home)
      || metadata.role !== "judge" || metadata.state_dir !== owner.state_dir || metadata.dd_flow_home !== owner.dd_flow_home
      || metadata.adapter_executable !== owner.adapter_executable || !Number.isSafeInteger(metadata.process_group_id)
      || (record.id === state.resource_process.id ? record.pid !== state.pid : record.pid !== state.provider_pid || metadata.owner_pid !== state.pid)) fail("Preparation process binding changed; no process may be stopped");
    return record;
  });
  return { records, run };
}

async function retired(records) {
  const processes = await processSnapshot();
  for (const record of records) {
    const group = JSON.parse(record.metadata_json).process_group_id;
    if (!["stopped", "failed"].includes(record.state) || !Number.isFinite(Date.parse(record.finished_at))
      || !processRetired(record.pid, record.finished_at) || processes.some(value => value.pgid === group)) fail("Preparation owner/process group is not physically retired");
  }
}

export async function assertQualificationPreparationRecovery({ intentFile, home, invoke = commandJson }) {
  const receipt = await optional(recoveryFile(intentFile));
  if (!receipt) return false;
  const prepared = await preparation(intentFile, home, receipt.judge_root);
  if (receipt.schema_id !== "dd-eval/qualification-preparation-reconciliation@1" || receipt.intent_file !== intentFile
    || receipt.status !== "retired_before_model_dispatch" || receipt.binding_sha256 !== prepared.binding_sha256
    || !Number.isFinite(Date.parse(receipt.observed_at))) fail("Preparation reconciliation is stale or unbound");
  const { records } = await ownedRecords(prepared, invoke);
  await retired(records);
  if (hashJson(receipt.processes) !== hashJson(records.map(record => ({ id: record.id, registration_sha256: binding(record, prepared.owner.resource_home), finished_at: record.finished_at })))) fail("Reconciled physical owner was replaced");
  return true;
}

export async function reconcileQualificationPreparation({ intentFile, home, invoke = commandJson }) {
  intentFile = path.resolve(intentFile); home = path.resolve(home);
  return withRunnerLock(path.join(home, "qualification"), async () => {
    if (await assertQualificationPreparationRecovery({ intentFile, home, invoke })) return await read(recoveryFile(intentFile));
    const intent = await read(intentFile), operation = path.dirname(path.dirname(intentFile));
    const roots = [];
    for (const name of await readdir(path.join(operation, "interaction-judge"))) {
      const root = path.join(operation, "interaction-judge", name), packet = await optional(path.join(root, "packet.json"));
      if (packet?.question === intent.identity?.question && packet?.stage === intent.identity?.stage) roots.push(root);
    }
    if (roots.length !== 1) fail("Preparation has no unique retained packet");
    const before = await preparation(intentFile, home, roots[0]);
    const { records, run } = await ownedRecords(before, invoke);
    // Exact lease/PID/birth/group ownership is checked by the runtime stop API.
    // Never use reconcile --owner: it claims unrelated expired records too.
    for (const record of records) {
      const stopped = await run(["stop", "--id", record.id, "--lease-token", record.lease_token]);
      if (stopped.ok !== true || stopped.process?.id !== record.id || !["stopped", "failed"].includes(stopped.process.state)) fail("Owned preparation stop was not acknowledged");
    }
    const after = await preparation(intentFile, home, roots[0]);
    if (before.binding_sha256 !== after.binding_sha256) fail("Native preparation changed while retiring its owner");
    const final = await ownedRecords(after, invoke);
    await retired(final.records);
    const receipt = { schema_id: "dd-eval/qualification-preparation-reconciliation@1", status: "retired_before_model_dispatch", intent_file: intentFile,
      judge_root: after.root, binding_sha256: after.binding_sha256, observed_at: new Date().toISOString(),
      processes: final.records.map(record => ({ id: record.id, registration_sha256: binding(record, after.owner.resource_home), finished_at: record.finished_at })) };
    await writeJsonAtomic(recoveryFile(intentFile), receipt);
    await assertQualificationPreparationRecovery({ intentFile, home, invoke });
    return receipt;
  });
}
