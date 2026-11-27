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
 * UI: the panel is a real <dialog> from the modal manager, so focus trapping,
 * Escape and scroll locking are handled once, in one place. The launcher lives in
 * the shared tools dock (see js/core/section-kit.js) because the header has no
 * search button and the feature must not edit index.html.
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

/** Hard cap on rendered results; the API in the search engine also caps work. */
const MAX_RESULTS = 30;

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
    sectionLabel: SECTION_LABELS[sectionId] || sectionId
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
    addEntry(entries, {
      id: certificate.id,
      title: certificate.title,
      description: [asText(certificate.issuer), asText(certificate.description)]
        .filter(Boolean)
        .join(" \u2014 "),
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
      keywords: [activity.topic, activity.categoryId],
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

  /** Builds the dialog content once per open; simple and cheap at this size. */
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

    const inputId = "global-search-input";
    field.append(
      el("label", {
        className: "visually-hidden",
        text: "Search the portfolio",
        attrs: { for: inputId }
      })
    );

    const input = el("input", {
      className: "field__input global-search__input",
      attrs: {
        id: inputId,
        type: "search",
        placeholder: "Search skills, projects, certificates\u2026",
        autocomplete: "off",
        spellcheck: "false",
        "aria-describedby": "global-search-status"
      }
    });

    field.append(input);
    content.append(field);

    const status = el("p", {
      className: "global-search__status",
      attrs: { id: "global-search-status", role: "status", "aria-live": "polite" }
    });

    const list = el("ul", { className: "global-search__results" });
    content.append(status, list);

    const dialog = openModal({
      title: "Search",
      content,
      size: "lg",
      initialFocus: input,
      onClose: () => {
        if (storage?.saveLocalData && lastQuery) {
          storage.saveLocalData(STORAGE_KEYS.ui.lastSearchQuery, lastQuery);
        }
      }
    });

    if (!dialog) {
      return;
    }

    /**
     * Renders matches for one query.
     *
     * Matching is delegated to search-engine.matchesQuery over title, description
     * and keywords. Results keep dataset order and are capped, rather than being
     * re-ranked by a second algorithm that would disagree with section filters.
     */
    function renderResults(query) {
      list.replaceChildren();

      if (!query.trim()) {
        status.textContent = entries.length
          ? `${entries.length} items across the page. Start typing to filter.`
          : "No data is loaded, so there is nothing to search.";
        return;
      }

      const matches = entries
        .filter((entry) =>
          matchesQuery(entry, query, { fields: ["title", "description", "keywords"] })
        )
        .slice(0, MAX_RESULTS);

      status.textContent =
        matches.length === 1 ? "1 result" : `${matches.length} results`;

      if (matches.length === 0) {
        list.append(
          el("li", {
            className: "global-search__empty",
            text: `No match for \u201c${query.trim()}\u201d. Try a skill, a technology or a project name.`
          })
        );
        return;
      }

      for (const match of matches) {
        const item = el("li", { className: "global-search__item" });
        const button = el("button", {
          className: "global-search__result",
          attrs: { type: "button" }
        });

        button.append(el("span", { className: "global-search__result-title", text: match.title }));

        if (match.description) {
          button.append(
            el("span", { className: "global-search__result-text", text: match.description })
          );
        }

        button.append(
          el("span", { className: "global-search__result-where", text: match.sectionLabel })
        );

        button.addEventListener("click", () => {
          closeModal(undefined, "navigation");
          revealSection(match.sectionId);
        });

        item.append(button);
        list.append(item);
      }
    }

    input.addEventListener("input", () => {
      lastQuery = input.value;
      renderResults(input.value);
    });

    // Ctrl/Cmd+K while the dialog is open is a no-op, not a second dialog.
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        list.querySelector("button")?.click();
      }
    });

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

  teardownPrevious = () => {
    document.removeEventListener("keydown", onKeydown);
    tool.remove();
  };
}
