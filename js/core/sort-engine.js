/**
 * js/core/sort-engine.js - generic sorting for any dataset.
 *
 * Three modes only, because that is what the sort controls offer: newest,
 * oldest and alphabetical. Any other value leaves the order untouched and logs
 * a warning, so a typo in a data attribute cannot silently scramble a list.
 *
 * The engine is data-shape agnostic: it does not know that a project has
 * "date" or a certificate has "issuedAt". It resolves a comparable value from a
 * documented list of common keys, and a caller can override that with
 * `getDateValue` / `getLabelValue` when its dataset uses something else.
 *
 * Input is never mutated (shared dataset instance, see data-loader.js).
 */

import { readPath } from "./filter-engine.js";

/** Supported sort modes, in the order a sort control should list them. */
export const SORT_MODES = Object.freeze(["newest", "oldest", "alphabetical"]);

/**
 * Keys checked, in order, when no explicit date getter is supplied.
 * Ordered from the most specific date to the loosest: a record that carries both
 * "date" and "updatedAt" should sort by the date the visitor cares about.
 */
const DEFAULT_DATE_KEYS = Object.freeze([
  "date",
  "publishedAt",
  "issuedAt",
  "completedAt",
  "endDate",
  "startDate",
  "updatedAt",
  "createdAt",
  "year"
]);

/**
 * Keys checked when sorting alphabetically. "title" first because every visible
 * record type in this portfolio has one; "id" last as a stable fallback so a
 * record with no label still lands in a predictable place.
 */
const DEFAULT_LABEL_KEYS = Object.freeze([
  "title",
  "name",
  "label",
  "degree",
  "institution",
  "company",
  "id"
]);

/**
 * Created once: constructing a collator per comparison is measurably slow on
 * long lists, and the options are constant.
 */
const labelCollator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true
});

/** Matches "2024", "2024-05" and "2024-05-31". */
const ISO_DATE_PATTERN = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;

/**
 * Converts a date-ish value to a number that sorts correctly.
 *
 * ISO parts are parsed by hand instead of through `new Date(string)` on purpose:
 * the Date constructor treats "2024-05-31" as UTC midnight and then renders it
 * in local time, which can move a record to the previous day (and therefore
 * reorder two records on the same date) depending on the visitor's timezone.
 *
 * @param {unknown} value - "YYYY-MM-DD", "YYYY-MM", "YYYY", a full ISO
 *   timestamp, a Date, or a number.
 * @returns {number|null} Comparable key, or null when the value has no date.
 */
export function parseSortableDate(value) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    return null;
  }

  const parts = ISO_DATE_PATTERN.exec(trimmed);

  if (parts) {
    const year = Number(parts[1]);
    const month = parts[2] ? Number(parts[2]) : 1;
    const day = parts[3] ? Number(parts[3]) : 1;

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    // yyyymmdd keeps the natural ordering of mixed precision: a bare year sorts
    // before any month inside it, which is what "no month recorded" should mean.
    return year * 10000 + month * 100 + day;
  }

  // Full timestamps ("2024-05-31T10:00:00Z") still need the Date parser. A
  // timestamp carries its own timezone, so there is no local-time ambiguity.
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Resolves the first usable date on a record.
 *
 * @param {Object} record
 * @param {readonly string[]} keys
 * @returns {number|null}
 */
function resolveDateValue(record, keys) {
  for (const key of keys) {
    const parsed = parseSortableDate(readPath(record, key));

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

/**
 * Resolves the first usable label on a record.
 *
 * @param {Object} record
 * @param {readonly string[]} keys
 * @returns {string}
 */
function resolveLabelValue(record, keys) {
  for (const key of keys) {
    const value = readPath(record, key);

    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

/**
 * Sorts a copy of `records`.
 *
 * Records the mode cannot order (no date, no label) are placed after the ordered
 * ones in both directions: "newest first" must not end with a block of undated
 * records that look oldest, and the same list must not move between the two
 * directions. Ties keep their incoming order, which keeps a section's curated
 * sequence intact when two records share a date.
 *
 * @param {Array<Object>} records
 * @param {"newest"|"oldest"|"alphabetical"} mode
 * @param {Object} [options]
 * @param {(record: Object) => unknown} [options.getDateValue] - Explicit date
 *   getter; receives the record and returns a date-ish value.
 * @param {(record: Object) => unknown} [options.getLabelValue] - Explicit label
 *   getter for alphabetical mode.
 * @param {readonly string[]} [options.dateKeys] - Override the searched keys.
 * @param {readonly string[]} [options.labelKeys] - Override the searched keys.
 * @param {"asc"|"desc"} [options.direction="asc"] - Only meaningful for
 *   "alphabetical"; newest/oldest already imply their direction.
 * @returns {Array<Object>} New array.
 */
export function applySort(records, mode, options = {}) {
  if (!Array.isArray(records)) {
    return [];
  }

  const indexed = records.map((record, index) => ({ record, index }));

  if (!SORT_MODES.includes(mode)) {
    console.warn(`applySort(): unknown mode "${String(mode)}"; order left unchanged.`);
    return records.slice();
  }

  const {
    getDateValue,
    getLabelValue,
    dateKeys = DEFAULT_DATE_KEYS,
    labelKeys = DEFAULT_LABEL_KEYS,
    direction = "asc"
  } = options;

  if (mode === "alphabetical") {
    const labelOf = (record) => {
      const value =
        typeof getLabelValue === "function"
          ? getLabelValue(record)
          : resolveLabelValue(record, labelKeys);
      return value === null || typeof value === "undefined" ? "" : String(value).trim();
    };

    const sign = direction === "desc" ? -1 : 1;

    indexed.sort((a, b) => {
      const labelA = labelOf(a.record);
      const labelB = labelOf(b.record);

      // Empty labels stay at the end regardless of direction, for the same
      // reason undated records do.
      if (labelA === "" && labelB === "") {
        return a.index - b.index;
      }
      if (labelA === "") {
        return 1;
      }
      if (labelB === "") {
        return -1;
      }

      const comparison = labelCollator.compare(labelA, labelB);
      return comparison !== 0 ? comparison * sign : a.index - b.index;
    });

    return indexed.map((entry) => entry.record);
  }

  const dateOf = (record) =>
    typeof getDateValue === "function"
      ? parseSortableDate(getDateValue(record))
      : resolveDateValue(record, dateKeys);

  const sign = mode === "newest" ? -1 : 1;

  indexed.sort((a, b) => {
    const dateA = dateOf(a.record);
    const dateB = dateOf(b.record);

    if (dateA === null && dateB === null) {
      return a.index - b.index;
    }
    if (dateA === null) {
      return 1;
    }
    if (dateB === null) {
      return -1;
    }

    return dateA !== dateB ? (dateA - dateB) * sign : a.index - b.index;
  });

  return indexed.map((entry) => entry.record);
}
