import path from "node:path";

const invalid = () => Object.assign(new Error("Check resources require one absolute Playwright browser cache path"), { code: "invalid_check_resources" });
export function validateCheckResources(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1
    || typeof value.playwright_browsers_path !== "string" || !value.playwright_browsers_path.length
    || value.playwright_browsers_path.length > 4096 || value.playwright_browsers_path.includes("\0") || !path.isAbsolute(value.playwright_browsers_path)) throw invalid();
  return { playwright_browsers_path: path.resolve(value.playwright_browsers_path) };
}
export function selectCheckResources(resourceHome, environment = process.env) {
  if (!path.isAbsolute(resourceHome ?? "")) throw invalid();
  return validateCheckResources({ playwright_browsers_path: environment.PLAYWRIGHT_BROWSERS_PATH ?? path.join(resourceHome, "browser-cache", "playwright") });
}
export function checkResourceEnvironment(resources) {
  return resources === undefined ? {} : { PLAYWRIGHT_BROWSERS_PATH: validateCheckResources(resources).playwright_browsers_path };
}
