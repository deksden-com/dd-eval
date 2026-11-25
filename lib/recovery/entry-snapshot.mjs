import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import { sha256 } from "../runner-events.mjs";
import { contained } from "../contained-path.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { isInstalledFlow } from "../installed-flows.mjs";
import { isStageRunSnapshot } from "./snapshot-version.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** List stage-entry manifests without granting restoration authority. */
export async function runnerCheckpoints({ evalRoot, executionId = "e2e" }) {
  const root = path.resolve(evalRoot), directory = path.join(root, "executions", executionId, "boundaries");
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error));
  const checkpoints = [];
  for (const entry of entries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name, "snapshot.json");
    try {
      const bytes = await readRegularFile(file);
      const manifest = JSON.parse(bytes);
      if (isStageRunSnapshot(manifest) && manifest.purpose === "stage_entry" && typeof manifest.stage_entry === "string") checkpoints.push({ id: entry.name, stage: manifest.stage_entry, run_id: manifest.run_id, created_at: manifest.created_at ?? null, manifest_sha256: sha256(bytes), verification: "manifest_only", forkability: manifest.assessment_only === true || manifest.pack_evidence ? "assessment_only" : "requires_engine_verification" });
    } catch { /* a damaged capture is not an eligible checkpoint */ }
  }
  return { root, execution: executionId, checkpoints };
}

/** Verify the owned stage-entry manifest, checksum and selected flow boundary. */
export async function verifySnapshot(home, entry, stage, expectedFlow = null) {
  const root = contained(home, entry.snapshot.locator, "snapshot locator");
  const manifestFile = path.join(root, entry.snapshot.kind === "bootstrap" ? "bootstrap.json" : "snapshot.json");
  if (!(await exists(manifestFile))) fail(`snapshot manifest is missing: ${manifestFile}`, "snapshot_missing");
  const bytes = await readFile(manifestFile);
  if (sha256(bytes) !== entry.snapshot.manifest_sha256) fail(`snapshot manifest checksum does not match: ${manifestFile}`, "snapshot_checksum_mismatch");
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (entry.snapshot.kind === "run") {
    if (!isStageRunSnapshot(manifest) || manifest.purpose !== "stage_entry" || manifest.run_id !== entry.snapshot.run_id || manifest.stage_entry !== stage
      || manifest.assessment_only === true || manifest.pack_evidence) fail("RUN snapshot does not match a restorable stage entry", "snapshot_contract_mismatch");
  } else {
    const validBoundary = manifest.schema_id === "dd-eval/bootstrap-snapshot@1" ? manifest.stage === "specify" && manifest.flow === undefined
      : manifest.schema_id === "dd-eval/bootstrap-snapshot@2" && manifest.stage === "preflight" && isInstalledFlow(manifest.flow?.id)
        && Object.keys(manifest.flow).sort().join() === "descriptor_sha256,id,source_sha256"
        && /^[a-f0-9]{64}$/.test(manifest.flow.source_sha256 ?? "") && /^[a-f0-9]{64}$/.test(manifest.flow.descriptor_sha256 ?? "");
    if (!validBoundary || manifest.stage !== stage || entry.stage !== undefined && entry.stage !== stage) fail("Bootstrap snapshot does not match its selected initial boundary", "snapshot_contract_mismatch");
    if(expectedFlow && ((manifest.flow?.id??'sdlc')!==expectedFlow.id
      || expectedFlow.descriptor_sha256!==undefined && manifest.flow?.descriptor_sha256!==expectedFlow.descriptor_sha256))
      fail('Bootstrap snapshot belongs to another selected workflow','snapshot_contract_mismatch');
  }
  return { root, manifest };
}
