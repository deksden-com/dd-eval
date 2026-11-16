import path from "node:path";

/** Resolve the retained HITL qualification home without accepting relative paths. */
export function hitlQualificationHome() {
  const root = process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME ?? path.join(process.env.HOME ?? ".", ".dd-eval", "definition-qualifications");
  if (!path.isAbsolute(root)) throw Object.assign(new Error("definition qualification home must be absolute"), { code: "definition_qualification_invalid" });
  return path.resolve(root);
}
