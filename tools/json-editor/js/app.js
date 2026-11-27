/**
 * tools/json-editor/js/app.js - JSON Editor Studio UI.
 *
 * One page, four regions: datasets (left), records (middle), record form and JSON
 * preview (right), plus a modal change review shared by save and download.
 *
 * Data flow:
 *   folder/file -> parsed document + `original` snapshot -> draft record ->
 *   Apply -> document -> diff (original vs draft) -> validation -> save/download.
 *
 * Module map (what breaks if a dependency changes):
 *   app.js        -> schema.js (registry, validation), file-access.js (disk),
 *                    ids.js (id allocation via schema.js), diff.js (change review),
 *                    history.js (undo/redo), query.js (search/filter/sort),
 *                    references.js (reference pickers), save-all.js (multi-file write).
 *   schema.js     -> ids.js. Never imports app.js; must import with no DOM.
 *   file-access.js-> schema.js (the dataset registry).
 *   diff/history/query/references/save-all -> pure; covered by
 *                    tests/cases/editor-*.test.mjs.
 *
 * The dirty state is derived, never accumulated: a dataset is dirty when the
 * serialized draft differs from the snapshot taken when the file was loaded. That
 * makes undo-to-original clear the indicator by itself, and it means a cancelled
 * form edit can never mark a file as changed.
 *
 * A draft is never written to disk until the owner confirms the review, and the
 * review refuses to offer Save while any affected file has validation errors.
 */

import {
  DATASETS,
  blankRecord,
  collectionOf,
  datasetByKey,
  enumOptions,
  findReferences,
  isArrayDataset,
  isDateKey,
  isEnumKey,
  isLongTextKey,
  isUrlKey,
  recordLabel,
  validateDocument
} from "./schema.js";
import { allocateId } from "./ids.js";
import { createHistory } from "./history.js";
import { diffDocuments, isEmptyDiff, summarizeChanges } from "./diff.js";
import { facetValues, filterAndSort, filterFieldsFor, searchFieldsFor } from "./query.js";
import { isUnknownReference, referenceKind, referenceLabel, referenceOptions } from "./references.js";
import { saveAllDocuments } from "./save-all.js";
import {
  connectProject,
  downloadDocument,
  loadFromServer,
  saveDataset,
  supportsDirectoryPicker
} from "./file-access.js";

/** Form labels for properties whose raw JSON key would not read as English. */
const FIELD_LABELS = {
  categoryId: "Category",
  referenceId: "Referenced record",
  relatedSkillIds: "Related skills",
  relatedProjectIds: "Related projects",
  isSample: "Sample record",
  status: "Status",
  type: "Type",
  enabled: "Enabled",
  featured: "Featured",
  learningType: "Learning type",
  employmentType: "Employment type"
};

const state = {
  docs: {},
  directory: null,
  dataDirectory: null,
  currentKey: "projects",
  selectedIndex: null,
  draft: null,
  draftDirty: false,
  mode: "records",
  search: "",
  filterField: "",
  filterValue: "",
  sort: "order",
  preview: false,
  saving: false,
  lastSave: null
};

/** Bounded, in-memory: see history.js for why snapshots beat inverse edits. */
const history = createHistory({ limit: 50 });

const dom = {
  datasetList: document.getElementById("dataset-list"),
  datasetTitle: document.getElementById("dataset-title"),
  datasetMeta: document.getElementById("dataset-meta"),
  status: document.getElementById("connection-status"),
  draftStatus: document.getElementById("draft-status"),
  connect: document.getElementById("connect-button"),
  save: document.getElementById("save-button"),
  download: document.getElementById("download-button"),
  undo: document.getElementById("undo-button"),
  redo: document.getElementById("redo-button"),
  changes: document.getElementById("changes-button"),
  search: document.getElementById("record-search"),
  filterField: document.getElementById("filter-field"),
  filterValue: document.getElementById("filter-value"),
  sort: document.getElementById("sort-order"),
  clearFilters: document.getElementById("clear-filters"),
  add: document.getElementById("add-record"),
  categories: document.getElementById("categories-toggle"),
  table: document.getElementById("record-table"),
  tableWrap: document.getElementById("table-wrap"),
  empty: document.getElementById("empty-state"),
  form: document.getElementById("record-form"),
  formTitle: document.getElementById("form-title"),
  apply: document.getElementById("apply-record"),
  cancel: document.getElementById("cancel-record"),
  preview: document.getElementById("json-preview"),
  copy: document.getElementById("copy-json"),
  validation: document.getElementById("validation-panel"),
  previewWrap: document.getElementById("preview-wrap"),
  panelForm: document.getElementById("panel-form"),
  tablist: document.querySelector("[role=\"tablist\"]"),
  toast: document.getElementById("toast"),
  changesDialog: document.getElementById("changes-dialog"),
  changesBody: document.getElementById("changes-body"),
  changesActions: document.getElementById("changes-actions"),
  changesTitle: document.getElementById("changes-title"),
  changesClose: document.getElementById("changes-close"),
  tabs: [...document.querySelectorAll("[data-tab]")]
};

/* ------------------------------------------------------------------ helpers */

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (typeof props.text === "string") node.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value !== null && value !== undefined) node.setAttribute(name, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function button(text, onClick, props = {}) {
  const node = el("button", {
    className: `button${props.tone ? ` button--${props.tone}` : ""}`,
    text,
    attrs: { type: "button" }
  });
  node.addEventListener("click", onClick);
  return node;
}

function toast(message, tone = "info") {
  dom.toast.textContent = message;
  dom.toast.dataset.tone = tone;
  dom.toast.hidden = false;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    dom.toast.hidden = true;
  }, 4000);
}

function currentDataset() {
  return datasetByKey(state.currentKey);
}

function currentDoc() {
  return state.docs[state.currentKey]?.parsed ?? null;
}

function serialize(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function setPath(target, path, value) {
  let node = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    node = node[path[index]];
  }
  node[path[path.length - 1]] = value;
}

/** Number-ish keys keep a numeric control when their current value is null. */
function looksNumericKey(key) {
  return /(value|order|proficiency|level|scale|count|index|weight|version)$/i.test(key);
}

/** Empty instance of a template shape, used when appending a nested item. */
function blankLike(value) {
  if (Array.isArray(value)) return [];
  if (isRecord(value)) {
    const clone = {};
    for (const [key, child] of Object.entries(value)) clone[key] = blankLike(child);
    return clone;
  }
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return null;
  return "";
}

function docsParsed() {
  const result = {};
  for (const [key, entry] of Object.entries(state.docs)) {
    if (entry?.parsed) result[key] = entry.parsed;
  }
  return result;
}

/** A form control changed: the draft differs from the selected record. */
function draftChanged() {
  state.draftDirty = true;
  renderStatus();
}

/* --------------------------------------------------------- documents + dirty */

/**
 * Keeps a snapshot of what was loaded. Everything that compares (diff, dirty dot,
 * undo baseline) reads it, so "unchanged" always means "identical to the file".
 */
function adoptDocuments(documents) {
  for (const entry of Object.values(documents)) {
    entry.original = entry.parsed ? structuredClone(entry.parsed) : null;
    entry.originalText = entry.text ?? "";
  }
  return documents;
}

function isDirty(key) {
  const entry = state.docs[key];
  if (!entry?.parsed || !entry.original) return false;
  return serialize(entry.parsed) !== serialize(entry.original);
}

function dirtyKeys() {
  return DATASETS.map((dataset) => dataset.key).filter((key) => isDirty(key));
}

/** Unsaved changes include unapplied form edits, which never reach a document. */
function hasUnsaved() {
  return dirtyKeys().length > 0 || state.draftDirty;
}

function unsavedSummary() {
  const files = dirtyKeys().map((key) => datasetByKey(key).file);
  const parts = [];
  if (files.length > 0) parts.push(`${files.length} file(s) with unsaved changes (${files.join(", ")})`);
  if (state.draftDirty) parts.push("unapplied form edits");
  return parts.join(" and ");
}

/* ------------------------------------------------------------------ loading */

async function loadAllDocuments() {
  try {
    state.docs = adoptDocuments(await loadFromServer());
    setStatus("preview", "Preview mode: loaded from the local server. Connect the project folder to save directly.");
  } catch (error) {
    setStatus("error", `Datasets could not be loaded: ${error.message}`);
  }
  renderAll();
}

function setStatus(kind, message) {
  dom.status.dataset.state = kind;
  dom.status.textContent = message;
}

async function onConnect() {
  if (hasUnsaved() && !window.confirm(`${unsavedSummary()}. Connecting a folder reloads every file from disk and discards the drafts. Continue?`)) {
    return;
  }

  try {
    dom.connect.disabled = true;
    const result = await connectProject();
    state.directory = result.directory;
    state.dataDirectory = result.dataDirectory;
    state.docs = adoptDocuments(result.documents);
    history.clear();
    state.selectedIndex = null;
    state.draft = null;
    state.draftDirty = false;
    state.lastSave = null;
    setStatus("connected", "Project folder connected. Read/write permission granted.");
    toast("Project folder connected. Saving writes into data/.", "success");
    renderAll();
  } catch (error) {
    setStatus("error", error.message);
    toast(error.message, "error");
  } finally {
    dom.connect.disabled = false;
  }
}

/* ------------------------------------------------------------------- status */

function renderStatus() {
  const loaded = Boolean(currentDoc());
  const dirty = dirtyKeys();
  const errors = loaded ? validateDocument(currentDataset(), currentDoc(), docsParsed()).errors.length : 0;

  let text = "Saved";
  let tone = "saved";

  if (state.saving) {
    text = "Saving…";
    tone = "busy";
  } else if (state.lastSave?.tone === "error") {
    text = "Save failed";
    tone = "error";
  } else if (errors > 0) {
    text = `Invalid draft: ${errors} error(s)`;
    tone = "error";
  } else if (dirty.length > 0) {
    text = `Unsaved changes: ${dirty.length} file(s)`;
    tone = "warning";
  } else if (state.lastSave) {
    text = state.lastSave.text;
    tone = state.lastSave.tone ?? "saved";
  } else if (!loaded) {
    text = "Not loaded";
    tone = "saved";
  }

  dom.draftStatus.textContent = text;
  dom.draftStatus.dataset.state = tone;

  dom.undo.disabled = !history.canUndo();
  dom.redo.disabled = !history.canRedo();
  dom.undo.title = history.canUndo() ? `Undo ${history.nextUndoLabel()}` : "Nothing to undo";
  dom.redo.title = history.canRedo() ? `Redo ${history.nextRedoLabel()}` : "Nothing to redo";

  dom.changes.textContent = dirty.length > 0 ? `Changes (${dirty.length})` : "Changes";
  dom.changes.disabled = dirty.length === 0;
  dom.save.disabled = dirty.length === 0 || state.saving;
}

/* ------------------------------------------------------------------ sidebar */

function renderSidebar() {
  dom.datasetList.replaceChildren();

  for (const dataset of DATASETS) {
    const entry = state.docs[dataset.key];
    const doc = entry?.parsed;
    const collection = doc ? collectionOf(dataset, doc) : null;
    const count = Array.isArray(collection) ? collection.length : collection ? 1 : 0;

    const node = el("button", {
      className: `dataset-button${dataset.key === state.currentKey ? " is-active" : ""}`,
      attrs: { type: "button" }
    }, el("span", { className: "dataset-button__label", text: dataset.label }),
       el("span", { className: "dataset-button__count", text: String(count) }));

    if (isDirty(dataset.key)) {
      node.append(el("span", { className: "dot", attrs: { "aria-label": "Unsaved changes" } }));
    }

    node.addEventListener("click", () => switchDataset(dataset.key));
    dom.datasetList.append(node);
  }
}

function switchDataset(key) {
  if (key === state.currentKey) return;

  if (hasUnsaved() && !window.confirm(`${unsavedSummary()}. Switch to ${datasetByKey(key).label} and keep the changes in memory?`)) {
    return;
  }

  state.currentKey = key;
  state.selectedIndex = null;
  state.draft = null;
  state.draftDirty = false;
  state.mode = "records";
  state.search = "";
  state.filterField = "";
  state.filterValue = "";
  state.sort = "order";
  dom.search.value = "";
  dom.sort.value = "order";
  renderAll();
}

/* -------------------------------------------------------------------- table */

function currentCollection() {
  const dataset = currentDataset();
  const doc = currentDoc();
  if (!doc) return [];

  if (state.mode === "categories") {
    return dataset.categories ? doc[dataset.categories] ?? [] : [];
  }

  return collectionOf(dataset, doc) ?? [];
}

/**
 * Rebuilds the filter controls for the current dataset.
 *
 * The selects are derived from the records actually present: offering "Status" on
 * a dataset with no status property would be a control that can never match.
 */
function renderFilters() {
  const dataset = currentDataset();
  const arrayDataset = isArrayDataset(dataset);
  const showFilter = arrayDataset && state.mode === "records";
  const collection = arrayDataset ? currentCollection() : [];
  const records = Array.isArray(collection) ? collection : [];

  dom.filterField.hidden = !showFilter;
  dom.filterValue.hidden = !showFilter;
  dom.sort.hidden = !arrayDataset;
  dom.clearFilters.hidden = !arrayDataset;

  const fields = showFilter ? filterFieldsFor(records) : [];
  const signature = `${dataset.key}:${state.mode}:${fields.join(",")}`;

  if (dom.filterField.dataset.signature !== signature) {
    dom.filterField.replaceChildren(el("option", { text: "All fields", attrs: { value: "" } }));
    for (const field of fields) {
      dom.filterField.append(el("option", { text: FIELD_LABELS[field] ?? field, attrs: { value: field } }));
    }
    dom.filterField.dataset.signature = signature;
    if (!fields.includes(state.filterField)) state.filterField = "";
  }

  dom.filterField.value = state.filterField;

  const categoryLabels = new Map();
  if (dataset.categories) {
    for (const category of currentDoc()?.[dataset.categories] ?? []) {
      if (category?.id) categoryLabels.set(category.id, category.name || category.label || category.id);
    }
  }

  const values = showFilter && state.filterField ? facetValues(records, state.filterField) : [];
  dom.filterValue.replaceChildren(el("option", { text: "Any value", attrs: { value: "" } }));
  for (const entry of values) {
    const label = entry.value === "true" ? "Yes" : entry.value === "false" ? "No" : categoryLabels.get(entry.value) ?? entry.value;
    dom.filterValue.append(el("option", { text: label, attrs: { value: entry.value } }));
  }

  if (!values.some((entry) => entry.value === state.filterValue)) state.filterValue = "";
  dom.filterValue.value = state.filterValue;
  dom.filterValue.disabled = !state.filterField;
  dom.sort.value = state.sort;
}

function renderTable() {
  const dataset = currentDataset();
  const collection = currentCollection();
  const isCategories = state.mode === "categories";
  const isRecordKind = !isArrayDataset(dataset) && !isCategories;

  dom.table.replaceChildren();
  dom.empty.hidden = true;

  if (isRecordKind) {
    dom.tableWrap.hidden = true;
    dom.empty.hidden = false;
    dom.empty.textContent = "This file holds one object (not a list). Use the form on the right.";
    dom.formTitle.textContent = dataset.label;
    renderFormForObject();
    return;
  }

  dom.tableWrap.hidden = false;

  if (!Array.isArray(collection) || collection.length === 0) {
    dom.empty.hidden = false;
    dom.empty.textContent = isCategories
      ? "No categories yet. Add one to group records."
      : "No records yet. Add the first record.";
    dom.formTitle.textContent = isCategories ? "Category" : "Record";
    clearForm("Select a record or add a new one.");
    return;
  }

  const head = el("tr", {},
    el("th", { text: "ID", attrs: { scope: "col" } }),
    el("th", { text: isCategories ? "Category" : "Record", attrs: { scope: "col" } }),
    el("th", { text: "Status / date", attrs: { scope: "col" } }),
    el("th", { text: "Actions", attrs: { scope: "col" } })
  );
  const caption = el("caption", { className: "visually-hidden", text: `${dataset.label} records` });
  const thead = el("thead", {}, head);

  const tbody = el("tbody");
  const items = filterAndSort(collection, {
    query: state.search,
    fields: searchFieldsFor(dataset),
    filter: { field: state.filterField, value: state.filterValue },
    sort: state.sort
  });

  for (const { record, index } of items) {
    if (!isRecord(record)) continue;

    const label = recordLabel(dataset, record);
    const status = record.status || record.startDate || record.issueDate || record.date || "";
    const row = el("tr", { className: index === state.selectedIndex ? "is-selected" : "" });

    // A real button, not a clickable row: a <tr> is not focusable, so keyboard
    // users could not open any record. Enter and Space come free with a button.
    const open = el("button", {
      className: "row-open",
      attrs: { type: "button", "aria-label": `Open ${label}` }
    }, el("span", { text: label }),
      record.isSample ? el("span", { className: "badge", text: "sample" }) : null);
    open.addEventListener("click", (event) => {
      event.stopPropagation();
      selectRecord(index);
    });

    row.append(
      el("td", { className: "mono", text: record.id || "(no id)" }),
      el("td", {}, open),
      el("td", { className: "muted", text: String(status).slice(0, 24) }),
      el("td", { className: "row-actions" })
    );

    const actions = row.lastElementChild;
    const up = el("button", { className: "icon-button", text: "↑", attrs: { type: "button", "aria-label": `Move ${label} up` } });
    up.disabled = index === 0;
    up.addEventListener("click", (event) => { event.stopPropagation(); moveRecord(index, -1); });

    const down = el("button", { className: "icon-button", text: "↓", attrs: { type: "button", "aria-label": `Move ${label} down` } });
    down.disabled = index === collection.length - 1;
    down.addEventListener("click", (event) => { event.stopPropagation(); moveRecord(index, 1); });

    const copy = el("button", { className: "icon-button", text: "⧉", attrs: { type: "button", "aria-label": `Duplicate ${label}` } });
    copy.addEventListener("click", (event) => { event.stopPropagation(); duplicateRecord(index); });

    const del = el("button", { className: "icon-button", text: "×", attrs: { type: "button", "aria-label": `Delete ${label}` } });
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.mode === "categories") deleteCategory(index);
      else deleteRecord(index);
    });

    actions.append(up, down, copy, del);

    row.addEventListener("click", () => selectRecord(index));
    tbody.append(row);
  }

  dom.table.append(caption, thead, tbody);
  dom.formTitle.textContent = isCategories ? "Category" : "Record";

  // A filtered list with no rows must say so. Leaving the header row alone in an
  // empty table reads as "this dataset is empty", which is wrong and sends the
  // owner looking for deleted records.
  if (items.length === 0 && collection.length > 0) {
    dom.tableWrap.hidden = true;
    dom.empty.hidden = false;
    const criteria = [state.search.trim() && `\u201c${state.search.trim()}\u201d`, state.filterField && `${FIELD_LABELS[state.filterField] ?? state.filterField} = ${state.filterValue}`]
      .filter(Boolean)
      .join(" and ");
    dom.empty.textContent = `No records match ${criteria || "the current filter"}. Clear the filters to see all ${collection.length}.`;
    return;
  }

  dom.tableWrap.hidden = false;
}

function selectRecord(index) {
  const collection = currentCollection();
  const record = collection[index];
  if (!isRecord(record)) return;

  if (state.draftDirty && state.selectedIndex !== index) {
    const leave = window.confirm("Discard the unapplied changes to the current record?");
    if (!leave) return;
  }

  state.selectedIndex = index;
  state.draft = structuredClone(record);
  state.draftDirty = false;
  state.preview = false;
  renderTable();
  renderForm();
  renderTabs();
  renderPreview();
  renderStatus();
}

function clearForm(message) {
  dom.form.replaceChildren(el("p", { className: "muted", text: message }));
  dom.apply.disabled = true;
  dom.cancel.disabled = true;
  state.draft = null;
  state.draftDirty = false;
}

/* --------------------------------------------------------------------- form */

let fieldSequence = 0;

function renderForm() {
  const dataset = currentDataset();
  const isCategories = state.mode === "categories";

  if (!state.draft) {
    clearForm("Select a record or add a new one.");
    return;
  }

  dom.form.replaceChildren();
  dom.apply.disabled = false;
  dom.cancel.disabled = false;
  fieldSequence = 0;

  renderObjectFields(dom.form, state.draft, [], dataset, isCategories);
}

function renderFormForObject() {
  const dataset = currentDataset();
  const doc = currentDoc();
  const object = doc?.[dataset.collection];

  if (!isRecord(object)) {
    clearForm("This document has no object to edit. Use the JSON tab to repair it.");
    return;
  }

  if (!state.draft) state.draft = structuredClone(object);
  dom.form.replaceChildren();
  dom.apply.disabled = false;
  dom.cancel.disabled = false;
  fieldSequence = 0;
  renderObjectFields(dom.form, state.draft, [], dataset, false);
}

/**
 * Renders one record. Nested objects become fieldsets; arrays of strings become
 * line-based textareas; arrays of objects get repeatable groups. `_guide` is
 * intentionally not editable: it is file documentation, not record data.
 */
function renderObjectFields(container, object, path, dataset, isCategory) {
  for (const [key, value] of Object.entries(object)) {
    if (key === "_guide") continue;
    renderField(container, key, value, [...path, key], dataset, isCategory);
  }
}

function renderField(container, key, value, path, dataset, isCategory) {
  const fieldLabel = FIELD_LABELS[key] ?? key;
  const label = el("span", { className: "field-label", text: fieldLabel });

  if (referenceKind(key, dataset)) {
    renderReferenceField(container, key, value, path, dataset);
    return;
  }

  if (Array.isArray(value)) {
    const objectArray = value.some((item) => isRecord(item));

    if (!objectArray && value.every((item) => typeof item === "string" || typeof item === "number")) {
      const textarea = el("textarea", { className: "input", attrs: { rows: "3" } });
      textarea.value = value.join("\n");
      textarea.addEventListener("input", () => {
        setPath(state.draft, path, textarea.value.split("\n").map((line) => line.trim()).filter(Boolean));
        draftChanged();
      });
      container.append(el("label", { className: "field" }, label, textarea));
      return;
    }

    const group = el("fieldset", { className: "subgroup" },
      el("legend", { text: fieldLabel }));
    const list = el("div", { className: "array-list" });

    value.forEach((item, index) => {
      if (!isRecord(item)) {
        list.append(el("p", { className: "muted", text: `Item ${index + 1}: only objects are editable here.` }));
        return;
      }

      const card = el("div", { className: "array-item" });
      const head = el("div", { className: "array-item__head" },
        el("span", { className: "mono", text: item.id || `#${index + 1}` }));

      const remove = el("button", { className: "icon-button", text: "×", attrs: { type: "button", "aria-label": `Remove ${key} item ${index + 1}` } });
      remove.addEventListener("click", () => {
        value.splice(index, 1);
        state.draftDirty = true;
        renderForm();
        renderStatus();
      });
      head.append(remove);
      card.append(head);

      const body = el("div", { className: "array-item__body" });
      renderObjectFields(body, item, [...path, index], dataset, isCategory);
      card.append(body);
      list.append(card);
    });

    const add = el("button", { className: "button button--ghost", text: `Add ${fieldLabel} item`, attrs: { type: "button" } });
    add.addEventListener("click", () => {
      const template = value.find((item) => isRecord(item)) ?? {};
      value.push(blankLike(template));
      state.draftDirty = true;
      renderForm();
      renderStatus();
    });

    group.append(list, add);
    container.append(group);
    return;
  }

  if (isRecord(value)) {
    const group = el("fieldset", { className: "subgroup" }, el("legend", { text: fieldLabel }));
    renderObjectFields(group, value, path, dataset, isCategory);
    container.append(group);
    return;
  }

  if (typeof value === "boolean") {
    const checkbox = el("input", { attrs: { type: "checkbox" } });
    checkbox.checked = value;
    checkbox.addEventListener("change", () => {
      setPath(state.draft, path, checkbox.checked);
      draftChanged();
    });
    container.append(el("label", { className: "field field--inline" }, checkbox, el("span", { text: fieldLabel })));
    return;
  }

  if (typeof value === "number" || (value === null && looksNumericKey(key))) {
    const input = el("input", {
      className: "input",
      attrs: { type: "number", step: "any", inputmode: "decimal", placeholder: value === null ? "null" : "" }
    });
    input.value = value === null ? "" : String(value);
    input.addEventListener("input", () => {
      const next = input.value === "" ? null : Number(input.value);
      setPath(state.draft, path, Number.isFinite(next) ? next : null);
      draftChanged();
    });
    container.append(el("label", { className: "field" }, label, input));
    return;
  }

  if (value === null) {
    // null is not the same as "": an empty input writes null back, any text writes
    // a string. This preserves the distinction the datasets rely on for dates and
    // optional fields.
    const input = el("input", { className: "input", attrs: { type: "text", placeholder: "null" } });
    input.addEventListener("input", () => {
      setPath(state.draft, path, input.value === "" ? null : input.value);
      draftChanged();
    });
    container.append(el("label", { className: "field" }, label, input));
    return;
  }

  const text = String(value ?? "");
  const control = isLongTextKey(key)
    ? el("textarea", { className: "input", attrs: { rows: "4" } })
    : el("input", {
        className: "input",
        attrs: {
          type: isUrlKey(key) ? "url" : "text",
          placeholder: isDateKey(key) ? "YYYY, YYYY-MM or YYYY-MM-DD" : ""
        }
      });

  control.value = text;

  if (key === "id" && dataset.prefix) {
    control.readOnly = true;
    control.title = "Stable id: create a duplicate to get a new one.";
  }

  if (isEnumKey(key)) {
    const select = el("select", { className: "input" });
    const options = enumOptions(currentCollection(), key, text);
    select.append(el("option", { text: "(empty)", attrs: { value: "" } }));
    for (const option of options) select.append(el("option", { text: option, attrs: { value: option } }));
    select.value = text;
    select.addEventListener("change", () => {
      setPath(state.draft, path, select.value);
      draftChanged();
      // A timeline event's reference belongs to the dataset its type names; keeping
      // the old id after a type change would be a wrong-dataset reference.
      if (dataset.key === "careerTimeline" && key === "type" && "referenceId" in state.draft) {
        state.draft.referenceId = "";
        renderForm();
      }
    });
    container.append(el("label", { className: "field" }, label, select));
    return;
  }

  control.addEventListener("input", () => {
    setPath(state.draft, path, control.value);
    draftChanged();
  });
  container.append(el("label", { className: "field" }, label, control));
}

/**
 * Renders a reference field: a datalist combobox (pick or type) for a single id,
 * or a chip list plus an "add id" box for an id array.
 *
 * Free text stays possible on purpose: a reference can be staged before the target
 * record exists, and the validator names it until the target is added.
 */
function renderReferenceField(container, key, value, path, dataset) {
  const options = referenceOptions({ key, dataset, draft: state.draft, documents: docsParsed() });
  const listId = `ref-options-${fieldSequence += 1}`;
  const datalist = el("datalist", { attrs: { id: listId } });
  for (const option of options) {
    datalist.append(el("option", { attrs: { value: option.value, label: `${option.label} (${option.value})` } }));
  }

  const title = el("span", { className: "field-label", text: FIELD_LABELS[key] ?? key });

  if (Array.isArray(value)) {
    const chips = el("div", { className: "chip-list" });

    value.forEach((id, index) => {
      const chip = el("span", { className: "ref-chip" },
        el("span", { text: referenceLabel(options, id) }),
        el("code", { className: "ref-chip__id", text: String(id) }));
      const remove = el("button", {
        className: "icon-button",
        text: "×",
        attrs: { type: "button", "aria-label": `Remove reference ${id}` }
      });
      remove.addEventListener("click", () => {
        value.splice(index, 1);
        state.draftDirty = true;
        renderForm();
        renderStatus();
      });
      chip.append(remove);
      chips.append(chip);
    });

    const input = el("input", {
      className: "input",
      attrs: { type: "text", list: listId, placeholder: "Pick a record or type its id", autocomplete: "off" }
    });
    const add = button("Add", () => addReference(value, input.value, input, options), { tone: "ghost" });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addReference(value, input.value, input, options);
      }
    });

    container.append(el("div", { className: "field" }, title, chips, el("div", { className: "ref-add" }, input, add), datalist));
    return;
  }

  const input = el("input", {
    className: "input",
    attrs: { type: "text", list: listId, placeholder: "Pick a record or type its id", autocomplete: "off" }
  });
  input.value = typeof value === "string" ? value : "";

  const hint = el("span", { className: "field-hint" });
  const updateHint = () => {
    const current = input.value.trim();
    if (!current) hint.textContent = options.length ? "No reference selected." : "No candidate records loaded.";
    else if (isUnknownReference(options, current)) hint.textContent = `\u201c${current}\u201d does not match a loaded record. Saving stays blocked until it does.`;
    else hint.textContent = `\u2192 ${referenceLabel(options, current)}`;
  };
  updateHint();

  input.addEventListener("input", () => {
    setPath(state.draft, path, input.value);
    updateHint();
    draftChanged();
  });

  container.append(el("label", { className: "field" }, title, input, hint, datalist));
}

function addReference(list, raw, input, options) {
  const id = String(raw ?? "").trim();
  if (!id) return;

  if (list.includes(id)) {
    toast(`"${id}" is already linked.`, "warning");
    return;
  }

  list.push(id);
  input.value = "";
  state.draftDirty = true;
  renderForm();
  renderStatus();
  toast(isUnknownReference(options, id) ? `Linked ${id} (no matching record yet).` : `Linked ${referenceLabel(options, id)}.`, "info");
}

/* ------------------------------------------------------------------ actions */

/**
 * Runs a mutation against the current document and records it for undo.
 * The snapshot is taken before the mutation, so undo restores exactly the text
 * that was displayed at the time.
 */
function commit(label, mutate) {
  const doc = currentDoc();
  if (!doc) return null;

  const before = structuredClone(doc);
  const result = mutate(doc);

  history.push({ key: state.currentKey, label, before, after: structuredClone(doc) });
  state.draftDirty = false;
  renderAll();
  return result;
}

function applyDraft() {
  const dataset = currentDataset();
  if (!state.draft || !currentDoc()) return;

  const draft = state.draft;
  const label = `edit ${recordLabel(dataset, draft) || draft.id || "record"}`;

  commit(label, (doc) => {
    if (!isArrayDataset(dataset)) {
      doc[dataset.collection] = draft;
      return;
    }

    const list = state.mode === "categories" ? doc[dataset.categories] : doc[dataset.collection];
    if (!Array.isArray(list)) throw new Error(`${dataset.collection} is not a list.`);

    if (state.selectedIndex === null) list.push(draft);
    else list[state.selectedIndex] = draft;
  });

  state.selectedIndex = null;
  state.draft = null;
  state.draftDirty = false;
  renderAll();
  toast("Record applied in memory. Review the changes, then save.", "info");
}

function addRecord() {
  const dataset = currentDataset();
  const doc = currentDoc();
  if (!doc) return;

  if (state.mode === "categories") {
    const list = doc[dataset.categories] ?? (doc[dataset.categories] = []);
    state.draft = { id: "", name: "New category", order: list.length + 1, enabled: true };
    state.selectedIndex = null;
    state.draftDirty = false;
    renderForm();
    return;
  }

  const collection = doc[dataset.collection];
  if (!Array.isArray(collection)) return;

  state.draft = blankRecord(dataset, collection);
  state.selectedIndex = null;
  state.draftDirty = false;
  renderForm();
  dom.form.scrollIntoView({ block: "nearest" });
}

function duplicateRecord(index = state.selectedIndex) {
  const dataset = currentDataset();
  const collection = currentCollection();
  if (!isArrayDataset(dataset) || index === null || index === undefined) return;

  const source = collection[index];
  if (!isRecord(source)) return;

  const copy = structuredClone(source);
  if (dataset.prefix) copy.id = allocateId(dataset, collection);
  if (typeof copy.title === "string") copy.title = `${copy.title} (copy)`;
  if (typeof copy.name === "string") copy.name = `${copy.name} (copy)`;
  if (typeof copy.order === "number") copy.order = collection.length + 1;

  commit(`duplicate ${recordLabel(dataset, source)}`, () => {
    collection.splice(index + 1, 0, copy);
  });

  state.selectedIndex = index + 1;
  renderAll();
  toast("Record duplicated with a new id.", "success");
}

function deleteRecord(index) {
  const dataset = currentDataset();
  const collection = currentCollection();
  const record = collection[index];
  if (!record) return;

  const references = record.id ? findReferences(record.id, docsParsed()) : [];
  const warning = references.length > 0
    ? `\n\nReferenced by:\n- ${references.join("\n- ")}\n\nDeleting will leave dangling references; saving stays blocked until they are fixed.`
    : "";

  if (!window.confirm(`Delete "${recordLabel(dataset, record)}" (${record.id || "no id"})?${warning}`)) {
    return;
  }

  commit(`delete ${recordLabel(dataset, record)}`, () => {
    collection.splice(index, 1);
  });

  state.selectedIndex = null;
  state.draft = null;
  renderAll();
}

function moveRecord(index, direction) {
  const collection = currentCollection();
  const target = index + direction;
  if (target < 0 || target >= collection.length) return;

  commit("reorder records", () => {
    [collection[index], collection[target]] = [collection[target], collection[index]];

    collection.forEach((record, position) => {
      if (record && typeof record === "object" && Object.prototype.hasOwnProperty.call(record, "order")) {
        record.order = position + 1;
      }
    });
  });

  state.selectedIndex = target;
  renderAll();
}

function deleteCategory(index) {
  const dataset = currentDataset();
  const doc = currentDoc();
  const categories = doc?.[dataset.categories] ?? [];
  const category = categories[index];
  if (!category) return;

  const used = (doc[dataset.collection] ?? []).filter((record) => record.categoryId === category.id);

  if (used.length > 0) {
    window.alert(`This category is used by ${used.length} record(s). Reassign them before deleting it.`);
    return;
  }

  if (!window.confirm(`Delete category "${category.name || category.id}"?`)) return;

  commit(`delete category ${category.name || category.id}`, () => {
    categories.splice(index, 1);
  });

  state.selectedIndex = null;
  state.draft = null;
  renderAll();
}

/* --------------------------------------------------------------- undo/redo */

function undo() {
  const entry = history.undo();
  if (!entry) return;

  const target = state.docs[entry.key];
  if (!target) return;

  target.parsed = structuredClone(entry.before);
  state.currentKey = entry.key;
  state.selectedIndex = null;
  state.draft = null;
  state.draftDirty = false;
  state.mode = "records";
  renderAll();
  toast(`Undid ${entry.label}. ${isDirty(entry.key) ? "Unsaved changes remain." : "Back to the loaded file."}`, "info");
}

function redo() {
  const entry = history.redo();
  if (!entry) return;

  const target = state.docs[entry.key];
  if (!target) return;

  target.parsed = structuredClone(entry.after);
  state.currentKey = entry.key;
  state.selectedIndex = null;
  state.draft = null;
  state.draftDirty = false;
  state.mode = "records";
  renderAll();
  toast(`Redid ${entry.label}.`, "info");
}

/* ------------------------------------------------------------------ change review */

function buildChangeModel() {
  const model = [];

  for (const dataset of DATASETS) {
    const entry = state.docs[dataset.key];
    if (!entry?.parsed || !entry.original) continue;

    const diff = diffDocuments(entry.original, entry.parsed, dataset);
    if (isEmptyDiff(diff)) continue;

    const validation = validateDocument(dataset, entry.parsed, docsParsed());
    model.push({
      key: dataset.key,
      dataset,
      diff,
      totals: summarizeChanges(diff),
      errors: validation.errors,
      warnings: validation.warnings
    });
  }

  return model;
}

function formatValue(value) {
  if (value === undefined) return "(missing)";
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length === 0 ? "[]" : `[${value.length} item(s)]`;
  if (typeof value === "object") return "{…}";
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function changeList(entries, mark) {
  const list = el("ul", { className: "change-list" });

  for (const entry of entries) {
    const item = el("li", { className: "change-item", attrs: { "data-mark": mark } },
      el("span", { className: "change-mark", text: mark }),
      el("code", { className: "mono", text: entry.id }),
      el("span", { text: entry.label }));

    if (Array.isArray(entry.fields) && entry.fields.length > 0) {
      const fields = el("ul", { className: "change-fields" });
      for (const field of entry.fields.slice(0, 12)) {
        fields.append(el("li", { text: `${field.path}: ${formatValue(field.from)} \u2192 ${formatValue(field.to)}` }));
      }
      if (entry.fields.length > 12) {
        fields.append(el("li", { className: "muted", text: `… ${entry.fields.length - 12} more field(s)` }));
      }
      item.append(fields);
    }

    list.append(item);
  }

  return list;
}

/**
 * Renders the change review.
 *
 * @param {"review"|"save"} mode - "save" adds the confirm action and the
 *   validation gate; "review" only inspects.
 */
function renderChanges(mode) {
  const model = buildChangeModel();
  dom.changesBody.replaceChildren();
  dom.changesActions.replaceChildren();
  dom.changesTitle.textContent = mode === "save" ? "Review before saving" : "Unsaved changes";

  if (model.length === 0) {
    dom.changesBody.append(el("p", { className: "muted", text: "Every loaded file matches the version on disk. Nothing to save." }));
    dom.changesActions.append(button("Close", () => dom.changesDialog.close()));
    return;
  }

  for (const change of model) {
    const section = el("section", { className: "change-file" });
    const totals = change.totals;
    const counts = [
      totals.added ? `${totals.added} added` : "",
      totals.updated ? `${totals.updated} updated` : "",
      totals.removed ? `${totals.removed} removed` : "",
      totals.categoryChanges ? `${totals.categoryChanges} categor${totals.categoryChanges === 1 ? "y" : "ies"}` : ""
    ].filter(Boolean).join(" · ");

    section.append(
      el("h3", { className: "change-file__name", text: `data/${change.dataset.file}` }),
      el("p", { className: "muted change-file__counts", text: counts || "changed" })
    );

    if (change.diff.added.length > 0) section.append(changeList(change.diff.added, "+"));
    if (change.diff.updated.length > 0) section.append(changeList(change.diff.updated, "~"));
    if (change.diff.removed.length > 0) section.append(changeList(change.diff.removed, "-"));

    const categories = change.diff.categories;
    if (categories) {
      const block = el("div", { className: "change-categories" }, el("h4", { text: "Categories" }));
      if (categories.added.length > 0) block.append(changeList(categories.added, "+"));
      if (categories.updated.length > 0) block.append(changeList(categories.updated, "~"));
      if (categories.removed.length > 0) block.append(changeList(categories.removed, "-"));
      section.append(block);
    }

    if (change.errors.length > 0) {
      const errors = el("ul", { className: "validation-list change-errors" });
      for (const error of change.errors.slice(0, 8)) {
        errors.append(el("li", { text: `${error.path}: ${error.message}` }));
      }
      if (change.errors.length > 8) {
        errors.append(el("li", { className: "muted", text: `… ${change.errors.length - 8} more error(s)` }));
      }
      section.append(el("p", { className: "status-line status-line--error", text: `This file cannot be written: ${change.errors.length} validation error(s).` }), errors);
    }

    dom.changesBody.append(section);
  }

  dom.changesActions.append(button("Close", () => dom.changesDialog.close()));

  if (mode !== "save") return;

  const blocked = model.some((change) => change.errors.length > 0);
  const suffix = model.length === 1 ? "file" : "files";
  const action = state.directory ? `Save ${model.length} ${suffix}` : `Download ${model.length} ${suffix}`;

  const confirm = button(action, () => runSaveFlow(model.map((change) => change.key)), { tone: "primary" });
  confirm.disabled = blocked;
  confirm.title = blocked ? "Fix the validation errors in the listed files first." : "";

  dom.changesActions.append(confirm);
}

function openChanges(mode) {
  renderChanges(mode);
  if (!dom.changesDialog.open) dom.changesDialog.showModal();
}

/* -------------------------------------------------------------------- save */

/**
 * Writes (or downloads) every listed dataset, collecting one result per file.
 *
 * It never stops at the first failure: a multi-file save has to report exactly
 * which files changed and which did not, otherwise the owner cannot tell what to
 * redo. There is no "success" message unless every entry succeeded.
 */
async function saveAll(keys) {
  const files = [];

  for (const key of keys) {
    const dataset = datasetByKey(key);
    const entry = state.docs[key];
    files.push({
      key,
      dataset,
      entry,
      text: entry?.parsed ? serialize(entry.parsed) : ""
    });
  }

  const results = await saveAllDocuments(files, {
    // Each file is validated on its own, against the whole in-memory project, so a
    // second file's broken reference is reported with the file it belongs to.
    validate: (file) => {
      const entry = state.docs[file.key];
      if (!entry?.parsed) return ["the document is not loaded"];
      return validateDocument(file.dataset, entry.parsed, docsParsed()).errors
        .map((error) => `${error.path}: ${error.message}`);
    },
    write: state.directory ? writeOneFile : null,
    download: (file) => {
      if (!file.entry?.parsed) throw Object.assign(new Error("the document is not loaded"), { code: "missing" });
      downloadDocument(file.dataset, file.text);
    }
  });

  // Snapshots taken before a successful write describe a state that is no longer
  // the baseline; keeping them would let Undo resurrect a pre-save document and
  // mark it dirty against the new baseline.
  if (results.some((result) => result.ok && result.mode === "write")) history.clear();

  return results;
}

/**
 * Writes one file into the connected folder, including the hash-conflict path.
 *
 * The pre-write hash check lives in file-access.js; when it reports a conflict the
 * owner decides here, per file, and only that file is affected by the answer.
 */
async function writeOneFile(file) {
  const entry = state.docs[file.key];

  // An editor bug must never replace a valid file with invalid text.
  try {
    JSON.parse(file.text);
  } catch (error) {
    throw Object.assign(new Error(`generated JSON does not parse: ${error.message}`), { code: "serialize" });
  }

  const write = async (expectedHash) => {
    const written = await saveDataset({
      projectDirectory: state.directory,
      dataDirectory: state.dataDirectory,
      dataset: file.dataset,
      text: file.text,
      expectedHash
    });

    entry.text = file.text;
    entry.hash = written.hash;
    entry.original = structuredClone(entry.parsed);
    return written;
  };

  try {
    return await write(entry.hash);
  } catch (error) {
    if (error.code !== "conflict") throw error;

    const overwrite = window.confirm(
      `data/${file.dataset.file} changed on disk after it was loaded.\n\nOverwrite it with the editor version? A backup of the current file is created first.`
    );

    if (!overwrite) {
      throw Object.assign(new Error("the file changed on disk and the overwrite was declined"), { code: "conflict" });
    }

    return write("");
  }
}

async function runSaveFlow(keys) {
  state.saving = true;
  state.lastSave = null;
  renderStatus();
  dom.changesActions.replaceChildren(el("span", { className: "muted", text: "Saving…" }));

  let results = [];
  try {
    results = await saveAll(keys);
  } catch (error) {
    results = [{ key: "", file: "(unknown)", ok: false, code: "unexpected", message: error.message }];
  }

  state.saving = false;
  const failed = results.filter((result) => !result.ok);
  const written = results.filter((result) => result.ok && result.mode === "write");
  const downloaded = results.filter((result) => result.ok && result.mode === "download");

  state.lastSave = failed.length === 0
    ? {
        tone: "saved",
        text: written.length > 0
          ? `Saved ${written.length} file(s)`
          : `${downloaded.length} file(s) downloaded`
      }
    : { tone: "error", text: `${failed.length} of ${results.length} file(s) failed` };

  renderSaveResults(results);
  renderAll();
}

function renderSaveResults(results) {
  const failed = results.filter((result) => !result.ok);
  dom.changesTitle.textContent = failed.length === 0 ? "Save results" : "Save results — some files failed";
  dom.changesBody.replaceChildren();

  const list = el("ul", { className: "save-results" });

  for (const result of results) {
    const row = el("li", { className: `save-result save-result--${result.ok ? "ok" : "fail"}` });
    row.append(
      el("span", { className: "save-result__mark", text: result.ok ? "✓" : "✗" }),
      el("code", { className: "mono", text: `data/${result.file}` }),
      el("span", {
        text: result.ok
          ? result.mode === "write"
            ? `written; backup at ${result.backupPath}`
            : "downloaded — replace data/ with this file, the copy on disk is unchanged"
          : `not written: ${result.message}`
      })
    );
    list.append(row);
  }

  dom.changesBody.append(list);

  if (failed.length > 0) {
    dom.changesBody.append(el("p", { className: "muted" },
      "Every file above marked ✗ still has its original content on disk. Fix the problem for that file and save again; the files marked ✓ are already written."));
  } else if (results.every((result) => result.mode === "download")) {
    dom.changesBody.append(el("p", { className: "muted" },
      "Downloads are not saves: copy each file into data/ and re-run node scripts/validate-data.mjs."));
  }

  dom.changesActions.replaceChildren(button("Close", () => dom.changesDialog.close()));

  if (failed.length > 0) {
    const retry = button(`Download the ${failed.length} failed file(s)`, () => {
      for (const result of failed) {
        const dataset = datasetByKey(result.key);
        const entry = state.docs[result.key];
        if (dataset && entry?.parsed) downloadDocument(dataset, serialize(entry.parsed));
      }
      toast("Downloaded the files that could not be written.", "warning");
    }, { tone: "ghost" });
    dom.changesActions.append(retry);
  }
}

/* ------------------------------------------------------------------ panels */

function renderValidation() {
  const dataset = currentDataset();
  const doc = currentDoc();
  if (!doc) {
    dom.validation.replaceChildren(el("p", { className: "muted", text: "No document loaded." }));
    return;
  }

  const { errors, warnings } = validateDocument(dataset, doc, docsParsed());
  dom.validation.replaceChildren();

  dom.validation.append(
    el("h2", { className: "panel-title", text: "Validation" }),
    el("p", {
      className: errors.length ? "status-line status-line--error" : "status-line status-line--ok",
      text: errors.length ? `${errors.length} error(s) — saving is blocked.` : "No blocking errors."
    })
  );

  const list = el("ul", { className: "validation-list" });
  for (const error of errors.slice(0, 12)) {
    list.append(el("li", { text: `${error.path}: ${error.message}` }));
  }
  for (const warning of warnings.slice(0, 6)) {
    list.append(el("li", { className: "warning", text: `${warning.path}: ${warning.message}` }));
  }
  dom.validation.append(list);
}

function renderPreview() {
  const doc = currentDoc();
  dom.preview.textContent = doc ? serialize(doc) : "No document loaded.";
}

function renderTabs() {
  for (const tab of dom.tabs) {
    const active = (tab.dataset.tab === "json") === state.preview;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    // Roving tabindex: a tablist is one stop in the page tab order, and Arrow
    // keys move inside it. Leaving both tabs focusable makes the keyboard user
    // tab past the panel to reach the second tab.
    tab.tabIndex = active ? 0 : -1;
  }
  dom.form.hidden = state.preview;
  dom.preview.hidden = !state.preview;
  dom.previewWrap.hidden = !state.preview;
  if (dom.panelForm) dom.panelForm.hidden = state.preview;
}

function renderAll() {
  renderSidebar();
  const dataset = currentDataset();
  const doc = currentDoc();
  dom.datasetTitle.textContent = dataset.label;
  dom.datasetMeta.textContent = doc
    ? `${doc.schemaVersion === 1 ? "schema 1" : "schema missing"} · ${state.docs[state.currentKey]?.missing ? "file missing" : "loaded"}`
    : "not loaded";

  dom.add.hidden = !isArrayDataset(dataset);
  dom.search.hidden = !isArrayDataset(dataset);
  dom.categories.hidden = !dataset.categories;
  dom.categories.classList.toggle("is-active", state.mode === "categories");
  dom.categories.textContent = state.mode === "categories" ? "Back to records" : "Categories";

  renderFilters();
  renderTable();
  renderValidation();
  renderTabs();
  renderPreview();
  renderStatus();

  // No record selected yet: the editor panel would otherwise be a blank column.
  if (!state.draft && !state.preview) {
    clearForm("Select a record to edit, or add a new one.");
  }
  dom.download.disabled = !doc;
}

/* ------------------------------------------------------------------ filters */

function onFilterChange() {
  state.filterField = dom.filterField.value;
  state.filterValue = "";
  renderFilters();
  renderTable();
}

function onFilterValueChange() {
  state.filterValue = dom.filterValue.value;
  renderTable();
}

function onSortChange() {
  state.sort = dom.sort.value;
  renderTable();
}

function clearListControls() {
  state.search = "";
  state.filterField = "";
  state.filterValue = "";
  state.sort = "order";
  dom.search.value = "";
  renderFilters();
  renderTable();
}

/* ------------------------------------------------------------------- events */

dom.connect.addEventListener("click", onConnect);
dom.save.addEventListener("click", () => {
  if (dirtyKeys().length === 0) {
    toast("No unsaved changes to write.", "info");
    return;
  }
  openChanges("save");
});
dom.changes.addEventListener("click", () => openChanges("review"));
dom.changesClose.addEventListener("click", () => dom.changesDialog.close());
dom.undo.addEventListener("click", undo);
dom.redo.addEventListener("click", redo);
dom.download.addEventListener("click", () => {
  const dataset = currentDataset();
  const entry = state.docs[state.currentKey];
  if (!entry?.parsed) return;

  // Downloading is the documented fallback, but it must not hand out a file that
  // the validator already knows is broken.
  const errors = validateDocument(dataset, entry.parsed, docsParsed()).errors;
  if (errors.length > 0) {
    toast(`Fix ${errors.length} validation error(s) before downloading.`, "error");
    return;
  }

  downloadDocument(dataset, serialize(entry.parsed));
});
dom.add.addEventListener("click", addRecord);
dom.search.addEventListener("input", () => {
  state.search = dom.search.value;
  renderTable();
});
dom.filterField.addEventListener("change", onFilterChange);
dom.filterValue.addEventListener("change", onFilterValueChange);
dom.sort.addEventListener("change", onSortChange);
dom.clearFilters.addEventListener("click", clearListControls);
dom.categories.addEventListener("click", () => {
  if (state.draftDirty && !window.confirm("Discard the unapplied changes to the current record?")) return;

  state.mode = state.mode === "categories" ? "records" : "categories";
  state.selectedIndex = null;
  state.draft = null;
  state.draftDirty = false;
  state.filterField = "";
  state.filterValue = "";
  renderAll();
});
dom.apply.addEventListener("click", applyDraft);
dom.cancel.addEventListener("click", () => {
  state.selectedIndex = null;
  state.draft = null;
  state.draftDirty = false;
  renderAll();
});
dom.copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(dom.preview.textContent);
    toast("JSON copied.", "success");
  } catch {
    toast("Clipboard permission denied.", "error");
  }
});

for (const tab of dom.tabs) {
  tab.addEventListener("click", () => {
    state.preview = tab.dataset.tab === "json";
    renderTabs();
  });
}

// Arrow keys move between the tabs and Home/End jump to the ends (WAI-ARIA tabs
// pattern). Activation follows focus: both panels render instantly, so an extra
// Enter press would only add a step.
if (dom.tablist) {
  dom.tablist.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    const current = dom.tabs.indexOf(document.activeElement);
    const from = current < 0 ? 0 : current;
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? dom.tabs.length - 1
        : Math.min(dom.tabs.length - 1, Math.max(0, from + (event.key === "ArrowLeft" ? -1 : 1)));

    const tab = dom.tabs[next];
    if (!tab) return;
    tab.focus();
    state.preview = tab.dataset.tab === "json";
    renderTabs();
  });
}

// The form has no submit button, but Enter in a text field can still submit it
// and reload the page with the draft in the URL. Prevent that; Save is explicit.
dom.form.addEventListener("submit", (event) => {
  event.preventDefault();
});

document.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();

  if (key === "s") {
    event.preventDefault();
    if (dirtyKeys().length > 0) openChanges("save");
  } else if (key === "z" && !event.shiftKey) {
    event.preventDefault();
    undo();
  } else if ((key === "z" && event.shiftKey) || key === "y") {
    event.preventDefault();
    redo();
  }
});

// Covers a tab close, reload or external link. Browsers show their own wording and
// may skip the prompt entirely, so this is a backstop, not a guarantee.
window.addEventListener("beforeunload", (event) => {
  if (!hasUnsaved()) return;
  event.preventDefault();
  event.returnValue = "";
});

/* -------------------------------------------------------------------- start */

if (!supportsDirectoryPicker()) {
  setStatus("preview", "This browser has no File System Access API. Editing and download work; direct saving does not.");
} else {
  setStatus("preview", "Preview mode: connect the project folder to save directly.");
}

loadAllDocuments();
