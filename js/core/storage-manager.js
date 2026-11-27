/**
 * js/core/storage-manager.js - every read and write of localStorage goes here.
 *
 * localStorage is a hostile environment: it throws in private windows, it
 * throws when the 5 MB quota is full, it throws when the visitor blocks site
 * data, and another script on the same origin can leave a corrupt value behind.
 * Each of those is handled and reported through a return value, never by
 * letting an exception escape into a click handler or a render loop.
 *
 * Rules that this module exists to enforce:
 *   - every key is namespaced with "portfolio." so nothing collides with other
 *     applications served from the same origin (github.io is a shared origin);
 *   - stored values are always JSON, so callers get back the shape they saved;
 *   - nothing sensitive is stored. localStorage is readable by any script on
 *     the page and survives the session, so it holds preferences only: theme,
 *     favourites, interface state and unsaved drafts.
 *
 * The authoritative portfolio content stays in data/*.json. localStorage is a
 * convenience layer, never the only copy of owner data (see 01_FOUNDATION.md,
 * "Browser Storage").
 */

/** Namespace that every key must carry. */
export const STORAGE_PREFIX = "portfolio.";

/**
 * Documented key list. Adding a key means adding it here with its owner, so the
 * next developer can find out who writes a value before changing its shape.
 *
 * Intended owner (the module that writes the key):
 *   theme, themeSettings  -> js/features/theme-studio.js
 *   favorites             -> js/sections/bookmarks.js
 *   ui.*                  -> the section named in the comment
 *   draft.*               -> the feature named in the comment, cleared after a
 *                            successful save/import so a stale draft is never
 *                            restored over newer data
 *
 * Shapes are deliberately not frozen: each owner documents its own value.
 */
export const STORAGE_KEYS = Object.freeze({
  /** "dark" | "light" or a preset id. Written by Theme Studio. */
  theme: "portfolio.theme",

  /** Serialised theme token overrides: { [tokenName]: value }. */
  themeSettings: "portfolio.themeSettings",

  /** Array of bookmark ids the visitor starred. */
  favorites: "portfolio.favorites",

  /** Interface state that should survive a reload but never sync anywhere. */
  ui: Object.freeze({
    /** Last search query, restored into the Global Search input on reload. */
    lastSearchQuery: "portfolio.ui.lastSearchQuery",
    /** Recent Global Search queries, newest first, capped at five. */
    recentSearches: "portfolio.ui.recentSearches",
    /** Selected filter set per section: { [sectionId]: Object }. */
    filters: "portfolio.ui.filters",
    /** Selected sort mode per section: { [sectionId]: string }. */
    sortModes: "portfolio.ui.sortModes",
    /** Whether the mobile navigation drawer was open. */
    navigationOpen: "portfolio.ui.navigationOpen"
  }),

  /** Unsaved working copies. Never read during boot: a draft is offered, never applied. */
  draft: Object.freeze({
    /** Records pasted or fetched in the GitHub importer, awaiting the owner's export. */
    githubImport: "portfolio.draft.githubImport",
    /** Dataset edits made in the JSON Manager that have not been downloaded yet. */
    jsonManager: "portfolio.draft.jsonManager",
    /** Message text typed into the contact form. */
    contactMessage: "portfolio.draft.contactMessage",
    /** Bookmark create/edit/delete operations made in ?owner=1, awaiting export. */
    bookmarkDrafts: "portfolio.draft.bookmarkDrafts"
  })
});

/**
 * Result of the one-time availability probe.
 * null means "not probed yet", so a page that never stores anything costs
 * nothing, and a failed probe is not repeated on every call.
 *
 * @type {boolean|null}
 */
let storageAvailable = null;

/**
 * @returns {Storage|null} localStorage, or null when the browser denies access
 *   (blocked cookies, sandboxed iframe, non-browser environment).
 */
function getStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Reading the property itself throws a SecurityError when site data is
    // blocked, which is different from the object merely being unusable.
    return null;
  }
}

/**
 * Normalises a caller-supplied key to the namespaced form.
 *
 * Keys are documented in STORAGE_KEYS, but a caller may pass "theme" by
 * mistake. Prefixing (rather than throwing) keeps the contract "every key is
 * namespaced" true even for a typo, and the value still round-trips because
 * reads use the same normalisation.
 *
 * @param {string} key
 * @returns {string}
 */
function toStorageKey(key) {
  if (typeof key !== "string" || key.trim() === "") {
    throw new TypeError("Storage key must be a non-empty string.");
  }

  const trimmed = key.trim();
  return trimmed.startsWith(STORAGE_PREFIX) ? trimmed : STORAGE_PREFIX + trimmed;
}

/**
 * True when the browser can persist a value right now.
 *
 * The probe writes and removes a throwaway key: feature-detecting the
 * localStorage object is not enough, because Safari's private mode and a full
 * quota both expose the object and then throw on setItem.
 *
 * @returns {boolean}
 */
export function isStorageAvailable() {
  if (storageAvailable !== null) {
    return storageAvailable;
  }

  const storage = getStorage();

  if (!storage) {
    storageAvailable = false;
    return storageAvailable;
  }

  const probeKey = `${STORAGE_PREFIX}__probe__`;

  try {
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    storageAvailable = true;
  } catch (error) {
    console.warn(
      "localStorage is unavailable; preferences will not persist this visit.",
      error
    );
    storageAvailable = false;
  }

  return storageAvailable;
}

/**
 * Serialises `value` and stores it.
 *
 * @param {string} key - Namespaced key, normally from STORAGE_KEYS.
 * @param {any} value - Anything JSON can represent. `undefined` is rejected
 *   rather than stored as the string "undefined": use removeLocalData() to
 *   clear a value, which is unambiguous on the next read.
 * @returns {boolean} True when the value was written.
 */
export function saveLocalData(key, value) {
  const storageKey = toStorageKey(key);
  const storage = getStorage();

  if (!storage) {
    return false;
  }

  let serialised;

  try {
    serialised = JSON.stringify(value);
  } catch (error) {
    // Cyclic structures and BigInt throw here. Storing something else instead
    // would make the next read return a different shape than the caller saved.
    console.error(`Could not serialise value for "${storageKey}":`, error);
    return false;
  }

  if (typeof serialised === "undefined") {
    console.error(
      `Refusing to store "${storageKey}": undefined is not JSON. Use removeLocalData() to clear it.`
    );
    return false;
  }

  try {
    storage.setItem(storageKey, serialised);
    return true;
  } catch (error) {
    if (isQuotaError(error)) {
      // The visitor's origin storage is full. Nothing is deleted here: silently
      // evicting another feature's key would trade one broken feature for two.
      console.warn(
        `Could not store "${storageKey}": the browser storage quota is full.`
      );
    } else {
      console.warn(`Could not store "${storageKey}":`, error);
    }

    storageAvailable = false;
    return false;
  }
}

/**
 * Reads and deserialises a stored value.
 *
 * @param {string} key - Namespaced key, normally from STORAGE_KEYS.
 * @param {any} [fallback=null] - Returned when the key is absent, unreadable or
 *   holds invalid JSON.
 * @returns {any} The parsed value, or `fallback`.
 */
export function getLocalData(key, fallback = null) {
  const storageKey = toStorageKey(key);
  const storage = getStorage();

  if (!storage) {
    return fallback;
  }

  let raw;

  try {
    raw = storage.getItem(storageKey);
  } catch (error) {
    console.warn(`Could not read "${storageKey}":`, error);
    return fallback;
  }

  if (raw === null) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    // A corrupt entry is left in place on purpose: removing it would erase the
    // only evidence of what went wrong. The owning feature overwrites it on its
    // next save, and the JSON Manager offers an explicit clear.
    console.warn(
      `Stored value for "${storageKey}" is not valid JSON; using the fallback.`,
      error
    );
    return fallback;
  }
}

/**
 * Deletes one key.
 *
 * @param {string} key
 * @returns {boolean} True when the key is gone (including when it never existed).
 */
export function removeLocalData(key) {
  const storageKey = toStorageKey(key);
  const storage = getStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(storageKey);
    return true;
  } catch (error) {
    console.warn(`Could not remove "${storageKey}":`, error);
    return false;
  }
}

/**
 * Recognises "storage is full" across browsers.
 *
 * Chrome/Safari throw QuotaExceededError, older Firefox throws
 * NS_ERROR_DOM_QUOTA_REACHED with code 1014, and both can appear as legacy
 * numeric codes. Only affects the wording of the warning; the return value is
 * the same either way.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isQuotaError(error) {
  if (!(error instanceof DOMException)) {
    return false;
  }

  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014
  );
}
