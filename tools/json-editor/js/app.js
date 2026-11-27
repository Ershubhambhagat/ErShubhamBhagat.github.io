/**
 * tools/json-editor/js/app.js - JSON Editor Studio UI.
 *
 * The editor is intentionally one page with three regions:
 *   datasets (left), records (middle), record form and JSON preview (right).
 *
 * Data flow:
 *   folder/file -> parsed document in state.docs -> draft record -> Apply ->
 *   document -> validation -> Save (file handle or download).
 *
 * A draft is never written to disk until the owner presses Save, and Save refuses
 * to run while the current dataset has validation errors. The editor edits only
 * the eleven datasets listed in schema.js; it cannot browse arbitrary files.
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
  nextId,
  recordLabel,
  validateDocument
} from "./schema.js";
import {
  connectProject,
  downloadDocument,
  loadFromServer,
  saveDataset,
  supportsDirectoryPicker
} from "./file-access.js";

const state = {
  docs: {},
  directory: null,
  dataDirectory: null,
  currentKey: "projects",
  selectedIndex: null,
  draft: null,
  mode: "records",
  search: "",
  preview: false,
  dirty: new Set()
};

const dom = {
  datasetList: document.getElementById("dataset-list"),
  datasetTitle: document.getElementById("dataset-title"),
  datasetMeta: document.getElementById("dataset-meta"),
  status: document.getElementById("connection-status"),
  connect: document.getElementById("connect-button"),
  save: document.getElementById("save-button"),
  download: document.getElementById("download-button"),
  search: document.getElementById("record-search"),
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
  toast: document.getElementById("toast"),
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

const OBJECT_ARRAY_KEYS = new Set([
  "gallery", "achievements", "socialLinks", "highlights", "primaryActions",
  "categories", "items", "events", "themes"
]);

function looksNumericKey(key) {
  return /(value|order|proficiency|level|scale|count|index|weight|version)$/i.test(key);
}

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

/* ------------------------------------------------------------------ loading */

async function loadAllDocuments() {
  try {
    state.docs = await loadFromServer();
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
  try {
    dom.connect.disabled = true;
    const result = await connectProject();
    state.directory = result.directory;
    state.dataDirectory = result.dataDirectory;
    state.docs = result.documents;
    state.dirty.clear();
    state.selectedIndex = null;
    state.draft = null;
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

/* ------------------------------------------------------------------ sidebar */

function renderSidebar() {
  dom.datasetList.replaceChildren();

  for (const dataset of DATASETS) {
    const entry = state.docs[dataset.key];
    const doc = entry?.parsed;
    const collection = doc ? collectionOf(dataset, doc) : null;
    const count = Array.isArray(collection) ? collection.length : collection ? 1 : 0;

    const button = el("button", {
      className: `dataset-button${dataset.key === state.currentKey ? " is-active" : ""}`,
      attrs: { type: "button" }
    }, el("span", { className: "dataset-button__label", text: dataset.label }),
       el("span", { className: "dataset-button__count", text: String(count) }));

    if (state.dirty.has(dataset.key)) {
      button.append(el("span", { className: "dot", attrs: { "aria-label": "Unsaved changes" } }));
    }

    button.addEventListener("click", () => switchDataset(dataset.key));
    dom.datasetList.append(button);
  }
}

function switchDataset(key) {
  if (key === state.currentKey) return;

  if (state.dirty.size > 0 && !window.confirm("This dataset has unsaved changes. Switch anyway and keep them in memory?")) {
    return;
  }

  state.currentKey = key;
  state.selectedIndex = null;
  state.draft = null;
  state.mode = "records";
  state.search = "";
  dom.search.value = "";
  renderAll();
}

/* ------------------------------------------------------------------ table */

function currentCollection() {
  const dataset = currentDataset();
  const doc = currentDoc();
  if (!doc) return [];

  if (state.mode === "categories") {
    return dataset.categories ? doc[dataset.categories] ?? [] : [];
  }

  return collectionOf(dataset, doc) ?? [];
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
    el("th", { text: "ID" }),
    el("th", { text: isCategories ? "Category" : "Record" }),
    el("th", { text: "Status / date" }),
    el("th", { text: "" })
  );
  const thead = el("thead", {}, head);

  const tbody = el("tbody");
  const query = state.search.trim().toLowerCase();

  collection.forEach((record, index) => {
    const haystack = JSON.stringify(record).toLowerCase();
    if (query && !haystack.includes(query)) return;

    const status = record.status || record.startDate || record.issueDate || record.date || "";
    const row = el("tr", { className: index === state.selectedIndex ? "is-selected" : "" });

    row.append(
      el("td", { className: "mono", text: record.id || "(no id)" }),
      el("td", {}, el("span", { text: recordLabel(dataset, record) }),
        record.isSample ? el("span", { className: "badge", text: "sample" }) : null),
      el("td", { className: "muted", text: String(status).slice(0, 24) }),
      el("td", { className: "row-actions" })
    );

    const actions = row.lastElementChild;
    const up = el("button", { className: "icon-button", text: "↑", attrs: { type: "button", "aria-label": `Move ${recordLabel(dataset, record)} up` } });
    up.disabled = index === 0;
    up.addEventListener("click", (event) => { event.stopPropagation(); moveRecord(index, -1); });

    const down = el("button", { className: "icon-button", text: "↓", attrs: { type: "button", "aria-label": `Move ${recordLabel(dataset, record)} down` } });
    down.disabled = index === collection.length - 1;
    down.addEventListener("click", (event) => { event.stopPropagation(); moveRecord(index, 1); });

    const copy = el("button", { className: "icon-button", text: "⧉", attrs: { type: "button", "aria-label": `Duplicate ${recordLabel(dataset, record)}` } });
    copy.addEventListener("click", (event) => { event.stopPropagation(); duplicateRecord(index); });

    const del = el("button", { className: "icon-button", text: "×", attrs: { type: "button", "aria-label": `Delete ${recordLabel(dataset, record)}` } });
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.mode === "categories") deleteCategory(index);
      else deleteRecord(index);
    });

    actions.append(up, down, copy, del);

    row.addEventListener("click", () => selectRecord(index));
    tbody.append(row);
  });

  dom.table.append(thead, tbody);
  dom.tableWrap.hidden = false;
  dom.formTitle.textContent = isCategories ? "Category" : "Record";
}

function selectRecord(index) {
  const collection = currentCollection();
  const record = collection[index];
  if (!isRecord(record)) return;

  if (state.draft && state.selectedIndex !== index) {
    const leave = window.confirm("Discard the unapplied changes to the current record?");
    if (!leave) return;
  }

  state.selectedIndex = index;
  state.draft = structuredClone(record);
  state.preview = false;
  renderTable();
  renderForm();
  renderTabs();
  renderPreview();
}

function clearForm(message) {
  dom.form.replaceChildren(el("p", { className: "muted", text: message }));
  dom.apply.disabled = true;
  dom.cancel.disabled = true;
  state.draft = null;
}

/* ------------------------------------------------------------------ form */

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
  const label = el("span", { className: "field-label", text: key });

  if (Array.isArray(value)) {
    const objectArray = value.some((item) => isRecord(item)) || (value.length === 0 && OBJECT_ARRAY_KEYS.has(key));

    if (!objectArray && value.every((item) => typeof item === "string" || typeof item === "number")) {
      const textarea = el("textarea", { className: "input", attrs: { rows: "3" } });
      textarea.value = value.join("\n");
      textarea.addEventListener("input", () => {
        setPath(state.draft, path, textarea.value.split("\n").map((line) => line.trim()).filter(Boolean));
      });
      container.append(el("label", { className: "field" }, label, textarea));
      return;
    }

    const group = el("fieldset", { className: "subgroup" },
      el("legend", { text: key }));
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
        renderForm();
      });
      head.append(remove);
      card.append(head);

      const body = el("div", { className: "array-item__body" });
      renderObjectFields(body, item, [...path, index], dataset, isCategory);
      card.append(body);
      list.append(card);
    });

    const add = el("button", { className: "button button--ghost", text: `Add ${key} item`, attrs: { type: "button" } });
    add.addEventListener("click", () => {
      const template = value.find((item) => isRecord(item)) ?? {};
      value.push(blankLike(template));
      renderForm();
    });

    group.append(list, add);
    container.append(group);
    return;
  }

  if (isRecord(value)) {
    const group = el("fieldset", { className: "subgroup" }, el("legend", { text: key }));
    renderObjectFields(group, value, path, dataset, isCategory);
    container.append(group);
    return;
  }

  if (typeof value === "boolean") {
    const checkbox = el("input", { attrs: { type: "checkbox" } });
    checkbox.checked = value;
    checkbox.addEventListener("change", () => setPath(state.draft, path, checkbox.checked));
    container.append(el("label", { className: "field field--inline" }, checkbox, el("span", { text: key })));
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
          type: isUrlKey(key) ? "text" : "text",
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
    select.addEventListener("change", () => setPath(state.draft, path, select.value));
    container.append(el("label", { className: "field" }, label, select));
    return;
  }

  control.addEventListener("input", () => setPath(state.draft, path, control.value));
  container.append(el("label", { className: "field" }, label, control));
}

/* ------------------------------------------------------------------ actions */

function applyDraft() {
  const dataset = currentDataset();
  const doc = currentDoc();
  if (!state.draft || !doc) return;

  if (!isArrayDataset(dataset)) {
    doc[dataset.collection] = state.draft;
  } else if (state.mode === "categories") {
    const list = doc[dataset.categories] ?? [];
    if (state.selectedIndex === null) list.push(state.draft);
    else list[state.selectedIndex] = state.draft;
  } else {
    const list = doc[dataset.collection];
    if (state.selectedIndex === null) list.push(state.draft);
    else list[state.selectedIndex] = state.draft;
  }

  markDirty();
  state.selectedIndex = null;
  state.draft = null;
  renderAll();
  toast("Record applied in memory. Press Save to write the file.", "info");
}

function markDirty() {
  state.dirty.add(state.currentKey);
  renderSidebar();
  renderValidation();
}

function addRecord() {
  const dataset = currentDataset();
  const doc = currentDoc();
  if (!doc) return;

  if (state.mode === "categories") {
    const list = doc[dataset.categories] ?? (doc[dataset.categories] = []);
    state.draft = { id: "", name: "New category", order: list.length + 1, enabled: true };
    state.selectedIndex = null;
    renderForm();
    return;
  }

  const collection = doc[dataset.collection];
  if (!Array.isArray(collection)) return;

  state.draft = blankRecord(dataset, collection);
  state.selectedIndex = null;
  renderForm();
  dom.form.scrollIntoView({ block: "nearest" });
}

function duplicateRecord(index = state.selectedIndex) {
  const dataset = currentDataset();
  const doc = currentDoc();
  const collection = currentCollection();
  if (!isArrayDataset(dataset) || index === null || !doc) return;

  const source = collection[index];
  const copy = structuredClone(source);

  if (dataset.prefix) copy.id = nextId(dataset, collection);
  if (typeof copy.title === "string") copy.title = `${copy.title} (copy)`;
  if (typeof copy.name === "string") copy.name = `${copy.name} (copy)`;
  if (typeof copy.order === "number") copy.order = collection.length + 1;

  collection.splice(index + 1, 0, copy);
  state.selectedIndex = index + 1;
  markDirty();
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
    ? `\n\nReferenced by:\n- ${references.join("\n- ")}\n\nDeleting will leave dangling references.`
    : "";

  if (!window.confirm(`Delete "${recordLabel(dataset, record)}" (${record.id || "no id"})?${warning}`)) {
    return;
  }

  collection.splice(index, 1);
  state.selectedIndex = null;
  state.draft = null;
  markDirty();
  renderAll();
}

function moveRecord(index, direction) {
  const collection = currentCollection();
  const target = index + direction;
  if (target < 0 || target >= collection.length) return;

  [collection[index], collection[target]] = [collection[target], collection[index]];

  collection.forEach((record, position) => {
    if (record && typeof record === "object" && Object.prototype.hasOwnProperty.call(record, "order")) {
      record.order = position + 1;
    }
  });

  state.selectedIndex = target;
  markDirty();
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

  categories.splice(index, 1);
  state.selectedIndex = null;
  state.draft = null;
  markDirty();
  renderAll();
}

function docsParsed() {
  const result = {};
  for (const [key, entry] of Object.entries(state.docs)) {
    if (entry?.parsed) result[key] = entry.parsed;
  }
  return result;
}

/* ------------------------------------------------------------------ save */

async function saveCurrent() {
  const dataset = currentDataset();
  const entry = state.docs[state.currentKey];
  if (!entry?.parsed) {
    toast("Nothing to save: this dataset is not loaded.", "error");
    return;
  }

  const validation = validateDocument(dataset, entry.parsed, docsParsed());
  if (validation.errors.length > 0) {
    renderValidation();
    toast(`Fix ${validation.errors.length} validation error(s) before saving.`, "error");
    return;
  }

  const text = serialize(entry.parsed);

  if (!state.directory) {
    downloadDocument(dataset, text);
    toast(`Downloaded ${dataset.file}. Place it in data/ and reload the page.`, "warning");
    return;
  }

  try {
    const result = await saveDataset({
      projectDirectory: state.directory,
      dataDirectory: state.dataDirectory,
      dataset,
      text,
      expectedHash: entry.hash
    });

    entry.text = text;
    entry.hash = result.hash;
    state.dirty.delete(state.currentKey);
    setStatus("connected", `Saved data/${dataset.file}. Backup: ${result.backupPath}`);
    toast(`Saved ${dataset.file}.`, "success");
    renderAll();
  } catch (error) {
    if (error.code === "conflict") {
      const overwrite = window.confirm(
        "The file changed on disk after it was loaded.\n\nOverwrite it with the editor version? A backup of the current file will be created first."
      );

      if (!overwrite) {
        setStatus("error", "Save cancelled: the file changed on disk.");
        return;
      }

      try {
        const result = await saveDataset({
          projectDirectory: state.directory,
          dataDirectory: state.dataDirectory,
          dataset,
          text,
          expectedHash: ""
        });
        entry.text = text;
        entry.hash = result.hash;
        state.dirty.delete(state.currentKey);
        toast(`Saved ${dataset.file} after confirmation.`, "success");
        renderAll();
      } catch (retryError) {
        setStatus("error", retryError.message);
        toast(retryError.message, "error");
      }
      return;
    }

    setStatus("error", error.message);
    toast(error.message, "error");
  }
}

/* ------------------------------------------------------------------ panels */

function renderValidation() {
  const dataset = currentDataset();
  const doc = currentDoc();
  if (!doc) {
    dom.save.disabled = true;
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
  dom.save.disabled = errors.length > 0;
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
  }
  dom.form.hidden = state.preview;
  dom.preview.hidden = !state.preview;
  dom.previewWrap.hidden = !state.preview;
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

  renderTable();
  renderValidation();
  renderTabs();
  renderPreview();

  // No record selected yet: the editor panel would otherwise be a blank column.
  if (!state.draft && !state.preview) {
    clearForm("Select a record to edit, or add a new one.");
  }
  dom.download.disabled = !doc;
  // Save is only meaningful after the project folder is connected. In preview mode
  // the Download button is the fallback, so the UI does not offer a save it cannot do.
  dom.save.hidden = !state.directory;
  dom.save.textContent = "Save to file";
  // Save is enabled/disabled by renderValidation() from the actual error count;
  // setting it from `!doc` here would silently re-enable it after a failed check.
}

/* ------------------------------------------------------------------ events */

dom.connect.addEventListener("click", onConnect);
dom.save.addEventListener("click", saveCurrent);
dom.download.addEventListener("click", () => {
  const dataset = currentDataset();
  const doc = currentDoc();
  if (doc) downloadDocument(dataset, serialize(doc));
});
dom.add.addEventListener("click", addRecord);
dom.search.addEventListener("input", () => {
  state.search = dom.search.value;
  renderTable();
});
dom.categories.addEventListener("click", () => {
  state.mode = state.mode === "categories" ? "records" : "categories";
  state.selectedIndex = null;
  state.draft = null;
  renderAll();
});
dom.apply.addEventListener("click", applyDraft);
dom.cancel.addEventListener("click", () => {
  state.selectedIndex = null;
  state.draft = null;
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

// The form has no submit button, but Enter in a text field can still submit it
// and reload the page with the draft in the URL. Prevent that; Save is explicit.
dom.form.addEventListener("submit", (event) => {
  event.preventDefault();
});

document.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveCurrent();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (state.dirty.size > 0) {
    event.preventDefault();
    event.returnValue = "";
  }
});

/* ------------------------------------------------------------------ start */

if (!supportsDirectoryPicker()) {
  setStatus("preview", "This browser has no File System Access API. Editing and download work; direct saving does not.");
} else {
  setStatus("preview", "Preview mode: connect the project folder to save directly.");
}

loadAllDocuments();
