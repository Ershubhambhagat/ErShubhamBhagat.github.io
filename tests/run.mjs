/**
 * Test runner for the portfolio's pure modules.
 *
 * Why a runner instead of `node --test tests/`: the site ships browser ES
 * modules named .js with no root package.json (that is the build contract - no
 * npm project). Node would parse those files as CommonJS and fail on `export`.
 * check-modules.mjs already solves this by copying js/ into a temp folder with a
 * {"type":"module"} package.json; this runner does the same for the real test
 * cases, so the tests exercise the exact files the browser loads.
 *
 * Run: node tests/run.mjs
 */

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const temp = path.join(root, ".build", "test-tmp");
const cases = path.join(root, "tests", "cases");

rmSync(temp, { recursive: true, force: true });
mkdirSync(temp, { recursive: true });

// The tested code is copied, never modified.
cpSync(path.join(root, "js"), path.join(temp, "js"), { recursive: true });

// The JSON editor is a separate tree (tools/json-editor/js) but the same rule
// applies: its pure modules are tested from their real files, not re-imported
// from a rewrite. Copied as `editor/` so the module specifiers stay relative.
cpSync(path.join(root, "tools", "json-editor", "js"), path.join(temp, "editor"), { recursive: true });

writeFileSync(path.join(temp, "package.json"), '{"type":"module"}\n', "utf8");

// Test cases are copied with their import specifier rewritten from the real tree
// to the copy, so a case can keep a normal relative path in the repository. The
// longer, more specific prefix is rewritten first; otherwise `../../js/` would
// also match inside the editor path and produce a wrong target.
const REWRITES = [
  ["../../../tools/json-editor/js/", "./editor/"],
  ["../../js/", "./js/"]
];

const written = [];
for (const name of readdirSync(cases).filter((file) => file.endsWith(".test.mjs"))) {
  let source = readFileSync(path.join(cases, name), "utf8");
  for (const [from, to] of REWRITES) source = source.replaceAll(from, to);
  const target = path.join(temp, name);
  writeFileSync(target, source, "utf8");
  written.push(target);
}

const result = spawnSync(process.execPath, ["--test", ...written], {
  stdio: "inherit",
  cwd: root
});

rmSync(temp, { recursive: true, force: true });

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

