import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT = path.join(ROOT, "plugins", "grok");

function read(relativePath) {
  return fs.readFileSync(path.join(PLUGIN_ROOT, relativePath), "utf8");
}

test("Grok manifest exposes the configured plugin name and user settings", () => {
  const manifest = JSON.parse(read(".claude-plugin/plugin.json"));

  assert.equal(manifest.name, "grok");
  assert.equal(manifest.commands, "./commands/");
  assert.equal("agents" in manifest, false);
  assert.equal(manifest.userConfig.default_model.type, "string");
  assert.equal(manifest.userConfig.api_fallback_enabled.type, "boolean");
});

test("Grok commands expose rescue forwarding and session hooks", () => {
  const files = fs.readdirSync(path.join(PLUGIN_ROOT, "commands")).sort();
  assert.deepEqual(files, ["ask.md", "cancel.md", "rescue.md", "result.md", "review.md", "setup.md", "status.md"]);

  for (const command of ["setup", "ask", "review", "status", "result", "cancel"]) {
    const source = read(`commands/${command}.md`);
    assert.doesNotMatch(source, /disable-model-invocation:\s*true/);
    assert.match(source, new RegExp(`grok-companion\\.mjs" ${command} "\\$ARGUMENTS"`));
  }

  const review = read("commands/review.md");
  assert.match(review, /review-only/i);
  assert.match(review, /--background/);
  assert.match(review, /--base <ref>/);

  const rescue = read("commands/rescue.md");
  const agent = read("agents/grok-rescue.md");
  const hooks = read("hooks/hooks.json");
  assert.match(rescue, /subagent_type: "grok:grok-rescue"/);
  assert.match(rescue, /Raw user request:/i);
  assert.match(rescue, /--background\|--wait/);
  assert.match(rescue, /--resume\|--fresh/);
  assert.match(rescue, /--write/);
  assert.match(rescue, /--always-approve\|--yolo/);
  assert.match(rescue, /task-resume-candidate --json/);
  assert.match(rescue, /AskUserQuestion/);
  assert.match(rescue, /Continue current Grok task/);
  assert.match(rescue, /Start a new Grok task/);
  assert.match(rescue, /Do not forward them to `task`/);
  assert.match(rescue, /bounded implementation request/i);
  assert.match(rescue, /background write task requires explicit/i);
  assert.match(agent, /exactly one `Bash` call/i);
  assert.match(agent, /Default to a write-capable Grok run/i);
  assert.match(agent, /Keep review, diagnosis, research, and planning requests read-only/i);
  assert.match(agent, /--always-approve/);
  assert.match(agent, /--yolo/);
  assert.match(agent, /Do not inspect the repository/i);
  assert.match(agent, /stdout of the `grok-companion` command exactly as-is/i);
  assert.match(hooks, /SessionStart/);
  assert.match(hooks, /SessionEnd/);
  assert.match(hooks, /session-lifecycle-hook\.mjs/);
  assert.doesNotMatch(hooks, /Stop/);
});
