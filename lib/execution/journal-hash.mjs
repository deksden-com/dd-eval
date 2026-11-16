import { createHash } from "node:crypto";

/** Canonicalize JSON recursively for durable hashes. */
export function canonicalJson(value) {
  const normalize = (item) => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") return Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize(item[key])]));
    return item;
  };
  return `${JSON.stringify(normalize(value))}\n`;
}

/** Compute the SHA-256 digest of retained bytes or text. */
export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Hash a canonical JSON value. */
export function hashJson(value) { return sha256(canonicalJson(value)); }
