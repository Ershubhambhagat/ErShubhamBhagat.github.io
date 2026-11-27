/**
 * js/core/data-loader.js - the only place that turns a JSON file into objects.
 *
 * Responsibilities:
 *   - fetch one dataset (loadJSON)
 *   - fetch all datasets listed in APP_CONFIG.dataPaths (loadPortfolioData)
 *   - guarantee one network request per path, no matter how many sections ask
 *
 * What it deliberately does NOT do: invent data. A missing or malformed file
 * produces an error object the caller can show; it never produces an empty
 * array or a placeholder record that would look like real portfolio content.
 *
 * Intended consumers: js/app.js (boot), js/features/json-manager.js (reload after
 * an import), and any module reading the shared data map from appContext.
 *
 * Security: the only untrusted input here is the response body. It is parsed
 * with response.json() and never evaluated, and nothing in this module touches
 * the DOM, so a hostile JSON file cannot inject markup by itself.
 */

import { APP_CONFIG } from "../config.js";

/**
 * Error thrown for every failure this module can produce.
 *
 * A dedicated type (instead of plain Error) lets js/core/error-handler.js show
 * the technical part of the message only to developers, while the user-facing
 * panel stays generic. `path` and `status` are what a developer needs first
 * when a dataset 404s after a rename.
 */
export class DataLoadError extends Error {
  /**
   * @param {string} message - Developer-facing description.
   * @param {Object} [details]
   * @param {string} [details.path] - Requested path, relative as configured.
   * @param {number} [details.status] - HTTP status when a response arrived.
   * @param {Error} [details.cause] - Original error, preserved for the console.
   * @param {Array<{key: string, path: string, error: Error}>} [details.failures]
   *   Populated by loadPortfolioData() when several datasets fail at once.
   */
  constructor(message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = "DataLoadError";
    this.path = details.path ?? "";
    this.status = details.status ?? 0;
    this.failures = details.failures ?? [];
  }
}

/**
 * path -> Promise<payload> while a request is in flight, payload once resolved.
 *
 * Keyed by absolute URL, not by the configured string, so "./data/projects.json"
 * and "data/projects.json" are recognised as the same file. Projects, Global
 * Search and Career Timeline all read the same records: caching means the
 * visitor downloads each dataset once per page load.
 */
const datasetCache = new Map();

/**
 * Resolves a configured path against the document base URL.
 *
 * Falls back to the raw string when there is no document (unit tests, tooling),
 * which keeps the module importable outside a browser without a DOM shim.
 *
 * @param {string} path
 * @returns {string} Absolute URL, or the input when it cannot be resolved.
 */
function toAbsoluteUrl(path) {
  if (typeof document === "undefined" || !document.baseURI) {
    return path;
  }

  try {
    return new URL(path, document.baseURI).href;
  } catch {
    return path;
  }
}

/**
 * Fetches and parses one JSON file, with the result cached in memory.
 *
 * Failure modes that reach the caller as DataLoadError:
 *   - network failure or an aborted request (fetch rejects)
 *   - HTTP error status (response.ok is false, so a 404 HTML page is never parsed)
 *   - body that is not JSON (response.json() rejects)
 *   - a JSON root that is not an object or array (e.g. a bare string), which
 *     would break every consumer that reads named arrays from it
 *
 * A failed request is evicted from the cache so a later retry can succeed; a
 * cached failure would otherwise be permanent for the page's lifetime.
 *
 * @param {string} path - Path as written in APP_CONFIG.dataPaths.
 * @returns {Promise<Object|Array>} Parsed payload. Treat as read-only: every
 *   section receives the same object, so mutating it changes other sections.
 * @throws {DataLoadError}
 */
export async function loadJSON(path) {
  if (typeof path !== "string" || path.trim() === "") {
    throw new DataLoadError("loadJSON() needs a non-empty path string.", {
      path: String(path)
    });
  }

  const url = toAbsoluteUrl(path);
  const cached = datasetCache.get(url);

  // A cached value is either the in-flight promise or the resolved payload.
  // Awaiting both shapes is correct, and it makes concurrent callers share one
  // request instead of racing two.
  if (cached !== undefined) {
    return cached;
  }

  const request = (async () => {
    let response;

    try {
      // "no-cache" keeps a stale dataset out of the HTTP cache during
      // development while still allowing a conditional request on GitHub Pages.
      response = await fetch(url, { cache: "no-cache" });
    } catch (cause) {
      throw new DataLoadError(`Could not request ${path}.`, { path, cause });
    }

    if (!response.ok) {
      throw new DataLoadError(
        `Could not load ${path}: HTTP ${response.status}.`,
        { path, status: response.status }
      );
    }

    let payload;

    try {
      payload = await response.json();
    } catch (cause) {
      // A response that arrives but is not JSON is almost always a renamed
      // file, an HTML error page or a truncated upload. Report the path so the
      // developer does not have to guess which dataset broke.
      throw new DataLoadError(`${path} did not contain valid JSON.`, {
        path,
        status: response.status,
        cause
      });
    }

    if (payload === null || typeof payload !== "object") {
      throw new DataLoadError(
        `${path} must contain a JSON object or array at the root.`,
        { path, status: response.status }
      );
    }

    return payload;
  })();

  datasetCache.set(url, request);

  try {
    const payload = await request;
    // Replace the promise with the resolved payload. Keeping the promise would
    // also work, but this makes the cache cheap to inspect while debugging.
    datasetCache.set(url, payload);
    return payload;
  } catch (error) {
    datasetCache.delete(url);
    throw error;
  }
}

/**
 * Loads every dataset in APP_CONFIG.dataPaths concurrently.
 *
 * Each task captures its own error instead of letting Promise.all reject on the
 * first failure, for two reasons:
 *   1. the failure panel can then name every missing file in one pass, rather
 *      than one reload per typo;
 *   2. with `onDatasetError` supplied, the datasets that did load are still
 *      returned, so one broken file does not blank the whole portfolio.
 *
 * Never returns placeholder data: a key is present only if its file loaded.
 *
 * @param {Object} [options]
 * @param {Object<string, string>} [options.paths] - Override for tests; defaults
 *   to APP_CONFIG.dataPaths.
 * @param {((error: Error, failure: {key: string, path: string, error: Error}) => void)|null}
 *   [options.onDatasetError] - Called once per failed dataset. When supplied,
 *   failures are tolerated and partial data is returned. When omitted, any
 *   failure rejects with a single DataLoadError listing all of them.
 * @returns {Promise<Object<string, Object|Array>>} Map of dataset key to payload.
 * @throws {DataLoadError}
 */
export async function loadPortfolioData(options = {}) {
  const { paths = APP_CONFIG.dataPaths, onDatasetError = null } = options;

  if (onDatasetError !== null && typeof onDatasetError !== "function") {
    throw new TypeError("loadPortfolioData(): onDatasetError must be a function or null.");
  }

  const results = await Promise.all(
    Object.entries(paths).map(async ([key, path]) => {
      try {
        return { key, path, payload: await loadJSON(path), error: null };
      } catch (error) {
        return { key, path, payload: undefined, error };
      }
    })
  );

  const data = {};
  const failures = [];

  for (const result of results) {
    if (result.error) {
      failures.push({ key: result.key, path: result.path, error: result.error });
    } else {
      data[result.key] = result.payload;
    }
  }

  if (failures.length === 0) {
    return data;
  }

  // Report every failure before deciding what to do with it. A throwing
  // reporter must not hide the remaining failures, so each call is isolated.
  if (onDatasetError) {
    for (const failure of failures) {
      try {
        onDatasetError(failure.error, failure);
      } catch (reporterError) {
        console.error("Dataset error reporter failed:", reporterError);
      }
    }

    console.error(
      `Data loading finished with ${failures.length} failed dataset(s):`,
      failures.map((failure) => failure.path)
    );

    return data;
  }

  const list = failures.map((failure) => failure.path).join(", ");
  const aggregate = new DataLoadError(
    failures.length === 1
      ? `Could not load ${list}.`
      : `Could not load ${failures.length} datasets: ${list}.`,
    { path: failures[0].path, failures }
  );

  // Keep the individual errors visible in the console: the aggregate message
  // names the files, and each original error carries the HTTP status or parse
  // detail a developer needs next.
  console.error("Dataset loading failed:", failures);
  throw aggregate;
}

/**
 * Empties the in-memory dataset cache.
 *
 * The JSON Manager calls this after the owner imports new records, so the next
 * loadPortfolioData() reads the files again instead of returning what the page
 * started with. Sections hold their own rendered output, so this does not
 * re-render anything by itself.
 */
export function clearDataCache() {
  datasetCache.clear();
}
