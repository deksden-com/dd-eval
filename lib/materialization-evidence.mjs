import path from "node:path";
import { realpath } from "node:fs/promises";
import { frozenFile, resolveBoundSnapshot, withFrozenRuntimeDatabase } from "./recovery-safety.mjs";
import { snapshotTreeHash } from "./case-acceptance.mjs";

const relative = value => typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\x00-\x1f\x7f]/.test(value) && !path.isAbsolute(value) && !value.split(/[\\/]/).includes("..");
const ensure = (ok, message) => { if (!ok) throw new Error(message); };

/** Use a completed stage cut, never today's live workspace or a later cut. */
export async function protocolizeMaterializationEvidence(evalRoot, result) {
  const base = { stage: "protocolize", status: "unavailable" };
  try {
    ensure(relative(result.execution), "execution_scope_invalid");
    const boundaries = (result.boundaries ?? []).filter(item => item.stage === "protocolize");
    ensure(boundaries.length <= 1, "ambiguous_stage_boundary");
    const checkpoint = boundaries[0] ?? result.recovery;
    ensure(checkpoint, "snapshot_unavailable");
    let snapshot, data;
    if (boundaries.length) {
      snapshot = checkpoint.snapshot;
      const owner = path.resolve(await realpath(evalRoot), "executions", result.execution, "boundaries");
      ensure(path.isAbsolute(snapshot ?? "") && snapshot.startsWith(owner + path.sep), "foreign_stage_boundary");
      ensure(await realpath(snapshot) === path.resolve(snapshot) && (await realpath(owner)) === owner, "foreign_stage_boundary");
      const manifest = await frozenFile(snapshot, path.join(snapshot, "snapshot.json"));
      data = JSON.parse(manifest.text);
      ensure(manifest.sha256 === checkpoint.manifest_sha256 && data.schema_id === "dd-flow/eval-run-snapshot@5"
        && (data.purpose === "stage_entry" && data.stage_entry === "plan" || data.purpose === "candidate" && data.stage_entry === null)
        && data.run_id === (result.lifecycle?.run_id ?? result.run_id), "stage_boundary_scope_mismatch");
      ensure(data.workspace?.sha256 === snapshotTreeHash(path.join(snapshot, "workspace")) && data.runtime_sha256 === snapshotTreeHash(path.join(snapshot, "runtime")), "snapshot_payload_mismatch");
    } else ({ snapshot, data } = await resolveBoundSnapshot({ evalRoot, execution: result.execution, result, checkpoint, purpose: "recovery" }));
    const runRelative = path.relative(data.dd_flow_home, data.source_status?.run?.run_root ?? "");
    ensure(relative(runRelative), "run_artifact_scope_mismatch");
    const reportFile = path.join(snapshot, "runtime", runRelative, "02-protocolize", "stage-report.json");
    const retainedReport = await frozenFile(snapshot, reportFile);
    await withFrozenRuntimeDatabase(snapshot, db => {
      const run = db.prepare("SELECT run_root, index_json FROM runs WHERE id = ? AND project_id = ?").get(data.run_id, data.project_id);
      ensure(run?.run_root === data.source_status?.run?.run_root, "materialization_runtime_scope_mismatch");
      const stage = JSON.parse(run.index_json).stage_runs?.find(item => item.stage === "protocolize");
      ensure(stage?.status === "done" && typeof stage.attempt === "string", "materialization_stage_unaccepted");
      const relocate = locator => {
        ensure(path.isAbsolute(locator ?? ""), "materialization_publication_invalid");
        let destination = path.resolve(locator);
        const mappings = db.prepare("SELECT payload_json FROM audit_events WHERE project_id = ? AND event_type = 'flow_run.publication_relocation' AND json_extract(payload_json, '$.run_id') = ? ORDER BY id LIMIT 256").all(data.project_id, data.run_id);
        for (const row of mappings) {
          const mapping = JSON.parse(row.payload_json);
          ensure(path.isAbsolute(mapping.from ?? "") && path.isAbsolute(mapping.to ?? ""), "materialization_publication_invalid");
          const suffix = path.relative(mapping.from, destination);
          if (relative(suffix)) destination = path.resolve(mapping.to, suffix);
        }
        return destination;
      };
      const rows = db.prepare("SELECT payload_json FROM audit_events WHERE project_id = ? AND event_type = 'flow_run.stage_report' AND json_extract(payload_json, '$.run_id') = ? AND json_extract(payload_json, '$.stage') = 'protocolize' ORDER BY id DESC LIMIT 256").all(data.project_id, data.run_id);
      const receipt = rows.map(row => JSON.parse(row.payload_json)).find(item => item.attempt === stage.attempt && relocate(item.root) === path.join(run.run_root, "02-protocolize"));
      ensure(receipt?.sha256 === retainedReport.sha256, "materialization_publication_mismatch");
    });
    const report = JSON.parse(retainedReport.text), proof = report.semantic?.materialization;
    ensure(proof, "legacy_materialization_unavailable");
    ensure(proof.schema_id === "dd-flow/protocolize-materialization@1" && proof.run_id === data.run_id && proof.stage === "protocolize" && report.run_id === data.run_id && report.stage === "protocolize" && report.verdict === "done", "materialization_scope_mismatch");
    ensure(proof.status === "passed" && ["create", "link", "update", "not_applicable"].includes(proof.action) && Array.isArray(proof.documents) && proof.documents.length <= 1024 && Array.isArray(proof.owned_links) && proof.owned_links.length <= 1024 && Array.isArray(proof.protocol_ids) && proof.protocol_ids.length <= 1024 && new Set(proof.protocol_ids).size === proof.protocol_ids.length && proof.protocol_ids.every(id => typeof id === "string" && id.length <= 256 && /^PRT-[A-Za-z0-9_-]+$/.test(id)), "materialization_contract_invalid");
    const documents = new Map();
    for (const ref of proof.documents) {
      ensure(relative(ref.path) && ref.path.startsWith(".memory-bank/") && /^[a-f0-9]{64}$/.test(ref.sha256 ?? "") && !documents.has(ref.path), "materialization_ref_invalid");
      const file = path.join(snapshot, "workspace", ref.path), retained = await frozenFile(snapshot, file);
      ensure(retained.sha256 === ref.sha256, "materialization_document_mismatch");
      documents.set(ref.path, { path: ref.path, sha256: ref.sha256, file, text: retained.text });
    }
    // ponytail: generated links are YAML flow arrays of safe IDs/paths; any
    // other syntax is unavailable, never a guessed missing product link.
    const links = (text, key) => {
      const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
      const line = front?.split(/\r?\n/).find(line => line.startsWith(key + ":"));
      ensure(line, "materialization_links_unavailable");
      const body = line.slice(key.length + 1).trim();
      ensure(/^\[(?:\s*'[A-Za-z0-9_./-]+'\s*(?:,\s*'[A-Za-z0-9_./-]+'\s*)*)?\]$/.test(body), "materialization_links_unavailable");
      return [...body.matchAll(/'([^']+)'/g)].map(match => match[1]);
    };
    ensure(proof.action === "not_applicable" ? proof.feature_path === null && proof.owned_links.length === 0 : relative(proof.feature_path) && proof.owned_links.length === proof.protocol_ids.length, "materialization_edges_invalid");
    const seen = new Set();
    const edges = proof.owned_links.map(edge => ({ feature_path: edge.feature_path, protocol_id: edge.protocol_id, protocol_path: edge.protocol_path }));
    const broken = edges.filter(edge => {
      ensure(edge.feature_path === proof.feature_path && proof.protocol_ids.includes(edge.protocol_id) && edge.protocol_path === `.memory-bank/protocol/${edge.protocol_id}/summary.md` && !seen.has(edge.protocol_id), "materialization_edge_scope_mismatch");
      seen.add(edge.protocol_id);
      const feature = documents.get(edge.feature_path), protocol = documents.get(edge.protocol_path);
      ensure(feature && protocol, "materialization_edge_document_unavailable");
      return !links(feature.text, "related_protocols").includes(edge.protocol_id) || !links(protocol.text, "related_features").includes(edge.feature_path);
    });
    return { ...base, status: broken.length ? "failed" : "passed", source: boundaries.length ? "stage_boundary" : "recovery", manifest_sha256: checkpoint.manifest_sha256, report_file: reportFile,
      action: proof.action, feature_path: proof.feature_path, protocol_ids: proof.protocol_ids, owned_links: edges, broken_links: broken, documents: [...documents.values()].map(({ text, ...ref }) => ref), authored_result_role: "input_not_materialized_output" };
  } catch (error) { return { ...base, reason: /^[a-z_]{1,80}$/.test(error.message ?? "") ? error.message : "snapshot_evidence_unavailable" }; }
}
