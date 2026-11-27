/**
 * scripts/check-modules.mjs - the module contract, checked without a browser.
 *
 * Run from the repository root:  node scripts/check-modules.mjs
 *
 * What it proves:
 *   1. every section and feature module parses and imports with no DOM present;
 *   2. each exports exactly one initializer, named as .build/CONTRACT.md pins it;
 *   3. calling an initializer with missing or empty data does not throw;
 *   4. no module assigns innerHTML/outerHTML (the contract's XSS rule).
 *
 * Why a temporary copy: the site ships browser ES modules and has no
 * package.json, so Node would treat .js as CommonJS. The copy gets a minimal
 * {"type":"module"} package.json and is imported unchanged.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = process.cwd();
const tmp = path.join(root, ".build", "check-modules-tmp");

const MODULES = {
  "js/sections/profile.js": "initializeProfile",
  "js/sections/skills.js": "initializeSkills",
  "js/sections/experience.js": "initializeExperience",
  "js/sections/projects.js": "initializeProjects",
  "js/sections/certificates.js": "initializeCertificates",
  "js/sections/education.js": "initializeEducation",
  "js/sections/learning-journey.js": "initializeLearningJourney",
  "js/sections/career-timeline.js": "initializeCareerTimeline",
  "js/sections/github-importer.js": "initializeGithubImporter",
  "js/sections/bookmarks.js": "initializeBookmarks",
  "js/sections/contact.js": "initializeContact",
  "js/features/global-search.js": "initializeGlobalSearch",
  "js/features/theme-studio.js": "initializeThemeStudio",
  "js/features/json-manager.js": "initializeJsonManager",
  "js/features/seo.js": "initializeSeo"
};

const CALLS = [
  [undefined, undefined],
  [{}, {}],
  [null, null],
  [{ schemaVersion: 1, projects: [] }, { data: {} }]
];

let passed = 0;
let failed = 0;

const ok = (label) => {
  passed += 1;
  console.log(`ok    ${label}`);
};

const no = (label, detail) => {
  failed += 1;
  console.log(`FAIL  ${label}${detail ? ` -> ${detail}` : ""}`);
};

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
cpSync(path.join(root, "js"), path.join(tmp, "js"), { recursive: true });
writeFileSync(path.join(tmp, "package.json"), '{"type":"module"}\n', "utf8");

for (const [rel, exportName] of Object.entries(MODULES)) {
  const source = readFileSync(path.join(root, rel), "utf8");

  if (/\b(innerHTML|outerHTML)\s*=/.test(source)) {
    no(`${rel}: assigns innerHTML/outerHTML`);
  } else {
    ok(`${rel}: no innerHTML assignment`);
  }

  let mod;

  try {
    mod = await import(pathToFileURL(path.join(tmp, rel)).href);
  } catch (error) {
    no(`${rel}: import threw`, error.message);
    continue;
  }

  const names = Object.keys(mod).sort();

  if (names.length !== 1 || names[0] !== exportName) {
    no(`${rel}: exports ${JSON.stringify(names)}`, `expected ["${exportName}"]`);
    continue;
  }

  if (typeof mod[exportName] !== "function") {
    no(`${rel}: ${exportName} is not a function`);
    continue;
  }

  let problem = "";

  for (const args of CALLS) {
    try {
      const result = mod[exportName](...args);
      if (result !== undefined) {
        problem = `returned ${String(result)}`;
        break;
      }
    } catch (error) {
      problem = error.message;
      break;
    }
  }

  if (problem) {
    no(`${rel}: initializer with empty args`, problem);
  } else {
    ok(`${rel}: DOM-free import, single export, no throw`);
  }
}

try {
  const kit = await import(pathToFileURL(path.join(tmp, "js/core/section-kit.js")).href);
  const required = [
    "prepareSection", "renderEmpty", "renderSampleNotice", "createLink", "createTagList",
    "createProgress", "createTimeline", "formatDate", "formatDateRange", "parseDate",
    "readCollection", "sortByDateDesc", "ensureToolsDock", "addToolButton", "copyText"
  ];
  const missing = required.filter((name) => typeof kit[name] !== "function");

  if (missing.length > 0) {
    no("section-kit: missing helpers", missing.join(", "));
  } else if (kit.formatDate("2025-03-14", "long") !== "14 Mar 2025") {
    no("section-kit: formatDate output", kit.formatDate("2025-03-14", "long"));
  } else {
    ok(`section-kit: ${required.length} helpers and date formatting`);
  }
} catch (error) {
  no("section-kit: import threw", error.message);
}

rmSync(tmp, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
