/**
 * js/features/global-search.js - Ctrl/Cmd+K search across every dataset.
 *
 * Index: built once from appContext.data, not from the DOM. Reading the data
 * keeps the index independent of which sections happened to render (a section
 * that failed still has searchable records) and avoids scraping text out of
 * headings, which would pick up labels and button captions.
 *
 * Search: reuses js/core/search-engine.js (normalizeText + matchesQuery). The site
 * has one matching algorithm on purpose; a second implementation here would
 * disagree with the section-level filters at the edges (accents, multi-token
 * queries, nested values).
 *
 * Ranking: a title hit outranks a description hit, and an exact title match
 * outranks a prefix. Ties keep dataset order, so the result list is stable while
 * the visitor types. Results are grouped by section because that is how the page
 * is organised; the group heading is a label, not a result.
 *
 * Highlighting: matched tokens wrapped in <mark> inside the title and the
 * description. The match is case-insensitive and literal. Accent-folded matches
 * (typing "sao" for "São") are found by the engine but not highlighted, because
 * mapping a folded offset back to the original string is not reliable; the result
 * still appears, which is the part that matters.
 *
 * Keyboard: Up/Down/Home/End move the active option, Enter opens it, Escape is
 * handled by the modal manager. The input keeps focus and points at the active
 * option with aria-activedescendant, which is the listbox pattern that works
 * without moving focus into the list.
 *
 * UI: the panel is a real <dialog> from the modal manager, so focus trapping,
 * Escape and scroll locking are handled once, in one place. The launcher lives in
 * the shared tools dock and in the header (through the ui:open-search bus event).
 *
 * Security: every dataset string is untrusted; results are built with textContent
 * and the query is never inserted into markup.
 */

import { closeModal, openModal } from "../components/modal.js";
import { matchesQuery } from "../core/search-engine.js";
import { STORAGE_KEYS } from "../core/storage-manager.js";
import {
  addToolButton,
  asArray,
  asText,
  el,
  isRecord
} from "../core/section-kit.js";

/** Hard cap on rendered results; the search engine also caps its own work. */
const MAX_RESULTS = 40;

/** How many recent queries are remembered. */
const MAX_RECENT = 5;

/** How many "popular" entries are offered before a query is typed. */
const MAX_SUGGESTIONS = 6;

/** Teardown for a previous initialization. */
let teardownPrevious = null;

/** Section id -> human label, used for the result's location line. */
const SECTION_LABELS = Object.freeze({
  profile: "Profile",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  certificates: "Certificates",
  education: "Education",
  "learning-journey": "Learning journey",
  "career-timeline": "Timeline",
  bookmarks: "Bookmarks",
  contact: "Contact"
});

/** Regex metacharacters, escaped before a token becomes a pattern. */
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * Adds one entry to the index.
 *
 * @param {Array<Object>} entries
 * @param {Object} entry
 */
function addEntry(entries, entry) {
  const title = asText(entry.title);
  const sectionId = asText(entry.sectionId);

  if (!title || !sectionId) {
    return;
  }

  entries.push({
    id: asText(entry.id) || `${sectionId}-${entries.length}`,
    title,
    description: asText(entry.description),
    keywords: asArray(entry.keywords).map(asText).filter(Boolean).join(" "),
    sectionId,
    sectionLabel: SECTION_LABELS[sectionId] || sectionId,
    order: entries.length
  });
}

/**
 * Flattens the loaded datasets into searchable entries.
 *
 * @param {Object} data - appContext.data.
 * @returns {Array<Object>}
 */
function buildIndex(data) {
  const entries = [];

  if (!isRecord(data)) {
    return entries;
  }

  const profile = isRecord(data.profile) ? data.profile.profile : null;
  if (isRecord(profile)) {
    addEntry(entries, {
      id: "profile-main",
      title: asText(profile.name),
      description: [asText(profile.professionalTitle), asText(profile.shortIntroduction)]
        .filter(Boolean)
        .join(" \u2014 "),
      keywords: [asText(profile.location), asText(profile.tagline), asText(profile.email)],
      sectionId: "profile"
    });
  }

  for (const skill of asArray(data.skills?.skills)) {
    addEntry(entries, {
      id: skill.id,
      title: skill.name,
      description: skill.description,
      keywords: [skill.categoryId, skill.proficiencyLabel],
      sectionId: "skills"
    });
  }

  for (const experience of asArray(data.experience?.experiences)) {
    addEntry(entries, {
      id: experience.id,
      title: experience.role,
      description: [asText(experience.company?.name), asText(experience.shortDescription)]
        .filter(Boolean)
        .join(" \u2014 "),
      keywords: experience.skills,
      sectionId: "experience"
    });
  }

  for (const project of asArray(data.projects?.projects)) {
    addEntry(entries, {
      id: project.id,
      title: project.title,
      description: project.shortDescription || project.description,
      keywords: project.technologies,
      sectionId: "projects"
    });
  }

  for (const certificate of asArray(data.certificates?.certificates)) {
    // issuer is an object in this dataset; asText(record.issuer) would be "".
    const issuer =
      certificate.issuer && typeof certificate.issuer === "object"
        ? asText(certificate.issuer.name)
        : asText(certificate.issuer);

    addEntry(entries, {
      id: certificate.id,
      title: certificate.title,
      description: [issuer, asText(certificate.description)].filter(Boolean).join(" \u2014 "),
      keywords: certificate.skills,
      sectionId: "certificates"
    });
  }

  for (const record of asArray(data.education?.education)) {
    addEntry(entries, {
      id: record.id,
      title: record.qualification,
      description: asText(record.institution?.name),
      keywords: [record.fieldOfStudy, record.description],
      sectionId: "education"
    });
  }

  for (const activity of asArray(data.learningJourney?.learningActivities)) {
    addEntry(entries, {
      id: activity.id,
      title: activity.title,
      description: activity.description,
      keywords: [activity.topic, activity.categoryId, activity.keyLearnings],
      sectionId: "learning-journey"
    });
  }

  for (const bookmark of asArray(data.bookmarks?.bookmarks)) {
    addEntry(entries, {
      id: bookmark.id,
      title: bookmark.name,
      description: bookmark.description,
      keywords: bookmark.tags,
      sectionId: "bookmarks"
    });
  }

  return entries;
}

/**
 * Scrolls to a section and moves focus to its heading.
 *
 * Focusing after the scroll matters for keyboard and screen-reader users: without
 * it the dialog closes and focus returns to the launcher, leaving the visitor at
 * the top of the page while the content they picked is further down.
 *
 * @param {string} sectionId
 */
function revealSection(sectionId) {
  const section = document.getElementById(sectionId);

  if (!section) {
    return;
  }

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  section.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });

  const heading = section.querySelector("h1, h2, h3, .section__title, .profile-hero__name");

  if (heading instanceof HTMLElement) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
}

/**
 * Builds a fragment with every literal match of the query wrapped in <mark>.
 *
 * The original string is sliced, never re-parsed as HTML. Tokens shorter than two
 * characters are not highlighted: marking every "a" would turn the list into
 * noise.
 *
 * @param {string} text
 * @param {string} query
 * @returns {Node}
 */
function highlight(text, query) {
  const source = asText(text);

  if (!source) {
    return document.createDocumentFragment();
  }

  const tokens = asText(query)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .map((token) => token.replace(REGEX_SPECIALS, "\\$&"));

  if (tokens.length === 0) {
    return document.createTextNode(source);
  }

  let pattern;

  try {
    pattern = new RegExp(`(${tokens.join("|")})`, "gi");
  } catch {
    return document.createTextNode(source);
  }

  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;

    if (index > cursor) {
      fragment.append(document.createTextNode(source.slice(cursor, index)));
    }

    const mark = document.createElement("mark");
    mark.className = "global-search__mark";
    mark.textContent = match[0];
    fragment.append(mark);
    cursor = index + match[0].length;
  }

  if (cursor < source.length) {
    fragment.append(document.createTextNode(source.slice(cursor)));
  }

  return fragment;
}

/**
 * Scores one entry for the current query.
 *
 * Lower is better:
 *   0 exact title, 1 title starts with the query, 2 title contains it,
 *   3 description contains it, 4 only the keywords match.
 *
 * @param {Object} entry
 * @param {string} query
 * @returns {number}
 */
function scoreEntry(entry, query) {
  const needle = asText(query).toLowerCase().trim();
  const title = entry.title.toLowerCase();

  if (title === needle) {
    return 0;
  }

  if (title.startsWith(needle)) {
    return 1;
  }

  if (title.includes(needle)) {
    return 2;
  }

  if (entry.description.toLowerCase().includes(needle)) {
    return 3;
  }

  return 4;
}

/**
 * Reads the recent query list, tolerating a missing or corrupt value.
 *
 * @param {Object|undefined} storage
 * @returns {string[]}
 */
function readRecent(storage) {
  if (!storage?.getLocalData) {
    return [];
  }

  return asArray(storage.getLocalData(STORAGE_KEYS.ui.recentSearches, []))
    .map(asText)
    .filter(Boolean)
    .slice(0, MAX_RECENT);
}

/**
 * Pushes one query into the recent list, newest first, de-duplicated.
 *
 * @param {Object|undefined} storage
 * @param {string} query
 */
function pushRecent(storage, query) {
  const value = asText(query);

  if (!value || !storage?.saveLocalData) {
    return;
  }

  const existing = readRecent(storage).filter(
    (entry) => entry.toLowerCase() !== value.toLowerCase()
  );

  storage.saveLocalData(
    STORAGE_KEYS.ui.recentSearches,
    [value, ...existing].slice(0, MAX_RECENT)
  );
}

/**
 * @param {Object|undefined} sectionData - Unused: this feature reads appContext.data.
 * @param {{data?: Object, storage?: Object, bus?: Object, toast?: Object}} [appContext]
 * @returns {void}
 */
export function initializeGlobalSearch(sectionData, appContext) {
  // Node-safe: the module contract check imports this file without a document.
  if (typeof document === "undefined") {
    return;
  }

  if (typeof teardownPrevious === "function") {
    teardownPrevious();
    teardownPrevious = null;
  }

  const root = document.getElementById("global-search-root");

  if (!root) {
    return;
  }

  const entries = buildIndex(appContext?.data);
  const storage = appContext?.storage;
  const bus = appContext?.bus;

  const sectionOptions = [...new Set(entries.map((entry) => entry.sectionId))].map((id) => ({
    value: id,
    label: SECTION_LABELS[id] || id
  }));

  let lastQuery = "";

  if (storage?.getLocalData) {
    const stored = storage.getLocalData(STORAGE_KEYS.ui.lastSearchQuery, "");
    lastQuery = asText(stored);
  }

  const tool = addToolButton({
    id: "global-search-trigger",
    label: "Search",
    icon: "search",
    shortcut: "Ctrl K",
    onClick: () => openSearch()
  });

  /**
   * Opens the command palette and wires its input.
   *
   * A fresh dialog per open avoids stale result nodes, and the modal manager owns
   * focus trapping and Escape. The last query is restored from storage so a
   * reload does not lose what the visitor was looking for.
   */
  function openSearch() {
    const content = el("div", { className: "global-search" });

    const field = el("div", { className: "global-search__field" });
    field.append(
      el("label", {
        className: "visually-hidden",
        text: "Search the portfolio",
        attrs: { for: "global-search-input" }
      })
    );

    const input = el("input", {
      className: "field__input global-search__input",
      attrs: {
        id: "global-search-input",
        type: "search",
        placeholder: "Search skills, projects, certificates\u2026",
        autocomplete: "off",
        spellcheck: "false",
        role: "combobox",
        "aria-expanded": "true",
        "aria-controls": "global-search-results",
        "aria-autocomplete": "list",
        "aria-describedby": "global-search-status"
      }
    });

    const sectionFilter = el("select", {
      className: "field__input field__input--select global-search__section",
      attrs: { id: "global-search-section", "aria-label": "Limit to one section" }
    });
    sectionFilter.append(el("option", { text: "Everywhere", attrs: { value: "all" } }));

    for (const option of sectionOptions) {
      sectionFilter.append(el("option", { text: option.label, attrs: { value: option.value } }));
    }

    // Relevance is the default; alphabetical is the one alternative the spec
    // offers that does not need reliable dates (which these records do not all
    // have). Sorting by section is what the grouping already does.
    const sortSelect = el("select", {
      className: "field__input field__input--select global-search__sort",
      attrs: { id: "global-search-sort", "aria-label": "Sort results" }
    });
    sortSelect.append(
      el("option", { text: "Relevance", attrs: { value: "relevance" } }),
      el("option", { text: "A\u2013Z", attrs: { value: "alpha" } })
    );

    field.append(input, sectionFilter, sortSelect);
    content.append(field);

    const status = el("p", {
      className: "global-search__status",
      attrs: { id: "global-search-status", role: "status", "aria-live": "polite" }
    });

    const list = el("ul", {
      className: "global-search__results",
      attrs: { id: "global-search-results", role: "listbox", "aria-label": "Search results" }
    });

    content.append(status, list);

    const dialog = openModal({
      title: "Search",
      content,
      size: "lg",
      initialFocus: input,
      onClose: () => {
        pushRecent(storage, lastQuery);
        storage?.saveLocalData?.(STORAGE_KEYS.ui.lastSearchQuery, lastQuery);
      }
    });

    if (!dialog) {
      return;
    }

    /** @type {Array<{element: HTMLElement, entry: Object|null}>} */
    let options = [];
    let activeIndex = -1;
    let search = "";

    /** Marks one option active and scrolls it into view. */
    function setActive(index) {
      if (options.length === 0) {
        activeIndex = -1;
        input.removeAttribute("aria-activedescendant");
        return;
      }

      activeIndex = (index + options.length) % options.length;

      options.forEach((option, position) => {
        const isActive = position === activeIndex;
        option.element.classList.toggle("is-active", isActive);
        option.element.setAttribute("aria-selected", String(isActive));
      });

      const active = options[activeIndex]?.element;

      if (active) {
        input.setAttribute("aria-activedescendant", active.id);
        active.scrollIntoView({ block: "nearest" });
      }
    }

    /** Selects the active option, or the first one when nothing is active. */
    function choose(index = activeIndex) {
      const option = options[index >= 0 ? index : 0];

      if (!option?.entry) {
        return;
      }

      const entry = option.entry;
      pushRecent(storage, search);
      storage?.saveLocalData?.(STORAGE_KEYS.ui.lastSearchQuery, search);
      closeModal(undefined, "navigation");
      revealSection(entry.sectionId);
    }

    /**
     * Adds one option row.
     *
     * A row is an <li role="option">, not a button: the input keeps focus and
     * aria-activedescendant names the row, which is what makes ArrowDown work
     * without a second tab stop per result.
     */
    function addOption(entry, index, query) {
      const item = el("li", {
        className: "global-search__item",
        attrs: {
          id: `global-search-option-${index}`,
          role: "option",
          "aria-selected": "false"
        }
      });

      const title = el("span", { className: "global-search__result-title" });
      title.append(highlight(entry.title, query));
      item.append(title);

      if (entry.description) {
        const description = el("span", { className: "global-search__result-text" });
        description.append(highlight(entry.description, query));
        item.append(description);
      }

      item.append(
        el("span", { className: "global-search__result-where", text: entry.sectionLabel })
      );

      item.addEventListener("click", () => {
        choose(options.findIndex((option) => option.element === item));
      });

      list.append(item);
      options.push({ element: item, entry });
      return item;
    }

    /** Adds a non-selectable label row (group heading or "recent" label). */
    function addHeading(text, className) {
      const item = el("li", {
        className: `global-search__heading ${className || ""}`.trim(),
        attrs: { role: "presentation", "aria-hidden": "true" },
        text
      });

      list.append(item);
    }

    /**
     * Draws the empty-query state: recent searches and a short popular list.
     *
     * Suggestions are real entries, so clicking one navigates exactly like a
     * search result. A recent query, by contrast, fills the input: the visitor
     * may want to refine it rather than jump.
     */
    function renderSuggestions() {
      list.replaceChildren();
      options = [];
      activeIndex = -1;
      input.removeAttribute("aria-activedescendant");

      const recent = readRecent(storage);

      if (recent.length > 0) {
        addHeading("Recent searches", "global-search__heading--recent");

        for (const query of recent) {
          const item = el("li", { className: "global-search__recent" });
          const button = el("button", {
            className: "global-search__recent-button",
            text: query,
            attrs: { type: "button" }
          });
          button.addEventListener("click", () => {
            input.value = query;
            search = query;
            lastQuery = query;
            renderResults(query);
            input.focus();
          });
          item.append(button);
          list.append(item);
        }

        const clear = el("button", {
          className: "global-search__clear-recent",
          text: "Clear recent searches",
          attrs: { type: "button" }
        });
        clear.addEventListener("click", () => {
          storage?.saveLocalData?.(STORAGE_KEYS.ui.recentSearches, []);
          renderSuggestions();
        });
        list.append(el("li", { className: "global-search__recent" , children: [clear] }));
      }

      const popular = entries
        .filter((entry) => entry.sectionId === "projects" || entry.sectionId === "skills")
        .slice(0, MAX_SUGGESTIONS);

      if (popular.length > 0) {
        addHeading("Popular", "global-search__heading--popular");
        popular.forEach((entry, index) => addOption(entry, index, ""));
      }

      status.textContent = entries.length
        ? `${entries.length} items across the page. Start typing, or pick a suggestion.`
        : "No data is loaded, so there is nothing to search.";

      if (options.length > 0) {
        setActive(0);
      }
    }

    /**
     * Renders matches for one query.
     *
     * Matching is delegated to search-engine.matchesQuery; only the ordering and
     * the grouping are decided here. A section filter narrows the same match set
     * rather than running a second query.
     */
    function renderResults(rawQuery) {
      list.replaceChildren();
      options = [];
      activeIndex = -1;
      input.removeAttribute("aria-activedescendant");

      const query = asText(rawQuery);
      const section = sectionFilter.value;

      if (!query.trim()) {
        renderSuggestions();
        return;
      }

      const matches = entries
        .filter((entry) =>
          matchesQuery(entry, query, { fields: ["title", "description", "keywords"] })
        )
        .filter((entry) => section === "all" || entry.sectionId === section)
        .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
        .sort((a, b) => a.score - b.score || a.entry.order - b.entry.order)
        .slice(0, MAX_RESULTS)
        .map((scored) => scored.entry);

      // Alphabetical is applied after the relevance cut, so the cap still keeps
      // the best matches instead of the first 40 titles in the alphabet.
      if (sortSelect.value === "alpha") {
        matches.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
      }

      status.textContent =
        matches.length === 0
          ? `No match for \u201c${query.trim()}\u201d.`
          : matches.length === 1
            ? "1 result"
            : `${matches.length} results`;

      if (matches.length === 0) {
        list.append(
          el("li", {
            className: "global-search__empty",
            text: "Try a skill, a technology, a project name or a section."
          })
        );
        return;
      }

      // Grouping keeps the page's structure visible. A group heading is not an
      // option, so it is skipped by the arrow keys.
      let currentSection = "";
      let index = 0;

      for (const entry of matches) {
        if (entry.sectionId !== currentSection) {
          currentSection = entry.sectionId;
          addHeading(entry.sectionLabel, "global-search__heading--group");
        }

        addOption(entry, index, query);
        index += 1;
      }

      setActive(0);
    }

    input.addEventListener("input", () => {
      search = input.value;
      lastQuery = search;
      renderResults(search);
    });

    sectionFilter.addEventListener("change", () => {
      renderResults(input.value);
      input.focus();
    });

    sortSelect.addEventListener("change", () => {
      renderResults(input.value);
      input.focus();
    });

    input.addEventListener("keydown", (event) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActive(activeIndex + 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          setActive(activeIndex - 1);
          break;
        case "Home":
          if (options.length > 0) {
            event.preventDefault();
            setActive(0);
          }
          break;
        case "End":
          if (options.length > 0) {
            event.preventDefault();
            setActive(options.length - 1);
          }
          break;
        case "Enter":
          event.preventDefault();
          choose();
          break;
        default:
          break;
      }
    });

    search = lastQuery;
    input.value = lastQuery;
    renderResults(lastQuery);
    input.select();
  }

  // Global shortcut. Registered on the document because the feature has no
  // visible control in the header; removed by the teardown below so a re-import
  // cannot stack two handlers.
  const onKeydown = (event) => {
    const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";

    if (!isShortcut) {
      return;
    }

    // Let the browser keep Ctrl+K when the visitor is typing in a field that has
    // its own meaning for it (the browser's address bar never receives this, but
    // an embedded editor might).
    const target = event.target;
    if (target instanceof HTMLElement && target.isContentEditable) {
      return;
    }

    event.preventDefault();
    openSearch();
  };

  document.addEventListener("keydown", onKeydown);

  // The header renders a Search button; it asks through the bus instead of
  // importing this module, so the feature stays the only owner of its dialog and
  // a disabled feature simply leaves no listener behind.
  const offOpenRequest = bus?.on?.("ui:open-search", () => openSearch());

  teardownPrevious = () => {
    document.removeEventListener("keydown", onKeydown);
    offOpenRequest?.();
    tool.remove();
  };
}
