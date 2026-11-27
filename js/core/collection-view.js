/**
 * js/core/collection-view.js - one search/filter/sort/paging pipeline for every
 * card collection on the page.
 *
 * Why this module exists: seven sections need the same behaviour (text search,
 * a category select, a technology/issuer/type select, a sort select, a result
 * count and "load more"). Before this module each section that had any of them
 * wrote its own state object and its own filtering call, so the counts drifted
 * from the grid and two sections ranked the same query differently. Here the
 * state, the matching (js/core/search-engine.js), the sorting
 * (js/core/sort-engine.js) and the pagination live in one place; a section only
 * supplies records and a render callback.
 *
 * Data flow: records -> filter -> search -> sort -> page -> renderList. Every
 * step returns a new array, so the dataset loaded by js/core/data-loader.js is
 * never mutated and a second render cannot compound a previous filter.
 *
 * Accessibility: the count is a polite status region, the controls are real
 * labelled form fields, and "load more" is a button that reports how many
 * records remain. All three are keyboard operable without a custom widget.
 *
 * Security: no record value reaches the DOM here. renderList owns that and every
 * section uses textContent; this module only compares strings.
 */

import { matchesQuery, normalizeText } from "./search-engine.js";
import { applySort } from "./sort-engine.js";
import { matchesRange } from "./filter-engine.js";
import { createRangeFilter } from "../components/filter.js";
import { initializeSearch } from "../components/search.js";
import { asArray, asText, el, isRecord, renderEmpty } from "./section-kit.js";

/** Values that mean "no restriction" in a filter select. */
const ALL_VALUES = Object.freeze(["", "all", "*"]);

/** Distinguishes control ids when several collections live on one page. */
let instanceCounter = 0;

/**
 * @param {unknown} value
 * @returns {boolean} True when the value means "no filter".
 */
function isAllValue(value) {
  return ALL_VALUES.includes(String(value ?? "").trim().toLowerCase());
}

/**
 * Compares one record field against a chosen filter value.
 *
 * Array fields (technologies, tags, skills) match when any entry matches, which
 * is what a technology filter has to do. Comparison is case-insensitive because
 * imported data is not guaranteed to agree on capitalisation.
 *
 * @param {unknown} fieldValue
 * @param {string} selected
 * @returns {boolean}
 */
function matchesFilterValue(fieldValue, selected) {
  const target = String(selected).trim().toLowerCase();

  if (!target) {
    return true;
  }

  const values = Array.isArray(fieldValue) ? fieldValue : [fieldValue];

  return values.some(
    (value) =>
      value !== null &&
      typeof value !== "undefined" &&
      String(value).trim().toLowerCase() === target
  );
}

/**
 * Reads a dotted path without importing the filter engine.
 *
 * Kept local so this module has one dependency direction (search-engine already
 * imports filter-engine, and re-exporting readPath through it would make the
 * dependency harder to read than four lines of own code).
 *
 * @param {unknown} record
 * @param {string} path
 * @returns {unknown}
 */
function readField(record, path) {
  if (!isRecord(record) || !path) {
    return undefined;
  }

  return path.split(".").reduce((current, key) => {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    return current[key];
  }, record);
}

/**
 * Builds one labelled <select>.
 *
 * @param {Object} options
 * @param {string} options.id
 * @param {string} options.label
 * @param {Array<{value: string, label: string}>} options.options
 * @param {string} options.value
 * @param {(value: string) => void} options.onChange
 * @param {string} [options.className]
 * @returns {HTMLElement}
 */
function createSelectField({ id, label, options, value, onChange, className }) {
  const wrapper = el("div", { className: className || "field collection-toolbar__field" });
  wrapper.append(el("label", { className: "field__label", text: label, attrs: { for: id } }));

  const select = el("select", {
    className: "field__input field__input--select",
    attrs: { id }
  });

  for (const option of options) {
    const node = el("option", { text: option.label, attrs: { value: option.value } });
    if (option.value === value) {
      node.selected = true;
    }
    select.append(node);
  }

  select.addEventListener("change", () => onChange(select.value));
  wrapper.append(select);
  return wrapper;
}

/**
 * Builds the whole collection view inside `mount`.
 *
 * @param {Object} options
 * @param {HTMLElement} options.mount - Container the toolbar and list live in.
 * @param {Array<Object>} options.records - Source records (never mutated).
 * @param {Object|null} [options.search] - { label, placeholder, fields }.
 * @param {Array<Object>} [options.filters] - One entry per control:
 *   { id, label, key, allLabel, options: [{value,label}] } for a select, or
 *   { id, label, type: "range", min, max, step, unit, getValue } for a numeric
 *   interval. A select with fewer than two real options is dropped: a control
 *   with one choice is noise. A range without a usable scale is dropped too.
 * @param {Object|null} [options.sort] - { label, options: [{value,label}],
 *   initial, getDate, getLabel }.
 * @param {number} [options.pageSize=0] - 0 renders everything at once.
 * @param {(visible: number, total: number) => string} [options.countLabel]
 * @param {{title: string, message: string}} [options.empty]
 * @param {(records: Array<Object>) => (Node|Array<Node>|null)} options.renderList
 * @param {string} [options.listClassName]
 * @param {string} [options.toolbarClassName]
 * @param {string} [options.idPrefix]
 * @returns {{refresh: (records?: Array<Object>) => void, destroy: () => void,
 *   getState: () => Object, setPageSize: (size: number) => void}}
 */
export function createCollectionView(options) {
  const settings = isRecord(options) ? options : {};
  const mount = settings.mount;

  if (!(mount instanceof HTMLElement)) {
    return { refresh() {}, destroy() {}, getState: () => ({}), setPageSize() {} };
  }

  instanceCounter += 1;
  const prefix = asText(settings.idPrefix) || `collection-${instanceCounter}`;
  const searchConfig = isRecord(settings.search) ? settings.search : null;
  const sortConfig = isRecord(settings.sort) ? settings.sort : null;
  const pageSize = Number.isFinite(settings.pageSize) && settings.pageSize > 0
    ? Math.floor(settings.pageSize)
    : 0;

  let source = asArray(settings.records).filter(isRecord);
  let visibleLimit = pageSize || source.length;
  let destroyed = false;

  const state = {
    query: "",
    filters: Object.create(null),
    sort: sortConfig ? asText(sortConfig.initial) : ""
  };

  const cleanups = [];

  // ---- Toolbar ------------------------------------------------------------
  const toolbar = el("div", {
    className: settings.toolbarClassName || "collection-toolbar"
  });

  /** @type {HTMLInputElement|null} */
  let searchInput = null;
  /** @type {Object|null} */
  let searchController = null;

  if (searchConfig) {
    const searchId = `${prefix}-search`;
    const field = el("div", { className: "field collection-toolbar__search search" });
    field.append(
      el("label", {
        className: "field__label",
        text: asText(searchConfig.label) || "Search",
        attrs: { for: searchId }
      })
    );

    const searchField = el("div", { className: "search__field" });
    searchInput = el("input", {
      className: "search__input",
      attrs: {
        id: searchId,
        type: "search",
        placeholder: asText(searchConfig.placeholder) || "",
        autocomplete: "off",
        spellcheck: "false"
      }
    });
    searchField.append(searchInput);
    field.append(searchField);

    // The shared component owns debouncing, the clear control and the suggestion
    // listbox. Suggestions are the record labels of this collection, filtered by
    // the same folded comparison the result list uses, so the two cannot disagree
    // about whether something matches.
    searchController = initializeSearch(field, {
      label: asText(searchConfig.label) || "Search",
      // The section already renders a visible label; the component keeps it and
      // adds only its own styling hooks instead of hiding it.
      labelVisible: true,
      debounceMs: 0,
      onInput(value) {
        state.query = value;
        visibleLimit = pageSize || source.length;
        render();
      },
      getSuggestions(query) {
        const needle = normalizeText(query);

        if (!needle) {
          return [];
        }

        const labels = [];

        for (const record of source) {
          const label =
            asText(record.title) ||
            asText(record.name) ||
            asText(record.role) ||
            asText(record.qualification) ||
            asText(record.id);

          if (!label) {
            continue;
          }

          const folded = normalizeText(label);

          if (!folded.includes(needle)) {
            continue;
          }

          if (!labels.some((entry) => entry.toLowerCase() === label.toLowerCase())) {
            labels.push(label);
          }
        }

        // Prefix matches read as the better suggestion, so they come first and
        // keep the dataset order inside each group.
        labels.sort((a, b) => {
          const aPrefix = normalizeText(a).startsWith(needle) ? 0 : 1;
          const bPrefix = normalizeText(b).startsWith(needle) ? 0 : 1;
          return aPrefix - bPrefix;
        });

        return labels.slice(0, 6);
      },
      onSuggestionSelect(suggestion) {
        state.query = suggestion.value;
        visibleLimit = pageSize || source.length;
        render();
      }
    });

    if (searchController) {
      cleanups.push(() => searchController.destroy());
    }

    toolbar.append(field);
  }

  const filterSelects = [];
  /** @type {Array<{id: string, control: Object}>} */
  const filterRanges = [];

  for (const filter of asArray(settings.filters).filter(isRecord)) {
    const filterId = asText(filter.id);
    const key = asText(filter.key);

    if (filterId && asText(filter.type) === "range") {
      // The interval is rendered by the shared filter component so a toolbar
      // range and a filter-panel range cannot drift apart.
      const bounds = {
        min: Number(filter.min),
        max: Number(filter.max)
      };
      if (!Number.isFinite(bounds.min) || !Number.isFinite(bounds.max)) {
        continue;
      }

      const rangeControl = createRangeFilter({
        id: `${prefix}-${filterId}`,
        label: asText(filter.label) || filterId,
        min: bounds.min,
        max: bounds.max,
        step: Number(filter.step),
        unit: asText(filter.unit),
        fromLabel: asText(filter.fromLabel),
        toLabel: asText(filter.toLabel),
        className: "collection-toolbar__field range-filter--toolbar",
        onChange(value) {
          state.filters[filterId] = value;
          visibleLimit = pageSize || source.length;
          render();
        }
      });

      if (!rangeControl) {
        continue;
      }

      state.filters[filterId] = { min: null, max: null };
      filterRanges.push({ id: filterId, control: rangeControl });
      cleanups.push(() => rangeControl.destroy());
      toolbar.append(rangeControl.element);
      continue;
    }

    const filterOptions = asArray(filter.options)
      .filter((option) => isRecord(option) && !isAllValue(option.value))
      .map((option) => ({
        value: asText(option.value),
        label: asText(option.label) || asText(option.value)
      }));

    if (!filterId || !key || filterOptions.length < 2) {
      continue;
    }

    state.filters[filterId] = "";

    const field = createSelectField({
      id: `${prefix}-${filterId}`,
      label: asText(filter.label) || filterId,
      options: [{ value: "all", label: asText(filter.allLabel) || "All" }, ...filterOptions],
      value: "all",
      onChange(value) {
        state.filters[filterId] = isAllValue(value) ? "" : value;
        visibleLimit = pageSize || source.length;
        render();
      }
    });

    const select = field.querySelector("select");
    filterSelects.push(select);
    toolbar.append(field);
  }

  const sortOptions = sortConfig
    ? asArray(sortConfig.options)
        .filter((option) => isRecord(option) && asText(option.value))
        .map((option) => ({ value: asText(option.value), label: asText(option.label) }))
    : [];

  /** @type {HTMLSelectElement|null} */
  let sortSelect = null;

  if (sortConfig && sortOptions.length > 1) {
    const sortField = createSelectField({
      id: `${prefix}-sort`,
      label: asText(sortConfig.label) || "Sort by",
      options: sortOptions,
      value: state.sort,
      onChange(value) {
        state.sort = value;
        visibleLimit = pageSize || source.length;
        render();
      }
    });

    sortSelect = sortField.querySelector("select");
    toolbar.append(sortField);
  }

  // ---- Status + list ------------------------------------------------------
  const status = el("p", {
    className: "collection-status",
    attrs: { role: "status", "aria-live": "polite" }
  });

  const listHost = el("div", { className: asText(settings.listClassName) || "collection-list" });
  const moreHost = el("div", { className: "collection-more" });

  mount.append(toolbar, status, listHost, moreHost);

  /**
   * Applies filters, then the query, then the sort. Exposed through getState so
   * a test can assert the pipeline without scraping the DOM.
   *
   * @returns {Array<Object>}
   */
  function selectRecords() {
    let selected = source;

    for (const filter of asArray(settings.filters).filter(isRecord)) {
      const filterId = asText(filter.id);
      const key = asText(filter.key);
      const value = state.filters[filterId];

      if (!value || !key) {
        continue;
      }

      if (asText(filter.type) === "range") {
        const readRange =
          typeof filter.getValue === "function"
            ? (record) => filter.getValue(record)
            : (record) => readField(record, key);

        // matchesRange ignores an empty interval, so an untouched control is a
        // no-op rather than a filter that hides everything.
        selected = selected.filter((record) => matchesRange(readRange(record), value));
        continue;
      }

      selected = selected.filter((record) => matchesFilterValue(readField(record, key), value));
    }

    if (searchConfig && asText(state.query)) {
      const fields = asArray(searchConfig.fields).map(asText).filter(Boolean);
      selected = selected.filter((record) =>
        matchesQuery(record, state.query, fields.length > 0 ? { fields } : {})
      );
    }

    if (sortConfig && state.sort && state.sort !== "default") {
      selected = applySort(selected, state.sort, {
        getDateValue:
          typeof sortConfig.getDate === "function" ? sortConfig.getDate : undefined,
        getLabelValue:
          typeof sortConfig.getLabel === "function" ? sortConfig.getLabel : undefined
      });
    }

    return selected;
  }

  /** Resets every control and redraws. Used by the empty state's clear action. */
  function reset() {
    state.query = "";
    state.sort = sortConfig ? asText(sortConfig.initial) : "";

    if (searchInput) {
      // setValue keeps the component's clear button and listbox in sync; writing
      // input.value directly would leave a stale clear control behind.
      if (searchController) {
        searchController.setValue("");
      } else {
        searchInput.value = "";
      }
    }

    for (const select of filterSelects) {
      select.value = "all";
    }

    for (const filter of asArray(settings.filters).filter(isRecord)) {
      const filterId = asText(filter.id);
      state.filters[filterId] = asText(filter.type) === "range" ? { min: null, max: null } : "";
    }

    for (const range of filterRanges) {
      range.control.reset();
    }

    if (sortSelect) {
      sortSelect.value = state.sort;
    }

    visibleLimit = pageSize || source.length;
    render();
  }

  /** Redraws the list, the count and the paging control from scratch. */
  function render() {
    if (destroyed) {
      return;
    }

    const selected = selectRecords();
    const page = pageSize > 0 ? selected.slice(0, visibleLimit) : selected;

    listHost.replaceChildren();

    if (selected.length === 0) {
      renderEmpty(listHost, {
        title: asText(settings.empty?.title) || "Nothing matches",
        message: asText(settings.empty?.message) || "Clear the search or choose another filter."
      });

      const clear = el("button", {
        className: "button button--outline button--small",
        text: "Clear search and filters",
        attrs: { type: "button" }
      });
      clear.addEventListener("click", reset);
      listHost.append(clear);
    } else {
      const rendered =
        typeof settings.renderList === "function" ? settings.renderList(page) : null;

      if (Array.isArray(rendered)) {
        listHost.append(...rendered.filter((node) => node instanceof Node));
      } else if (rendered instanceof Node) {
        listHost.append(rendered);
      }
    }

    const total = selected.length;
    const shown = page.length;
    const label =
      typeof settings.countLabel === "function"
        ? settings.countLabel(total, source.length)
        : total === 1
          ? "1 result"
          : `${total} results`;

    status.textContent = pageSize > 0 && total > shown ? `${label} \u00b7 showing ${shown}` : label;

    moreHost.replaceChildren();

    if (pageSize > 0 && total > shown) {
      const remaining = total - shown;
      const more = el("button", {
        className: "button button--outline collection-more__button",
        text:
          remaining === 1
            ? "Load one more"
            : `Load ${Math.min(pageSize, remaining)} more`,
        attrs: { type: "button" }
      });

      more.addEventListener("click", () => {
        visibleLimit += pageSize;
        render();
      });

      moreHost.append(more);
    }
  }

  /**
   * Replaces the record set (JSON Manager re-import, GitHub importer output) and
   * redraws. The state is kept so a refresh does not silently clear a query.
   *
   * @param {Array<Object>} [records]
   */
  function refresh(records) {
    if (Array.isArray(records)) {
      source = records.filter(isRecord);
      visibleLimit = pageSize || source.length;
    }

    render();
  }

  render();

  return {
    refresh,
    destroy() {
      destroyed = true;

      for (const cleanup of cleanups) {
        cleanup();
      }

      mount.replaceChildren();
    },
    getState() {
      const filters = {};

      for (const [id, value] of Object.entries(state.filters)) {
        filters[id] = value !== null && typeof value === "object" ? { ...value } : value;
      }

      return {
        query: state.query,
        filters,
        sort: state.sort,
        visible: pageSize > 0 ? visibleLimit : selectRecords().length,
        total: selectRecords().length
      };
    },
    setPageSize(size) {
      visibleLimit = Number.isFinite(size) && size > 0 ? Math.floor(size) : source.length;
      render();
    }
  };
}
