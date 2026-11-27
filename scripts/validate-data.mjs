/**
 * scripts/validate-data.mjs - schema and cross-file checks for data/*.json.
 *
 * Run from the repository root:  node scripts/validate-data.mjs
 *
 * Checks, per dataset:
 *   - valid JSON, root object, schemaVersion === 1
 *   - the collection property exists and has the documented type
 *   - every record has an id, ids are unique, dates are YYYY / YYYY-MM / YYYY-MM-DD
 *   - every event in career-timeline.json resolves to a real record
 *   - navigation targets exist as <section id> in index.html
 *   - every local bookmark URL points at a file that exists
 *
 * Why this exists: the datasets are hand-edited, and the failures that reach a
 * visitor are almost always structural (renamed key, duplicated id, dangling
 * reference). A browser shows eleven error panels; this names the file and index.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "data");

/** Dataset key -> { file, collection, kind, idPrefix }. */
const DATASETS = {
  profile: { file: "profile.json", collection: "profile", kind: "record" },
  skills: { file: "skills.json", collection: "skills", kind: "array", prefix: "skill-" },
  experience: { file: "experience.json", collection: "experiences", kind: "array", prefix: "exp-" },
  projects: { file: "projects.json", collection: "projects", kind: "array", prefix: "project-" },
  certificates: { file: "certificates.json", collection: "certificates", kind: "array", prefix: "cert-" },
  education: { file: "education.json", collection: "education", kind: "array", prefix: "edu-" },
  learningJourney: { file: "learning-journey.json", collection: "learningActivities", kind: "array", prefix: "journey-" },
  careerTimeline: { file: "career-timeline.json", collection: "events", kind: "array", prefix: "event-" },
  bookmarks: { file: "bookmarks.json", collection: "bookmarks", kind: "array", prefix: "bookmark-" },
  navigation: { file: "navigation.json", collection: "navigation", kind: "record" },
  themePresets: { file: "theme-presets.json", collection: "themes", kind: "array" }
};

const DATE_FIELDS = ["date", "startDate", "endDate", "issueDate", "expiryDate", "updatedAt"];
const DATE_PATTERN = /^\d{4}(-\d{2}(-\d{2})?)?$/;

let failures = 0;

function fail(message) {
  failures += 1;
  console.log(`FAIL  ${message}`);
}

const loaded = new Map();

for (const [key, spec] of Object.entries(DATASETS)) {
  const file = path.join(dataDir, spec.file);
  let payload;

  try {
    payload = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${spec.file}: ${error.message}`);
    continue;
  }

  loaded.set(key, payload);

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    fail(`${spec.file}: root must be an object`);
    continue;
  }

  if (payload.schemaVersion !== 1) {
    fail(`${spec.file}: schemaVersion must be the number 1`);
  }

  const value = payload[spec.collection];

  if (spec.kind === "record") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      fail(`${spec.file}: "${spec.collection}" must be an object`);
      continue;
    }

    if (key === "profile" && typeof value.name !== "string") {
      fail(`${spec.file}: profile.name must be a string`);
    }

    console.log(`ok    ${spec.file}: 1 record`);
    continue;
  }

  if (!Array.isArray(value)) {
    fail(`${spec.file}: "${spec.collection}" must be an array`);
    continue;
  }

  const ids = new Set();

  value.forEach((record, index) => {
    const where = `${spec.file} ${spec.collection}[${index}]`;

    if (!record || typeof record !== "object" || Array.isArray(record)) {
      fail(`${where}: not an object`);
      return;
    }

    const id = typeof record.id === "string" ? record.id.trim() : "";

    if (id) {
      if (ids.has(id)) {
        fail(`${where}: duplicate id "${id}"`);
      }
      ids.add(id);

      if (spec.prefix && !id.startsWith(spec.prefix)) {
        fail(`${where}: id "${id}" should start with "${spec.prefix}"`);
      }
    } else if (key !== "themePresets") {
      fail(`${where}: missing id`);
    }

    for (const field of DATE_FIELDS) {
      const candidate = record[field];
      if (typeof candidate === "string" && candidate !== "" && !DATE_PATTERN.test(candidate)) {
        fail(`${where}.${field}: "${candidate}" is not YYYY, YYYY-MM or YYYY-MM-DD`);
      }
    }
  });

  console.log(`ok    ${spec.file}: ${value.length} records, ${ids.size} unique ids`);
}

// --- cross-file: career timeline references --------------------------------
const collections = {
  experience: ["experience", "experiences"],
  project: ["projects", "projects"],
  certificate: ["certificates", "certificates"],
  education: ["education", "education"],
  learning: ["learningJourney", "learningActivities"]
};

const timeline = loaded.get("careerTimeline");

if (timeline && Array.isArray(timeline.events)) {
  const events = timeline.events;

  events.forEach((event, index) => {
    const type = String(event.type || "");
    const reference = collections[type];

    if (!reference) {
      fail(`career-timeline.json events[${index}]: unknown type "${type}"`);
      return;
    }

    const dataset = loaded.get(reference[0]);
    const records = dataset && Array.isArray(dataset[reference[1]]) ? dataset[reference[1]] : [];
    const found = records.some((record) => record.id === event.referenceId);

    if (!found) {
      fail(`career-timeline.json events[${index}]: ${type}:${event.referenceId} does not resolve`);
    }
  });

  console.log(`ok    career-timeline.json: ${events.length} events checked`);
}

// --- cross-file: navigation targets ---------------------------------------
const navigation = loaded.get("navigation");
const indexPath = path.join(root, "index.html");

if (navigation && existsSync(indexPath)) {
  const html = readFileSync(indexPath, "utf8");
  const items = navigation.navigation && Array.isArray(navigation.navigation.items)
    ? navigation.navigation.items
    : [];

  if (items.length !== 11) {
    fail(`navigation.json: expected 11 items, found ${items.length}`);
  }

  items.forEach((item) => {
    const target = String(item.target || "");
    if (!html.includes(`<section id="${target}"`)) {
      fail(`navigation.json: target "${target}" has no <section> in index.html`);
    }
  });

  console.log(`ok    navigation.json: ${items.length} targets present in index.html`);
}

// --- cross-file: local bookmark files -------------------------------------
const bookmarks = loaded.get("bookmarks");

if (bookmarks && Array.isArray(bookmarks.bookmarks)) {
  bookmarks.bookmarks.forEach((bookmark, index) => {
    const url = String(bookmark.url || "");

    if (url.startsWith("./") && !url.includes("#")) {
      const target = path.join(root, decodeURIComponent(url));
      if (!existsSync(target)) {
        fail(`bookmarks.json bookmarks[${index}]: "${url}" does not exist`);
      }
    }
  });

  console.log(`ok    bookmarks.json: local URLs checked`);
}

// --- summary of sample records -------------------------------------------
const sampleKeys = [];

for (const [key, spec] of Object.entries(DATASETS)) {
  const payload = loaded.get(key);
  if (!payload || spec.kind !== "array" || !Array.isArray(payload[spec.collection])) {
    continue;
  }

  const samples = payload[spec.collection].filter((record) => record && record.isSample === true);
  if (samples.length > 0) {
    sampleKeys.push(`${key}: ${samples.length}`);
  }
}

console.log(`\nExample records still in the datasets: ${sampleKeys.length ? sampleKeys.join(", ") : "none"}`);

if (failures > 0) {
  console.log(`\n${failures} problem(s) found.`);
  process.exit(1);
}

console.log("\nAll data checks passed.");
