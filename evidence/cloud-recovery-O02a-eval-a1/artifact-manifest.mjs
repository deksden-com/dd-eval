import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const [root, source] = process.argv.slice(2);
assert(path.isAbsolute(root));
const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(actual, source);
assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim(), '');
const { packageSnapshotFiles } = await import(pathToFileURL(path.join(root, 'dist/services/engines.js')));
const build = JSON.parse(fs.readFileSync(path.join(root, 'dist/build-info.json')));
assert.equal(build.cli_commit, source);
assert.equal(build.built_with_canon.commit, '55f6987c501ecd1d848896c0d9059f45e0f4e4c3');
const checksum = crypto.createHash('sha256');
const files = [...packageSnapshotFiles(root)].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([file, sourceFile]) => {
  const bytes = fs.readFileSync(sourceFile);
  if (path.basename(file) !== 'engine.json') checksum.update(file).update('\0').update(bytes).update('\0');
  return { file, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
console.log(JSON.stringify({ source, canon: build.built_with_canon.commit, build, checksum: checksum.digest('hex'), files }, null, 2));
