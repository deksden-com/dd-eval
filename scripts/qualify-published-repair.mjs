import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Reuse the release's regression fixtures, but execute only installed npm modules.
// This is a deterministic package smoke, not a scored model evaluation.
const [checkout, installedPackage] = process.argv.slice(2).map(value => path.resolve(value));
assert(checkout && installedPackage, "usage: node scripts/qualify-published-repair.mjs <CLI checkout> <installed package>");
const info = JSON.parse(fs.readFileSync(path.join(installedPackage, "dist/build-info.json"), "utf8"));
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).trim();
assert.equal(info.cli_commit, commit, "Fixtures must come from the published source commit");
assert.equal(info.cli_version, JSON.parse(fs.readFileSync(path.join(installedPackage, "package.json"))).version);
const temporary = fs.mkdtempSync(path.join(checkout, "test", ".published-repair-"));
try {
  for (const name of ["repair-continuation.test.ts", "vnext-protocolize.test.ts"]) {
    let source = fs.readFileSync(path.join(checkout, "test", name), "utf8");
    source = source.replace(/from "\.\.\/src\/([^\"]+)"/g, (_, relative) => `from ${JSON.stringify(path.join(installedPackage, "dist", relative))}`);
    source = source.replace(/from '\.\/dist\/([^']+)'/g, (_, relative) => `from '${pathToFileURL(path.join(installedPackage, "dist", relative)).href}'`);
    source = source.replaceAll('path.join(process.cwd(), "src", "schemas",', `path.join(${JSON.stringify(installedPackage)}, "dist", "schemas",`);
    assert(!source.includes('"../src/') && !source.includes("'./dist/"), "Smoke must not load development modules");
    fs.writeFileSync(path.join(temporary, name), source);
  }
  const result = spawnSync("pnpm", ["exec", "vitest", "run", "--pool=forks", "--no-file-parallelism", path.relative(checkout, temporary), "-t", "closes review-off|accepts a PLAN, starts|resolves repair paths|contains aliases|registers every|serializes concurrent|excludes historical|renders shell|covers every|recognizes exact|retains only|recovers a committed"], { cwd: checkout, stdio: "inherit" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, "Published repair qualification failed");
  console.log(JSON.stringify({ schema_id: "dd-eval/published-repair-smoke@1", status: "passed", version: info.cli_version, commit, package_root: installedPackage }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
