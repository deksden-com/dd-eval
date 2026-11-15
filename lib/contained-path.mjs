import path from "node:path";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
export function relative(value, label) { if (typeof value !== "string" || !value || path.isAbsolute(value) || value.split(/[\\/]/).includes("..")) fail(`${label} must be a non-empty contained relative path`); return value; }
export function contained(root, value, label) { return path.resolve(root, relative(value, label)); }
