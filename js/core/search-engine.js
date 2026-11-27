/**
 * js/core/search-engine.js - the only text-matching algorithm in the project.
 *
 * .build/CONTRACT.md requires every consumer (Global Search, section search
 * boxes, the JSON Manager's record lookup) to reuse this module rather than
 * writing a second matcher, so users get one consistent set of rules:
 *
 *   - case-insensitive;
 *   - accent-insensitive ("Sao" finds "São");
 *   - every word must appear somewhere in the record (AND, not OR);
 *   - punctuation is preserved, so "c++" and "node.js" remain searchable;
 *   - the record's shape is irrelevant: all of its scalar values are searched,
 *     at any reasonable nesting depth.
 *
 * `applyFilters` and `applySort` are implemented in their own modules and
 * re-exported here because the contract lists them as part of this module's
 * public API. There is exactly one implementation of each.
 *
 * Security: record values are only stringified and compared. Nothing here
 * evaluates a query as a regular expression, so a query of ".*" is literal text
 * rather than a catastrophic backtracking pattern.
 */

import { readPath } from "./filter-engine.js";

// Re-exported so a consumer can import everything search-related from one path.
// These are pass-through re-exports, not second implementations.
export { applyFilters, collectFilterValues } from "./filter-engine.js";
export { applySort, parseSortableDate, SORT_MODES } from "./sort-engine.js";

// The binding imported above is deliberately re-exported by name: `export ...
// from` of the same name in addition to the import would be a duplicate export
// and the module would fail to parse.
export { readPath };

/** Combining accents left behind by NFKD normalisation. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Runs of whitespace, including the non-breaking spaces that JSON often carries. */
const WHITESPACE_RUN = /[\s\u00a0]+/g;

/**
 * How deep the record walk goes before it stops descending.
 *
 * Four levels covers every documented dataset (event -> related -> project ->
 * meta) while guaranteeing that a pathological or cyclic record cannot stall the
 * search.
 */
const MAX_SEARCH_DEPTH = 4;

/**
 * Normalises a value for comparison.
 *
 * NFKD + stripping combining marks folds accented characters onto their base
 * letter, which matters for names and institutions in this portfolio. Case is
 * folded with toLowerCase() rather than a locale-aware call so the same query
 * behaves identically on every device.
 *
 * @param {unknown} value - String, number, boolean, null or undefined.
 * @returns {string} Normalised text; "" for null/undefined.
 */
export function normalizeText(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }

  let text;

  try {
    text = String(value);
  } catch {
    // A hostile or broken object with a throwing toString() must not break a
    // search over the rest of the dataset.
    return "";
  }

  return text
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(WHITESPACE_RUN, " ")
    .trim();
}

/**
 * Collects every scalar value in a record into one searchable string.
 *
 * Values are concatenated with a space so a token cannot be formed by the join
 * itself (searching "ab" would otherwise match a record whose fields are "a" and
 * "b").
 *
 * @param {unknown} value
 * @param {Set<unknown>} seen - Guards against cycles in malformed imported JSON.
 * @param {number} depth
 * @returns {string}
 */
function collectScalars(value, seen, depth) {
  if (value === null || typeof value === "undefined") {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value !== "object" || depth >= MAX_SEARCH_DEPTH) {
    return "";
  }

  if (seen.has(value)) {
    return "";
  }

  seen.add(value);

  const parts = Array.isArray(value)
    ? value.map((entry) => collectScalars(entry, seen, depth + 1))
    : Object.values(value).map((entry) => collectScalars(entry, seen, depth + 1));

  seen.delete(value);

  return parts.join(" ");
}

/**
 * Builds the searchable text for one record.
 *
 * @param {unknown} record
 * @param {readonly string[]|undefined} fields - When provided, only these dotted
 *   paths are searched, which lets a section exclude ids or URLs.
 * @returns {string}
 */
function buildHaystack(record, fields) {
  if (Array.isArray(fields) && fields.length > 0) {
    return fields
      .map((field) => collectScalars(readPath(record, field), new Set(), 0))
      .join(" ");
  }

  return collectScalars(record, new Set(), 0);
}

/**
 * Tests whether a record matches a query.
 *
 * An empty or whitespace-only query matches everything: that is the state of an
 * untouched search box, and returning false there would hide the whole list.
 *
 * @param {unknown} record - Object, or a bare string/number.
 * @param {string} query
 * @param {Object} [options]
 * @param {readonly string[]} [options.fields] - Restrict the search to these
 *   dotted paths.
 * @returns {boolean}
 */
export function matchesQuery(record, query, options = {}) {
  const normalizedQuery = normalizeText(query);

  if (normalizedQuery === "") {
    return true;
  }

  const haystack = normalizeText(buildHaystack(record, options.fields));

  if (haystack === "") {
    return false;
  }

  // AND semantics: "react portfolio" finds a record that mentions both words in
  // any order, which is what a visitor typing without quotes expects.
  return normalizedQuery.split(" ").every((token) => haystack.includes(token));
}
