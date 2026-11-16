import path from "node:path";
import { mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";

async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Create a capacity probe home with inherited auth and isolated runtime state. */
export async function provisionCapacityCodexHome(codexHome) {
  await mkdir(codexHome, { recursive: true, mode: 0o700 });
  const sourceHome = process.env.CODEX_HOME ?? path.join(process.env.HOME ?? ".", ".codex");
  const sourceAuth = path.join(sourceHome, "auth.json");
  if (await exists(sourceAuth)) await symlink(sourceAuth, path.join(codexHome, "auth.json"));
  const sourceConfig = path.join(sourceHome, "config.toml");
  if (await exists(sourceConfig)) {
    let config = await readFile(sourceConfig, "utf8");
    config = config.replace(/^[ \t]*sqlite_home[ \t]*=.*(?:\r?\n|$)/gm, "");
    config = config.replace(/^[ \t]*hooks[ \t]*=[ \t]*true[ \t]*$/gm, "hooks = false");
    // Keep the source routing configuration (including model_provider), while
    // disabling plugin loading in the isolated home.  Replace an existing
    // features key instead of inserting a duplicate TOML key.
    const lines = config.split(/\r?\n/);
    const featuresIndex = lines.findIndex((line) => /^\s*\[features\]\s*$/.test(line));
    if (featuresIndex >= 0) {
      let end = lines.findIndex((line, index) => index > featuresIndex && /^\s*\[[^\]]+\]\s*$/.test(line));
      if (end < 0) end = lines.length;
      const pluginsIndex = lines.findIndex((line, index) => index > featuresIndex && index < end && /^\s*plugins\s*=/.test(line));
      if (pluginsIndex >= 0) lines[pluginsIndex] = "plugins = false";
      else lines.splice(featuresIndex + 1, 0, "plugins = false");
      config = lines.join("\n");
    } else config = `[features]\nplugins = false\n\n${config}`;
    await writeFile(path.join(codexHome, "config.toml"), config, { mode: 0o600 });
  }
}
