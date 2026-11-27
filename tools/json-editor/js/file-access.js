/**
 * tools/json-editor/js/file-access.js - browser file access for the editor.
 *
 * A static server cannot write project files. Direct saving therefore uses the
 * File System Access API: the owner picks the project folder once, the editor
 * keeps the directory handle for the session, and writes through file handles.
 * When the API is unavailable the editor falls back to downloading a complete
 * replacement file; it never pretends a download was a save.
 *
 * Safety rules encoded here:
 *   - the folder is always chosen by the user through showDirectoryPicker();
 *   - only files registered in schema.js are read or written;
 *   - the existing text is re-read and hashed immediately before writing, so an
 *     external edit is detected instead of overwritten silently;
 *   - a timestamped backup is written before the original is replaced;
 *   - after writing, the file is read again and parsed, and the new hash is
 *     returned; a failed write leaves the original text untouched on disk.
 */

import { DATASETS } from "./schema.js";

const BACKUP_DIR = ".local-json-backups";

export function supportsDirectoryPicker() {
  return typeof window.showDirectoryPicker === "function";
}

async function hashText(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readText(fileHandle) {
  const file = await fileHandle.getFile();
  return file.text();
}

async function writeText(fileHandle, text) {
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

/**
 * Asks for read/write permission on the chosen directory.
 *
 * Chrome can return "prompt" for a handle restored from IndexedDB; the editor does
 * not persist handles, but checking makes the reason for a failed save explicit.
 */
async function ensurePermission(directoryHandle) {
  const options = { mode: "readwrite" };
  if ((await directoryHandle.queryPermission(options)) === "granted") return true;
  return (await directoryHandle.requestPermission(options)) === "granted";
}

/**
 * Opens the folder picker and loads every registered dataset.
 *
 * @returns {Promise<{directory: FileSystemDirectoryHandle, dataDirectory: FileSystemDirectoryHandle, documents: Object}>}
 */
export async function connectProject() {
  if (!supportsDirectoryPicker()) {
    throw new Error("This browser does not support the File System Access API. Use Chrome or Edge, or use the download fallback.");
  }

  const directory = await window.showDirectoryPicker({ id: "portfolio-root", mode: "readwrite" });

  if (!(await ensurePermission(directory))) {
    throw new Error("Read/write permission was not granted, so the editor cannot save into the project.");
  }

  let dataDirectory;
  try {
    dataDirectory = await directory.getDirectoryHandle("data");
  } catch {
    throw new Error('The selected folder has no "data" directory. Select the portfolio root, not a subfolder.');
  }

  const documents = {};

  for (const dataset of DATASETS) {
    try {
      const handle = await dataDirectory.getFileHandle(dataset.file);
      const text = await readText(handle);
      documents[dataset.key] = {
        text,
        hash: await hashText(text),
        parsed: JSON.parse(text),
        handle,
        missing: false
      };
    } catch (error) {
      // A missing or unreadable file is reported per dataset; one bad file must not
      // stop the editor from opening the rest.
      documents[dataset.key] = {
        text: "",
        hash: "",
        parsed: null,
        handle: null,
        missing: true,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return { directory, dataDirectory, documents };
}

/**
 * Loads the datasets from the running local server (read-only preview).
 * Used before the folder is connected, and in browsers without the file API.
 */
export async function loadFromServer() {
  const documents = {};

  for (const dataset of DATASETS) {
    try {
      const response = await fetch(`../../data/${dataset.file}`, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      documents[dataset.key] = {
        text,
        hash: await hashText(text),
        parsed: JSON.parse(text),
        handle: null,
        missing: false
      };
    } catch (error) {
      documents[dataset.key] = {
        text: "",
        hash: "",
        parsed: null,
        handle: null,
        missing: true,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return documents;
}

/**
 * Writes one validated dataset back to the selected project folder.
 *
 * @param {Object} options
 * @param {FileSystemDirectoryHandle} options.projectDirectory - Root folder chosen by the user; backups live here, never inside data/.
 * @param {FileSystemDirectoryHandle} options.dataDirectory
 * @param {Object} options.dataset
 * @param {string} options.text - Serialized complete document.
 * @param {string} options.expectedHash - Hash recorded when the document was loaded.
 * @returns {Promise<{hash: string, backupPath: string}>}
 * @throws {Error & {code?: string, currentText?: string}}
 */
export async function saveDataset({ projectDirectory, dataDirectory, dataset, text, expectedHash }) {
  let handle;

  try {
    handle = await dataDirectory.getFileHandle(dataset.file);
  } catch {
    throw Object.assign(new Error(`data/${dataset.file} does not exist in the selected folder.`), { code: "missing" });
  }

  const currentText = await readText(handle);
  const currentHash = await hashText(currentText);

  if (expectedHash && currentHash !== expectedHash) {
    throw Object.assign(
      new Error("The file changed on disk after it was loaded. Review the change before overwriting."),
      { code: "conflict", currentText }
    );
  }

  // Parsing the generated text here is a final guard: an editor bug must never
  // replace a valid file with invalid JSON.
  JSON.parse(text);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${BACKUP_DIR}/${stamp}/data/${dataset.file}`;

  try {
    // Backups belong beside the project, not in data/, so they are never served
    // or published accidentally. The caller passes the root folder it selected.
    const backups = await projectDirectory.getDirectoryHandle(BACKUP_DIR, { create: true });
    const runDir = await backups.getDirectoryHandle(stamp, { create: true });
    const dataDir = await runDir.getDirectoryHandle("data", { create: true });
    const backupHandle = await dataDir.getFileHandle(dataset.file, { create: true });
    await writeText(backupHandle, currentText);
  } catch (error) {
    throw Object.assign(
      new Error(`Backup could not be created, so the file was not overwritten: ${error instanceof Error ? error.message : error}`),
      { code: "backup" }
    );
  }

  await writeText(handle, text);

  const written = await readText(handle);
  const writtenHash = await hashText(written);
  JSON.parse(written);

  return { hash: writtenHash, backupPath };
}

/**
 * Starts a download of the complete replacement file.
 * The filename keeps the original `.json` name so it can be dropped into data/.
 */
export function downloadDocument(dataset, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = dataset.file;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export { hashText };
