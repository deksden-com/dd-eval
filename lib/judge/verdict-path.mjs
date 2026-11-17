import path from "node:path";

/** Locate the verdict directory for a candidate whose identity is already known. */
export function judgeRootForCandidate(root, { file, immutable_hash }) {
  const judge = path.join(root, "judge");
  return file === path.join(root, "candidate.json") ? judge : path.join(judge, "revisions", immutable_hash);
}
