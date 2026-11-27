/**
 * scripts/check-budget.mjs - the first-load budget gate for CI.
 *
 * Why this exists: docs/DEVELOPMENT/PERFORMANCE.md recorded a budget, but nothing enforced
 * it, so a budget was a wish. This script walks the module graph the browser
 * actually loads - starting from the entry module in index.html - and fails the
 * build when the shipped weight crosses the documented limit (SEO-007).
 *
 * What it measures, and what it deliberately does not:
 *   - only files reachable from the entry module, so a demo folder such as
 *     js/Projects/ cannot inflate the number the visitor pays for;
 *   - uncompressed bytes, which is the honest worst case for a static host that
 *     the owner cannot guarantee gzip on;
 *   - not paint timings. LCP/CLS need a browser and a deployed URL; they stay a
 *     manual item in docs/DEVELOPMENT/PERFORMANCE.md rather than a fake number here.
 *
 * Run: node scripts/check-budget.mjs
 */

import { readFileSync, statSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

/**
 * Limits from docs/DEVELOPMENT/PERFORMANCE.md. Raise a limit only with a written reason in
 * that file, which is why the numbers live next to their citation.
 */
const BUDGETS = {
  requests: 100,
  javascript: 750 * 1024,
  css: 250 * 1024,
  json: 120 * 1024
};

const toKb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

/** Static `import ... from "x"` and `export ... from "x"` specifiers, in order. */
function importSpecifiers(source) {
  const specifiers = [];
  const pattern = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    specifiers.push(match[1]);
  }

  // Side-effect imports: `import "./x.js";`
  const bare = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  while ((match = bare.exec(source)) !== null) {
    specifiers.push(match[1]);
  }

  // Literal dynamic imports: `import("./x.js")`.
  const dynamic = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = dynamic.exec(source)) !== null) {
    specifiers.push(match[1]);
  }

  // app.js boots sections and features from a table of module paths. They are
  // loaded with a variable specifier, so a specifier scan cannot see them; the
  // literal `module: "./sections/x.js"` entries are what the browser fetches.
  const table = /\bmodule\s*:\s*["']([^"']+\.js)["']/g;
  while ((match = table.exec(source)) !== null) {
    specifiers.push(match[1]);
  }

  return specifiers;
}

/** Resolves a relative specifier against its importing file; ignores bare and remote ones. */
function resolve(fromRel, specifier) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier));
  return resolved;
}

const html = read("index.html");

/* ---- entry module ------------------------------------------------------- */
const entryMatch = html.match(/<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i);
if (!entryMatch) {
  console.error("check-budget: index.html has no module entry, so nothing to measure.");
  process.exit(1);
}
const entry = entryMatch[1].replace(/^\.\//, "");

/* ---- walk the module graph --------------------------------------------- */
const javascript = new Map();
const queue = [entry];

while (queue.length > 0) {
  const current = queue.shift();
  if (javascript.has(current)) continue;

  let size = 0;
  let source = "";
  try {
    size = statSync(path.join(root, current)).size;
    source = read(current);
  } catch {
    console.error(`check-budget: ${current} is imported but missing.`);
    process.exit(1);
  }

  javascript.set(current, size);

  for (const specifier of importSpecifiers(source)) {
    const target = resolve(current, specifier);
    if (target && !javascript.has(target)) queue.push(target);
  }
}

/* ---- stylesheets linked by the document -------------------------------- */
const cssFiles = [...html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)]
  .map((match) => match[1].replace(/^\.\//, ""))
  .filter((href) => href.startsWith("css/"));

const cssBytes = cssFiles.reduce((total, file) => total + statSync(path.join(root, file)).size, 0);

/* ---- datasets fetched at boot ------------------------------------------ */
const dataDir = path.join(root, "data");
const jsonFiles = readdirSync(dataDir).filter((name) => name.endsWith(".json"));
const jsonBytes = jsonFiles.reduce((total, name) => total + statSync(path.join(dataDir, name)).size, 0);

/* ---- report ------------------------------------------------------------ */
const jsBytes = [...javascript.values()].reduce((total, size) => total + size, 0);
const requests = javascript.size + cssFiles.length + jsonFiles.length;

const rows = [
  ["requests", `${requests}`, BUDGETS.requests, requests],
  ["javascript", toKb(jsBytes), toKb(BUDGETS.javascript), jsBytes],
  ["css", toKb(cssBytes), toKb(BUDGETS.css), cssBytes],
  ["json", toKb(jsonBytes), toKb(BUDGETS.json), jsonBytes]
];

console.log("First-load budget (uncompressed):");
let failed = 0;
for (const [name, actual, limit, numeric] of rows) {
  const budget = name === "requests" ? BUDGETS.requests : BUDGETS[name];
  const over = numeric > budget;
  if (over) failed += 1;
  console.log(`  ${over ? "OVER " : "ok   "} ${name.padEnd(11)} ${String(actual).padStart(9)}   limit ${limit}`);
}

if (failed > 0) {
  console.error(
    `\n${failed} budget(s) exceeded. Raise the limit in docs/DEVELOPMENT/PERFORMANCE.md with a reason, or trim the payload.`
  );
  process.exit(1);
}

console.log(`\n${javascript.size} modules, ${cssFiles.length} stylesheets, ${jsonFiles.length} datasets - within budget.`);
