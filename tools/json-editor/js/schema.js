/**
 * tools/json-editor/js/schema.js - dataset registry and validation.
 *
 * The portfolio has eleven JSON files with different shapes. This module is the
 * single place that knows each file's name, collection property, id prefix and
 * label field, so the editor UI never hardcodes a dataset.
 *
 * Why the registry is explicit instead of inferred from `data/*.json`: the editor
 * must still work when a file is empty or broken. A dataset whose collection is
 * missing has to be identifiable and repairable, not silently disappear.
 *
 * Validation mirrors scripts/validate-data.mjs plus the editor-only checks
 * (category and related-id references) that the Node script leaves to the
 * section modules. Errors block saving; warnings do not.
 */

export const DATASETS = Object.freeze([
  { key: "profile", file: "profile.json", collection: "profile", kind: "record", label: "Profile" },
  { key: "skills", file: "skills.json", collection: "skills", prefix: "skill-", label: "Skills", labelField: "name", categories: "categories" },
  { key: "experience", file: "experience.json", collection: "experiences", prefix: "exp-", label: "Experience", labelField: "role", categories: null },
  { key: "projects", file: "projects.json", collection: "projects", prefix: "project-", label: "Projects", labelField: "title", categories: "categories" },
  { key: "certificates", file: "certificates.json", collection: "certificates", prefix: "cert-", label: "Certificates", labelField: "title", categories: "categories" },
  { key: "education", file: "education.json", collection: "education", prefix: "edu-", label: "Education", labelField: "qualification", categories: null },
  { key: "learningJourney", file: "learning-journey.json", collection: "learningActivities", prefix: "journey-", label: "Learning Journey", labelField: "title", categories: "categories" },
  { key: "careerTimeline", file: "career-timeline.json", collection: "events", prefix: "event-", label: "Career Timeline", labelField: "" },
  { key: "bookmarks", file: "bookmarks.json", collection: "bookmarks", prefix: "bookmark-", label: "Bookmarks", labelField: "name", categories: "categories" },
  { key: "navigation", file: "navigation.json", collection: "navigation", kind: "record", label: "Navigation" },
  { key: "themePresets", file: "theme-presets.json", collection: "themes", prefix: "", label: "Theme Presets", labelField: "name" }
]);

/**
 * Maps a career-timeline event type to the dataset that owns the referenced id.
 * Kept next to the registry so a new event type cannot be added in one place and
 * forgotten in another.
 */
export const TIMELINE_TYPES = Object.freeze({
  experience: { dataset: "experience", collection: "experiences", label: "role" },
  project: { dataset: "projects", collection: "projects", label: "title" },
  certificate: { dataset: "certificates", collection: "certificates", label: "title" },
  education: { dataset: "education", collection: "education", label: "qualification" },
  learning: { dataset: "learningJourney", collection: "learningActivities", label: "title" }
});

const DATE_PATTERN = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const ID_PATTERN = /^[a-z][a-z0-9-]*$/i;

export function datasetByKey(key) {
  return DATASETS.find((dataset) => dataset.key === key) ?? null;
}

export function collectionOf(dataset, document) {
  return document?.[dataset.collection];
}

export function isArrayDataset(dataset) {
  return dataset.kind !== "record";
}

/**
 * Returns a human label for a record, used in the table and reference selectors.
 * The fallback chain is deliberate: a half-filled record must still be findable.
 */
export function recordLabel(dataset, record) {
  if (!record || typeof record !== "object") {
    return "(invalid record)";
  }

  const field = dataset.labelField;
  const candidates = [field, "title", "name", "role", "qualification", "label", "id"];

  for (const key of candidates) {
    if (key && typeof record[key] === "string" && record[key].trim()) {
      return record[key].trim();
    }
  }

  return "(untitled)";
}

export function nextId(dataset, records) {
  const prefix = dataset.prefix;
  if (!prefix) {
    return "";
  }

  let highest = 0;
  for (const record of records) {
    const id = typeof record?.id === "string" ? record.id : "";
    if (!id.startsWith(prefix)) continue;
    const number = Number.parseInt(id.slice(prefix.length), 10);
    if (Number.isFinite(number)) highest = Math.max(highest, number);
  }

  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

function blankValue(value) {
  if (Array.isArray(value)) return [];
  if (value && typeof value === "object") {
    const clone = {};
    for (const [key, child] of Object.entries(value)) clone[key] = blankValue(child);
    return clone;
  }
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return null;
  return "";
}

/**
 * Creates a new record from the first existing record's shape.
 *
 * Why clone the shape: the form is generated from the object's keys. A blank
 * object would show no fields for nested structures (company, institution,
 * progress), and the owner would not know they exist.
 */
export function blankRecord(dataset, records) {
  const template = records.find((record) => record && typeof record === "object") ?? {};
  const record = blankValue(template);

  if (dataset.prefix) {
    record.id = nextId(dataset, records);
  }

  if (dataset.labelField) {
    record[dataset.labelField] = `New ${dataset.label.replace(/s$/, "")}`;
  }

  if (Array.isArray(records) && records.length > 0) {
    const maxOrder = Math.max(...records.map((item) => Number(item?.order) || 0));
    if (Object.prototype.hasOwnProperty.call(record, "order")) record.order = maxOrder + 1;
  }

  if (Object.prototype.hasOwnProperty.call(record, "enabled")) record.enabled = true;
  if (Object.prototype.hasOwnProperty.call(record, "isSample")) record.isSample = false;
  if (Object.prototype.hasOwnProperty.call(record, "featured")) record.featured = false;

  return record;
}

export function isDateKey(key) {
  return /(date|Date)$/.test(key);
}

export function isUrlKey(key) {
  return /(url|Url|website|link|logo|image|cover|screenshot|document|favicon)$/i.test(key);
}

export function isLongTextKey(key) {
  return /(description|biography|summary|notes|text|body|message)$/i.test(key);
}

export function isEnumKey(key) {
  return [
    "status", "type", "mode", "categoryId", "employmentType", "workArrangement",
    "educationType", "studyMode", "learningType", "unit", "scale", "eventType"
  ].includes(key);
}

/**
 * Collects the values already used for an enum-like field, plus the current value.
 * This keeps select options grounded in the dataset instead of inventing a list.
 */
export function enumOptions(records, key, current) {
  const values = new Set();
  for (const record of Array.isArray(records) ? records : []) {
    if (record && typeof record === "object" && typeof record[key] === "string" && record[key]) {
      values.add(record[key]);
    }
  }
  if (typeof current === "string" && current) values.add(current);
  return [...values].sort();
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pushError(errors, path, message) {
  errors.push({ path, message });
}

/**
 * Validates one document against the dataset's shape and the cross-file rules.
 *
 * @param {Object} dataset
 * @param {Object} document
 * @param {Object<string, Object>} allDocuments - parsed documents for references
 * @returns {{errors: Array<{path: string, message: string}>, warnings: Array<{path: string, message: string}>}}
 */
export function validateDocument(dataset, document, allDocuments = {}) {
  const errors = [];
  const warnings = [];

  if (!isRecord(document)) {
    pushError(errors, "", "The file root must be a JSON object.");
    return { errors, warnings };
  }

  if (document.schemaVersion !== 1) {
    pushError(errors, "schemaVersion", "schemaVersion must be the number 1.");
  }

  const collection = document[dataset.collection];

  if (dataset.kind === "record") {
    if (!isRecord(collection)) {
      pushError(errors, dataset.collection, `"${dataset.collection}" must be an object.`);
    } else if (dataset.key === "profile" && !String(collection.name || "").trim()) {
      pushError(errors, `${dataset.collection}.name`, "Profile name is required.");
    } else if (dataset.key === "navigation") {
      validateNavigation(collection, errors);
    }
    return { errors, warnings };
  }

  if (!Array.isArray(collection)) {
    pushError(errors, dataset.collection, `"${dataset.collection}" must be an array.`);
    return { errors, warnings };
  }

  const ids = new Map();
  const categories = Array.isArray(document[dataset.categories]) ? document[dataset.categories] : [];
  const categoryIds = new Set(categories.map((category) => category?.id).filter(Boolean));

  if (dataset.categories) {
    if (!Array.isArray(document[dataset.categories])) {
      pushError(errors, dataset.categories, `"${dataset.categories}" must be an array.`);
    } else {
      const seenCategories = new Set();
      categories.forEach((category, index) => {
        const path = `${dataset.categories}[${index}]`;
        if (!isRecord(category)) {
          pushError(errors, path, "Category must be an object.");
          return;
        }
        if (!String(category.id || "").trim()) pushError(errors, `${path}.id`, "category id is required.");
        if (!String(category.name || category.label || "").trim()) {
          pushError(errors, `${path}.name`, "category name is required.");
        }
        if (category.id && seenCategories.has(category.id)) {
          pushError(errors, `${path}.id`, `duplicate category id "${category.id}".`);
        }
        if (category.id) seenCategories.add(category.id);
      });
    }
  }
  const skillIds = collectIds(allDocuments.skills?.skills);
  const projectIds = collectIds(allDocuments.projects?.projects);

  collection.forEach((record, index) => {
    const path = `${dataset.collection}[${index}]`;

    if (!isRecord(record)) {
      pushError(errors, path, "Record must be an object.");
      return;
    }

    const id = typeof record.id === "string" ? record.id.trim() : "";

    if (!id) {
      pushError(errors, `${path}.id`, "id is required.");
    } else {
      if (!ID_PATTERN.test(id)) pushError(errors, `${path}.id`, "id may contain only letters, digits and hyphens.");
      if (dataset.prefix && !id.startsWith(dataset.prefix)) {
        pushError(errors, `${path}.id`, `id should start with "${dataset.prefix}".`);
      }
      if (ids.has(id)) pushError(errors, `${path}.id`, `duplicate id "${id}" (also at index ${ids.get(id)}).`);
      else ids.set(id, index);
    }

    if (dataset.labelField && !String(record[dataset.labelField] || "").trim()) {
      pushError(errors, `${path}.${dataset.labelField}`, `${dataset.labelField} is required.`);
    }

    if (typeof record.isSample !== "undefined" && typeof record.isSample !== "boolean") {
      pushError(errors, `${path}.isSample`, "isSample must be true or false.");
    }

    record.categoryId && !categoryIds.has(record.categoryId)
      ? pushError(errors, `${path}.categoryId`, `unknown categoryId "${record.categoryId}".`)
      : null;

    checkDateFields(record, path, errors);
    checkLinks(record, path, errors);
    checkRelatedIds(record, path, { skillIds, projectIds }, errors);

    if (dataset.key === "learningJourney" && record.progress && record.progress.enabled === true) {
      const value = record.progress.value;
      if (typeof value !== "number" || value < 0 || value > 100) {
        pushError(errors, `${path}.progress.value`, "progress.value must be a number from 0 to 100.");
      }
    }
  });

  if (dataset.key === "careerTimeline") {
    validateTimeline(collection, allDocuments, errors, warnings);
  }

  return { errors, warnings };
}

function collectIds(records) {
  return new Set((Array.isArray(records) ? records : []).map((record) => record?.id).filter(Boolean));
}

function checkDateFields(record, path, errors) {
  for (const [key, value] of Object.entries(record)) {
    if (!isDateKey(key)) continue;
    if (value === null || value === "") continue;
    if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
      pushError(errors, `${path}.${key}`, `${key} must be YYYY, YYYY-MM or YYYY-MM-DD.`);
    }
  }
}

function checkLinks(record, path, errors) {
  for (const [key, value] of Object.entries(record)) {
    if (!isUrlKey(key) || value === null || value === "") continue;
    if (typeof value !== "string") {
      pushError(errors, `${path}.${key}`, `${key} must be a string.`);
      continue;
    }
    const local = value.startsWith("./") || value.startsWith("/") || value.startsWith("#");
    const remote = /^https?:\/\//i.test(value);
    if (!local && !remote) {
      pushError(errors, `${path}.${key}`, `${key} must start with http(s)://, ./ or /.`);
    }
  }
}

function checkRelatedIds(record, path, references, errors) {
  const skillIds = references.skillIds;
  const projectIds = references.projectIds;

  for (const key of ["relatedSkillIds"]) {
    for (const id of Array.isArray(record[key]) ? record[key] : []) {
      if (!skillIds.has(id)) pushError(errors, `${path}.${key}`, `unknown skill id "${id}".`);
    }
  }

  for (const key of ["relatedProjectIds"]) {
    for (const id of Array.isArray(record[key]) ? record[key] : []) {
      if (!projectIds.has(id)) pushError(errors, `${path}.${key}`, `unknown project id "${id}".`);
    }
  }
}

function validateNavigation(navigation, errors) {
  const items = navigation?.items;
  if (!Array.isArray(items) || items.length === 0) {
    pushError(errors, "navigation.items", "navigation.items must contain the eleven section links.");
    return;
  }

  const ids = new Set();
  items.forEach((item, index) => {
    const path = `navigation.items[${index}]`;
    if (!isRecord(item)) {
      pushError(errors, path, "Navigation item must be an object.");
      return;
    }
    if (!String(item.id || "").trim()) pushError(errors, `${path}.id`, "id is required.");
    if (!String(item.label || "").trim()) pushError(errors, `${path}.label`, "label is required.");
    if (!String(item.target || "").trim()) pushError(errors, `${path}.target`, "target is required.");
    if (typeof item.order !== "number") pushError(errors, `${path}.order`, "order must be a number.");
    if (ids.has(item.id)) pushError(errors, `${path}.id`, `duplicate id "${item.id}".`);
    ids.add(item.id);
  });
}

function validateTimeline(events, allDocuments, errors, warnings) {
  const referenceIds = new Map();

  for (const [type, source] of Object.entries(TIMELINE_TYPES)) {
    referenceIds.set(type, collectIds(allDocuments[source.dataset]?.[source.collection]));
  }

  events.forEach((event, index) => {
    const path = `events[${index}]`;
    const type = typeof event?.type === "string" ? event.type : "";
    const source = TIMELINE_TYPES[type];

    if (!source) {
      pushError(errors, `${path}.type`, `type must be one of: ${Object.keys(TIMELINE_TYPES).join(", ")}.`);
      return;
    }

    if (!String(event.referenceId || "").trim()) {
      pushError(errors, `${path}.referenceId`, "referenceId is required.");
    } else if (!referenceIds.get(type).has(event.referenceId)) {
      pushError(errors, `${path}.referenceId`, `${type} "${event.referenceId}" does not exist.`);
    }

    if (typeof event.date !== "string" || !DATE_PATTERN.test(event.date)) {
      pushError(errors, `${path}.date`, "date must be YYYY, YYYY-MM or YYYY-MM-DD.");
    }

    const duplicate = events.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.type === event.type &&
        other.referenceId === event.referenceId
    );

    if (duplicate) warnings.push({ path, message: "Another event already references this record." });
  });
}

/**
 * Finds records that point at an id, so deleting it can warn first.
 * Returns human-readable "dataset: label" strings.
 */
export function findReferences(id, allDocuments) {
  const hits = [];

  for (const dataset of DATASETS) {
    if (dataset.kind === "record") continue;
    const records = allDocuments[dataset.key]?.[dataset.collection];
    if (!Array.isArray(records)) continue;

    for (const record of records) {
      const values = [
        ...(Array.isArray(record.relatedSkillIds) ? record.relatedSkillIds : []),
        ...(Array.isArray(record.relatedProjectIds) ? record.relatedProjectIds : [])
      ];

      if (record.referenceId === id || values.includes(id)) {
        hits.push(`${dataset.label}: ${recordLabel(dataset, record)}`);
      }
    }
  }

  return hits;
}
