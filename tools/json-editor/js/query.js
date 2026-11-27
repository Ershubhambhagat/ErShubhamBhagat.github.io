/**
 * tools/json-editor/js/query.js - search, field filter and sort for the record list.
 *
 * Filtering and sorting never touch the collection: the result is a list of
 * {record, index} pairs, and `index` still points at the record's position in the
 * JSON array. The table's move/duplicate/delete buttons rely on that index, so a
 * sorted view cannot make "move up" edit the wrong row.
 *
 * Pure: no DOM. Covered by tests/cases/editor-query.test.mjs.
 */

const DATE_FIELDS = ["updatedAt", "endDate", "startDate", "issueDate", "date", "expiryDate"];

/** Fields the record search looks at, before falling back to the whole record. */
export function searchFieldsFor(dataset) {
  if (!dataset) return [];

  const fields = ["id", dataset.labelField].filter(Boolean);

  const perDataset = {
    bookmarks: ["name", "url", "description", "categoryId"],
    experience: ["role", "company.name", "location", "shortDescription"],
    projects: ["title", "shortDescription", "technologies", "status"],
    certificates: ["title", "issuer", "credentialId"],
    education: ["qualification", "institution.name", "fieldOfStudy"],
    learningJourney: ["title", "topic", "learningType"],
    careerTimeline: ["type", "referenceId", "date"],
    skills: ["name", "description"],
    themePresets: ["name", "id"]
  };

  return [...new Set([...(perDataset[dataset.key] ?? []), ...fields])];
}

/** Fields offered in the "filter by field value" selects, when the records have them. */
export function filterFieldsFor(records) {
  const candidates = ["categoryId", "status", "type", "enabled", "featured", "isSample", "learningType", "employmentType"];
  const sample = (Array.isArray(records) ? records : []).find((record) => record && typeof record === "object");
  if (!sample) return [];
  return candidates.filter((key) => key in sample);
}

function readPath(record, path) {
  if (!record || typeof record !== "object") return undefined;
  let node = record;
  for (const key of String(path).split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = node[key];
  }
  return node;
}

function haystack(record, fields) {
  if (fields.length === 0) return JSON.stringify(record ?? "").toLowerCase();
  return fields
    .map((field) => readPath(record, field))
    .filter((value) => value !== undefined && value !== null)
    .map((value) => (typeof value === "string" ? value : JSON.stringify(value)))
    .join(" \u0000 ")
    .toLowerCase();
}

function labelOf(record) {
  for (const key of ["title", "name", "role", "qualification", "label", "id"]) {
    if (record && typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  return "";
}

function latestDate(record) {
  let latest = "";
  for (const key of DATE_FIELDS) {
    const value = record?.[key];
    if (typeof value === "string" && value > latest) latest = value;
  }
  return latest;
}

function compareBy(sort) {
  if (sort === "id") {
    return (a, b) => String(a.record?.id ?? "").localeCompare(String(b.record?.id ?? ""), undefined, { numeric: true });
  }
  if (sort === "label") {
    return (a, b) => labelOf(a.record).localeCompare(labelOf(b.record), undefined, { sensitivity: "base" })
      || String(a.record?.id ?? "").localeCompare(String(b.record?.id ?? ""), undefined, { numeric: true });
  }
  if (sort === "updated") {
    // Newest first; records with no date sort last rather than at the top.
    return (a, b) => {
      const left = latestDate(a.record);
      const right = latestDate(b.record);
      if (left === right) return a.index - b.index;
      if (!left) return 1;
      if (!right) return -1;
      return right.localeCompare(left);
    };
  }
  // "order": manual order when the schema has it, otherwise the file's order.
  return (a, b) => {
    const left = Number(a.record?.order);
    const right = Number(b.record?.order);
    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
    return a.index - b.index;
  };
}

/**
 * Filters and sorts a copy of the record list.
 *
 * @param {Array} records
 * @param {Object} options
 * @param {string} [options.query] - case-insensitive substring search
 * @param {Array<string>} [options.fields] - dotted paths for the search
 * @param {{field: string, value: string}|null} [options.filter] - exact value match
 * @param {string} [options.sort] - "order" | "id" | "label" | "updated"
 * @returns {Array<{record: Object, index: number}>}
 */
export function filterAndSort(records, { query = "", fields = [], filter = null, sort = "order" } = {}) {
  const list = Array.isArray(records) ? records : [];
  const needle = String(query ?? "").trim().toLowerCase();
  const field = filter?.field ?? "";
  const value = filter?.value ?? "";

  const items = list.map((record, index) => ({ record, index }));

  const matching = items.filter(({ record }) => {
    if (needle && !haystack(record, fields).includes(needle)) return false;
    if (field && value !== "") {
      const candidate = readPath(record, field);
      if (Array.isArray(candidate)) return candidate.map(String).includes(value);
      if (typeof candidate === "boolean") return String(candidate) === value;
      return String(candidate ?? "") === value;
    }
    return true;
  });

  return matching.sort(compareBy(sort));
}

/** Distinct values for a filter field, formatted for a select control. */
export function facetValues(records, field) {
  const seen = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    if (!field) continue;
    const value = readPath(record, field);
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) seen.set(String(item), String(item));
      continue;
    }
    seen.set(String(value), String(value));
  }

  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}
