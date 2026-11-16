import { isInstalledFlow } from "../installed-flows.mjs";

/** Strip EVAL classifier credentials from a child process environment. */
export function childEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.OPENROUTER_API_KEY;
  delete env.OPENAI_DECISIONS_API_KEY;
  return env;
}
/** Select the observation timeout for the requested command and phase. */
export function commandObservationTimeout(args, phase = null) {
  const memoryPrepare = args.includes("--prepare-only") && (["init", "upgrade"].includes(args[0])
    || args[0] === "flow" && isInstalledFlow(args[1]));
  return phase === "work" || args[0] === "setup" || memoryPrepare || args.some(arg => ["clone", "install", "build", "snapshot"].includes(arg)) ? 30 * 60_000 : 30_000;
}
