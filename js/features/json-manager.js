/**
 * js/features/json-manager.js - validate, inspect and export the datasets.
 *
 * What this tool can and cannot do, stated in the UI because guessing wrong
 * wastes the owner's time: a static site cannot write to its own repository.
 * The manager validates an edited file, shows what it found, and downloads a
 * clean copy with the right file name; the owner commits that file. Nothing is
 * uploaded anywhere and no request leaves the page.
 *
 * Why validation instead of a full editor: the datasets are hand-edited JSON, and
 * the mistakes that actually happen are structural - a missing array, a record
 * without an id, a duplicated id, an invalid date. Those are exactly what the
 * checks below report, with the record index so the fix is obvious.
 *
 * Security: a chosen file is read with FileReader.text() and parsed with
 * JSON.parse; it is never evaluated and never inserted as markup. Only the
 * validated object is serialised back to a download.
 */

import { closeModal, openModal } from "../components/modal.js";
import { STORAGE_KEYS } from "../core/storage-manager.js";
import {
  addToolButton,
  asText,
  el,
  isRecord
} from "../core/section-kit.js";

/**
 * Dataset key -> the array (or record) its file must contain.
 *
 * Mirrors .build/CONTRACT.md: schemaVersion plus one named collection. `profile`
 * is the documented exception - a single record, not an array - because the
 * profile section renders one person.
 */
const DATASETS = Object.freeze({
  profile: { collection: "profile", kind: "record" },
  skills: { collection: "skills", kind: "array" },
  experience: { collection: "experiences", kind: "array" },
  projects: { collection: "projects", kind: "array" },
  certificates: { collection: "certificates", kind: "array" },
  education: { collection: "education", kind: "array" },
  learningJourney: { collection: "learningActivities", kind: "array" },
  careerTimeline: { collection: "events", kind: "array" },
  bookmarks: { collection: "bookmarks", kind: "array" },
  navigation: { collection: "navigation", kind: "record" },
  themePresets: { collection: "themes", kind: "array" }
});

/** Teardown for a previous initialization. */
let teardownPrevious = null;

/**
 * Validates one parsed dataset against its expected shape.
 *
 * @param {string} key - Dataset key.
 * @param {unknown} payload - Parsed JSON.
 * @returns {{ok: boolean, problems: Array<string>, count: number}}
 */
function validateDataset(key, payload) {
  const spec = DATASETS[key];
  const problems = [];
  let count = 0;

  if (!spec) {
    return { ok: false, problems: [`Unknown dataset "${key}".`], count: 0 };
  }

  if (!isRecord(payload)) {
    return { ok: false, problems: ["The file root must be a JSON object."], count: 0 };
  }

  if (payload.schemaVersion !== 1) {
    problems.push(`schemaVersion must be the number 1 (found ${JSON.stringify(payload.schemaVersion)}).`);
  }

  const value = payload[spec.collection];

  if (spec.kind === "array") {
    if (!Array.isArray(value)) {
      problems.push(`The "${spec.collection}" property must be an array.`);
    } else {
      count = value.length;
      value.forEach((record, index) => {
        if (!isRecord(record)) {
          problems.push(`${spec.collection}[${index}] is not an object.`);
          return;
        }

        if (!asText(record.id) && key !== "themePresets") {
          problems.push(`${spec.collection}[${index}] has no id.`);
        }

        for (const field of ["startDate", "endDate", "date", "issueDate", "publishedAt"]) {
          const candidate = record[field];
          if (typeof candidate === "string" && candidate && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(candidate)) {
            problems.push(`${spec.collection}[${index}].${field} is not YYYY, YYYY-MM or YYYY-MM-DD.`);
          }
        }
      });

      const ids = value.filter(isRecord).map((record) => asText(record.id)).filter(Boolean);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

      if (duplicates.length > 0) {
        problems.push(`Duplicate ids: ${[...new Set(duplicates)].join(", ")}.`);
      }
    }
  } else if (!isRecord(value)) {
    problems.push(`The "${spec.collection}" property must be an object.`);
  } else {
    count = 1;

    if (key === "profile" && !asText(value.name)) {
      problems.push("The profile record has no name.");
    }
  }

  return { ok: problems.length === 0, problems, count };
}

/**
 * Starts a download for a JSON payload.
 *
 * @param {string} filename
 * @param {unknown} payload
 */
function downloadJson(filename, payload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Give the browser a turn to start the download before the blob is released.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * @param {Object|undefined} sectionData - Unused: the manager reads appContext.
 * @param {{data?: Object, config?: Object, toast?: Object, storage?: Object}} [appContext]
 * @returns {void}
 */
export function initializeJsonManager(sectionData, appContext) {
  // Node-safe: the module contract check imports this file without a document.
  if (typeof document === "undefined") {
    return;
  }

  if (typeof teardownPrevious === "function") {
    teardownPrevious();
    teardownPrevious = null;
  }

  const root = document.getElementById("json-manager-root");

  if (!root) {
    return;
  }

  const dataPaths = appContext?.config?.dataPaths ?? {};
  const data = isRecord(appContext?.data) ? appContext.data : {};
  const toast = appContext?.toast;
  const storage = appContext?.storage;

  /**
   * Builds the manager dialog: loaded datasets on top, validation below.
   *
   * A static page cannot write to its own repository, so this never claims to
   * save. Downloading a validated file is the delivery mechanism, and the note at
   * the top of the dialog says so before the owner spends time looking for a
   * save button.
   */
  function openPanel() {
    const panel = el("div", { className: "json-manager" });
    panel.append(
      el("p", {
        className: "json-manager__note",
        text: "Validate a dataset, then download a clean copy. This page cannot write to your repository: commit the downloaded file to data/ yourself."
      })
    );

    const loadedList = el("div", { className: "json-manager__loaded" });
    loadedList.append(el("h3", { className: "json-manager__heading", text: "Loaded datasets" }));

    const table = el("ul", { className: "json-manager__list" });

    for (const key of Object.keys(DATASETS)) {
      const spec = DATASETS[key];
      const payload = data[key];
      const value = isRecord(payload) ? payload[spec.collection] : undefined;
      const count = Array.isArray(value) ? value.length : isRecord(value) ? 1 : 0;
      const item = el("li", { className: "json-manager__row" });

      item.append(
        el("span", { className: "json-manager__name", text: `${key} \u00b7 ${count} record${count === 1 ? "" : "s"}` })
      );

      if (payload) {
        const exportButton = el("button", {
          className: "btn btn--ghost btn--small",
          text: "Download",
          attrs: { type: "button" }
        });

        exportButton.addEventListener("click", () => {
          const path = asText(dataPaths[key]) || `./data/${key}.json`;
          const filename = path.split("/").pop() || `${key}.json`;
          downloadJson(filename, payload);
          toast?.success?.(`${filename} downloaded.`);
        });

        item.append(exportButton);
      } else {
        item.append(el("span", { className: "json-manager__missing", text: "not loaded" }));
      }

      table.append(item);
    }

    loadedList.append(table);
    panel.append(loadedList);

    // Import / validate section -------------------------------------------
    const importBlock = el("div", { className: "json-manager__import" });
    importBlock.append(el("h3", { className: "json-manager__heading", text: "Validate a file" }));

    const selectId = "json-manager-dataset";
    const selectWrap = el("div", { className: "field" });
    selectWrap.append(
      el("label", { className: "field__label", text: "Dataset", attrs: { for: selectId } })
    );
    const select = el("select", { className: "field__input", attrs: { id: selectId } });

    for (const key of Object.keys(DATASETS)) {
      const option = el("option", { text: key, attrs: { value: key } });
      select.append(option);
    }

    selectWrap.append(select);

    const fileId = "json-manager-file";
    const fileWrap = el("div", { className: "field" });
    fileWrap.append(
      el("label", { className: "field__label", text: "JSON file", attrs: { for: fileId } })
    );
    const fileInput = el("input", {
      className: "field__input",
      attrs: { id: fileId, type: "file", accept: ".json,application/json" }
    });
    fileWrap.append(fileInput);

    const status = el("div", { className: "json-manager__status", attrs: { role: "status", "aria-live": "polite" } });
    status.hidden = true;

    const downloadButton = el("button", {
      className: "btn btn--primary btn--small",
      text: "Download validated file",
      attrs: { type: "button", disabled: "" }
    });
    downloadButton.disabled = true;

    let validated = null;

    fileInput.addEventListener("change", async () => {
      status.hidden = true;
      status.replaceChildren();
      validated = null;
      downloadButton.disabled = true;

      const file = fileInput.files?.[0];

      if (!file) {
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        status.hidden = false;
        status.append(el("p", { className: "json-manager__error", text: "That file is larger than 2 MB; datasets here are far smaller." }));
        return;
      }

      let payload;

      try {
        payload = JSON.parse(await file.text());
      } catch (error) {
        status.hidden = false;
        status.append(
          el("p", {
            className: "json-manager__error",
            text: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}`
          })
        );
        return;
      }

      const key = select.value;
      const result = validateDataset(key, payload);
      status.hidden = false;
      status.append(
        el("p", {
          className: result.ok ? "json-manager__ok" : "json-manager__error",
          text: result.ok
            ? `Valid: ${result.count} record${result.count === 1 ? "" : "s"}.`
            : `${result.problems.length} problem${result.problems.length === 1 ? "" : "s"} found.`
        })
      );

      if (result.problems.length > 0) {
        const list = el("ul", { className: "json-manager__problems" });
        result.problems.slice(0, 12).forEach((problem) => list.append(el("li", { text: problem })));
        status.append(list);
      }

      if (result.ok) {
        validated = { key, payload, filename: `${asText(dataPaths[key]).split("/").pop() || `${key}.json`}` };
        downloadButton.disabled = false;
        storage?.saveLocalData?.(STORAGE_KEYS.draft.jsonManager, { key, at: new Date().toISOString() });
      }
    });

    downloadButton.addEventListener("click", () => {
      if (!validated) {
        return;
      }

      downloadJson(validated.filename, validated.payload);
      toast?.success?.(`${validated.filename} downloaded. Commit it to data/ to publish.`);
      closeModal(undefined, "download");
    });

    importBlock.append(selectWrap, fileWrap, downloadButton, status);
    panel.append(importBlock);

    openModal({
      title: "Data manager",
      content: panel,
      size: "lg",
      initialFocus: select
    });
  }

  const tool = addToolButton({
    id: "json-manager-trigger",
    label: "Data",
    icon: "database",
    onClick: openPanel
  });

  teardownPrevious = () => {
    tool.remove();
  };
}
