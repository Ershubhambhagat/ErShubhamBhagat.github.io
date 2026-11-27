/**
 * js/core/section-kit.js - the small shared vocabulary the section modules use.
 *
 * Why this file exists: eleven sections need the same six things - a heading, a
 * consistent mount, a date format, a safe link, a tag list and an empty state.
 * Copying those into each section would make a date-format change an eleven-file
 * edit, and would let one section quietly accept a javascript: URL that the
 * others reject. This module is the single implementation; sections keep their
 * own data handling and layout.
 *
 * Dependency direction: core -> components. Nothing here imports a section, so
 * there is no cycle, and a section that fails to load cannot break this module.
 *
 * Security: every string that comes from data/*.json is written with
 * textContent. Links pass through toSafeHref (js/components/button.js) - the
 * same allow-list the button and card components use - so "javascript:" and
 * "data:" URLs become inert text instead of navigable links.
 *
 * DOM-free import: this module has no top-level DOM access. A section module can
 * therefore be imported in Node (tests, the module contract check) without a
 * document; every function that needs the DOM guards for it and returns null.
 */

import { toSafeHref, isExternalHref } from "../components/button.js";
import { createBadge } from "../components/badge.js";
import { applySort } from "./sort-engine.js";

/**
 * Month abbreviations. Deliberately not Intl.DateTimeFormat: the site is
 * English-only and a fixed table renders identically in every browser and in
 * Node, which keeps the format predictable for tests.
 */
const MONTHS = Object.freeze([
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
]);

/**
 * Icon path data, 24x24 viewBox, stroke-based.
 *
 * Inline SVG instead of an icon font: no extra request, the stroke inherits
 * currentColor (so themes work), and a missing name is simply not rendered
 * rather than showing a tofu box.
 */
const ICONS = Object.freeze({
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  pin: "M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  palette: "M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.5-1.5-1.5-1.5-3 0-1 .8-1.8 2-1.8H17a4 4 0 0 0 4-4c0-4-4-7.2-9-7.2zM7.5 9.5h.01M10.5 6.5h.01M14.5 6.5h.01M17.5 9.5h.01",
  database: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  close: "M6 6l12 12M18 6L6 18",
  arrow: "M5 12h14M13 6l6 6-6 6",
  download: "M12 3v12M7 11l5 5 5-5M5 21h14",
  print: "M7 8V3h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v7H7z",
  check: "M20 6L9 17l-5-5",
  copy: "M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
});

/**
 * @param {unknown} value
 * @returns {boolean} True for a plain non-array object.
 */
export function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {Array} The value when it is an array, otherwise an empty array.
 */
export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @param {unknown} value
 * @returns {string} Trimmed string, or "" for anything that is not a string.
 */
export function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {unknown} value
 * @returns {number|null} Finite number or null; JSON numbers only.
 */
export function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Reads the record array out of a dataset.
 *
 * Accepts either {schemaVersion, projects:[...]} or a bare array, because the
 * JSON Manager imports owner-edited files and a bare array is the shape people
 * write by hand. Anything else yields [].
 *
 * @param {unknown} dataset
 * @param {string} key - Dataset-specific array name, e.g. "projects".
 * @returns {Array<Object>}
 */
export function readCollection(dataset, key) {
  if (Array.isArray(dataset)) {
    return dataset.filter(isRecord);
  }

  if (!isRecord(dataset)) {
    return [];
  }

  return asArray(dataset[key]).filter(isRecord);
}

/**
 * @param {unknown} dataset
 * @returns {Object} The dataset's `section` block, or an empty object.
 */
export function readSectionConfig(dataset) {
  return isRecord(dataset) && isRecord(dataset.section) ? dataset.section : {};
}

/**
 * Resolves a section mount by id.
 *
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function getSectionElement(id) {
  if (typeof document === "undefined") {
    return null;
  }

  const element = document.getElementById(id);
  return element instanceof HTMLElement ? element : null;
}

/**
 * Clears a section and builds its standard heading block.
 *
 * The h2 is created here rather than in index.html because the heading text is
 * data (dataset `section.title`), and because a section that fails to render
 * must not leave a heading promising content that is not there.
 *
 * @param {string} id - Section id, also used for the heading's DOM id.
 * @param {Object} [options]
 * @param {string} [options.title]
 * @param {string} [options.intro]
 * @param {string} [options.eyebrow]
 * @returns {{section: HTMLElement, header: HTMLElement|null, body: HTMLElement}|null}
 */
export function prepareSection(id, options = {}) {
  const section = getSectionElement(id);

  if (!section) {
    return null;
  }

  section.replaceChildren();
  section.classList.add("section");

  // One container per section: #main-content > section owns the vertical rhythm
  // (css/main.css), the container owns the readable line length. Without it a
  // section on a 2560px screen would run edge to edge.
  const wrapper = document.createElement("div");
  wrapper.className = "container section__inner";

  const title = asText(options.title);
  const intro = asText(options.intro);
  const eyebrow = asText(options.eyebrow);
  let header = null;

  if (title || intro || eyebrow) {
    header = document.createElement("div");
    header.className = "section__header";

    if (eyebrow) {
      const eyebrowNode = document.createElement("p");
      eyebrowNode.className = "section__eyebrow";
      eyebrowNode.textContent = eyebrow;
      header.append(eyebrowNode);
    }

    const heading = title ? document.createElement("h2") : null;

    if (heading) {
      heading.className = "section__title";
      heading.id = `${id}-title`;
      heading.textContent = title;
      header.append(heading);
      section.setAttribute("aria-labelledby", heading.id);
    }

    if (intro) {
      const introNode = document.createElement("p");
      introNode.className = "section__intro";
      introNode.textContent = intro;
      header.append(introNode);
    }

    wrapper.append(header);
  }

  const body = document.createElement("div");
  body.className = "section__body";
  wrapper.append(body);
  section.append(wrapper);

  return { section, header, body };
}

/**
 * Builds an element with text, class and attributes in one call.
 *
 * @param {string} tag
 * @param {Object} [options]
 * @param {string} [options.className]
 * @param {string} [options.text]
 * @param {Object<string, string>} [options.attrs]
 * @param {Array<Node>} [options.children]
 * @returns {HTMLElement}
 */
export function el(tag, options = {}) {
  const node = document.createElement(tag);

  if (options.className) {
    node.className = options.className;
  }

  if (typeof options.text === "string") {
    node.textContent = options.text;
  }

  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value !== null && value !== undefined && value !== "") {
      node.setAttribute(name, String(value));
    }
  }

  if (Array.isArray(options.children)) {
    node.append(...options.children.filter((child) => child instanceof Node));
  }

  return node;
}

/**
 * Creates an inline SVG icon.
 *
 * @param {string} name - Key in ICONS.
 * @returns {SVGElement|null}
 */
export function createIcon(name) {
  const path = ICONS[name];

  if (!path || typeof document === "undefined") {
    return null;
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const pathNode = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathNode.setAttribute("d", path);
  svg.append(pathNode);

  return svg;
}

/**
 * Creates a validated link.
 *
 * @param {Object} options
 * @param {string} options.href
 * @param {string} options.label
 * @param {string} [options.className]
 * @param {string} [options.ariaLabel]
 * @param {Node|null} [options.icon]
 * @returns {HTMLAnchorElement|null} null when the href fails the allow-list.
 */
export function createLink({ href, label, className, ariaLabel, icon } = {}) {
  const safeHref = toSafeHref(href);
  const text = asText(label);

  if (!safeHref || !text || typeof document === "undefined") {
    return null;
  }

  const anchor = document.createElement("a");
  anchor.href = safeHref;
  anchor.className = className || "link";

  if (ariaLabel) {
    anchor.setAttribute("aria-label", ariaLabel);
  }

  if (isExternalHref(safeHref)) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }

  if (icon) {
    const slot = document.createElement("span");
    slot.className = "link__icon";
    slot.setAttribute("aria-hidden", "true");
    slot.append(icon);
    anchor.append(slot);
  }

  const textNode = document.createElement("span");
  textNode.className = "link__label";
  textNode.textContent = text;
  anchor.append(textNode);

  return anchor;
}

/**
 * Parses a partial ISO date (YYYY, YYYY-MM or YYYY-MM-DD) as UTC.
 *
 * UTC matters: `new Date("2025-03-01")` is already UTC, but a two-part value
 * such as "2025-03" is parsed as local time by some engines, which can shift
 * the month by one for visitors west of Greenwich.
 *
 * @param {string} value
 * @returns {{year: number, month: number|null, day: number|null, time: number}|null}
 */
export function parseDate(value) {
  const text = asText(value);

  if (!text) {
    return null;
  }

  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(text);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : null;
  const day = match[3] ? Number(match[3]) : null;

  if (month !== null && (month < 1 || month > 12)) {
    return null;
  }

  if (day !== null && (day < 1 || day > 31)) {
    return null;
  }

  return {
    year,
    month,
    day,
    time: Date.UTC(year, (month ?? 1) - 1, day ?? 1)
  };
}

/**
 * Formats a partial ISO date for display.
 *
 * @param {string} value
 * @param {"short"|"long"|"year"} [style] - "short" = Mar 2025, "long" = 14 Mar
 *   2025, "year" = 2025.
 * @returns {string} Empty string when the value is not a date.
 */
export function formatDate(value, style = "short") {
  const parsed = parseDate(value);

  if (!parsed) {
    return "";
  }

  if (style === "year" || parsed.month === null) {
    return String(parsed.year);
  }

  const month = MONTHS[parsed.month - 1];

  if (style === "long" && parsed.day !== null) {
    return `${parsed.day} ${month} ${parsed.year}`;
  }

  return `${month} ${parsed.year}`;
}

/**
 * Formats a date range, collapsing whatever is missing.
 *
 * @param {string} start
 * @param {string} end
 * @param {boolean} [current] - When true and no end date, renders "Present".
 * @returns {string}
 */
export function formatDateRange(start, end, current = false) {
  const startText = formatDate(start);
  const endText = formatDate(end);

  if (startText && endText) {
    return `${startText} \u2013 ${endText}`;
  }

  if (startText) {
    return current || !endText ? `${startText} \u2013 Present` : startText;
  }

  return endText;
}

/**
 * Sorts records newest first by a date getter, leaving undated records last.
 *
 * Delegates to the core sort engine so sections never grow their own comparator.
 *
 * @param {Array<Object>} records
 * @param {(record: Object) => string} getDate
 * @returns {Array<Object>} New array.
 */
export function sortByDateDesc(records, getDate) {
  return applySort(asArray(records), "newest", {
    getDateValue: (record) => getDate(record) || null
  });
}

/**
 * Creates a group of outline badges.
 *
 * @param {Array<string>} labels
 * @param {Object} [options]
 * @param {string} [options.className]
 * @param {string} [options.label] - Accessible group name.
 * @returns {HTMLElement|null}
 */
export function createTagList(labels, options = {}) {
  const values = asArray(labels).map(asText).filter(Boolean);

  if (values.length === 0 || typeof document === "undefined") {
    return null;
  }

  const list = document.createElement("ul");
  list.className = options.className || "tag-list";

  if (options.label) {
    list.setAttribute("aria-label", options.label);
  }

  for (const value of values) {
    const item = document.createElement("li");
    item.append(createBadge({ label: value, variant: "outline", size: "small" }));
    list.append(item);
  }

  return list;
}

/**
 * Creates a definition list of label/value pairs, skipping empty values.
 *
 * @param {Array<{label: string, value: string}>} entries
 * @param {string} [className]
 * @returns {HTMLElement|null}
 */
export function createMetaList(entries, className = "meta-list") {
  const usable = asArray(entries).filter(
    (entry) => isRecord(entry) && asText(entry.label) && asText(entry.value)
  );

  if (usable.length === 0 || typeof document === "undefined") {
    return null;
  }

  const list = document.createElement("dl");
  list.className = className;

  for (const entry of usable) {
    const row = document.createElement("div");
    row.className = "meta-list__row";

    const term = document.createElement("dt");
    term.className = "meta-list__label";
    term.textContent = asText(entry.label);

    const detail = document.createElement("dd");
    detail.className = "meta-list__value";
    detail.textContent = asText(entry.value);

    row.append(term, detail);
    list.append(row);
  }

  return list;
}

/**
 * Accessible progress bar.
 *
 * @param {number} value - 0-100.
 * @param {string} label - Human description, also the accessible name.
 * @returns {HTMLElement|null}
 */
export function createProgress(value, label) {
  const amount = asNumber(value);

  if (amount === null || typeof document === "undefined") {
    return null;
  }

  const clamped = Math.max(0, Math.min(100, Math.round(amount)));
  const track = document.createElement("div");
  track.className = "progress";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(clamped));

  if (label) {
    track.setAttribute("aria-label", label);
  }

  const fill = document.createElement("div");
  fill.className = "progress__fill";
  fill.style.width = `${clamped}%`;
  track.append(fill);

  const caption = document.createElement("span");
  caption.className = "progress__caption";
  caption.setAttribute("aria-hidden", "true");
  caption.textContent = `${clamped}%`;
  track.append(caption);

  return track;
}

/**
 * Creates a vertical timeline list from ready timeline items.
 *
 * The <ol> carries the semantics (ordered by date), the items come from
 * js/components/timeline-item.js so every section's timeline has the same
 * marker, date and disclosure behaviour.
 *
 * @param {Array<Node>} items
 * @param {Object} [options]
 * @param {string} [options.label] - Accessible name for the list.
 * @param {string} [options.className]
 * @returns {HTMLElement|null}
 */
export function createTimeline(items, options = {}) {
  const usable = asArray(items).filter((item) => item instanceof Node);

  if (usable.length === 0 || typeof document === "undefined") {
    return null;
  }

  const list = document.createElement("ol");
  list.className = options.className || "timeline timeline--vertical";

  if (options.label) {
    list.setAttribute("aria-label", options.label);
  }

  list.append(...usable);
  return list;
}

/**
 * Renders the section's empty state.
 *
 * An empty dataset is a normal state, not an error: the message says what is
 * missing and the page keeps its shape. It is deliberately not styled as a
 * warning - there is nothing for the visitor to fix.
 *
 * @param {HTMLElement} container
 * @param {Object} [options]
 * @param {string} [options.title]
 * @param {string} [options.message]
 * @returns {HTMLElement|null}
 */
export function renderEmpty(container, options = {}) {
  if (!(container instanceof Element)) {
    return null;
  }

  const box = document.createElement("div");
  box.className = "empty-state";

  const title = document.createElement("p");
  title.className = "empty-state__title";
  title.textContent = asText(options.title) || "Nothing here yet";

  box.append(title);

  const message = asText(options.message);

  if (message) {
    const text = document.createElement("p");
    text.className = "empty-state__text";
    text.textContent = message;
    box.append(text);
  }

  container.append(box);
  return box;
}

/**
 * Shows one dismissible notice when a section contains example records.
 *
 * Why: several datasets have no verified content yet and ship with records
 * explicitly marked isSample. A visitor must be able to tell a layout sample
 * from a real claim, so the notice names the section and the count and stays
 * until dismissed. Dismissal is per page load on purpose - it is not a
 * preference, and storing it would hide the warning from the next visitor.
 *
 * @param {HTMLElement} container
 * @param {Array<Object>} records
 * @returns {HTMLElement|null}
 */
export function renderSampleNotice(container, records) {
  const samples = asArray(records).filter((record) => record && record.isSample === true);

  if (samples.length === 0 || !(container instanceof Element)) {
    return null;
  }

  const notice = document.createElement("div");
  notice.className = "sample-notice";
  notice.setAttribute("role", "note");

  const text = document.createElement("p");
  text.className = "sample-notice__text";
  text.textContent =
    samples.length === 1
      ? "One record in this section is an example, not a real entry."
      : `${samples.length} records in this section are examples, not real entries.`;
  notice.append(text);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "sample-notice__dismiss";
  dismiss.setAttribute("aria-label", "Dismiss the example-data notice");
  dismiss.append(document.createTextNode("Dismiss"));
  dismiss.addEventListener("click", () => notice.remove());
  notice.append(dismiss);

  container.prepend(notice);
  return notice;
}

/**
 * Returns the shared tools dock, creating it on first use.
 *
 * Why a document-level dock and not three buttons inside each feature mount:
 * #global-search-root, #theme-studio-root and #json-manager-root are siblings
 * of <main> with no shared chrome between them, so three independent fixed
 * buttons would overlap and their stacking order would depend on source order.
 * Each feature still renders its own panel inside its own mount; only the
 * launcher buttons share this container. The dock is removed again when its last
 * button is removed, and a feature switched off in APP_CONFIG never adds one.
 *
 * @returns {HTMLElement|null}
 */
export function ensureToolsDock() {
  if (typeof document === "undefined" || !document.body) {
    return null;
  }

  const existing = document.getElementById("tools-dock");

  if (existing) {
    return existing;
  }

  const dock = document.createElement("div");
  dock.id = "tools-dock";
  dock.className = "tools-dock";
  dock.setAttribute("role", "group");
  dock.setAttribute("aria-label", "Page tools");
  document.body.append(dock);

  return dock;
}

/**
 * Adds one launcher button to the tools dock.
 *
 * @param {Object} options
 * @param {string} options.id - Button id, so a feature can find its own button.
 * @param {string} options.label - Visible and accessible name.
 * @param {string} [options.icon] - Key in ICONS.
 * @param {() => void} options.onClick
 * @param {string} [options.shortcut] - Display hint such as "Ctrl K".
 * @returns {{button: HTMLButtonElement|null, remove: () => void}}
 */
export function addToolButton({ id, label, icon, onClick, shortcut } = {}) {
  const dock = ensureToolsDock();

  if (!dock || typeof onClick !== "function") {
    return { button: null, remove: () => {} };
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "tools-dock__button";
  button.id = id;

  const glyph = createIcon(icon);
  if (glyph) {
    button.append(glyph);
  }

  const text = document.createElement("span");
  text.className = "tools-dock__label";
  text.textContent = asText(label) || "Open";
  button.append(text);

  if (shortcut) {
    const hint = document.createElement("kbd");
    hint.className = "tools-dock__shortcut";
    hint.textContent = shortcut;
    button.append(hint);
  }

  button.addEventListener("click", onClick);
  dock.append(button);

  return {
    button,
    remove() {
      button.remove();

      if (dock.childElementCount === 0) {
        dock.remove();
      }
    }
  };
}

/**
 * Copies text to the clipboard with a fallback for non-secure contexts.
 *
 * The async Clipboard API only exists on https/localhost; a GitHub Pages site is
 * https, but a local file:// preview is not, so the fallback keeps the copy
 * button usable there instead of failing silently.
 *
 * @param {string} text
 * @returns {Promise<boolean>} True when the copy succeeded.
 */
export async function copyText(text) {
  const value = String(text ?? "");

  if (!value) {
    return false;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Permission denied or a non-secure context: fall through to the textarea.
  }

  if (typeof document === "undefined") {
    return false;
  }

  const helper = document.createElement("textarea");
  helper.value = value;
  helper.setAttribute("readonly", "");
  helper.className = "visually-hidden";
  document.body.append(helper);
  helper.select();

  let copied = false;

  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  helper.remove();
  return copied;
}
