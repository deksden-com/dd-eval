import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Syntax inventory only; payload and applicability belong to the services.
export const commandInputs = {
  "homes list": [2, []], "homes add": [2, ["path", "label"]], "homes remove": [2, ["id"]],
  "runner fixtures validate": [3, ["case", "revision"]], "runner eval preflight": [3, ["profile"]],
  "harness capacity check": [3, ["profile", "max", "project-root", "write-profile"]], "harness compatibility qualify": [3, ["profile", "project-root"]],
  "runner canonical build": [3, ["profile", "project-root", "flow-root"]], "runner canonical status": [3, ["build"]], "runner canonical resume": [3, ["build", "detach"]],
  "runner canonical qualify": [3, ["build", "profile"]], "runner canonical accept": [3, ["build", "entry", "review"]],
  "runner canonical engine capture": [4, ["build"]], "runner canonical boundary accept": [4, ["build", "stage", "review"]], "runner canonical qualification recover": [4, ["build", "receipt"]],
  "runner eval run": [3, ["profile"]], "runner eval judge": [3, ["eval", "profile"]],
  "runner status": [2, ["eval"]], "runner control status": [3, ["eval", "execution"]], "runner control pause": [3, ["eval", "request-id"]], "runner control stop": [3, ["eval", "request-id"]],
  "runner control reconcile": [3, ["eval", "from"]], "runner control resume": [3, ["eval", "from", "request-id", "wait-ms"]],
  "runner resume": [2, ["eval"]], "runner cleanup": [2, ["eval", "request-id"]], "runner recover": [2, ["eval", "from", "execution"]], "runner recovery inspect": [3, ["eval", "execution"]], "runner checkpoints": [2, ["eval", "execution"]], "runner fork": [2, ["eval", "execution", "from", "output", "engine-version", "request-id", "integrity-checksum", "start"]], "runner reconcile": [2, ["eval"]], "runner cancel": [2, ["eval", "execution"]],
  "storage ls": [2, ["case"]], "storage status": [2, []], "gc plan": [2, []], "gc apply": [2, ["plan"]]
};

export function parse(argv) {
  const positional = []; const options = Object.create(null);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) { positional.push(token); continue; }
    const key = token.slice(2); const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw Object.assign(new Error(`--${key} requires a value`), { code: "usage" });
    if (Object.hasOwn(options, key)) throw Object.assign(new Error(`--${key} may be supplied only once`), { code: "usage" });
    options[key] = value; index += 1;
  }
  return { positional, options };
}

export function validateCommand({ positional, options }) {
  const key = [4, 3, 2].map(length => positional.slice(0, length).join(" ")).find(candidate => Object.hasOwn(commandInputs, candidate));
  if (!key) throw Object.assign(new Error(`unknown command: ${positional.join(" ")}`), { code: "usage" });
  const rule = commandInputs[key];
  if (positional.length !== rule[0] || Object.keys(options).some(option => !rule[1].includes(option))) throw Object.assign(new Error(`unknown argument for ${key}`), { code: "usage" });
}

/** Resolve presentation aliases before any runner action. EVAL IDs are scoped
 * to the explicitly selected home; @eval is available only to a bound worker. */
export function resolveEvalReference(value, env = process.env) {
  const home = path.resolve(env.DD_EVAL_HOME ?? path.join(os.homedir(), ".dd-eval"));
  const scopedId = /^EVAL-[A-Za-z0-9._-]+$/.test(value) ? value : null;
  let candidate;
  if (value === "@eval") {
    candidate = env.DD_EVAL_CURRENT ?? (env.DD_EVAL_RUN_ID ? path.join(home, "runs", env.DD_EVAL_RUN_ID) : null);
    if (!candidate) throw Object.assign(new Error("@eval requires DD_EVAL_CURRENT or DD_EVAL_RUN_ID"), { code: "usage" });
  } else candidate = scopedId ? path.join(home, "runs", scopedId) : value;
  const root = path.resolve(candidate);
  const manifestFile = path.join(root, "manifest.json");
  if (!fs.existsSync(manifestFile)) throw Object.assign(new Error(`EVAL manifest does not exist: ${manifestFile}`), { code: "usage" });
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")); }
  catch { throw Object.assign(new Error(`EVAL manifest is not valid JSON: ${manifestFile}`), { code: "usage" }); }
  const expectedId = scopedId ?? (value === "@eval" ? env.DD_EVAL_RUN_ID : null);
  if (typeof manifest.run_id !== "string" || expectedId && manifest.run_id !== expectedId) {
    throw Object.assign(new Error(`EVAL reference does not match its manifest: ${value}`), { code: "usage" });
  }
  const canonicalRoot = fs.realpathSync(root);
  if (scopedId) {
    const canonicalRuns = fs.realpathSync(path.join(home, "runs"));
    const relative = path.relative(canonicalRuns, canonicalRoot);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw Object.assign(new Error(`EVAL ID resolves outside the selected home: ${value}`), { code: "usage" });
  }
  // Preserve the caller's path spelling. Existing manifests and managed
  // runtime records compare that stable spelling; realpath is used only for
  // the scoped-ID containment proof above.
  return root;
}
