import path from "node:path";
import { fileURLToPath } from "node:url";
import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { isInstalledFlow } from "../installed-flows.mjs";
import { commandText } from "../process-json.mjs";
import { sha256 } from "../runner-events.mjs";
import { ignoreEvalLocalState } from "./task-input.mjs";
import { assertSourceTag, assertMemoryInputProject, assertProjectFlowPack } from "./source-validation.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

// Fetching an exact commit into an empty repository excludes later refs and
// objects. A full clone followed by checkout would leak future project facts.
/** Materialize only the pinned Git commit into a new owned project. */
export async function materializePinnedMemoryGit(projectRoot, repository, source, integrationBranch,flowId='mb-init') {
  // Committed authored bundles use Eval-repository-relative locators, never
  // the disposable product checkout's cwd. Absolute paths and URLs stay exact.
  if (!path.isAbsolute(repository) && !/^[a-z][a-z0-9+.-]*:|^[^/]+@[^:]+:/i.test(repository)) repository = path.resolve(repoRoot, repository);
  await mkdir(projectRoot); // Refuse an existing target; never reinitialize it.
  await commandText('git', ['init', '--quiet', '--initial-branch', integrationBranch], { cwd: projectRoot });
  await commandText('git', ['fetch', '--quiet', '--no-tags', repository, source.commit], { cwd: projectRoot });
  if (source.tag !== undefined) {
    await commandText('git', ['check-ref-format', `refs/tags/${source.tag}`], { cwd: projectRoot });
    await commandText('git', ['fetch', '--quiet', '--no-tags', repository, `refs/tags/${source.tag}:refs/tags/${source.tag}`], { cwd: projectRoot });
    await assertSourceTag(projectRoot, source);
  }
  await commandText('git', ['checkout', '--quiet', '-B', integrationBranch, source.commit], { cwd: projectRoot });
  await assertMemoryInputProject(projectRoot,flowId);
  await ignoreEvalLocalState(projectRoot);
}
/** Materialize the pinned product and flow pack for a canonical build. */
export async function materializeCanonicalInput({ root, sourceProjectRoot, flowSource, inputCheckpoint, flowId = "sdlc", integrationBranch = "main" }) {
  const { flowRoot, flowHead, sourceFlow } = flowSource;
  const expected = inputCheckpoint.value.flow_pack;
  const target = path.join(root, "input", "project");
  if (isInstalledFlow(flowId)) {
    await commandText("git", ["check-ref-format", "--branch", integrationBranch], { cwd: root });
    if (expected.delivery !== "installed_canon") fail("Memory checkpoint requires installed canon delivery", "input_checkpoint_flow_pack_invalid");
    await assertMemoryInputProject(sourceProjectRoot,flowId);
  } else if (flowId !== "sdlc" || expected.delivery === "installed_canon") fail("Flow delivery does not match selected workflow", "input_checkpoint_flow_pack_invalid");
  if (isInstalledFlow(flowId)) {
    await mkdir(path.dirname(target), { recursive: true });
    await materializePinnedMemoryGit(target, sourceProjectRoot, inputCheckpoint.value.source, integrationBranch,flowId);
    return { project_root: target, source_commit: inputCheckpoint.value.source.commit, materialized_commit: inputCheckpoint.value.source.commit, branch: integrationBranch, flow_root: flowRoot, flow_commit: flowHead, flow_pack_path: expected.path, flow_delivery: 'installed_canon' };
  }
  await commandText("git", ["clone", "--no-local", sourceProjectRoot, target], { cwd: root });
  // The product fact is pinned at the checkpoint, but the selected flow pack
  // is deliberately newer.  Materialize that pair as a clean local `main`
  // checkout: normal PROTOCOLIZE routing correctly refuses a dirty or
  // non-integration checkout and must not need an eval-only exception.
  await commandText("git", ["-C", target, "checkout", "-B", flowId === "mb-init" ? integrationBranch : "main", inputCheckpoint.value.source.commit], { cwd: root });
  await rm(path.join(target, ".memory-bank", "dd-flow"), { recursive: true, force: true });
  await cp(sourceFlow, path.join(target, ".memory-bank", "dd-flow"), { recursive: true, verbatimSymlinks: true });
  await assertProjectFlowPack(target, inputCheckpoint);
  const sourceCommit = await commandText("git", ["-C", target, "rev-parse", "HEAD"], { cwd: root });
  const sourceDate = await commandText("git", ["-C", target, "show", "-s", "--format=%aI", "HEAD"], { cwd: root });
  await commandText("git", ["-C", target, "add", expected.path], { cwd: root });
  const overlayChanged = Boolean(await commandText("git", ["-C", target, "status", "--porcelain", "--", expected.path], { cwd: root }));
  if (overlayChanged) await commandText("git", ["-C", target, "-c", "user.name=dd-eval", "-c", "user.email=eval@localhost", "commit", "--quiet", "-m", `dd-eval: materialize ${inputCheckpoint.value.id} flow pack`], { cwd: root, env: { GIT_AUTHOR_DATE: sourceDate, GIT_COMMITTER_DATE: sourceDate } });
  // Harnesses may create their private local state in the project directory.
  // It is not product evidence and must not make the normal Git policy fail.
  await ignoreEvalLocalState(target);
  const [materializedCommit, overlayManifest] = await Promise.all([
    commandText("git", ["-C", target, "rev-parse", "HEAD"], { cwd: root }),
    readFile(path.join(target, expected.path, "manifest.json"))
  ]);
  return {
    project_root: target,
    source_commit: sourceCommit,
    materialized_commit: materializedCommit,
    branch: "main",
    flow_root: flowRoot,
    flow_commit: flowHead,
    flow_pack_path: expected.path,
    flow_manifest_sha256: sha256(overlayManifest)
  };
}

/** Prepare an E2E input while preserving pinned source and flow identities. */
export async function prepareE2EInput({ projectRoot, inputCheckpoint, flowId = "sdlc", integrationBranch = "main" }) {
  const source = inputCheckpoint.value.source; const flow = inputCheckpoint.value.flow_pack;
  if (isInstalledFlow(flowId) ? flow.delivery !== "installed_canon" : flowId !== "sdlc" || flow.delivery === "installed_canon") fail("Flow delivery does not match selected workflow", "input_checkpoint_flow_pack_invalid");
  if (typeof source.repository !== "string" || typeof flow.repository !== "string") fail("E2E input checkpoint requires source and flow repositories", "input_checkpoint_invalid");
  await mkdir(path.dirname(projectRoot), { recursive: true });
  if (isInstalledFlow(flowId)) {
    await commandText("git", ["check-ref-format", "--branch", integrationBranch], { cwd: path.dirname(projectRoot) });
    await materializePinnedMemoryGit(projectRoot, source.repository, source, integrationBranch,flowId);
    return { project_root: projectRoot, workspace_root: projectRoot, run_id: null, run_home: null, flow_delivery: 'installed_canon', source_commit: source.commit };
  }
  await commandText("git", ["clone", "--no-checkout", source.repository, projectRoot], { cwd: path.dirname(projectRoot) });
  await assertSourceTag(projectRoot, source);
  await commandText("git", ["-C", projectRoot, "checkout", "-B", flowId === "mb-init" ? integrationBranch : "main", source.commit], { cwd: path.dirname(projectRoot) });
  if (source.repository !== flow.repository || source.commit !== flow.commit) {
    const flowRoot = path.join(path.dirname(projectRoot), "flow-source");
    try {
      await commandText("git", ["clone", "--no-checkout", flow.repository, flowRoot], { cwd: path.dirname(projectRoot) });
      await commandText("git", ["-C", flowRoot, "checkout", "--detach", flow.commit], { cwd: path.dirname(projectRoot) });
      const sourceFlow = path.join(flowRoot, flow.path); if (!(await exists(sourceFlow))) fail(`input checkpoint flow pack is missing: ${flow.path}`, "input_checkpoint_flow_missing");
      await rm(path.join(projectRoot, flow.path), { recursive: true, force: true });
      await cp(sourceFlow, path.join(projectRoot, flow.path), { recursive: true, verbatimSymlinks: true });
      const sourceDate = await commandText("git", ["-C", projectRoot, "show", "-s", "--format=%aI", "HEAD"], { cwd: projectRoot });
      await commandText("git", ["-C", projectRoot, "add", flow.path], { cwd: projectRoot });
      if (await commandText("git", ["-C", projectRoot, "status", "--porcelain", "--", flow.path], { cwd: projectRoot })) await commandText("git", ["-C", projectRoot, "-c", "user.name=dd-eval", "-c", "user.email=eval@localhost", "commit", "--quiet", "-m", `dd-eval: materialize ${inputCheckpoint.value.id} flow pack`], { cwd: projectRoot, env: { GIT_AUTHOR_DATE: sourceDate, GIT_COMMITTER_DATE: sourceDate } });
    } finally { await rm(flowRoot, { recursive: true, force: true }); }
  }
  if (!(await exists(path.join(projectRoot, flow.path)))) fail(`input checkpoint flow pack is missing: ${flow.path}`, "input_checkpoint_flow_missing");
  await assertProjectFlowPack(projectRoot, inputCheckpoint);
  await ignoreEvalLocalState(projectRoot);
  return { project_root: projectRoot, workspace_root: projectRoot, run_id: null, run_home: null };
}
