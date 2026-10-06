#!/usr/bin/env node
import { readRegularFile } from "../lib/regular-file.mjs";
import { validateGroundedHitl } from "../lib/hitl-contract.mjs";

// Structural/provenance check only: no corpus, expected classes or semantic verdict.
try {
  const [packetFile, draftFile, ...extra] = process.argv.slice(2);
  if (!packetFile || !draftFile || extra.length) throw new Error("Usage: node check-hitl-draft.mjs <packet.json> <draft.json>");
  const packet = JSON.parse(await readRegularFile(packetFile));
  const draft = JSON.parse(await readRegularFile(draftFile));
  validateGroundedHitl(draft, packet);
  process.stdout.write('Structural/citation check passed; semantic correctness and completeness are not checked.\n');
} catch (error) {
  process.stderr.write(`${JSON.stringify({ code: error.code ?? "draft_invalid", error: error.message })}\n`);
  process.exitCode = 1;
}
