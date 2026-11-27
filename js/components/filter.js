/**
 * js/components/filter.js - shared Filter control component.
 *
 * Owns:
 * - Rendering filter groups (single-select radios, multi-select checkboxes,
 *   native <select>) from a supplied configuration.
 * - The selection state of those controls, the active-filter chips, the
 *   clear-all action and the result-count slot.
 * - Deriving option lists from live records (buildFilterGroups /
 *   deriveFilterOptions), so no section has to hardcode a category list that
 *   the data does not contain.
 *
 * Does not own:
 * - Matching records. js/core/filter-engine.js applyFilters() does that and
 *   sorting belongs to js/core/sort-engine.js; this module never inspects a
 *   record's fields except to count option occurrences for display.
 * - Persistence. Nothing is written to LocalStorage (FILTER_COMPONENT.md §22);
 *   the consuming section owns its state and may persist it deliberately.
 *
 * Consumers: every section with a filter bar (projects, certificates,
 * experience, learning journey, career timeline, github importer, bookmarks)
 * plus Global Search and JSON Manager.
 *
 * Pairs with css/components/filters.css, which is the only place filter
 * appearance lives. Sections must not restyle filter controls themselves.
 */

import { collectFilterValues, readPath } from "../core/filter-engine.js";

/**
 * Sentinel option used by single-select and <select> groups for "no filter".
 * filter-engine.js ignores this value, so selecting it restores the full set
 * without a second code path.
 */
const ALL_VALUE = "all";

/** Group types this component can render. Anything else is skipped safely. */
const SUPPORTED_TYPES = Object.freeze(["single", "select", "multiple", "checkbox"]);

/**
 * Accepted aliases so a section can pass the wording from FILTER_COMPONENT.md
 * ("multi-select", "dropdown", "radio") without the renderer caring.
 */
const TYPE_ALIASES = Object.freeze({
  radio: "single",
  dropdown: "select",
  "multi-select": "multiple",
  multi: "multiple",
  checkboxes: "multiple",
  toggle: "checkbox"
});

const SUPPORTED_LAYOUTS = Object.freeze(["vertical", "horizontal", "compact"]);

/** Distinguishes DOM ids when several filter controls live on one page. */
let instanceCounter = 0;

function reportError(message) {
  // One warning per invalid group/option: a broken config must not throw and
  // take the whole section down with it (FILTER_COMPONENT.md §25).
  console.warn(`[Filter] ${message}`);
}

/**
 * Turns a data value such as "web-development" into a readable label.
 *
 * Only fully lower-case values are humanised. Values that already carry their
 * own capitalisation ("JavaScript") are kept verbatim, because title-casing
 * them would produce "Javascript" and misname the technology.
 *
 * @param {unknown} value
 * @returns {string}
 */
function humanizeValue(value) {
  const text = String(value ?? "").trim();

  if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(text)) {
    return text;
  }

  return text
    .split(/[-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Values that cannot act as a filter because filter-engine.js treats them as
 * "no filter". A record whose category is literally "all" therefore cannot be
 * isolated, so it is left out of the option list instead of presenting a
 * control that does nothing.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isReservedValue(value) {
  return value === "" || value === ALL_VALUE || value === "*";
}

/**
 * Counts how many records carry a value, for the optional option badge.
 *
 * This mirrors filter-engine.js' case-insensitive comparison for display
 * purposes only; the filtering itself is never re-implemented here.
 *
 * @param {Array<Object>} records
 * @param {string} key
 * @param {string} value
 * @returns {number}
 */
function countRecordsWithValue(records, key, value) {
  if (!Array.isArray(records)) {
    return 0;
  }

  const target = String(value).trim().toLowerCase();
  let total = 0;

  for (const record of records) {
    const current = readPath(record, key);
    const values = Array.isArray(current) ? current : [current];

    if (
      values.some(
        (entry) =>
          entry !== null &&
          typeof entry !== "undefined" &&
          String(entry).trim().toLowerCase() === target
      )
    ) {
      total += 1;
    }
  }

  return total;
}

/**
 * Builds filter options from live records.
 *
 * Sections call this (usually through buildFilterGroups) instead of writing a
 * category list by hand: categories, technologies and issuers are whatever the
 * loaded dataset actually contains.
 *
 * @param {Array<Object>} records - Source records, unchanged.
 * @param {string} key - Record field, dotted paths supported ("issuer.name").
 * @param {Object} [options]
 * @param {Object<string,string>} [options.labelMap] - value -> display label.
 * @param {number} [options.limit] - Maximum options returned; 0 or negative = all.
 * @param {boolean} [options.includeCounts] - Add a record count per option.
 * @returns {Array<{value: string, label: string, count: number|null}>}
 */
export function deriveFilterOptions(records, key, options = {}) {
  const settings = options && typeof options === "object" ? options : {};
  const { labelMap = {}, includeCounts = true } = settings;
  const limit = Number.isFinite(settings.limit) ? settings.limit : 24;

  if (!Array.isArray(records) || typeof key !== "string" || key.trim() === "") {
    return [];
  }

  const values = collectFilterValues(records, key).filter((value) => !isReservedValue(value));
  const visible = limit > 0 ? values.slice(0, limit) : values;

  return visible.map((value) => {
    // hasOwnProperty guard: labelMap may be built from imported JSON, and
    // inherited keys such as "constructor" must not become labels.
    const mapped =
      labelMap !== null &&
      typeof labelMap === "object" &&
      Object.prototype.hasOwnProperty.call(labelMap, value)
        ? String(labelMap[value]).trim()
        : "";

    return {
      value,
      label: mapped || humanizeValue(value),
      count: includeCounts === false ? null : countRecordsWithValue(records, key, value)
    };
  });
}

/**
 * Turns a compact specification into a full filter configuration.
 *
 * A section writes one line per filter ("category from category", "tags from
 * tags") and gets back a configuration whose options are derived from the
 * loaded records. Groups that would have no options are dropped, because
 * FILTER_COMPONENT.md §7 forbids rendering an empty group.
 *
 * @param {Array<Object>} records
 * @param {Array<{id: string, label?: string, key?: string, type?: string,
 *   allLabel?: string, labelMap?: Object, limit?: number,
 *   includeCounts?: boolean}>} specs
 * @returns {Array<Object>} Groups accepted by initializeFilter({ groups }).
 */
export function buildFilterGroups(records, specs = []) {
  if (!Array.isArray(specs)) {
    reportError("buildFilterGroups expects an array of group specifications.");
    return [];
  }

  const groups = [];
  const seenIds = new Set();

  for (const spec of specs) {
    if (!spec || typeof spec !== "object") {
      continue;
    }

    const id = typeof spec.id === "string" ? spec.id.trim() : "";

    if (!id) {
      reportError("Skipped a derived group without an id.");
      continue;
    }

    if (seenIds.has(id)) {
      reportError(`Skipped duplicate derived group id "${id}".`);
      continue;
    }

    const options = deriveFilterOptions(records, spec.key ?? id, spec);

    if (options.length === 0) {
      // No records carry this field: showing the control would let the visitor
      // filter by something that cannot change the result.
      continue;
    }

    seenIds.add(id);
    groups.push({
      id,
      label:
        typeof spec.label === "string" && spec.label.trim()
          ? spec.label.trim()
          : humanizeValue(id),
      type: spec.type ?? "single",
      allLabel: spec.allLabel,
      options
    });
  }

  return groups;
}

/**
 * Normalises one option list, dropping values that cannot be represented.
 *
 * @param {Object} rawGroup
 * @param {string} type
 * @param {string} groupLabel
 * @returns {Array<{value: string, label: string, disabled: boolean, count: number|null}>}
 */
function normalizeOptions(rawGroup, type, groupLabel) {
  const rawOptions = Array.isArray(rawGroup.options) ? rawGroup.options : [];
  const options = [];
  const seenValues = new Set();

  for (const rawOption of rawOptions) {
    if (!rawOption || typeof rawOption !== "object") {
      continue;
    }

    const rawValue = rawOption.value;
    const value =
      typeof rawValue === "string" || typeof rawValue === "number"
        ? String(rawValue).trim()
        : "";

    if (value === "") {
      reportError(`Skipped an option without a value in group "${groupLabel}".`);
      continue;
    }

    if (isReservedValue(value)) {
      reportError(
        `Skipped option value "${value}" in group "${groupLabel}": reserved for "no filter".`
      );
      continue;
    }

    if (seenValues.has(value)) {
      reportError(`Skipped duplicate option value "${value}" in group "${groupLabel}".`);
      continue;
    }

    const label =
      typeof rawOption.label === "string" && rawOption.label.trim()
        ? rawOption.label.trim()
        : humanizeValue(value);

    seenValues.add(value);
    options.push({
      value,
      label,
      disabled: rawOption.disabled === true,
      count: Number.isFinite(rawOption.count) ? rawOption.count : null
    });
  }

  // A single independent checkbox ("Featured only") reads better without an
  // option list; the group label becomes the one option's label.
  if (options.length === 0 && type === "checkbox") {
    options.push({ value: "true", label: groupLabel, disabled: false, count: null });
  }

  return options;
}

/**
 * Validates a filter configuration.
 *
 * Invalid groups are skipped individually so one broken group cannot disable the
 * rest of the panel (§25). Option labels and values are treated as untrusted
 * text: they only ever become textContent, never markup or selectors.
 *
 * @param {Object|Array} config - { groups: [...] } or the group array itself.
 * @returns {Array<Object>}
 */
function normalizeGroups(config) {
  const rawGroups = Array.isArray(config)
    ? config
    : config && typeof config === "object" && Array.isArray(config.groups)
      ? config.groups
      : [];

  const groups = [];
  const seenIds = new Set();

  rawGroups.forEach((rawGroup, index) => {
    if (!rawGroup || typeof rawGroup !== "object") {
      reportError(`Filter group #${index} is not an object; skipped.`);
      return;
    }

    const id = typeof rawGroup.id === "string" ? rawGroup.id.trim() : "";

    if (!id) {
      reportError(`Filter group #${index} has no id; skipped.`);
      return;
    }

    if (seenIds.has(id)) {
      reportError(`Duplicate filter group id "${id}"; the later group was skipped.`);
      return;
    }

    const requestedType =
      typeof rawGroup.type === "string" ? rawGroup.type.trim().toLowerCase() : "single";
    const type = TYPE_ALIASES[requestedType] ?? requestedType;

    if (!SUPPORTED_TYPES.includes(type)) {
      reportError(`Unsupported filter type "${requestedType}" in group "${id}"; skipped.`);
      return;
    }

    const label =
      typeof rawGroup.label === "string" && rawGroup.label.trim()
        ? rawGroup.label.trim()
        : humanizeValue(id);

    const allLabel =
      typeof rawGroup.allLabel === "string" && rawGroup.allLabel.trim()
        ? rawGroup.allLabel.trim()
        : "All";

    const options = normalizeOptions(rawGroup, type, label);

    if (options.length === 0) {
      // Empty groups are not rendered at all (§25), not even as a heading.
      return;
    }

    seenIds.add(id);
    groups.push({
      id,
      label,
      type,
      allLabel,
      includeAllOption: type === "single" || type === "select",
      options
    });
  });

  return groups;
}

function safeIdPart(value) {
  // DOM ids only need to be unique; running imported ids through this keeps
  // them free of spaces and punctuation without ever being used as a selector.
  return (
    String(value)
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "group"
  );
}

function cloneState(state) {
  const copy = {};

  for (const [key, value] of Object.entries(state)) {
    copy[key] = Array.isArray(value) ? [...value] : value;
  }

  return copy;
}

/**
 * Default state: empty string for single/select/checkbox groups (meaning "no
 * filter"), empty array for multi-select groups.
 *
 * @param {Array<Object>} groups
 * @returns {Object<string, string|string[]>}
 */
function createDefaultState(groups) {
  const state = {};

  for (const group of groups) {
    state[group.id] = group.type === "multiple" ? [] : "";
  }

  return state;
}

/**
 * Validates externally supplied state (initialState, setState) against the
 * real option list.
 *
 * Unknown group ids, unknown option values and disabled options are ignored
 * rather than thrown: filter state often arrives from a URL or storage and must
 * never break rendering (§25 "Invalid initial selection").
 *
 * @param {Array<Object>} groups
 * @param {unknown} candidate
 * @returns {Object<string, string|string[]>}
 */
function sanitizeState(groups, candidate) {
  const state = createDefaultState(groups);

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return state;
  }

  for (const group of groups) {
    if (!Object.prototype.hasOwnProperty.call(candidate, group.id)) {
      continue;
    }

    const value = candidate[group.id];

    if (group.type === "multiple") {
      if (!Array.isArray(value)) {
        continue;
      }

      const accepted = [];

      for (const entry of value) {
        const normalized = String(entry);
        const option = group.options.find((item) => item.value === normalized);

        if (option && !option.disabled && !accepted.includes(normalized)) {
          accepted.push(normalized);
        }
      }

      state[group.id] = accepted;
      continue;
    }

    const normalized =
      typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";

    if (normalized === "" || normalized === ALL_VALUE) {
      continue;
    }

    const option = group.options.find((item) => item.value === normalized && !item.disabled);

    if (option) {
      state[group.id] = option.value;
    } else {
      reportError(
        `Ignored selected value "${normalized}" for group "${group.id}": not an available option.`
      );
    }
  }

  return state;
}

/**
 * Lists the selections that should appear as removable chips, in group order.
 *
 * @param {Array<Object>} groups
 * @param {Object<string, string|string[]>} state
 * @returns {Array<{groupId: string, value: string, label: string}>}
 */
function describeActiveFilters(groups, state) {
  const entries = [];

  for (const group of groups) {
    const value = state[group.id];

    if (group.type === "multiple") {
      if (!Array.isArray(value)) {
        continue;
      }

      for (const entry of value) {
        const option = group.options.find((item) => item.value === entry);

        if (option) {
          entries.push({ groupId: group.id, value: entry, label: option.label });
        }
      }

      continue;
    }

    if (!value || value === ALL_VALUE) {
      continue;
    }

    const option = group.options.find((item) => item.value === value);
    // An independent checkbox has no meaningful option label ("Show featured
    // records"), so the group label is what the visitor recognises.
    entries.push({
      groupId: group.id,
      value,
      label:
        group.type === "checkbox" ? group.label : (option?.label ?? humanizeValue(value))
    });
  }

  return entries;
}

function createCountBadge(count) {
  if (!Number.isFinite(count)) {
    return null;
  }

  const badge = document.createElement("span");
  badge.className = "filter__option-count";
  badge.textContent = String(count);
  return badge;
}

/**
 * Renders one fieldset of radio or checkbox options.
 *
 * @returns {HTMLInputElement[]} The generated inputs, for later state syncing.
 */
function renderChoiceGroup(fieldset, group, instanceId) {
  const inputs = [];
  const name = `filter-${instanceId}-${safeIdPart(group.id)}`;

  const typeOption = (option, index) => {
    const input = document.createElement("input");
    input.type = group.type === "single" ? "radio" : "checkbox";
    input.className = "filter__control";
    input.name = name;
    input.id = `${name}-${index}`;
    input.value = option.value;
    input.disabled = option.disabled === true;
    input.dataset.filterGroup = group.id;
    input.dataset.filterValue = option.value;

    const label = document.createElement("label");
    label.className = "filter__option";
    label.htmlFor = input.id;

    const text = document.createElement("span");
    text.className = "filter__label";
    text.textContent = option.label;

    label.append(input, text);

    const count = createCountBadge(option.count);

    if (count) {
      label.append(count);
    }

    fieldset.append(label);
    inputs.push(input);
  };

  if (group.includeAllOption) {
    typeOption({ value: ALL_VALUE, label: group.allLabel, disabled: false, count: null }, 0);
  }

  group.options.forEach((option, index) => {
    typeOption(option, group.includeAllOption ? index + 1 : index);
  });

  return inputs;
}

/**
 * Renders one group: fieldset+legend for radios/checkboxes, a labelled native
 * <select> for dropdown groups.
 *
 * @returns {{input?: HTMLInputElement, select?: HTMLSelectElement}}
 */
function renderGroup(group, instanceId) {
  if (group.type === "select") {
    const wrapper = document.createElement("div");
    wrapper.className = "filter__group filter__group--select";
    wrapper.dataset.filterGroup = group.id;

    const selectId = `filter-${instanceId}-${safeIdPart(group.id)}`;

    const label = document.createElement("label");
    label.className = "filter__group-title";
    label.htmlFor = selectId;
    label.textContent = group.label;

    const select = document.createElement("select");
    select.className = "filter__select";
    select.id = selectId;
    select.dataset.filterGroup = group.id;

    const allOption = document.createElement("option");
    allOption.value = ALL_VALUE;
    allOption.textContent = group.allLabel;
    select.append(allOption);

    for (const option of group.options) {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      element.disabled = option.disabled === true;
      select.append(element);
    }

    wrapper.append(label, select);
    return { element: wrapper, select };
  }

  const fieldset = document.createElement("fieldset");
  fieldset.className = "filter__group";
  fieldset.dataset.filterGroup = group.id;

  const legend = document.createElement("legend");
  legend.className = "filter__group-title";
  legend.textContent = group.label;

  fieldset.append(legend);
  const inputs = renderChoiceGroup(fieldset, group, instanceId);

  return { element: fieldset, inputs };
}

/**
 * Builds the whole control inside the container.
 *
 * The container is emptied first: sections pass a dedicated mount node, and
 * re-running the initializer (theme preview, data reload) must not stack two
 * copies of the same controls.
 *
 * @returns {Object} Element references the controller keeps in sync.
 */
function buildInterface(container, groups, instanceId, settings) {
  container.textContent = "";

  const layout = SUPPORTED_LAYOUTS.includes(settings.layout) ? settings.layout : "vertical";
  const collapsible = settings.collapsible === true || layout === "collapsible";
  const panelId = `filter-panel-${instanceId}`;

  const root = document.createElement("div");
  root.className = `filter filter--${layout === "collapsible" ? "vertical" : layout}`;
  root.dataset.filterRoot = "";

  const headingText = typeof settings.heading === "string" ? settings.heading.trim() : "Filters";

  let toggle = null;

  if (headingText || collapsible) {
    const header = document.createElement("div");
    header.className = "filter__header";

    if (headingText) {
      const heading = document.createElement(settings.headingLevel === "h2" ? "h2" : "h3");
      heading.className = "filter__heading";
      heading.textContent = headingText;
      header.append(heading);
    }

    if (collapsible) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "filter__toggle";
      toggle.dataset.filterAction = "toggle";
      toggle.setAttribute("aria-controls", panelId);
      toggle.setAttribute("aria-expanded", String(settings.startExpanded !== false));
      toggle.textContent =
        typeof settings.toggleLabel === "string" && settings.toggleLabel.trim()
          ? settings.toggleLabel.trim()
          : "Filters";
      header.append(toggle);
      root.classList.add("filter--collapsible");
    }

    root.append(header);
  }

  const panel = document.createElement("div");
  panel.className = "filter__panel";
  panel.id = panelId;
  panel.hidden = collapsible && settings.startExpanded === false;

  const controls = new Map();

  for (const group of groups) {
    const rendered = renderGroup(group, instanceId);
    controls.set(group.id, { inputs: rendered.inputs, select: rendered.select });
    panel.append(rendered.element);
  }

  const actions = document.createElement("div");
  actions.className = "filter__actions";

  let applyButton = null;

  if (settings.applyMode === "apply") {
    applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.className = "btn btn--primary filter__apply";
    applyButton.dataset.filterAction = "apply";
    applyButton.textContent =
      typeof settings.applyLabel === "string" && settings.applyLabel.trim()
        ? settings.applyLabel.trim()
        : "Apply filters";
    actions.append(applyButton);
  }

  const clearAll = document.createElement("button");
  clearAll.type = "button";
  clearAll.className = "btn btn--secondary filter__clear-all";
  clearAll.dataset.filterAction = "clear";
  clearAll.hidden = true;
  clearAll.textContent =
    typeof settings.clearLabel === "string" && settings.clearLabel.trim()
      ? settings.clearLabel.trim()
      : "Clear all filters";
  actions.append(clearAll);

  const activeList = document.createElement("div");
  activeList.className = "filter__active-list";
  activeList.hidden = true;

  const activeLabel = document.createElement("span");
  activeLabel.className = "filter__active-label";
  activeLabel.textContent = "Active filters";

  const chips = document.createElement("div");
  chips.className = "filter__chips";
  activeList.append(activeLabel, chips);

  const countOutput = document.createElement("p");
  countOutput.className = "filter__result-count";
  // role=status is a polite live region: the count is announced after filtering
  // but individual option changes are not, which §19 asks for.
  countOutput.setAttribute("role", "status");
  countOutput.setAttribute("aria-live", "polite");
  countOutput.hidden = true;

  panel.append(actions, activeList, countOutput);
  root.append(panel);
  container.append(root);

  return { root, panel, toggle, applyButton, clearAll, activeList, chips, countOutput, controls };
}

function createInertController() {
  // Returned when a caller passes a non-element. The shape matches the real
  // controller so a section's `filter.getState()` never throws during startup.
  return {
    element: null,
    getState: () => ({}),
    setState: () => {},
    clear: () => {},
    setResultCount: () => {},
    destroy: () => {}
  };
}

/**
 * Initialises one filter interface.
 *
 * @param {Element} container - Dedicated mount node; its content is replaced.
 * @param {Object} [options]
 * @param {Object|Array} [options.config] - { groups: [...] } (FILTER_COMPONENT.md §7).
 * @param {Object} [options.initialState] - { groupId: value | value[] }.
 * @param {"vertical"|"horizontal"|"compact"} [options.layout]
 * @param {boolean} [options.collapsible] - Add an aria-expanded panel toggle.
 * @param {boolean} [options.startExpanded] - Default true.
 * @param {"immediate"|"apply"} [options.applyMode] - Default immediate.
 * @param {boolean} [options.emitOnSetState] - Call onChange from setState().
 * @param {string} [options.heading] - Panel heading text; "" hides it.
 * @param {string} [options.countNoun] - "projects" -> "12 projects".
 * @param {(state: Object, meta: Object) => void} [options.onChange]
 * @param {(state: Object) => void} [options.onApply]
 * @param {(state: Object) => void} [options.onClear]
 * @returns {{getState: Function, setState: Function, clear: Function,
 *   setResultCount: Function, destroy: Function}}
 */
export function initializeFilter(container, options = {}) {
  const settings = options && typeof options === "object" ? options : {};

  if (typeof Element === "undefined" || !(container instanceof Element)) {
    reportError("initializeFilter needs a DOM element; the control was not rendered.");
    return createInertController();
  }

  const groups = normalizeGroups(settings.config ?? settings.groups ?? []);

  if (groups.length === 0) {
    reportError("initializeFilter received no usable filter groups; nothing was rendered.");
  }

  const instanceId = `f${++instanceCounter}`;
  const applyMode = settings.applyMode === "apply";

  let draftState = sanitizeState(groups, settings.initialState);
  // In immediate mode draft and applied never differ; in apply mode the chips
  // and the consumer see the last applied state, not the draft.
  let appliedState = cloneState(draftState);
  const ui = buildInterface(container, groups, instanceId, settings);
  let destroyed = false;

  function renderActiveFiltersView() {
    const state = applyMode ? appliedState : draftState;
    const entries = describeActiveFilters(groups, state);

    ui.chips.textContent = "";
    ui.activeList.hidden = entries.length === 0;
    ui.clearAll.hidden = entries.length === 0;

    for (const entry of entries) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "filter__active-chip";
      chip.dataset.filterAction = "remove-chip";
      chip.dataset.filterGroup = entry.groupId;
      chip.dataset.filterValue = entry.value;
      // A bare "×" is not an accessible name; the label names the filter.
      chip.setAttribute("aria-label", `Remove ${entry.label} filter`);

      const text = document.createElement("span");
      text.className = "filter__active-chip-label";
      text.textContent = entry.label;

      const icon = document.createElement("span");
      icon.className = "filter__active-chip-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "\u00d7";

      chip.append(text, icon);
      ui.chips.append(chip);
    }
  }

  function syncControls() {
    for (const group of groups) {
      const refs = ui.controls.get(group.id);

      if (!refs) {
        continue;
      }

      const value = draftState[group.id];

      if (refs.select) {
        refs.select.value = typeof value === "string" && value ? value : ALL_VALUE;
        continue;
      }

      for (const input of refs.inputs ?? []) {
        if (group.type === "multiple") {
          input.checked = Array.isArray(value) && value.includes(input.value);
          continue;
        }

        if (group.type === "single") {
          // Empty state is represented by the "All" radio so the visible
          // selection always matches the real filter state.
          input.checked = input.value === (value || ALL_VALUE);
          continue;
        }

        input.checked = value !== "" && input.value === value;
      }
    }
  }

  function commit(meta) {
    appliedState = cloneState(draftState);
    renderActiveFiltersView();

    if (typeof settings.onChange === "function") {
      settings.onChange(cloneState(appliedState), meta);
    }
  }

  function handleChange(event) {
    const input = event.target;

    if (!input || !input.dataset || !input.dataset.filterGroup) {
      return;
    }

    const group = groups.find((item) => item.id === input.dataset.filterGroup);

    if (!group) {
      return;
    }

    if (group.type === "multiple") {
      const current = Array.isArray(draftState[group.id]) ? [...draftState[group.id]] : [];
      const value = input.value;

      if (input.checked) {
        if (!current.includes(value)) {
          current.push(value);
        }
      } else {
        const index = current.indexOf(value);

        if (index !== -1) {
          current.splice(index, 1);
        }
      }

      draftState[group.id] = current;
    } else if (group.type === "single" || group.type === "select") {
      draftState[group.id] = input.value === ALL_VALUE ? "" : input.value;
    } else {
      draftState[group.id] = input.checked ? input.value : "";
    }

    if (applyMode) {
      renderActiveFiltersView();
      return;
    }

    commit({ groupId: group.id, value: draftState[group.id], action: "change" });
  }

  function removeChip(groupId, value) {
    const group = groups.find((item) => item.id === groupId);

    if (!group) {
      return;
    }

    if (group.type === "multiple") {
      const current = Array.isArray(draftState[groupId]) ? draftState[groupId] : [];
      draftState[groupId] = current.filter((entry) => entry !== value);
    } else {
      draftState[groupId] = "";
    }

    syncControls();
    renderActiveFiltersView();

    if (!applyMode) {
      commit({ groupId, value: draftState[groupId], action: "remove" });
    }

    // Move focus somewhere meaningful: the chip that was pressed no longer
    // exists, so a keyboard user would otherwise land back at the document top.
    const refs = ui.controls.get(groupId);
    const target = refs?.select ?? refs?.inputs?.[0] ?? ui.clearAll;
    target?.focus();
  }

  function handleClick(event) {
    const target = event.target;

    if (!target || typeof target.closest !== "function") {
      return;
    }

    const trigger = target.closest("[data-filter-action]");

    if (!trigger || !ui.root.contains(trigger)) {
      return;
    }

    switch (trigger.dataset.filterAction) {
      case "toggle": {
        const expanded = trigger.getAttribute("aria-expanded") === "true";
        trigger.setAttribute("aria-expanded", String(!expanded));
        ui.panel.hidden = expanded;
        break;
      }

      case "clear": {
        draftState = createDefaultState(groups);
        syncControls();
        renderActiveFiltersView();
        commit({ action: "clear" });

        if (applyMode && typeof settings.onApply === "function") {
          settings.onApply(cloneState(appliedState));
        }

        if (typeof settings.onClear === "function") {
          settings.onClear(cloneState(appliedState));
        }

        break;
      }

      case "apply": {
        commit({ action: "apply" });

        if (typeof settings.onApply === "function") {
          settings.onApply(cloneState(appliedState));
        }

        break;
      }

      case "remove-chip": {
        removeChip(trigger.dataset.filterGroup, trigger.dataset.filterValue);
        break;
      }

      default:
        // Unknown actions are inert on purpose: imported data can never name a
        // behaviour and have it executed here (§23).
        break;
    }
  }

  ui.root.addEventListener("change", handleChange);
  ui.root.addEventListener("click", handleClick);

  syncControls();
  renderActiveFiltersView();

  return {
    /**
     * @returns {Object<string, string|string[]>} The state the consumer filters
     *   with. In apply mode this is the last applied state.
     */
    getState() {
      return cloneState(appliedState);
    },

    /**
     * Applies external state (deep-link restore, reset from a parent view).
     * Controls are never left showing a value that is not in the state.
     *
     * @param {Object} nextState
     */
    setState(nextState) {
      if (destroyed) {
        return;
      }

      draftState = sanitizeState(groups, nextState);
      syncControls();

      if (settings.emitOnSetState === true) {
        commit({ action: "setState" });
        return;
      }

      appliedState = cloneState(draftState);
      renderActiveFiltersView();
    },

    /** Resets every control in this interface and notifies the consumer. */
    clear() {
      if (destroyed) {
        return;
      }

      draftState = createDefaultState(groups);
      syncControls();
      renderActiveFiltersView();
      commit({ action: "clear" });

      if (applyMode && typeof settings.onApply === "function") {
        settings.onApply(cloneState(appliedState));
      }

      if (typeof settings.onClear === "function") {
        settings.onClear(cloneState(appliedState));
      }
    },

    /**
     * Displays the consuming section's real match count. A missing or invalid
     * count hides the slot instead of showing a fabricated number (§14).
     *
     * @param {number} count
     * @param {string} [label] - e.g. "projects"; defaults to options.countNoun.
     */
    setResultCount(count, label) {
      if (destroyed) {
        return;
      }

      if (!Number.isFinite(count) || count < 0) {
        ui.countOutput.hidden = true;
        ui.countOutput.textContent = "";
        return;
      }

      const nounSource =
        typeof label === "string" && label.trim() ? label : settings.countNoun;
      const noun = typeof nounSource === "string" ? nounSource.trim() : "";
      const text = noun
        ? `${count} ${noun}`
        : `${count} ${count === 1 ? "result" : "results"}`;

      ui.countOutput.textContent = text;
      ui.countOutput.hidden = false;
    },

    /** Removes listeners and rendered markup so re-initialisation is safe. */
    destroy() {
      if (destroyed) {
        return;
      }

      destroyed = true;
      ui.root.removeEventListener("change", handleChange);
      ui.root.removeEventListener("click", handleClick);
      ui.root.remove();
      ui.controls.clear();
    }
  };
}
