/**
 * js/core/filter-engine.js - generic filtering for any dataset.
 *
 * The engine knows nothing about projects, certificates or bookmarks. A section
 * passes records and a filter object; the same code serves every list, so the
 * filtering rules cannot drift between sections.
 *
 * Input is never mutated: every dataset instance is shared between sections
 * (see js/core/data-loader.js), so sorting or filtering in place would corrupt
 * what another section is about to render.
 *
 * Filter object shape:
 *
 *   { category: "web",                    // equality
 *     tags: ["javascript", "css"],        // record value intersects this list
 *     issuer: (value, record) => boolean, // custom rule
 *     score: { min: 75, max: 90 },         // numeric range (either side optional)
 *     year: "" }                          // empty values are ignored
 *
 * Dotted keys reach nested values: { "issuer.name": "Coursera" }.
 *
 * Consumers: every section with a filter control, through js/core/search-engine.js
 * (re-exported) or directly.
 */

/**
 * Filter values that mean "no filter".
 *
 * "all" and "*" are the sentinels a <select> or a chip group uses for "show
 * everything"; an empty string is what an unselected control reports. Treating
 * them as real filter values would hide every record.
 */
const DEFAULT_IGNORED_VALUES = Object.freeze(["", "all", "*", null, undefined]);

/**
 * Recognises a numeric-range rule.
 *
 * A range is a plain object with a `min` and/or `max` key, which is why the
 * check is explicit rather than "any object": filter state is public API here,
 * and a record-shaped value must not be mistaken for an interval.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isRangeFilter(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.prototype.hasOwnProperty.call(value, "min") ||
      Object.prototype.hasOwnProperty.call(value, "max"))
  );
}

/**
 * Converts a value to a finite number, or null.
 *
 * Numeric strings are accepted because dates arrive as "2025-10" and will be
 * mapped by the caller, while imported JSON sometimes stores numbers as text.
 * Everything else (null, "", "abc", arrays) is null, which never matches.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function toFiniteNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Normalises a range rule to `{ min, max }` finite numbers (null = unbounded).
 *
 * @param {{min?: unknown, max?: unknown}} range
 * @returns {{min: number|null, max: number|null}}
 */
export function normalizeRange(range) {
  if (!isRangeFilter(range)) {
    return { min: null, max: null };
  }

  return { min: toFiniteNumber(range.min), max: toFiniteNumber(range.max) };
}

/**
 * Tests one record value against a numeric interval.
 *
 * Inclusive on both ends, matching how "2022 to 2025" reads. A record without
 * a numeric value is excluded while the rule is active: a range filter asks
 * "which records have a value in here", so an unrated record is not a match.
 *
 * @param {unknown} recordValue
 * @param {{min?: unknown, max?: unknown}} range
 * @returns {boolean}
 */
export function matchesRange(recordValue, range) {
  const { min, max } = normalizeRange(range);

  if (min === null && max === null) {
    return true;
  }

  const value = toFiniteNumber(recordValue);

  if (value === null) {
    return false;
  }

  if (min !== null && value < min) {
    return false;
  }

  if (max !== null && value > max) {
    return false;
  }

  return true;
}

/**
 * Reads a dotted path from a record without throwing.
 *
 * Missing intermediate objects return undefined instead of throwing a TypeError:
 * optional fields are normal in this data model (see .build/CONTRACT.md, "Data
 * rules"), and a filter on an absent field should simply not match.
 *
 * @param {unknown} record
 * @param {string} path - e.g. "issuer.name".
 * @returns {unknown}
 */
export function readPath(record, path) {
  if (record === null || typeof record !== "object" || typeof path !== "string") {
    return undefined;
  }

  let current = record;

  for (const key of path.split(".")) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

/**
 * Compares one record value with one filter value.
 *
 * Strings are compared case-insensitively and trimmed, because filter values
 * usually originate from markup (data attributes, option values) while record
 * values come from JSON, and a difference in case must not silently hide a
 * record. Everything else uses strict equality, so 0 and false keep their
 * meaning instead of being coerced into falsy "no filter".
 *
 * @param {unknown} recordValue
 * @param {unknown} filterValue
 * @returns {boolean}
 */
function sameValue(recordValue, filterValue) {
  if (recordValue === filterValue) {
    return true;
  }

  if (
    recordValue === null ||
    typeof recordValue === "undefined" ||
    filterValue === null ||
    typeof filterValue === "undefined"
  ) {
    return false;
  }

  if (typeof recordValue === "object" || typeof filterValue === "object") {
    return false;
  }

  return (
    String(recordValue).trim().toLowerCase() ===
    String(filterValue).trim().toLowerCase()
  );
}

/**
 * Tests one filter entry against one record value.
 *
 * @param {unknown} recordValue
 * @param {unknown} filterValue - Scalar, array of accepted values, or predicate.
 * @returns {boolean}
 */
function matchesFilterValue(recordValue, filterValue) {
  if (Array.isArray(filterValue)) {
    if (filterValue.length === 0) {
      return true;
    }

    const recordValues = Array.isArray(recordValue) ? recordValue : [recordValue];
    return filterValue.some((accepted) =>
      recordValues.some((value) => sameValue(value, accepted))
    );
  }

  // A record field that is itself a list (tags) matches when it contains the
  // filter value, which is the behaviour a tag chip expects.
  if (Array.isArray(recordValue)) {
    return recordValue.some((value) => sameValue(value, filterValue));
  }

  return sameValue(recordValue, filterValue);
}

/**
 * Filters records by an object of rules. Every active rule must pass (AND).
 *
 * @param {Array<Object>} records
 * @param {Object<string, unknown>} [filters] - Rule per key; see module header.
 * @param {Object} [options]
 * @param {(record: Object, key: string) => unknown} [options.getValue] - Custom
 *   value reader, e.g. to filter on a computed value.
 * @param {readonly unknown[]} [options.ignoreValues] - Values that mean "no
 *   filter". Defaults to "", "all", "*", null, undefined.
 * @returns {Array<Object>} New array; the input array and its records are
 *   returned unchanged when no rule is active.
 */
export function applyFilters(records, filters, options = {}) {
  if (!Array.isArray(records)) {
    return [];
  }

  const { getValue, ignoreValues = DEFAULT_IGNORED_VALUES } = options;
  const reader =
    typeof getValue === "function"
      ? (record, key) => getValue(record, key)
      : (record, key) => readPath(record, key);

  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return records.slice();
  }

  const activeRules = Object.entries(filters).filter(([, filterValue]) => {
    if (typeof filterValue === "function") {
      return true;
    }

    if (Array.isArray(filterValue)) {
      return filterValue.length > 0;
    }

    if (isRangeFilter(filterValue)) {
      // A range with both ends cleared is "no filter"; one end is enough.
      const { min, max } = normalizeRange(filterValue);
      return min !== null || max !== null;
    }

    return !ignoreValues.includes(filterValue);
  });

  if (activeRules.length === 0) {
    return records.slice();
  }

  return records.filter((record) => {
    if (record === null || typeof record !== "object") {
      return false;
    }

    return activeRules.every(([key, filterValue]) => {
      const recordValue = reader(record, key);

      if (typeof filterValue === "function") {
        try {
          return Boolean(filterValue(recordValue, record));
        } catch (error) {
          // A throwing predicate is a caller bug. Log it and exclude the record:
          // including it would make the filter look like it silently ignored a
          // rule, which is harder to notice while debugging.
          console.error(`Filter predicate for "${key}" failed:`, error);
          return false;
        }
      }

      if (isRangeFilter(filterValue)) {
        return matchesRange(recordValue, filterValue);
      }

      return matchesFilterValue(recordValue, filterValue);
    });
  });
}

/**
 * Lists the distinct values a key takes across a dataset.
 *
 * Sections use this to build filter controls from the data instead of hardcoding
 * categories that may not exist. Array values contribute each entry; records
 * without the key contribute nothing.
 *
 * @param {Array<Object>} records
 * @param {string} key - Supports dotted paths.
 * @returns {string[]} Sorted, de-duplicated, non-empty values.
 */
export function collectFilterValues(records, key) {
  if (!Array.isArray(records) || typeof key !== "string") {
    return [];
  }

  const values = new Set();

  for (const record of records) {
    const value = readPath(record, key);

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry !== null && typeof entry !== "undefined" && String(entry).trim() !== "") {
          values.add(String(entry).trim());
        }
      }
      continue;
    }

    if (value !== null && typeof value !== "undefined" && String(value).trim() !== "") {
      values.add(String(value).trim());
    }
  }

  return [...values].sort((a, b) => a.localeCompare(b));
}
