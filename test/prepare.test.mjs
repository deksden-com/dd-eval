import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { collect, prepare } from "../lib/dd-eval.mjs";

const source = process.env.DD_TASKS_REPO || path.resolve(import.meta.dirname, "..", "..", "dd-tasks");

test("prepare creates the same isolated input twice", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-"));
  try {
    const first = await prepare({ caseId: "EVAL-001-task-priority", profileId: "codex-gpt-5-6-luna-max", source, output: path.join(root, "one") });
    const second = await prepare({ caseId: "EVAL-001-task-priority", profileId: "codex-gpt-5-6-luna-max", source, output: path.join(root, "two") });
    assert.equal(first.inputTree, second.inputTree);
    assert.equal(first.inputCommit, second.inputCommit);
    const manifest = JSON.parse(await readFile(first.runManifest, "utf8"));
    assert.equal(manifest.checkpoint_id, "cp-002");
    assert.equal(manifest.profile.model, "gpt-5.6-luna");
    assert.equal(manifest.input.tree, manifest.source.tree);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prepare selects the Memory Bank 2.16.0 checkpoint without changing the case", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-mb216-"));
  try {
    const result = await prepare({
      caseId: "EVAL-001-task-priority",
      checkpointId: "cp-002-mb-2-16-0",
      profileId: "codex-desktop-gpt-5-6-luna-max",
      source,
      output: path.join(root, "run")
    });
    const manifest = JSON.parse(await readFile(result.runManifest, "utf8"));
    const memoryBank = await readFile(path.join(result.output, ".memory-bank", "index.md"), "utf8");
    assert.equal(manifest.checkpoint_id, "cp-002-mb-2-16-0");
    assert.equal(manifest.profile.harness, "codex-desktop");
    assert.match(memoryBank, /memory_bank_version: '2\.16\.0'/);
    assert.equal(manifest.operator_materials.controller_initial_prompt, "cases/EVAL-001-task-priority/prompts/controller-initial.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prepare selects Memory Bank 2.17.0 and binds operator material hashes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-mb217-"));
  try {
    const result = await prepare({
      caseId: "EVAL-001-task-priority",
      checkpointId: "cp-002-mb-2-17-0",
      profileId: "codex-desktop-gpt-5-6-luna-max",
      source,
      output: path.join(root, "run")
    });
    const manifest = JSON.parse(await readFile(result.runManifest, "utf8"));
    const memoryBank = await readFile(path.join(result.output, ".memory-bank", "index.md"), "utf8");
    assert.equal(manifest.checkpoint_id, "cp-002-mb-2-17-0");
    assert.equal(manifest.profile.runtime.dd_flow_cli.version, "0.4.2");
    assert.equal(manifest.profile.runtime.dd_flow_cli.git_tag, "v0.4.2");
    assert.match(memoryBank, /memory_bank_version: '2\.17\.0'/);
    assert.match(manifest.operator_material_sha256.clarification_packet, /^[a-f0-9]{64}$/);
    assert.match(manifest.operator_material_sha256.controller_initial_prompt, /^[a-f0-9]{64}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collect records transcript and flow timing without copying transcript content", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-collect-"));
  try {
    const files = {
      manifest: path.join(root, "run.json"),
      session: path.join(root, "session.jsonl"),
      timeline: path.join(root, "timeline.json"),
      usage: path.join(root, "usage.json"),
      flags: path.join(root, "flags.json"),
      output: path.join(root, "collected.json")
    };
    await writeFile(files.manifest, '{"case_id":"EVAL-001-task-priority"}\n');
    await writeFile(files.session, [
      JSON.stringify({ type: "session_meta", timestamp: "2026-08-07T10:00:00.000Z", payload: { session_id: "session-1", timestamp: "2026-08-07T10:00:00.000Z", originator: "Codex Desktop" } }),
      JSON.stringify({ type: "turn_context", timestamp: "2026-08-07T10:00:01.000Z", payload: { model: "gpt-5.6-luna", effort: "max" } }),
      JSON.stringify({ type: "response_item", timestamp: "2026-08-07T10:00:02.000Z", payload: { type: "function_call", name: "wait", arguments: "secret prompt content" } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-07T10:01:00.000Z", payload: { type: "token_count", info: { total_token_usage: { total_tokens: 42 } } } })
    ].join("\n"));
    await writeFile(files.timeline, JSON.stringify({ schema_id: "dd-flow/run-timeline@2", timing_status: "measured", summary: { elapsed_ms: 60000 }, stages: [{ elapsed_ms: 45000 }], sessions: [] }));
    await writeFile(files.usage, JSON.stringify({ schema_id: "dd-flow/run-usage@1", source: { kind: "codex_transcript_v1" }, groups: [], coverage: { measured: 1 }, deltas: [{}] }));
    await writeFile(files.flags, JSON.stringify({ resolution_status: "valid", snapshot_revision: 1, snapshot_checksum: "a".repeat(64), flow_flags: { preset: { applied: "full" } } }));

    await collect(files);
    const result = JSON.parse(await readFile(files.output, "utf8"));
    assert.equal(result.session.elapsed_seconds, 60);
    assert.equal(result.session.tool_calls.wait, 1);
    assert.equal(result.session.token_usage.total_tokens, 42);
    assert.equal(result.flow_observability.stage_elapsed_seconds, 45);
    assert.equal(result.flow_observability.unattributed_flow_seconds, 15);
    assert.doesNotMatch(JSON.stringify(result), /secret prompt content/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collect does not invent negative unattributed time for an unfinished RUN", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-open-run-"));
  try {
    const files = {
      manifest: path.join(root, "run.json"),
      session: path.join(root, "session.jsonl"),
      timeline: path.join(root, "timeline.json"),
      output: path.join(root, "collected.json")
    };
    await writeFile(files.manifest, '{}\n');
    await writeFile(files.session, `${JSON.stringify({ type: "session_meta", timestamp: "2026-08-07T10:00:00.000Z", payload: { session_id: "session-open" } })}\n`);
    await writeFile(files.timeline, JSON.stringify({
      schema_id: "dd-flow/run-timeline@2",
      timing_status: "in_progress",
      summary: { elapsed_ms: null },
      stages: [{ elapsed_ms: 45000 }],
      sessions: []
    }));

    await collect(files);
    const result = JSON.parse(await readFile(files.output, "utf8"));
    assert.equal(result.flow_observability.stage_elapsed_seconds, 45);
    assert.equal(result.flow_observability.unattributed_flow_seconds, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prepare refuses a fabricated implementation predecessor state", async () => {
  await assert.rejects(
    prepare({
      caseId: "EVAL-001-task-priority",
      profileId: "codex-gpt-5-6-luna-max",
      track: "implementation",
      source,
      output: path.join(tmpdir(), "dd-eval-must-not-exist")
    }),
    /not materializable yet/
  );
});
