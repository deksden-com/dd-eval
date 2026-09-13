// EXPERIMENT ONLY: one in-memory source substitution in an isolated native process.
// Does not edit the installed bundle. Never use this loader in production.
const Module = require('node:module');
const { appendFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const original = Module.prototype._compile;
Module.prototype._compile = function (source, filename) {
  if (filename === '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs') {
    const before = 'taskType:"subagent_child",toolset:';
    if (source.split(before).length !== 2) throw new Error('native child constructor changed; refusing probe patch');
    appendFileSync(path.join(process.env.DD_ZCODE_HOOK_PROBE_DIR, 'probe-patch.jsonl'), JSON.stringify({ originalSha256: createHash('sha256').update(source).digest('hex'), change: 'child config inherits hooks:this.config.hooks' }) + '\n');
    source = source.replace(before, 'taskType:"subagent_child",hooks:this.config.hooks,toolset:');
  }
  return original.call(this, source, filename);
};
