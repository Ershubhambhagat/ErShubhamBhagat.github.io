/**
 * tools/json-editor/js/references.js - option lists for reference fields.
 *
 * `categoryId`, `referenceId`, `relatedSkillIds` and `relatedProjectIds` store an
 * id, but a human edits them by name. This module turns the already-loaded
 * documents into {value, label} pairs so the form can offer a datalist: pick a
 * record or keep typing a raw id (needed when the target record has not been
 * created yet and the owner wants to stage the reference first).
 *
 * It reads the parsed documents the editor already holds. Nothing is fetched, so a
 * picker never triggers network traffic and an offline editor still works.
 *
 * Pure: no DOM. `documents` is a map of dataset key -> parsed document.
 */

import { TIMELINE_TYPES, recordLabel } from "./schema.js";

/** Which kind of reference a field holds, or null when it is a plain value. */
export function referenceKind(key, dataset) {
  if (!key || !dataset) return null;
  if (key === "categoryId" && dataset.categories) return "category";
  if (key === "referenceId" && dataset.key === "careerTimeline") return "timeline";
  if (key === "relatedSkillIds") return "skills";
  if (key === "relatedProjectIds") return "projects";
  return null;
}

function optionsFrom(records, labelField) {
  const seen = new Set();
  const options = [];

  for (const record of Array.isArray(records) ? records : []) {
    if (!record || typeof record !== "object" || typeof record.id !== "string" || !record.id) continue;
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    options.push({ value: record.id, label: recordLabel({ labelField }, record) });
  }

  return options;
}

/**
 * Reference options for one field of one draft.
 *
 * @param {Object} options
 * @param {string} options.key - the property name (categoryId, referenceId, ...)
 * @param {Object} options.dataset - registry entry of the dataset being edited
 * @param {Object} options.draft - the record being edited (its `type` picks the timeline source)
 * @param {Object<string, Object>} options.documents - parsed documents by dataset key
 * @returns {Array<{value: string, label: string}>}
 */
export function referenceOptions({ key, dataset, draft = null, documents = {} }) {
  const kind = referenceKind(key, dataset);
  if (!kind) return [];

  if (kind === "category") {
    const categories = documents[dataset.key]?.[dataset.categories] ?? [];
    return optionsFrom(categories, "name");
  }

  if (kind === "timeline") {
    // The reference must resolve in the dataset the event type points at; an event
    // retyped from experience to project can never keep the old id.
    const source = TIMELINE_TYPES[draft?.type];
    if (!source) return [];
    return optionsFrom(documents[source.dataset]?.[source.collection], source.label);
  }

  if (kind === "skills") return optionsFrom(documents.skills?.skills, "name");
  if (kind === "projects") return optionsFrom(documents.projects?.projects, "title");

  return [];
}

/** Readable text for a stored id, falling back to the id itself. */
export function referenceLabel(options, value) {
  const match = (Array.isArray(options) ? options : []).find((option) => option.value === value);
  return match ? match.label : String(value ?? "");
}

/** A stored id that has no matching record (a dangling reference the validator flags). */
export function isUnknownReference(options, value) {
  if (!value) return false;
  return !(Array.isArray(options) ? options : []).some((option) => option.value === value);
}
