/**
 * tools/json-editor/js/diff.js - before/after comparison of one dataset.
 *
 * The change review before saving, the sidebar dirty dot and the save results all
 * read the same comparison, so what the dialog lists and what the file write
 * contains cannot drift apart. A cancelled edit never reaches this module: the
 * callers pass the loaded snapshot and the in-memory draft, nothing else.
 *
 * Pure by design (no DOM, no editor state) so `node tests/run.mjs` can assert the
 * added/updated/removed grouping from fixtures.
 */

import { recordLabel } from "./schema.js";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valueKind(value) {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function sameValue(a, b) {
  if (valueKind(a) !== valueKind(b)) return false;
  if (Array.isArray(a) || isRecord(a)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

/**
 * Lists the dotted paths whose value differs between two records.
 *
 * Nested objects are walked key by key so the review can say
 * `company.name` instead of dumping the whole company object; arrays are compared
 * as a single path because an item-level diff of a tag list is noise, not a change
 * the owner can act on.
 */
export function changedPaths(before, after, base = "") {
  const paths = [];

  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      const path = base ? `${base}.${key}` : key;
      if (!(key in before)) paths.push(path);
      else if (!(key in after)) paths.push(path);
      else paths.push(...changedPaths(before[key], after[key], path));
    }
    return paths;
  }

  if (isRecord(before) !== isRecord(after) || !sameValue(before, after)) {
    return [base || "(record)"];
  }

  return paths;
}

function valueAt(record, path) {
  if (path === "(record)") return record;
  let node = record;
  for (const key of path.split(".")) {
    if (!isRecord(node) && !Array.isArray(node)) return undefined;
    node = node[key];
  }
  return node;
}

/**
 * Indexes a collection by id, keeping the original order and index.
 * Records without an id are keyed by position so they still show up as added or
 * removed rather than being silently merged with each other.
 */
function indexById(records) {
  const map = new Map();
  (Array.isArray(records) ? records : []).forEach((record, index) => {
    const id = isRecord(record) && typeof record.id === "string" && record.id ? record.id : `(index ${index})`;
    map.set(id, { id, record, index });
  });
  return map;
}

function describe(dataset, record, id) {
  return { id, label: recordLabel(dataset, record) };
}

/**
 * Compares two versions of a dataset document.
 *
 * @param {Object|null} before - the document as loaded from disk
 * @param {Object|null} after - the in-memory draft
 * @param {Object} dataset - registry entry (collection, categories, labelField)
 * @returns {{added: Array, updated: Array, removed: Array, categories: Object|null}}
 */
export function diffDocuments(before, after, dataset) {
  const empty = { added: [], updated: [], removed: [], categories: null };
  if (!dataset) return empty;

  const beforeDoc = isRecord(before) ? before : {};
  const afterDoc = isRecord(after) ? after : {};

  // A record-kind dataset holds one object instead of a list. Wrapping it keeps a
  // single diff algorithm: the object is "updated" as a whole set of field paths.
  const listOf = (doc) => {
    const value = doc[dataset.collection];
    if (Array.isArray(value)) return value;
    if (isRecord(value)) return [value];
    return [];
  };

  const beforeMap = indexById(listOf(beforeDoc));
  const afterMap = indexById(listOf(afterDoc));

  const result = { added: [], updated: [], removed: [], categories: null };

  for (const [id, entry] of afterMap) {
    if (!beforeMap.has(id)) {
      result.added.push(describe(dataset, entry.record, id));
      continue;
    }

    const previous = beforeMap.get(id).record;
    const paths = changedPaths(previous, entry.record);

    if (paths.length > 0) {
      result.updated.push({
        ...describe(dataset, entry.record, id),
        fields: paths.map((path) => ({ path, from: valueAt(previous, path), to: valueAt(entry.record, path) }))
      });
    }
  }

  for (const [id, entry] of beforeMap) {
    if (!afterMap.has(id)) result.removed.push(describe(dataset, entry.record, id));
  }

  if (dataset.categories) {
    const beforeCategories = indexById(beforeDoc[dataset.categories]);
    const afterCategories = indexById(afterDoc[dataset.categories]);
    const categories = { added: [], updated: [], removed: [] };

    for (const [id, entry] of afterCategories) {
      if (!beforeCategories.has(id)) categories.added.push(describe(dataset, entry.record, id));
      else if (changedPaths(beforeCategories.get(id).record, entry.record).length > 0) {
        categories.updated.push(describe(dataset, entry.record, id));
      }
    }

    for (const [id, entry] of beforeCategories) {
      if (!afterCategories.has(id)) categories.removed.push(describe(dataset, entry.record, id));
    }

    const touched = categories.added.length + categories.updated.length + categories.removed.length;
    result.categories = touched > 0 ? categories : null;
  }

  return result;
}

/** Totals for a file heading such as "1 added · 2 updated · 0 removed". */
export function summarizeChanges(diff) {
  const categories = diff?.categories;
  return {
    added: diff?.added?.length ?? 0,
    updated: diff?.updated?.length ?? 0,
    removed: diff?.removed?.length ?? 0,
    categoryChanges: categories
      ? categories.added.length + categories.updated.length + categories.removed.length
      : 0
  };
}

/** True when the comparison found nothing at all (the file can be marked saved). */
export function isEmptyDiff(diff) {
  const totals = summarizeChanges(diff);
  return totals.added + totals.updated + totals.removed + totals.categoryChanges === 0;
}
