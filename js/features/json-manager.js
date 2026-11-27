/**
 * js/features/json-manager.js - validate, merge, back up and export the datasets.
 *
 * What this tool can and cannot do, stated in the UI because guessing wrong
 * wastes the owner's time: a static site cannot write to its own repository.
 * The manager validates an edited file, shows what would change, builds the file
 * that should replace the current one, and downloads it with the right name; the
 * owner commits that file. Nothing is uploaded anywhere and no request leaves the
 * page.
 *
 * Why validation instead of a full editor: the datasets are hand-edited JSON, and
 * the mistakes that actually happen are structural - a missing collection, a
 * record without an id, a duplicated id, a date in the wrong shape, a categoryId
 * that no longer exists. Those are exactly what the checks below report, with the
 * record index so the fix is obvious.
 *
 * Merge model: records are matched by id. With "merge", the incoming file wins
 * for every id it contains and records it omits are kept, so a file exported
 * before an edit elsewhere does not silently delete that edit. With "replace",
 * the file becomes the dataset - offered because removing a record is legitimate,
 * but behind an explicit confirmation because it is the destructive direction.
 *
 * Backup and recovery: "download all" writes one envelope with every loaded
 * dataset. Choosing that envelope later validates each dataset inside it and
 * offers a per-dataset download, which is the recovery path - the owner still
 * commits the file, so recovery is never an invisible write.
 *
 * Security: a chosen file is read with FileReader.text() and parsed with
 * JSON.parse; it is never evaluated and never inserted as markup. Only the
 * validated object is serialised back to a download.
 */

import { closeModal, openModal } from "../components/modal.js";
import { STORAGE_KEYS } from "../core/storage-manager.js";
import {
  addToolButton,
  asArray,
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
  skills: { collection: "skills", kind: "array", categories: "categories" },
  experience: { collection: "experiences", kind: "array" },
  projects: { collection: "projects", kind: "array", categories: "categories" },
  certificates: { collection: "certificates", kind: "array", categories: "categories" },
  education: { collection: "education", kind: "array" },
  learningJourney: { collection: "learningActivities", kind: "array" },
  careerTimeline: { collection: "events", kind: "array" },
  bookmarks: { collection: "bookmarks", kind: "array" },
  navigation: { collection: "navigation", kind: "record" },
  themePresets: { collection: "themes", kind: "array" }
});

/** Marker on the combined backup file, so an import can tell the two apart. */
const BACKUP_KIND = "portfolio-backup";

/** Timeline event type -> the dataset and collection its referenceId must hit. */
const REFERENCE_TARGETS = Object.freeze({
  experience: { key: "experience", collection: "experiences" },
  project: { key: "projects", collection: "projects" },
  certificate: { key: "certificates", collection: "certificates" },
  education: { key: "education", collection: "education" },
  learning: { key: "learningJourney", collection: "learningActivities" }
});

/** Date-shaped fields checked for YYYY / YYYY-MM / YYYY-MM-DD. */
const DATE_FIELDS = Object.freeze([
  "startDate",
  "endDate",
  "date",
  "issueDate",
  "expiryDate",
  "publishedAt",
  "completedAt"
]);

/** Teardown for a previous initialization. */
let teardownPrevious = null;

/**
 * Filename for one dataset, taken from the configured data path.
 *
 * @param {string} key
 * @param {Object} dataPaths
 * @returns {string}
 */
function datasetFilename(key, dataPaths) {
  const path = asText(dataPaths?.[key]) || `./data/${key}.json`;
  return path.split("/").pop() || `${key}.json`;
}

/**
 * Guesses the dataset a file belongs to from its collection property.
 *
 * Picking the wrong entry in the select is the easiest mistake to make here, and
 * the collection name is unambiguous: exactly one dataset declares `skills`,
 * `events`, `bookmarks` and so on. When two match (a file with both `themes` and
 * `navigation`) nothing is guessed, because a wrong guess is worse than none.
 *
 * @param {unknown} payload
 * @returns {string} Dataset key, or "" when the file is ambiguous.
 */
function detectDatasetKey(payload) {
  if (!isRecord(payload)) {
    return "";
  }

  const matches = Object.keys(DATASETS).filter((key) => {
    const value = payload[DATASETS[key].collection];
    return Array.isArray(value) || isRecord(value);
  });

  return matches.length === 1 ? matches[0] : "";
}

/**
 * Human label for one record, used in the change preview.
 *
 * @param {Object} record
 * @returns {string}
 */
function recordLabel(record) {
  if (!isRecord(record)) {
    return "";
  }

  return (
    asText(record.title) ||
    asText(record.name) ||
    asText(record.role) ||
    asText(record.qualification) ||
    asText(record.id)
  );
}

/**
 * Checks categoryId values against the categories in the same file.
 *
 * The categories travel with the dataset, so this comparison needs no other
 * file: an incoming file that renamed a category is caught before it ships.
 *
 * @param {string} collection
 * @param {Array<unknown>} records
 * @param {unknown} categories
 * @returns {string[]}
 */
function categoryProblems(collection, records, categories) {
  const known = new Set(asArray(categories).map((entry) => asText(entry?.id)).filter(Boolean));

  if (known.size === 0) {
    return [];
  }

  const used = records
    .filter(isRecord)
    .map((record) => asText(record.categoryId))
    .filter((id) => id && !known.has(id));

  if (used.length === 0) {
    return [];
  }

  return [
    `${collection}: ${used.length} record(s) use a categoryId that is not in categories (${[...new Set(used)].join(", ")}).`
  ];
}

/**
 * Checks timeline referenceId values against the loaded datasets.
 *
 * An event points at a record in another section, so this is the one check that
 * needs data outside the file being validated. When the target dataset is not
 * loaded the check is skipped rather than reported as a failure - a missing
 * dataset is a loader problem, not a data problem.
 *
 * @param {Array<unknown>} records
 * @param {Object} data
 * @returns {string[]}
 */
function referenceProblems(records, data) {
  const missing = new Map();

  for (const record of records) {
    if (!isRecord(record)) {
      continue;
    }

    const target = REFERENCE_TARGETS[asText(record.type)];

    if (!target) {
      continue;
    }

    const referenceId = asText(record.referenceId);

    if (!referenceId) {
      continue;
    }

    const pool = asArray(data?.[target.key]?.[target.collection])
      .map((entry) => asText(entry?.id))
      .filter(Boolean);

    if (pool.length === 0) {
      continue;
    }

    if (!pool.includes(referenceId)) {
      const list = missing.get(asText(record.type)) || [];
      list.push(referenceId);
      missing.set(asText(record.type), list);
    }
  }

  return [...missing.entries()].map(
    ([type, ids]) =>
      `events: ${ids.length} pointer(s) of type "${type}" name a record that does not exist (${[
        ...new Set(ids)
      ].join(", ")}).`
  );
}

/**
 * Validates one parsed dataset against its expected shape.
 *
 * @param {string} key - Dataset key.
 * @param {unknown} payload - Parsed JSON.
 * @param {Object} [data] - Loaded datasets, used for cross-references.
 * @returns {{ok: boolean, problems: Array<string>, count: number}}
 */
function validateDataset(key, payload, data) {
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
    problems.push(
      `schemaVersion must be the number 1 (found ${JSON.stringify(payload.schemaVersion)}).`
    );
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

        for (const field of DATE_FIELDS) {
          const candidate = record[field];

          if (
            typeof candidate === "string" &&
            candidate &&
            !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(candidate)
          ) {
            problems.push(
              `${spec.collection}[${index}].${field} is not YYYY, YYYY-MM or YYYY-MM-DD.`
            );
          }
        }
      });

      const ids = value.filter(isRecord).map((record) => asText(record.id)).filter(Boolean);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

      if (duplicates.length > 0) {
        problems.push(`Duplicate ids: ${[...new Set(duplicates)].join(", ")}.`);
      }

      if (spec.categories) {
        problems.push(...categoryProblems(spec.collection, value, payload[spec.categories]));
      }

      if (key === "careerTimeline") {
        problems.push(...referenceProblems(value, data));
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
 * Compares an incoming record list with the loaded one by id.
 *
 * @param {Array<unknown>} incoming
 * @param {Array<unknown>} loaded
 * @returns {{added: number, changed: number, removed: number, addedLabels: string[], changedLabels: string[]}}
 */
function diffRecords(incoming, loaded) {
  const loadedById = new Map();

  for (const record of loaded.filter(isRecord)) {
    const id = asText(record.id);

    if (id) {
      loadedById.set(id, record);
    }
  }

  const seen = new Set();
  const addedLabels = [];
  const changedLabels = [];
  let changed = 0;

  for (const record of incoming.filter(isRecord)) {
    const id = asText(record.id);

    if (!id) {
      continue;
    }

    seen.add(id);
    const before = loadedById.get(id);

    if (!before) {
      addedLabels.push(recordLabel(record) || id);
      continue;
    }

    // Records are small plain objects, so a stable string comparison is both
    // accurate enough and immune to key order: JSON.stringify keeps insertion
    // order, which is the order the file was parsed in.
    if (JSON.stringify(before) !== JSON.stringify(record)) {
      changed += 1;
      changedLabels.push(recordLabel(record) || id);
    }
  }

  let removed = 0;

  for (const id of loadedById.keys()) {
    if (!seen.has(id)) {
      removed += 1;
    }
  }

  return { added: addedLabels.length, changed, removed, addedLabels, changedLabels };
}

/**
 * Describes the first few conflicting records field by field.
 *
 * The spec asks for the existing and the imported record to be visible before the
 * owner chooses. Printing every field of every record would be unreadable, so this
 * returns the changed scalar fields for at most three records, with values cut to
 * a readable length. Nested objects are reported as "changed" without a value.
 *
 * @param {Array<unknown>} incoming
 * @param {Array<unknown>} loaded
 * @returns {string[]}
 */
function describeConflicts(incoming, loaded) {
  const loadedById = new Map();

  for (const record of loaded.filter(isRecord)) {
    const id = asText(record.id);

    if (id) {
      loadedById.set(id, record);
    }
  }

  const lines = [];

  for (const record of incoming.filter(isRecord)) {
    if (lines.length >= 3) {
      break;
    }

    const before = loadedById.get(asText(record.id));

    if (!before) {
      continue;
    }

    const changes = [];

    for (const key of Object.keys(record)) {
      if (changes.length >= 3) {
        break;
      }

      const next = record[key];
      const previous = before[key];

      if (JSON.stringify(previous) === JSON.stringify(next)) {
        continue;
      }

      const brief = (value) => {
        if (isRecord(value) || Array.isArray(value)) {
          return "(object)";
        }

        const text = String(value ?? "");
        return text.length > 40 ? `${text.slice(0, 37)}...` : text;
      };

      changes.push(`${key}: "${brief(previous)}" \u2192 "${brief(next)}"`);
    }

    if (changes.length > 0) {
      lines.push(`${asText(record.id)} \u2014 ${changes.join("; ")}`);
    }
  }

  return lines;
}

/**
 * Merges incoming records into the loaded list by id.
 *
 * For an id present in both, the result is a shallow merge: the file's fields win,
 * and a field the file omits keeps its loaded value. That is how "never discard
 * existing fields silently" is honoured without inventing data. Nested objects are
 * replaced whole rather than merged, because merging them would fabricate
 * structure the file did not state.
 *
 * Records only in the file keep the file's order and are followed by records only
 * in the loaded data, in their original order. Appending rather than interleaving
 * keeps the result predictable: the file's own ordering is what its author saw.
 *
 * @param {Array<unknown>} incoming
 * @param {Array<unknown>} loaded
 * @returns {Array<unknown>}
 */
function mergeRecords(incoming, loaded) {
  const loadedById = new Map();

  for (const record of loaded.filter(isRecord)) {
    const id = asText(record.id);

    if (id) {
      loadedById.set(id, record);
    }
  }

  const incomingIds = new Set();
  const merged = incoming.map((record) => {
    if (!isRecord(record)) {
      return record;
    }

    const id = asText(record.id);
    incomingIds.add(id);
    const before = loadedById.get(id);

    return before ? { ...before, ...record } : record;
  });

  const kept = loaded.filter(
    (record) => isRecord(record) && asText(record.id) && !incomingIds.has(asText(record.id))
  );

  return [...merged, ...kept];
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
   * Builds the manager dialog: loaded datasets, the import form and the preview.
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
        text: "Validate a dataset, compare it with what is loaded, then download the file to commit. This page cannot write to your repository."
      })
    );

    const loadedList = el("div", { className: "json-manager__loaded" });
    const loadedHeading = el("div", { className: "json-manager__section-head" });
    loadedHeading.append(
      el("h3", { className: "json-manager__heading", text: "Loaded datasets" })
    );

    const backupButton = el("button", {
      className: "btn btn--ghost btn--small",
      text: "Download all (backup)",
      attrs: { type: "button" }
    });

    backupButton.addEventListener("click", () => {
      const datasets = {};

      for (const key of Object.keys(DATASETS)) {
        if (data[key]) {
          datasets[key] = data[key];
        }
      }

      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`portfolio-backup-${stamp}.json`, {
        kind: BACKUP_KIND,
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        datasets
      });
      toast?.success?.("Backup downloaded. Keep it outside the repository.");
    });

    loadedHeading.append(backupButton);
    loadedList.append(loadedHeading);

    const table = el("ul", { className: "json-manager__list" });

    for (const key of Object.keys(DATASETS)) {
      const spec = DATASETS[key];
      const payload = data[key];
      const value = isRecord(payload) ? payload[spec.collection] : undefined;
      const count = Array.isArray(value) ? value.length : isRecord(value) ? 1 : 0;
      const item = el("li", { className: "json-manager__row" });

      item.append(
        el("span", {
          className: "json-manager__name",
          text: `${key} \u00b7 ${count} record${count === 1 ? "" : "s"}`
        })
      );

      if (payload) {
        const exportButton = el("button", {
          className: "btn btn--ghost btn--small",
          text: "Download",
          attrs: { type: "button" }
        });

        exportButton.addEventListener("click", () => {
          const filename = datasetFilename(key, dataPaths);
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
    importBlock.append(el("h3", { className: "json-manager__heading", text: "Import a file" }));

    const selectId = "json-manager-dataset";
    const selectWrap = el("div", { className: "field" });
    selectWrap.append(
      el("label", { className: "field__label", text: "Dataset", attrs: { for: selectId } })
    );
    const select = el("select", {
      className: "field__input field__input--select",
      attrs: { id: selectId }
    });

    for (const key of Object.keys(DATASETS)) {
      select.append(el("option", { text: key, attrs: { value: key } }));
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

    const strategyWrap = el("fieldset", { className: "json-manager__strategies" });
    strategyWrap.append(
      el("legend", { className: "field__label", text: "When a record id already exists" })
    );

    const strategies = [
      { value: "merge", label: "Merge: the file wins, omitted fields and records are kept" },
      { value: "replace", label: "Replace: the file becomes the dataset" }
    ];

    for (const strategy of strategies) {
      const option = el("label", { className: "json-manager__strategy" });
      const radio = el("input", {
        attrs: { type: "radio", name: "json-manager-strategy", value: strategy.value }
      });
      radio.checked = strategy.value === "merge";
      option.append(radio, el("span", { text: strategy.label }));
      strategyWrap.append(option);
    }

    const confirmWrap = el("label", { className: "json-manager__confirm" });
    const confirmInput = el("input", {
      attrs: { type: "checkbox", id: "json-manager-confirm" }
    });
    confirmWrap.append(
      confirmInput,
      el("span", {
        text: "I understand that records missing from this file will be removed."
      })
    );
    confirmWrap.hidden = true;

    const status = el("div", {
      className: "json-manager__status",
      attrs: { role: "status", "aria-live": "polite" }
    });
    status.hidden = true;

    const preview = el("div", { className: "json-manager__preview" });
    preview.hidden = true;

    const downloadButton = el("button", {
      className: "btn btn--primary btn--small",
      text: "Download validated file",
      attrs: { type: "button" }
    });
    downloadButton.disabled = true;

    /** Validated result for the current file, or null. */
    let validated = null;

    /** Re-renders the strategy-dependent controls (confirm gate, button label). */
    function syncStrategy() {
      const strategy = strategyWrap.querySelector("input:checked")?.value || "merge";
      confirmWrap.hidden = strategy !== "replace";
      downloadButton.textContent =
        strategy === "merge" ? "Download merged dataset" : "Download replacement file";
      downloadButton.disabled =
        !validated || (strategy === "replace" && !confirmInput.checked);
    }

    /** Draws the preview: totals plus the first added and changed records. */
    function renderPreview(result, payload) {
      preview.replaceChildren();
      preview.hidden = false;

      const spec = DATASETS[validated.key];
      const incoming = asArray(payload[spec.collection]);
      const loaded = asArray(data[validated.key]?.[spec.collection]);
      const diff = diffRecords(incoming, loaded);

      const summary = el("p", { className: "json-manager__preview-summary" });
      summary.append(
        el("strong", { text: `${incoming.length} record${incoming.length === 1 ? "" : "s"}` }),
        el("span", {
          text: ` \u00b7 ${diff.added} added \u00b7 ${diff.changed} changed \u00b7 ${diff.removed} not in file`
        })
      );
      preview.append(summary);

      const interesting = [
        ...diff.addedLabels.map((label) => `+ ${label}`),
        ...diff.changedLabels.map((label) => `~ ${label}`)
      ].slice(0, 5);

      if (interesting.length > 0) {
        const list = el("ul", { className: "json-manager__preview-list" });
        interesting.forEach((label) => list.append(el("li", { text: label })));
        preview.append(list);
      }

      const conflicts = describeConflicts(incoming, loaded).map((line) =>
        el("li", { className: "json-manager__conflict", text: line })
      );

      if (conflicts.length > 0) {
        preview.append(
          el("p", { className: "json-manager__preview-note", text: "Existing \u2192 imported:" })
        );
        // el() takes children as an array option, not as rest arguments.
        preview.append(el("ul", { className: "json-manager__preview-list", children: conflicts }));
      }

      if (diff.removed > 0) {
        preview.append(
          el("p", {
            className: "json-manager__preview-note",
            text:
              strategyWrap.querySelector("input:checked")?.value === "replace"
                ? "Replace removes those records from the dataset."
                : "Merge keeps those records, because the file does not mention them."
          })
        );
      }

      preview.append(
        el("p", {
          className: "json-manager__preview-note",
          text: `Target: ${datasetFilename(validated.key, dataPaths)}`
        })
      );
    }

    /** Validates one dataset payload and reports into the shared status area. */
    function reportOne(key, payload) {
      const result = validateDataset(key, payload, data);

      if (!result.ok) {
        status.append(
          el("p", {
            className: "json-manager__error",
            text: `${key}: ${result.problems.length} problem${result.problems.length === 1 ? "" : "s"}.`
          })
        );
        const list = el("ul", { className: "json-manager__problems" });
        result.problems.slice(0, 12).forEach((problem) => list.append(el("li", { text: problem })));
        status.append(list);
        return null;
      }

      return { key, payload, filename: datasetFilename(key, dataPaths) };
    }

    /**
     * Handles a chosen file: single dataset or combined backup.
     *
     * The backup branch validates every dataset in the envelope and offers one
     * download per dataset instead of a batch: browsers block multiple automatic
     * downloads, and a partial batch would leave the owner unsure which files
     * arrived.
     */
    async function handleFile(file) {
      status.hidden = true;
      status.replaceChildren();
      preview.hidden = true;
      preview.replaceChildren();
      validated = null;
      downloadButton.disabled = true;
      confirmInput.checked = false;

      if (!file) {
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        status.hidden = false;
        status.append(
          el("p", {
            className: "json-manager__error",
            text: "That file is larger than 2 MB; datasets here are far smaller."
          })
        );
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

      status.hidden = false;

      if (isRecord(payload) && payload.kind === BACKUP_KIND) {
        const envelope = isRecord(payload.datasets) ? payload.datasets : {};
        const keys = Object.keys(envelope);

        if (keys.length === 0) {
          status.append(
            el("p", { className: "json-manager__error", text: "The backup contains no datasets." })
          );
          return;
        }

        status.append(
          el("p", {
            className: "json-manager__ok",
            text: `Backup from ${asText(payload.exportedAt) || "an unknown date"}: ${keys.length} dataset(s). Download the ones you want to restore.`
          })
        );

        const list = el("ul", { className: "json-manager__list" });

        for (const key of keys) {
          const item = el("li", { className: "json-manager__row" });
          const result = validateDataset(key, envelope[key], data);

          item.append(
            el("span", {
              className: "json-manager__name",
              text: `${key} \u00b7 ${result.ok ? `${result.count} valid` : `${result.problems.length} problems`}`
            })
          );

          if (result.ok) {
            const restore = el("button", {
              className: "btn btn--ghost btn--small",
              text: "Download",
              attrs: { type: "button" }
            });
            restore.addEventListener("click", () => {
              const filename = datasetFilename(key, dataPaths);
              downloadJson(filename, envelope[key]);
              toast?.success?.(`${filename} downloaded. Commit it to data/ to restore.`);
            });
            item.append(restore);
          } else {
            item.append(el("span", { className: "json-manager__error", text: "invalid" }));
          }

          list.append(item);
        }

        status.append(list);
        return;
      }

      // The file, not the select, says which dataset it is; switching the select
      // keeps the label and the exported filename consistent with the content.
      const detected = detectDatasetKey(payload);

      if (detected && detected !== select.value) {
        select.value = detected;
        status.append(
          el("p", {
            className: "json-manager__ok",
            text: `Detected dataset "${detected}" from the file.`
          })
        );
      }

      validated = reportOne(select.value, payload);

      if (!validated) {
        return;
      }

      status.append(
        el("p", {
          className: "json-manager__ok",
          text: `Valid: ${validateDataset(validated.key, payload, data).count} record(s).`
        })
      );

      renderPreview(validateDataset(validated.key, payload, data), payload);
      syncStrategy();
      storage?.saveLocalData?.(STORAGE_KEYS.draft.jsonManager, {
        key: validated.key,
        at: new Date().toISOString()
      });
    }

    fileInput.addEventListener("change", () => {
      void handleFile(fileInput.files?.[0]);
    });

    select.addEventListener("change", () => {
      // The dataset select decides which collection is read from the file; a
      // validation made against the previous choice no longer applies.
      validated = null;
      downloadButton.disabled = true;
      preview.hidden = true;
      status.hidden = true;
    });

    strategyWrap.addEventListener("change", () => {
      syncStrategy();

      if (validated) {
        renderPreview(validateDataset(validated.key, validated.payload, data), validated.payload);
      }
    });

    confirmInput.addEventListener("change", syncStrategy);

    downloadButton.addEventListener("click", () => {
      if (!validated) {
        return;
      }

      const strategy = strategyWrap.querySelector("input:checked")?.value || "merge";
      const spec = DATASETS[validated.key];
      const loadedPayload = isRecord(data[validated.key]) ? data[validated.key] : null;

      let output = validated.payload;

      if (strategy === "merge" && loadedPayload) {
        output = {
          ...loadedPayload,
          schemaVersion: validated.payload.schemaVersion ?? loadedPayload.schemaVersion,
          [spec.collection]: mergeRecords(
            asArray(validated.payload[spec.collection]),
            asArray(loadedPayload[spec.collection])
          )
        };
      }

      downloadJson(validated.filename, output);
      toast?.success?.(`${validated.filename} downloaded. Commit it to data/ to publish.`);
      closeModal(undefined, "download");
    });

    importBlock.append(selectWrap, fileWrap, strategyWrap, confirmWrap, downloadButton, status, preview);
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
