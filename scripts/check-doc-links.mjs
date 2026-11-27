/**
 * Checks every relative Markdown link and every `docs/...` path mentioned anywhere in
 * the documentation set. Run before declaring a restructure finished.
 *
 * Two scopes on purpose:
 *   - live documents (everything outside docs/ARCHIVE/) must have every link and every
 *     backticked docs/tools/scripts path resolve;
 *   - archived documents must have their Markdown links resolve, but their prose is left
 *     alone: an archive legitimately mentions files that were proposed and never built,
 *     and paths that no longer exist. Rewriting that would falsify the record.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

/**
 * docs/ and Prompt/ are local-only by the owner's decision: they are git-ignored, so a
 * clone and every CI runner have no documentation to check. This script is therefore a
 * local maintenance check, not a pipeline gate - it says so and exits cleanly rather than
 * failing a build that could never have the files.
 */
const docsDir = path.join(root, "docs");
if (!existsSync(docsDir)) {
  console.log("docs/ is not present in this checkout (it is local-only) - nothing to check.");
  process.exit(0);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".md")) out.push(full);
  }
  return out;
}

const files = walk(docsDir);

const brokenLinks = [];
const brokenPaths = [];

for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  const archived = rel.startsWith("docs/ARCHIVE/");
  const text = readFileSync(file, "utf8");

  // 1. Markdown links: [label](target) - skip http(s), mailto, anchors.
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^[a-z]+:/i.test(target) || target.startsWith("#")) continue;

    const clean = target.split("#")[0];
    if (!clean) continue;

    const resolved = path.resolve(path.dirname(file), clean);
    if (!existsSync(resolved)) brokenLinks.push(`${rel} -> ${target}`);
  }

  if (archived) continue;

  // 2. Backticked paths that look like documentation, specification or tool files
  //    (live documents only). Prompt/ is included so the specification index cannot
  //    drift from the specs it lists.
  for (const match of text.matchAll(/`((?:docs|tools|scripts|Prompt)\/[A-Za-z0-9_./-]+\.(?:md|mjs|js|json|py|bat))`/g)) {
    const target = match[1];
    if (!existsSync(path.join(root, target))) brokenPaths.push(`${rel} -> ${target}`);
  }
}

const report = [...new Set([...brokenLinks, ...brokenPaths])];

if (report.length === 0) {
  console.log(`ok: ${files.length} documents, every relative link and documented path resolves`);
  process.exit(0);
}

console.error(`${report.length} broken reference(s):`);
for (const line of report) console.error("  " + line);
process.exit(1);
