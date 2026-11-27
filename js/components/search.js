/**
 * js/components/search.js - the shared search field: input, clear control,
 * loading state, status line and the debounced callback.
 *
 * Owns:
 *  - the field markup described in Prompt/components/SEARCH_COMPONENT.md § 7
 *    (label, decorative icon, input[type=search], clear button, status line),
 *    built with DOM calls so no markup string ever reaches the page;
 *  - clear-button visibility, focus return after clearing, Escape/Enter
 *    handling, the debounce timer and the optional loading/status presentation;
 *  - delivering the raw query to the consumer through onInput/onSubmit/onClear.
 *
 * Does not own:
 *  - matching, ranking, filtering or counting. Those live in
 *    js/core/search-engine.js (matchesQuery/normalizeText) and in each section's
 *    own logic. This module never decides whether a query matched anything, and
 *    it never invents a result count for the status line;
 *  - the suggestion data. The consumer supplies `getSuggestions(query)`, and this
 *    module owns the listbox, the combobox ARIA state, the keyboard model and the
 *    empty state (Prompt/components/SEARCH_COMPONENT.md § 12, § 14). Without
 *    `getSuggestions` no combobox role is added, so a plain field stays plain;
 *  - query persistence. Nothing is written to storage (§ 24); Global Search owns
 *    its own recent-query history under its own specification.
 *
 * Two ways to use it
 *  1. Pass an empty container: the component builds the whole field inside it.
 *  2. Pass existing markup that already contains input[type="search"]: the
 *     component enhances it (adds the missing label, clear button, listeners)
 *     instead of rebuilding it, so a section keeps its own structure.
 *
 * Event-bus note: emitting "search:query" is opt-in (options.emitQuery). A
 * section-level search box that emitted on every keystroke would drive the
 * Global Search feature with queries the visitor never typed into it, so the
 * callback is the default channel and the bus is reserved for Global Search.
 */

import { emit } from "../core/event-bus.js";

/** Field heights documented in SEARCH_COMPONENT.md § 10. */
const SEARCH_SIZES = new Set(["sm", "md", "lg"]);

/** Visual variants from SEARCH_COMPONENT.md § 5 / § 10. */
const SEARCH_VARIANTS = new Set(["standard", "outlined", "filled", "compact", "expanded"]);

/** Default debounce; long enough to skip a keystroke burst, short enough to feel live. */
const DEFAULT_DEBOUNCE_MS = 200;

/** Unique-id suffix for generated inputs. */
let fieldCounter = 0;

/**
 * One controller per container: initializing the same container twice returns
 * the existing controller, so listeners and timers are never duplicated.
 */
const controllers = new WeakMap();

/**
 * Trims a caller value without changing its case.
 *
 * This is deliberately *not* a matcher: use normalizeText/matchesQuery from
 * js/core/search-engine.js for comparison. Trimming only removes the leading and
 * trailing whitespace that a visitor cannot see.
 *
 * @param {unknown} value
 * @returns {string} The trimmed string, or "" for non-strings.
 */
export function normalizeSearchValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Builds the decorative magnifier icon.
 *
 * createElementNS instead of an innerHTML template: the project forbids markup
 * strings in JS, and an inline SVG keeps the icon themable through currentColor.
 *
 * @returns {HTMLSpanElement}
 */
function createSearchIcon() {
  const span = document.createElement("span");
  span.className = "search__icon";
  span.setAttribute("aria-hidden", "true");

  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("focusable", "false");

  const ring = document.createElementNS(svgNamespace, "circle");
  ring.setAttribute("cx", "8.5");
  ring.setAttribute("cy", "8.5");
  ring.setAttribute("r", "5.5");
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke", "currentColor");
  ring.setAttribute("stroke-width", "1.8");

  const handle = document.createElementNS(svgNamespace, "line");
  handle.setAttribute("x1", "12.7");
  handle.setAttribute("y1", "12.7");
  handle.setAttribute("x2", "16.5");
  handle.setAttribute("y2", "16.5");
  handle.setAttribute("stroke", "currentColor");
  handle.setAttribute("stroke-width", "1.8");
  handle.setAttribute("stroke-linecap", "round");

  svg.append(ring, handle);
  span.append(svg);

  return span;
}

/**
 * Resolves the mount container passed by a caller.
 *
 * Strings are treated as element ids (getElementById, never a selector built
 * from the string) so a configuration value cannot be turned into CSS syntax.
 *
 * @param {Element|string|null|undefined} container
 * @returns {Element|null}
 */
function resolveContainer(container) {
  if (typeof Element !== "undefined" && container instanceof Element) {
    return container;
  }

  if (typeof container === "string" && typeof document !== "undefined") {
    return document.getElementById(container);
  }

  return null;
}

/**
 * Wires up (or builds) one search field.
 *
 * @param {Element|string} container - Empty element to build into, or existing
 *   markup containing input[type="search"].
 * @param {Object} [options]
 * @param {string} [options.label] - Accessible label; defaults to the placeholder
 *   text and finally to "Search".
 * @param {string} [options.placeholder="Search..."]
 * @param {"sm"|"md"|"lg"} [options.size="md"]
 * @param {"standard"|"outlined"|"filled"|"compact"|"expanded"} [options.variant]
 * @param {boolean} [options.labelVisible=false] - Show the label above the field
 *   instead of only to screen readers.
 * @param {number} [options.debounceMs=200]
 * @param {number} [options.minQueryLength=1] - Shorter non-empty queries are held
 *   back until the visitor types another character.
 * @param {boolean} [options.showClearButton=true]
 * @param {boolean} [options.clearOnEscape=false] - Off by default: Escape must not
 *   throw away a query the visitor is still editing.
 * @param {boolean} [options.emitQuery=false] - Also emit "search:query" on the bus.
 * @param {string} [options.source] - Source tag carried by that event.
 * @param {(value: string, detail: Object) => void} [options.onInput] - Debounced
 *   query, also called on clear with "".
 * @param {(value: string, detail: Object) => void} [options.onSubmit] - Enter or
 *   form submission.
 * @param {(value: string) => void} [options.onClear]
 * @param {() => void} [options.onEscape]
 * @param {(query: string, detail: Object) => Array<string|{label: string, value?: string}>} [options.getSuggestions]
 *   Consumer-owned suggestion source. Called on every keystroke; returning an
 *   empty array closes the list. This is the only way suggestions appear.
 * @param {(suggestion: {label: string, value: string}, detail: Object) => void} [options.onSuggestionSelect]
 * @param {string} [options.suggestionsLabel="Suggestions"] - Group label above
 *   the list; it is part of the listbox's accessible name.
 * @param {number} [options.maxSuggestions=8]
 * @param {number} [options.minSuggestionLength=1]
 * @param {boolean} [options.suggestOnEmpty=false]
 * @param {string} [options.emptySuggestionText] - Optional quiet message when the
 *   source returns nothing for a real query.
 * @returns {Object|null} Controller, or null when the container is missing.
 */
export function initializeSearch(container, options = {}) {
  if (typeof document === "undefined") {
    return null;
  }

  const root = resolveContainer(container);

  if (!root) {
    console.error("initializeSearch(): container not found; the field was not created.");
    return null;
  }

  const existingController = controllers.get(root);

  if (existingController) {
    return existingController;
  }

  // ---------------------------------------------------------------------------
  // 1. Locate or build the markup
  // ---------------------------------------------------------------------------
  let input = root.querySelector("input[type='search'], input.search__input");
  const builtFromScratch = !(input instanceof HTMLInputElement);
  let form = null;
  let searchElement;

  /** Nodes this module created, removed again on destroy(). */
  const ownedNodes = [];

  if (builtFromScratch) {
    form = document.createElement("form");
    form.className = "search";
    form.setAttribute("role", "search");

    const field = document.createElement("div");
    field.className = "search__field";

    input = document.createElement("input");
    input.type = "search";
    input.className = "search__input";
    input.name = "query";
    input.autocomplete = "off";
    input.placeholder = typeof options.placeholder === "string" ? options.placeholder : "Search...";

    field.append(createSearchIcon(), input);
    // The label is inserted by the shared block below (before the field), so
    // both the built and the enhanced path share one label code path.
    form.append(field);
    root.append(form);
    searchElement = form;
    ownedNodes.push(form);
  } else {
    // Existing markup: style the closest .search wrapper, or the container.
    searchElement = input.closest(".search") ?? root;
    form = input.closest("form");
  }

  if (!searchElement.classList.contains("search")) {
    searchElement.classList.add("search");
  }

  // A stable id is required for the label/input association and for the
  // aria-controls-free status line. Generated once and reused by setStatus().
  if (!input.id) {
    input.id = `search-input-${++fieldCounter}`;
  }

  // ---------------------------------------------------------------------------
  // 2. Accessible label
  // ---------------------------------------------------------------------------
  const labelText =
    normalizeSearchValue(options.label) ||
    normalizeSearchValue(input.placeholder) ||
    "Search";

  let labelElement = [...root.querySelectorAll("label")].find(
    (candidate) => candidate.htmlFor === input.id
  );

  if (!labelElement) {
    labelElement = document.createElement("label");
    labelElement.className = "search__label";
    labelElement.htmlFor = input.id;
    labelElement.textContent = labelText;
    ownedNodes.push(labelElement);

    (input.closest(".search__field") ?? input).before(labelElement);
  } else if (!labelElement.textContent.trim()) {
    labelElement.textContent = labelText;
  }

  // A visible label is opt-in; otherwise the label stays in the accessibility
  // tree and the placeholder is only a hint, never the label.
  if (options.labelVisible === true) {
    searchElement.classList.add("search--labelled");
    labelElement.classList.remove("visually-hidden");
    labelElement.classList.add("search__label--visible");
  } else {
    labelElement.classList.add("visually-hidden");
    labelElement.classList.remove("search__label--visible");
  }

  // ---------------------------------------------------------------------------
  // 3. Clear button
  // ---------------------------------------------------------------------------
  let clearButton = root.querySelector(".search__clear, [data-search-clear]");

  if (!clearButton && options.showClearButton !== false) {
    clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "search__clear";
    clearButton.setAttribute("aria-label", "Clear search");

    const glyph = document.createElement("span");
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = "\u00D7";
    clearButton.append(glyph);

    (input.closest(".search__field") ?? input).append(clearButton);
    ownedNodes.push(clearButton);
  }

  if (clearButton instanceof HTMLElement) {
    clearButton.hidden = input.value.length === 0;
  }

  // ---------------------------------------------------------------------------
  // 4. Size and variant classes (layout stays in css/components/search.css)
  // ---------------------------------------------------------------------------
  const requestedSize = normalizeSearchValue(options.size);
  if (SEARCH_SIZES.has(requestedSize)) {
    searchElement.classList.add(`search--${requestedSize}`);
  }

  const requestedVariant = normalizeSearchValue(options.variant);
  if (SEARCH_VARIANTS.has(requestedVariant) && requestedVariant !== "standard") {
    // "standard" is the base look, so it needs no modifier class.
    searchElement.classList.add(`search--${requestedVariant}`);
  }

  // ---------------------------------------------------------------------------
  // 5. Behaviour
  // ---------------------------------------------------------------------------
  const debounceMs = Number.isFinite(options.debounceMs)
    ? Math.max(0, Number(options.debounceMs))
    : DEFAULT_DEBOUNCE_MS;

  const minQueryLength =
    Number.isInteger(options.minQueryLength) && options.minQueryLength > 0
      ? options.minQueryLength
      : 1;

  const source = normalizeSearchValue(options.source) || searchElement.id || "";

  // AbortController rather than bookkeeping each listener by hand: destroy()
  // aborts in one call, which is the one thing that guarantees no duplicate
  // handler survives a re-initialization.
  const listeners = new AbortController();
  const { signal } = listeners;

  let pendingTimer = 0;
  let loadingElement = null;
  let statusElement = null;

  // ---------------------------------------------------------------------------
  // 5b. Suggestions / autocomplete
  // ---------------------------------------------------------------------------
  const suggestionSource =
    typeof options.getSuggestions === "function" ? options.getSuggestions : null;
  const maxSuggestions =
    Number.isInteger(options.maxSuggestions) && options.maxSuggestions > 0
      ? options.maxSuggestions
      : 8;
  const minSuggestionLength =
    Number.isInteger(options.minSuggestionLength) && options.minSuggestionLength > 0
      ? options.minSuggestionLength
      : 1;

  /** Root of the listbox, built only when the consumer supplies a source. */
  let suggestionsElement = null;
  let suggestionsList = null;
  let suggestionsEmpty = null;
  let suggestionItems = [];
  let activeSuggestion = -1;
  let suggestionsAttributesAdded = false;

  /**
   * Normalises one consumer suggestion.
   *
   * @param {unknown} entry
   * @returns {{label: string, value: string}|null}
   */
  function normalizeSuggestion(entry) {
    if (typeof entry === "string") {
      const label = entry.trim();
      return label ? { label, value: label } : null;
    }

    if (!entry || typeof entry !== "object") {
      return null;
    }

    const label = normalizeSearchValue(entry.label);

    if (!label) {
      return null;
    }

    return { label, value: normalizeSearchValue(entry.value) || label };
  }

  /** Builds the listbox shell once, then reuses it. */
  function ensureSuggestionsElement() {
    if (suggestionsElement || !suggestionSource) {
      return;
    }

    const listId = `${input.id}-suggestions`;

    suggestionsElement = document.createElement("div");
    suggestionsElement.className = "search__suggestions";
    suggestionsElement.hidden = true;

    const groupLabel = document.createElement("p");
    groupLabel.className = "search__suggestions-label";
    groupLabel.id = `${listId}-label`;
    groupLabel.textContent = normalizeSearchValue(options.suggestionsLabel) || "Suggestions";

    suggestionsList = document.createElement("ul");
    suggestionsList.className = "search__suggestions-list";
    suggestionsList.id = listId;
    suggestionsList.setAttribute("role", "listbox");
    suggestionsList.setAttribute("aria-labelledby", groupLabel.id);

    suggestionsEmpty = document.createElement("p");
    suggestionsEmpty.className = "search__suggestions-empty";
    suggestionsEmpty.hidden = true;

    suggestionsElement.append(groupLabel, suggestionsList, suggestionsEmpty);
    searchElement.append(suggestionsElement);
    ownedNodes.push(suggestionsElement);

    // Combobox semantics exist only while a suggestion source is configured, so a
    // plain search field is not announced as a combobox with an empty popup.
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", listId);
    input.setAttribute("aria-haspopup", "listbox");
    suggestionsAttributesAdded = true;
  }

  /** Marks one suggestion active, wrapping at both ends. */
  function setActiveSuggestion(index) {
    if (suggestionItems.length === 0) {
      activeSuggestion = -1;
      input.removeAttribute("aria-activedescendant");
      return;
    }

    activeSuggestion = (index + suggestionItems.length) % suggestionItems.length;

    suggestionItems.forEach((item, position) => {
      const isActive = position === activeSuggestion;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", String(isActive));
    });

    const active = suggestionItems[activeSuggestion];
    input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  }

  /** Hides the list and clears the combobox state. */
  function closeSuggestions() {
    if (!suggestionsElement) {
      return;
    }

    suggestionsElement.hidden = true;
    suggestionsList.replaceChildren();
    suggestionsEmpty.hidden = true;
    suggestionItems = [];
    activeSuggestion = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  /**
   * Flips the list above the field when it would fall below the viewport.
   *
   * A search box near the bottom of a short window is normal; a listbox that opens
   * downward there is unreachable. The class is re-evaluated on every render and on
   * resize, never cached.
   */
  function positionSuggestions() {
    if (!suggestionsElement || suggestionsElement.hidden) {
      return;
    }

    suggestionsElement.classList.remove("search__suggestions--above");
    const box = suggestionsElement.getBoundingClientRect();

    if (box.bottom > window.innerHeight && box.top > box.height) {
      suggestionsElement.classList.add("search__suggestions--above");
    }
  }

  /**
   * Rebuilds the list for the current query.
   *
   * @param {{activateFirst?: boolean}} [renderOptions]
   */
  function renderSuggestions(renderOptions = {}) {
    if (!suggestionSource) {
      return;
    }

    ensureSuggestionsElement();

    const query = input.value.trim();
    const suggestionsAllowed = options.suggestOnEmpty === true || query.length >= minSuggestionLength;
    let normalized = [];

    if (suggestionsAllowed) {
      try {
        normalized = (suggestionSource(input.value, { source }) || [])
          .map(normalizeSuggestion)
          .filter(Boolean)
          .slice(0, maxSuggestions);
      } catch (error) {
        console.error("Search getSuggestions callback failed:", error);
        normalized = [];
      }
    }

    suggestionsList.replaceChildren();
    suggestionItems = [];
    activeSuggestion = -1;

    if (normalized.length === 0) {
      const emptyText = normalizeSearchValue(options.emptySuggestionText);
      suggestionsList.hidden = true;
      suggestionsEmpty.hidden = !emptyText || !suggestionsAllowed;
      suggestionsEmpty.textContent = emptyText;
      suggestionsElement.hidden = !emptyText || !suggestionsAllowed;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      return;
    }

    suggestionsEmpty.hidden = true;
    suggestionsList.hidden = false;

    normalized.forEach((suggestion, index) => {
      const item = document.createElement("li");
      item.className = "search__suggestion";
      item.id = `${suggestionsList.id}-option-${index}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      item.textContent = suggestion.label;

      // pointerdown + preventDefault keeps focus in the input, so the blur handler
      // cannot close the list before the click lands.
      item.addEventListener("pointerdown", (event) => event.preventDefault(), { signal });
      item.addEventListener("click", () => selectSuggestion(index), { signal });

      suggestionsList.append(item);
      suggestionItems.push(item);
    });

    suggestionsElement.hidden = false;
    input.setAttribute("aria-expanded", "true");
    positionSuggestions();

    if (renderOptions.activateFirst === true) {
      setActiveSuggestion(0);
    }
  }

  /**
   * Applies one suggestion to the field and tells the consumer.
   *
   * @param {number} index
   */
  function selectSuggestion(index) {
    const item = suggestionItems[index];

    if (!item) {
      return;
    }

    const label = item.textContent || "";
    input.value = label;
    syncClearButton();
    closeSuggestions();
    deliver("suggestion");

    if (typeof options.onSuggestionSelect === "function") {
      try {
        options.onSuggestionSelect({ label, value: label }, { source, reason: "suggestion" });
      } catch (error) {
        console.error("Search onSuggestionSelect callback failed:", error);
      }
    }

    input.focus();
  }

  /**
   * Delivers the current value to the consumer.
   *
   * @param {"typing"|"submit"|"clear"|"set"} reason
   */
  function deliver(reason) {
    const value = input.value;

    const detail = {
      query: value,
      trimmedQuery: value.trim(),
      reason,
      source
    };

    if (typeof options.onInput === "function") {
      try {
        options.onInput(value, detail);
      } catch (error) {
        // A consumer error must not break typing in the field.
        console.error("Search onInput callback failed:", error);
      }
    }

    if (options.emitQuery === true) {
      emit("search:query", detail);
    }
  }

  /**
   * True when a query is long enough to hand to the consumer.
   *
   * An empty query is always delivered: that is how a cleared field tells the
   * consumer to show its full list again.
   *
   * @param {string} trimmed
   * @returns {boolean}
   */
  function isDeliverable(trimmed) {
    return trimmed.length === 0 || trimmed.length >= minQueryLength;
  }

  /** Restarts the debounce timer for the current value. */
  function scheduleDelivery() {
    window.clearTimeout(pendingTimer);

    // A zero debounce means "deliver now": a consumer that wants instant filtering
    // (the section toolbars) should not wait a macrotask for every keystroke.
    if (debounceMs === 0) {
      pendingTimer = 0;

      if (isDeliverable(input.value.trim())) {
        deliver("typing");
      }

      return;
    }

    pendingTimer = window.setTimeout(() => {
      pendingTimer = 0;

      if (isDeliverable(input.value.trim())) {
        deliver("typing");
      }
    }, debounceMs);
  }

  /** Cancels the pending debounce and delivers immediately. */
  function flushDelivery(reason) {
    if (pendingTimer) {
      window.clearTimeout(pendingTimer);
      pendingTimer = 0;
    }

    if (isDeliverable(input.value.trim())) {
      deliver(reason);
    }
  }

  /** Keeps the clear control in sync with the input value. */
  function syncClearButton() {
    if (clearButton instanceof HTMLElement) {
      clearButton.hidden = input.value.length === 0;
    }
  }

  const handleInput = () => {
    syncClearButton();
    // Suggestions are not debounced: the consumer's source is an in-memory array
    // and a delayed list feels broken while typing. Only the query delivery waits.
    renderSuggestions();
    scheduleDelivery();
  };

  // "search" fires when the browser's own clear affordance is used; handling it
  // keeps the callback in sync on engines that do that instead of "input".
  input.addEventListener("input", handleInput, { signal });
  input.addEventListener("search", handleInput, { signal });

  input.addEventListener(
    "keydown",
    (event) => {
      const listOpen = Boolean(suggestionsElement && !suggestionsElement.hidden);

      if (event.key === "ArrowDown" && suggestionSource) {
        event.preventDefault();

        if (listOpen && suggestionItems.length > 0) {
          setActiveSuggestion(activeSuggestion + 1);
        } else {
          renderSuggestions({ activateFirst: true });
        }

        return;
      }

      if (event.key === "ArrowUp" && listOpen && suggestionItems.length > 0) {
        event.preventDefault();
        setActiveSuggestion(activeSuggestion <= 0 ? suggestionItems.length - 1 : activeSuggestion - 1);
        return;
      }

      if (event.key === "Enter" && listOpen && activeSuggestion >= 0) {
        // Enter activates the highlighted suggestion; with nothing highlighted it
        // still submits the typed query, which is what the field promises.
        event.preventDefault();
        selectSuggestion(activeSuggestion);
        return;
      }

      if (event.key === "Escape" && listOpen) {
        // First Escape only closes the list: the query the visitor typed stays.
        event.preventDefault();
        closeSuggestions();
        return;
      }

      if (event.key === "Tab") {
        closeSuggestions();
      }

      if (event.key === "Enter") {
        // Enter inside a form would reload the page; the query is submitted
        // through the consumer callback instead.
        event.preventDefault();
        closeSuggestions();
        flushDelivery("submit");

        if (typeof options.onSubmit === "function") {
          try {
            options.onSubmit(input.value, { source, reason: "submit" });
          } catch (error) {
            console.error("Search onSubmit callback failed:", error);
          }
        }

        return;
      }

      if (event.key === "Escape") {
        if (pendingTimer) {
          window.clearTimeout(pendingTimer);
          pendingTimer = 0;
        }

        if (typeof options.onEscape === "function") {
          try {
            options.onEscape();
          } catch (error) {
            console.error("Search onEscape callback failed:", error);
          }
        }

        if (options.clearOnEscape === true) {
          clearValue({ notify: true, focus: true });
        }
      }
    },
    { signal }
  );

  // A click elsewhere must not leave a stale listbox floating over the page. A
  // short delay lets a suggestion's pointerdown/click finish first.
  window.addEventListener("resize", positionSuggestions, { signal });

  input.addEventListener(
    "blur",
    () => {
      window.setTimeout(() => closeSuggestions(), 120);
    },
    { signal }
  );

  if (form) {
    form.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        flushDelivery("submit");

        if (typeof options.onSubmit === "function") {
          try {
            options.onSubmit(input.value, { source, reason: "submit" });
          } catch (error) {
            console.error("Search onSubmit callback failed:", error);
          }
        }
      },
      { signal }
    );
  }

  if (clearButton instanceof HTMLElement) {
    clearButton.addEventListener(
      "click",
      () => {
        clearValue({ notify: true, focus: true });
      },
      { signal }
    );
  }

  /**
   * Empties the input and tells the consumer, unless told not to.
   *
   * @param {Object} [clearOptions]
   * @param {boolean} [clearOptions.notify=true]
   * @param {boolean} [clearOptions.focus=true]
   * @returns {boolean} True when there was something to clear.
   */
  function clearValue(clearOptions = {}) {
    const { notify = true, focus = true } = clearOptions;

    if (pendingTimer) {
      window.clearTimeout(pendingTimer);
      pendingTimer = 0;
    }

    const hadValue = input.value !== "";
    input.value = "";
    syncClearButton();
    closeSuggestions();

    if (options.suggestOnEmpty === true) {
      renderSuggestions();
    }

    if (focus) {
      input.focus();
    }

    if (notify) {
      if (typeof options.onClear === "function") {
        try {
          options.onClear("");
        } catch (error) {
          console.error("Search onClear callback failed:", error);
        }
      }

      // One delivery path only: onClear reports the intent, deliver() resets the
      // consumer's result list. The dispatched "input" event of some examples is
      // deliberately not used, because it would call onInput a second time.
      deliver("clear");
    }

    return hadValue;
  }

  /**
   * Shows or hides the loading indicator.
   *
   * @param {boolean} loading
   */
  function setLoading(loading) {
    const active = Boolean(loading);

    searchElement.classList.toggle("search--loading", active);
    input.setAttribute("aria-busy", active ? "true" : "false");

    if (active && !loadingElement) {
      loadingElement = document.createElement("span");
      loadingElement.className = "search__loading";
      loadingElement.setAttribute("aria-hidden", "true");
      (input.closest(".search__field") ?? input).append(loadingElement);
      ownedNodes.push(loadingElement);
    }

    if (loadingElement) {
      loadingElement.hidden = !active;
    }
  }

  /**
   * Writes the consumer-provided result/empty/error message.
   *
   * The text is never generated here: the component has no idea how many items
   * matched, and a made-up count would be a false claim (§ 17).
   *
   * @param {string|null} text - Empty/null clears and hides the line.
   * @param {"neutral"|"error"} [tone="neutral"]
   */
  function setStatus(text, tone = "neutral") {
    const message = normalizeSearchValue(text);

    if (!message) {
      if (statusElement) {
        statusElement.textContent = "";
        statusElement.hidden = true;
      }

      return;
    }

    if (!statusElement) {
      statusElement = document.createElement("p");
      statusElement.className = "search__status";
      statusElement.setAttribute("role", "status");
      statusElement.setAttribute("aria-live", "polite");
      searchElement.append(statusElement);
      ownedNodes.push(statusElement);
    }

    statusElement.textContent = message;
    statusElement.classList.toggle("search__status--error", tone === "error");
    statusElement.hidden = false;
  }

  const controller = {
    /** @returns {string} The raw input value. */
    getValue: () => input.value,

    /**
     * @param {unknown} value
     * @param {{notify?: boolean}} [setOptions]
     */
    setValue(value, setOptions = {}) {
      input.value = value === null || typeof value === "undefined" ? "" : String(value);
      syncClearButton();
      closeSuggestions();

      if (setOptions.notify === true) {
        flushDelivery("set");
      }
    },

    /** @param {{notify?: boolean, focus?: boolean}} [clearOptions] */
    clear: (clearOptions = {}) => clearValue(clearOptions),

    /** @param {boolean} loading */
    setLoading,

    /** @param {string|null} text @param {"neutral"|"error"} [tone] */
    setStatus,

    closeSuggestions,

    /** @returns {boolean} True while the suggestion list is visible. */
    isSuggestionsOpen: () => Boolean(suggestionsElement && !suggestionsElement.hidden),

    /** Recomputes the list for the current value, e.g. after records change. */
    refreshSuggestions: () => renderSuggestions(),

    focus: () => input.focus(),

    /** Input and wrapper, for a consumer that needs to measure or label them. */
    input,
    element: searchElement,

    destroy() {
      listeners.abort();
      window.clearTimeout(pendingTimer);
      pendingTimer = 0;

      for (const node of ownedNodes) {
        node.remove();
      }

      if (suggestionsAttributesAdded) {
        for (const attribute of ["role", "aria-autocomplete", "aria-expanded", "aria-controls", "aria-haspopup", "aria-activedescendant"]) {
          input.removeAttribute(attribute);
        }
      }

      searchElement.classList.remove(
        "search--loading",
        "search--labelled",
        ...[...SEARCH_SIZES].map((size) => `search--${size}`),
        ...[...SEARCH_VARIANTS].map((variant) => `search--${variant}`)
      );

      controllers.delete(root);
    }
  };

  // Initial state: no query, so no clear control and no status line.
  syncClearButton();
  controllers.set(root, controller);

  return controller;
}
