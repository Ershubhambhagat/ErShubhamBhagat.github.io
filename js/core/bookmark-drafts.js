/**
 * js/core/bookmark-drafts.js - draft overlay for the bookmark collection.
 *
 * Why drafts exist: the site is a static page on GitHub Pages. It cannot commit
 * to its own repository, so an in-page "Save" that claimed to publish a bookmark
 * would be a lie. Instead the bookmarks section offers owner mode (?owner=1),
 * which stores create/edit/delete operations in this browser only, shows them
 * immediately, and exports the merged dataset so the owner can commit it with the
 * repository workflow. The published JSON is never touched at runtime.
 *
 * Shape stored under STORAGE_KEYS.draft.bookmarkDrafts:
 *
 *   {
 *     created: [record, ...],           // full records, newest first
 *     updated: { [id]: partialRecord }, // field patches for published records
 *     deleted: [id, ...]                // ids hidden from the merged view
 *   }
 *
 * Everything in this module is pure: no DOM, no storage, no network. The section
 * renders what these functions return, which is what makes the overlay testable
 * without a browser.
 */

/** Fields a bookmark draft may carry, in the order the form shows them. */
const TEXT_FIELDS = Object.freeze(["name", "url", "description", "notes", "faviconUrl", "image", "screenshot"]);

/** @returns {{created: Array, updated: Object, deleted: Array}} */
export function emptyDrafts() {
  return { created: [], updated: {}, deleted: [] };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asText(value) {
  return typeof value === "string" ? value : "";
}

/**
 * Coerces whatever storage returned into a usable draft set.
 *
 * A corrupt or hand-edited value must degrade to "no drafts", never throw: the
 * bookmarks section is a public page even when the owner's browser holds rubbish.
 *
 * @param {unknown} value
 * @returns {{created: Array, updated: Object, deleted: Array}}
 */
export function normalizeDrafts(value) {
  const drafts = emptyDrafts();

  if (!isRecord(value)) {
    return drafts;
  }

  if (Array.isArray(value.created)) {
    drafts.created = value.created.filter(
      (record) => isRecord(record) && asText(record.name).trim() && asText(record.url).trim()
    );
  }

  if (isRecord(value.updated)) {
    for (const [id, patch] of Object.entries(value.updated)) {
      if (asText(id).trim() && isRecord(patch)) {
        drafts.updated[id] = patch;
      }
    }
  }

  if (Array.isArray(value.deleted)) {
    drafts.deleted = [...new Set(value.deleted.map((id) => asText(id).trim()).filter(Boolean))];
  }

  return drafts;
}

/** @returns {boolean} True when no draft operation is pending. */
export function isEmptyDrafts(drafts) {
  const normalized = normalizeDrafts(drafts);
  return (
    normalized.created.length === 0 &&
    normalized.deleted.length === 0 &&
    Object.keys(normalized.updated).length === 0
  );
}

/**
 * Normalises a bookmark URL for comparison and output.
 *
 * The comparison form lowercases the scheme and host and drops a trailing slash,
 * because "https://Example.com/" and "https://example.com" are the same page. The
 * path, query and fragment are preserved: they identify the actual destination.
 *
 * @param {unknown} url
 * @returns {{href: string, key: string, external: boolean}|null} Null when the
 *   URL is not a safe http(s) or site-relative address.
 */
export function normalizeBookmarkUrl(url) {
  const text = asText(url).trim();

  if (!text) {
    return null;
  }

  // Site-relative pages live in this repository (Old_Data/Blog/...), which is the
  // normal case for this collection.
  if (text.startsWith("./") || text.startsWith("../") || text.startsWith("/")) {
    if (/[\s\\]/.test(text) || text.startsWith("//")) {
      return null;
    }

    return { href: text, key: text.toLowerCase(), external: false };
  }

  let parsed;

  try {
    parsed = new URL(text);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  const key = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${path}${parsed.search}`;

  return { href: parsed.toString(), key, external: true };
}

/**
 * Finds an existing bookmark with the same normalised URL.
 *
 * @param {unknown} url
 * @param {Array<Object>} records
 * @param {string} [ignoreId] - The record being edited, which may keep its URL.
 * @returns {Object|null}
 */
export function findDuplicateUrl(url, records, ignoreId = "") {
  const normalized = normalizeBookmarkUrl(url);

  if (!normalized || !Array.isArray(records)) {
    return null;
  }

  for (const record of records) {
    if (!isRecord(record) || asText(record.id) === ignoreId) {
      continue;
    }

    const existing = normalizeBookmarkUrl(record.url);

    if (existing && existing.key === normalized.key) {
      return record;
    }
  }

  return null;
}

/**
 * Applies the draft overlay to the published records.
 *
 * Order of operations matters: deletions win over edits, edits win over the
 * published value, and created records come first so the owner sees what they just
 * added without scrolling.
 *
 * @param {Array<Object>} published
 * @param {unknown} drafts
 * @returns {Array<Object>}
 */
export function mergeBookmarks(published, drafts) {
  const base = Array.isArray(published) ? published.filter(isRecord) : [];
  const overlay = normalizeDrafts(drafts);
  const deleted = new Set(overlay.deleted);

  const merged = [];

  for (const record of overlay.created) {
    if (!deleted.has(asText(record.id))) {
      merged.push({ ...record });
    }
  }

  for (const record of base) {
    const id = asText(record.id);

    if (deleted.has(id)) {
      continue;
    }

    const patch = overlay.updated[id];
    merged.push(patch ? { ...record, ...patch, id } : record);
  }

  return merged;
}

/**
 * Splits a comma or newline separated string into a clean list.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function parseTags(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => asText(entry).trim()).filter(Boolean))];
  }

  return [
    ...new Set(
      asText(value)
        .split(/[,\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  ];
}

/**
 * Validates one bookmark form submission.
 *
 * Messages are written for the visitor, and each one names the field so the
 * section can move focus to it. `record` is only present when there are no errors.
 *
 * @param {Object} input - Raw form values.
 * @param {Object} [context]
 * @param {Array<Object>} [context.records] - Records the new value must not duplicate.
 * @param {string} [context.editingId] - Id being edited, excluded from duplicate checks.
 * @param {string[]} [context.categoryIds]
 * @param {() => string} [context.createId]
 * @param {number} [context.order]
 * @returns {{ok: boolean, errors: Object<string,string>, record?: Object}}
 */
export function validateBookmark(input, context = {}) {
  const values = isRecord(input) ? input : {};
  const errors = {};
  const name = asText(values.name).trim();
  const normalized = normalizeBookmarkUrl(values.url);

  if (!name) {
    errors.name = "A website name is required.";
  } else if (name.length > 120) {
    errors.name = "Keep the name under 120 characters.";
  }

  if (!asText(values.url).trim()) {
    errors.url = "A website address is required.";
  } else if (!normalized) {
    errors.url = "Use an https:// or http:// address, or a ./ page inside this site.";
  } else {
    const duplicate = findDuplicateUrl(values.url, context.records, context.editingId);

    if (duplicate) {
      errors.url = `This address is already saved as "${asText(duplicate.name) || "an existing bookmark"}".`;
    }
  }

  if (asText(values.description).length > 500) {
    errors.description = "Keep the description under 500 characters.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const categoryId = asText(values.categoryId).trim();
  const editingId = asText(context.editingId);

  const record = {
    id: editingId || (typeof context.createId === "function" ? context.createId() : `bookmark-${Date.now()}`),
    name,
    url: normalized.href,
    description: asText(values.description).trim(),
    categoryId,
    tags: parseTags(values.tags),
    notes: asText(values.notes).trim(),
    faviconUrl: asText(values.faviconUrl).trim(),
    image: asText(values.image).trim(),
    screenshot: asText(values.screenshot).trim(),
    featured: values.featured === true,
    // Owner-created records are drafts; `enabled` keeps the same meaning as in
    // data/bookmarks.json so an export can be committed unchanged.
    enabled: true,
    order: Number.isFinite(context.order) ? context.order : 0,
    isSample: false
  };

  return { ok: true, errors: {}, record };
}

/**
 * Produces the dataset the owner should commit.
 *
 * @param {Object} dataset - The loaded data/bookmarks.json object.
 * @param {Array<Object>} records - Merged records (drafts applied).
 * @returns {Object} A deep-ish copy with `bookmarks` replaced.
 */
export function toExportDataset(dataset, records) {
  const source = isRecord(dataset) ? dataset : {};
  const copy = { ...source };

  copy.bookmarks = (Array.isArray(records) ? records : []).map((record) => {
    const clean = {};

    for (const [key, value] of Object.entries(record)) {
      if (key === "isDraft") {
        continue;
      }
      clean[key] = value;
    }

    return clean;
  });

  return copy;
}

/** Field names the bookmark form owns; exported for the section's form builder. */
export const BOOKMARK_FORM_FIELDS = TEXT_FIELDS;
