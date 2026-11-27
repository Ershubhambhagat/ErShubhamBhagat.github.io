/**
 * tools/json-editor/js/save-all.js - one write attempt per file, every outcome kept.
 *
 * Why a separate module: a multi-file save must never stop at the first problem.
 * The owner needs "experience.json written, career-timeline.json refused" as two
 * facts, not one generic failure. Keeping the loop here makes it testable without
 * a browser (a fake writer can fail the second file on purpose).
 *
 * Failure policy:
 *   - a file with validation errors is reported and skipped; the rest still run;
 *   - a writer exception is reported with its own message; the rest still run;
 *   - "ok: true" means this file really reached its destination. Download mode
 *     reports mode "download" because the file on disk is still the old one.
 *
 * Pure: the caller injects validate/write/download. No DOM, no globals.
 */

/**
 * @param {Array<{key: string, dataset: Object, text: string}>} files
 * @param {Object} handlers
 * @param {(file: Object) => string[]} [handlers.validate] - blocking messages, empty when valid
 * @param {(file: Object) => Promise<{backupPath?: string}>} [handlers.write] - omit to use download mode
 * @param {(file: Object) => void} [handlers.download]
 * @returns {Promise<Array<{key: string, file: string, ok: boolean, mode?: string, backupPath?: string, code?: string, message?: string}>>}
 */
export async function saveAllDocuments(files, { validate, write, download } = {}) {
  const results = [];
  const list = Array.isArray(files) ? files : [];

  for (const file of list) {
    const name = file?.dataset?.file ?? "(unknown)";
    const key = file?.key ?? "";

    if (!file?.dataset || typeof file.text !== "string" || file.text.length === 0) {
      results.push({ key, file: name, ok: false, code: "missing", message: "the document is not loaded" });
      continue;
    }

    const problems = typeof validate === "function" ? validate(file) : [];
    if (problems.length > 0) {
      results.push({
        key,
        file: name,
        ok: false,
        code: "invalid",
        message: `${problems.length} validation error(s): ${problems[0]}`
      });
      continue;
    }

    if (typeof write === "function") {
      try {
        const outcome = (await write(file)) ?? {};
        results.push({ key, file: name, ok: true, mode: "write", backupPath: outcome.backupPath ?? "" });
      } catch (error) {
        results.push({
          key,
          file: name,
          ok: false,
          code: error?.code ?? "write",
          message: error instanceof Error ? error.message : String(error)
        });
      }
      continue;
    }

    try {
      if (typeof download !== "function") throw new Error("no writer and no download handler");
      download(file);
      results.push({ key, file: name, ok: true, mode: "download" });
    } catch (error) {
      results.push({
        key,
        file: name,
        ok: false,
        code: error?.code ?? "download",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return results;
}

/** True only when every file reached its destination. */
export function allSaved(results) {
  return Array.isArray(results) && results.length > 0 && results.every((result) => result.ok);
}
