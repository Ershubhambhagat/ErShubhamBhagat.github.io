/**
 * js/sections/github-importer.js - public repositories from the GitHub API.
 *
 * This section is the only network call the site makes after boot. Four
 * decisions follow from that:
 *
 *  1. It does not fetch on page load. The unauthenticated GitHub API allows 60
 *     requests per hour per IP, shared by everyone behind the same address, so a
 *     portfolio that fetched on every visit would exhaust the quota and then show
 *     errors to the next visitor. The owner presses "Load repositories"; the
 *     result is cached per username in storage (portfolio.draft.githubImport).
 *  2. It never carries a token. .build/CONTRACT.md forbids embedding one, and a
 *     token in client-side JavaScript is public the moment it is deployed.
 *  3. Everything the API returns is untrusted text: it is written with
 *     textContent, and repo URLs pass the same allow-list as every other link.
 *  4. Conversion is a draft, not a publish. The page can produce a valid
 *     projects.json file; it cannot write the repository, so the UI says so and
 *     offers a download plus the git command in words. No fake push button.
 *
 * The default username is the one attested in README.md and every social handle
 * (.build/FACTS.md section 1); the field lets the owner import another account.
 */

import { createButton } from "../components/button.js";
import { closeModal, openModal } from "../components/modal.js";
import { matchesQuery } from "../core/search-engine.js";
import { STORAGE_KEYS } from "../core/storage-manager.js";
import {
  asArray,
  asNumber,
  asText,
  createTagList,
  el,
  formatDate,
  isRecord,
  prepareSection,
  renderEmpty
} from "../core/section-kit.js";

/** Attested GitHub username; the field starts here. */
const DEFAULT_USERNAME = "ershubhambhagat";

/** API endpoint builder: public, unauthenticated, newest first. */
function repositoriesEndpoint(username) {
  return `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=owner`;
}

/** How many repositories are rendered at once. */
const PAGE_SIZE = 12;

/** GitHub's own username rule; also keeps the value safe inside a URL. */
const USERNAME_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

/**
 * Normalises one API repository into the fields the section needs.
 *
 * Only fields that are used are kept: the raw payload is neither cached nor
 * rendered, which keeps storage small and the renderer honest about what it
 * actually reads.
 *
 * @param {Object} repo
 * @returns {Object|null}
 */
function normalizeRepo(repo) {
  if (!isRecord(repo)) {
    return null;
  }

  const name = asText(repo.name);

  if (!name) {
    return null;
  }

  return {
    id: asNumber(repo.id) ?? name,
    name,
    description: asText(repo.description),
    url: asText(repo.html_url),
    homepage: asText(repo.homepage),
    language: asText(repo.language),
    topics: asArray(repo.topics).map(asText).filter(Boolean),
    stars: asNumber(repo.stargazers_count) ?? 0,
    forks: asNumber(repo.forks_count) ?? 0,
    createdAt: asText(repo.created_at),
    updatedAt: asText(repo.updated_at),
    isFork: repo.fork === true,
    isArchived: repo.archived === true
  };
}

/**
 * Reads a GitHub username out of a bare handle or a profile/repository URL.
 *
 * Accepts "name", "https://github.com/name" and
 * "https://github.com/name/repo"; anything else is rejected rather than guessed.
 *
 * @param {string} input
 * @returns {string} "" when the input is not a usable username or URL.
 */
function parseUsername(input) {
  const text = asText(input);

  if (!text) {
    return "";
  }

  if (USERNAME_PATTERN.test(text)) {
    return text;
  }

  let url;

  try {
    url = new URL(text);
  } catch {
    return "";
  }

  if (!/^(www\.)?github\.com$/i.test(url.hostname)) {
    return "";
  }

  const [first] = url.pathname.split("/").filter(Boolean);

  return first && USERNAME_PATTERN.test(first) ? first : "";
}

/**
 * Normalises a project name for duplicate comparison.
 *
 * "My-Project" and "my project" are the same project as far as a visitor is
 * concerned, so the comparison ignores case, separators and spacing.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeName(value) {
  return asText(value)
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}

/**
 * Builds the technologies list: language first, then topics, de-duplicated and
 * capped. The cap is a display decision, not a data one - twelve chips on one
 * card drown the title.
 *
 * @param {Object} repo
 * @returns {string[]}
 */
function readTechnologies(repo) {
  const values = [repo.language, ...repo.topics].map(asText).filter(Boolean);
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const key = value.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);

    if (result.length >= 8) {
      break;
    }
  }

  return result;
}

/**
 * @param {Object|undefined} sectionData - Unused: this section has no dataset.
 * @param {{storage?: Object, toast?: Object, bus?: Object, data?: Object}} [appContext]
 * @returns {void}
 */
export function initializeGithubImporter(sectionData, appContext) {
  const section = prepareSection("github-importer", {
    title: "GitHub",
    intro:
      "Load public repositories, choose the ones worth publishing, and convert them into project records. Nothing is sent anywhere and nothing is pushed: the result is a JSON file you commit with git."
  });

  if (!section) {
    return;
  }

  const storage = appContext?.storage;
  const toast = appContext?.toast;
  const projectData = appContext?.data?.projects;
  const projectCategories = asArray(projectData?.categories)
    .filter((category) => isRecord(category) && asText(category.id) && asText(category.name))
    .map((category) => ({ id: asText(category.id), name: asText(category.name) }));
  const existingProjects = asArray(projectData?.projects).filter(isRecord);

  const storedUsername = asText(
    storage?.getLocalData?.(STORAGE_KEYS.draft.githubImport, null)?.username
  );

  let username = parseUsername(storedUsername) || DEFAULT_USERNAME;
  let repos = [];
  let visible = PAGE_SIZE;
  let loadedAt = "";
  let loading = false;

  const selected = new Set();

  const state = { query: "", language: "", visibility: "all", sort: "updated" };

  // ---- Controls ----------------------------------------------------------
  const controls = el("div", { className: "github-controls" });

  const usernameField = el("div", { className: "field github-controls__field" });
  usernameField.append(
    el("label", { className: "field__label", text: "GitHub username or profile URL", attrs: { for: "github-username" } })
  );
  const usernameInput = el("input", {
    className: "field__input",
    attrs: {
      id: "github-username",
      type: "text",
      value: username,
      autocomplete: "off",
      spellcheck: "false",
      placeholder: "ershubhambhagat or https://github.com/ershubhambhagat"
    }
  });
  usernameField.append(usernameInput);

  const loadButton = createButton({
    label: "Load repositories",
    variant: "primary",
    onClick: () => {
      void loadRepositories();
    }
  });

  controls.append(usernameField, loadButton);

  const statusLine = el("p", {
    className: "github-status",
    attrs: { role: "status", "aria-live": "polite" }
  });

  // Search/filter/sort row. It is disabled until a list exists, because every
  // control would otherwise be a no-op on an empty grid.
  const filterRow = el("div", { className: "collection-toolbar" });

  const searchField = el("div", { className: "field collection-toolbar__search" });
  searchField.append(
    el("label", { className: "field__label", text: "Search repositories", attrs: { for: "github-search" } })
  );
  const searchInput = el("input", {
    className: "field__input",
    attrs: {
      id: "github-search",
      type: "search",
      placeholder: "Name, description or language",
      autocomplete: "off",
      spellcheck: "false"
    }
  });
  searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    visible = PAGE_SIZE;
    render();
  });
  searchField.append(searchInput);
  filterRow.append(searchField);

  const languageSelect = createSelect("github-language", "Language", [], (value) => {
    state.language = value === "all" ? "" : value;
    visible = PAGE_SIZE;
    render();
  });
  filterRow.append(languageSelect.field);

  const visibilitySelect = createSelect(
    "github-visibility",
    "Include",
    [
      { value: "all", label: "All repositories" },
      { value: "no-forks", label: "Hide forks" },
      { value: "no-archived", label: "Hide archived" },
      { value: "primary", label: "Original and active" }
    ],
    (value) => {
      state.visibility = value;
      visible = PAGE_SIZE;
      render();
    }
  );
  filterRow.append(visibilitySelect.field);

  const sortSelect = createSelect(
    "github-sort",
    "Sort by",
    [
      { value: "updated", label: "Recently updated" },
      { value: "stars", label: "Most stars" },
      { value: "name", label: "Name A to Z" }
    ],
    (value) => {
      state.sort = value;
      visible = PAGE_SIZE;
      render();
    }
  );
  filterRow.append(sortSelect.field);

  const results = el("div", { className: "github-results" });
  const selectionBar = el("div", { className: "github-selection" });

  section.body.append(controls, statusLine, filterRow, selectionBar, results);

  /**
   * Builds one labelled select.
   *
   * @param {string} id
   * @param {string} label
   * @param {Array<{value: string, label: string}>} options
   * @param {(value: string) => void} onChange
   * @returns {{field: HTMLElement, select: HTMLSelectElement}}
   */
  function createSelect(id, label, options, onChange) {
    const field = el("div", { className: "field collection-toolbar__field" });
    field.append(el("label", { className: "field__label", text: label, attrs: { for: id } }));

    const select = el("select", {
      className: "field__input field__input--select",
      attrs: { id }
    });

    for (const option of options.length > 0 ? options : [{ value: "all", label: "All" }]) {
      select.append(el("option", { text: option.label, attrs: { value: option.value } }));
    }

    select.addEventListener("change", () => onChange(select.value));
    field.append(select);
    return { field, select };
  }

  /** Reads the cached fetch for the current username, tolerating old shapes. */
  function readCache() {
    if (!storage?.getLocalData) {
      return null;
    }

    const cached = storage.getLocalData(STORAGE_KEYS.draft.githubImport, null);

    if (!isRecord(cached) || !Array.isArray(cached.repos)) {
      return null;
    }

    if (asText(cached.username) && asText(cached.username) !== username) {
      return null;
    }

    const records = cached.repos.map(normalizeRepo).filter(Boolean);

    return records.length > 0
      ? { repos: records, fetchedAt: asText(cached.fetchedAt) }
      : null;
  }

  /** Stores the normalized list, the username and the timestamp. */
  function writeCache() {
    storage?.saveLocalData?.(STORAGE_KEYS.draft.githubImport, {
      username,
      fetchedAt: new Date().toISOString(),
      repos
    });
  }

  /** Rebuilds the language options from whatever the list actually contains. */
  function syncLanguageOptions() {
    const languages = [...new Set(repos.map((repo) => repo.language).filter(Boolean))].sort();

    languageSelect.select.replaceChildren();
    languageSelect.select.append(el("option", { text: "All languages", attrs: { value: "all" } }));

    for (const language of languages) {
      languageSelect.select.append(el("option", { text: language, attrs: { value: language } }));
    }

    if (!languages.includes(state.language)) {
      state.language = "";
    }

    languageSelect.select.value = state.language || "all";
  }

  /**
   * Applies the query, the language filter, the visibility filter and the sort.
   *
   * @returns {Array<Object>}
   */
  function selectRepos() {
    let selectedRepos = repos.slice();

    if (state.query.trim()) {
      selectedRepos = selectedRepos.filter((repo) =>
        matchesQuery(repo, state.query, { fields: ["name", "description", "language", "topics"] })
      );
    }

    if (state.language) {
      selectedRepos = selectedRepos.filter(
        (repo) => repo.language.toLowerCase() === state.language.toLowerCase()
      );
    }

    if (state.visibility === "no-forks") {
      selectedRepos = selectedRepos.filter((repo) => !repo.isFork);
    } else if (state.visibility === "no-archived") {
      selectedRepos = selectedRepos.filter((repo) => !repo.isArchived);
    } else if (state.visibility === "primary") {
      selectedRepos = selectedRepos.filter((repo) => !repo.isFork && !repo.isArchived);
    }

    if (state.sort === "stars") {
      selectedRepos.sort((a, b) => b.stars - a.stars);
    } else if (state.sort === "name") {
      selectedRepos.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    } else {
      selectedRepos.sort((a, b) => asText(b.updatedAt).localeCompare(asText(a.updatedAt)));
    }

    return selectedRepos;
  }

  /**
   * Finds an existing project that already represents this repository.
   *
   * Two signals: the normalised title and the recorded source URL. Either is
   * enough, because an import can change the title and still be the same project.
   *
   * @param {Object} repo
   * @returns {Object|null}
   */
  function findDuplicate(repo) {
    const name = normalizeName(repo.name);

    for (const project of existingProjects) {
      if (normalizeName(project.title) === name) {
        return project;
      }

      const source = asText(project.links?.sourceCode).replace(/\/+$/, "").toLowerCase();

      if (source && source === repo.url.replace(/\/+$/, "").toLowerCase()) {
        return project;
      }
    }

    return null;
  }

  /** Draws the selection bar (count + review action). */
  function renderSelection() {
    selectionBar.replaceChildren();

    const count = selected.size;

    selectionBar.append(
      el("p", {
        className: "github-selection__text",
        text: count === 1 ? "1 repository selected" : `${count} repositories selected`
      })
    );

    const review = createButton({
      label: "Review and convert",
      variant: "primary",
      size: "small",
      disabled: count === 0,
      onClick: () => openReview()
    });

    const clear = createButton({
      label: "Clear selection",
      variant: "ghost",
      size: "small",
      disabled: count === 0,
      onClick: () => {
        selected.clear();
        render();
      }
    });

    selectionBar.append(review, clear);
  }

  /** Draws the visible slice of the filtered list. */
  function render() {
    results.replaceChildren();

    if (repos.length === 0) {
      renderEmpty(results, {
        title: "Nothing loaded yet",
        message: "Enter a username and press Load repositories. The list is cached, so a refresh is not needed on every visit."
      });
      renderSelection();
      return;
    }

    const matching = selectRepos();

    if (matching.length === 0) {
      renderEmpty(results, {
        title: "No repositories match",
        message: "Clear the search or change the filters."
      });
      renderSelection();
      return;
    }

    const grid = el("div", { className: "github-grid card-grid" });

    for (const repo of matching.slice(0, visible)) {
      const duplicate = findDuplicate(repo);
      const card = el("article", {
        className: `github-card${duplicate ? " github-card--duplicate" : ""}`
      });

      const head = el("div", { className: "github-card__head" });
      const checkboxId = `github-select-${repo.id}`;
      const checkbox = el("input", {
        className: "github-card__checkbox",
        attrs: { id: checkboxId, type: "checkbox" }
      });
      checkbox.checked = selected.has(repo.name);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selected.add(repo.name);
        } else {
          selected.delete(repo.name);
        }
        renderSelection();
        card.classList.toggle("github-card--selected", checkbox.checked);
      });

      const label = el("label", {
        className: "github-card__select",
        attrs: { for: checkboxId }
      });
      label.append(checkbox, el("span", { className: "visually-hidden", text: `Select ${repo.name}` }));

      const heading = el("h3", { className: "github-card__title" });
      const link = document.createElement("a");
      link.className = "github-card__link";
      link.href = /^https:\/\/github\.com\//i.test(repo.url)
        ? repo.url
        : `https://github.com/${encodeURIComponent(username)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = repo.name;
      heading.append(link);

      head.append(label, heading);
      card.append(head);

      if (duplicate) {
        card.append(
          el("p", {
            className: "github-card__warning",
            text: `Already in projects as \u201c${asText(duplicate.title)}\u201d. Converting again would create a second card for the same work.`
          })
        );
      }

      if (repo.description) {
        card.append(el("p", { className: "github-card__text", text: repo.description }));
      }

      const facts = [];
      if (repo.language) {
        facts.push(repo.language);
      }
      if (repo.stars > 0) {
        facts.push(`${repo.stars} \u2605`);
      }
      if (repo.forks > 0) {
        facts.push(`${repo.forks} forks`);
      }
      if (repo.isFork) {
        facts.push("Fork");
      }
      if (repo.isArchived) {
        facts.push("Archived");
      }
      if (repo.updatedAt) {
        facts.push(`Updated ${formatDate(repo.updatedAt.slice(0, 10), "long")}`);
      }

      if (facts.length > 0) {
        const list = el("ul", { className: "github-card__facts" });
        facts.forEach((fact) => list.append(el("li", { text: fact })));
        card.append(list);
      }

      const topics = createTagList(readTechnologies(repo), {
        className: "tag-list github-card__topics",
        label: "Technologies"
      });

      if (topics) {
        card.append(topics);
      }

      grid.append(card);
    }

    results.append(grid);

    if (matching.length > visible) {
      results.append(
        createButton({
          label: `Show ${Math.min(PAGE_SIZE, matching.length - visible)} more`,
          variant: "outline",
          size: "small",
          onClick: () => {
            visible += PAGE_SIZE;
            render();
          }
        })
      );
    }

    renderSelection();
  }

  /**
   * Builds one project record from a repository and the owner's edits.
   *
   * Ids continue the existing sequence, because a duplicate id would fail the
   * repository validator and a random id would make diffs unreadable.
   *
   * @param {Object} repo
   * @param {{title: string, description: string, categoryId: string, index: number}} draft
   * @param {number} nextNumber
   * @returns {Object}
   */
  function toProject(repo, draft, nextNumber) {
    const links = { sourceCode: repo.url };

    if (/^https?:\/\//i.test(repo.homepage)) {
      links.liveDemo = repo.homepage;
    }

    return {
      id: `project-${String(nextNumber).padStart(3, "0")}`,
      isSample: false,
      title: draft.title,
      shortDescription: draft.description,
      description: draft.description,
      categoryId: draft.categoryId || undefined,
      coverImage: null,
      imageAlt: "",
      gallery: [],
      technologies: readTechnologies(repo),
      relatedSkillIds: [],
      role: "",
      contributions: [],
      links,
      status: "",
      featured: false,
      startDate: repo.createdAt ? repo.createdAt.slice(0, 10) : undefined,
      endDate: "",
      order: draft.index,
      enabled: true
    };
  }

  /** Opens the conversion dialog for the current selection. */
  function openReview() {
    const chosen = repos.filter((repo) => selected.has(repo.name));

    if (chosen.length === 0) {
      return;
    }

    const content = el("div", { className: "github-review" });

    content.append(
      el("p", {
        className: "details-panel__text",
        text: `${chosen.length} repository/repositories will become project records. Edit the titles and summaries; they are pre-filled from GitHub, not invented.`
      })
    );

    const categoryField = el("div", { className: "field" });
    categoryField.append(el("label", { className: "field__label", text: "Category for every imported project", attrs: { for: "github-category" } }));
    const categorySelect = el("select", {
      className: "field__input field__input--select",
      attrs: { id: "github-category" }
    });
    categorySelect.append(el("option", { text: "No category", attrs: { value: "" } }));

    for (const category of projectCategories) {
      categorySelect.append(el("option", { text: category.name, attrs: { value: category.id } }));
    }

    categoryField.append(categorySelect);
    content.append(categoryField);

    const drafts = [];

    chosen.forEach((repo, index) => {
      const block = el("fieldset", { className: "github-review__item" });
      block.append(el("legend", { text: repo.name }));

      const titleId = `github-title-${repo.id}`;
      const titleField = el("div", { className: "field" });
      titleField.append(el("label", { className: "field__label", text: "Project title", attrs: { for: titleId } }));
      const titleInput = el("input", {
        className: "field__input",
        attrs: { id: titleId, type: "text", value: asText(repo.name).replace(/[-_]+/g, " ") }
      });
      titleField.append(titleInput);
      block.append(titleField);

      const summaryId = `github-summary-${repo.id}`;
      const summaryField = el("div", { className: "field" });
      summaryField.append(el("label", { className: "field__label", text: "Short description", attrs: { for: summaryId } }));
      const summaryInput = el("textarea", {
        className: "field__input field__input--textarea",
        attrs: { id: summaryId, rows: "2" }
      });
      summaryInput.value = asText(repo.description);
      summaryField.append(summaryInput);
      block.append(summaryField);

      content.append(block);
      drafts.push({ repo, titleInput, summaryInput, index });
    });

    const footer = el("div", { className: "details-panel__actions" });

    const cancel = el("button", {
      className: "btn btn--ghost btn--small",
      text: "Cancel",
      attrs: { type: "button" }
    });
    cancel.addEventListener("click", () => closeModal(undefined, "github-review"));

    const convert = el("button", {
      className: "btn btn--primary btn--small",
      text: "Build JSON preview",
      attrs: { type: "button" }
    });

    convert.addEventListener("click", () => {
      const maxNumber = existingProjects.reduce((max, project) => {
        const match = /^project-(\d+)$/.exec(asText(project.id));
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0);

      const records = [];
      let rejected = 0;

      for (const draft of drafts) {
        const title = asText(draft.titleInput.value);

        if (!title) {
          rejected += 1;
          continue;
        }

        records.push(
          toProject(
            draft.repo,
            {
              title,
              description: asText(draft.summaryInput.value),
              categoryId: categorySelect.value,
              index: maxNumber + records.length + 1
            },
            maxNumber + records.length + 1
          )
        );
      }

      closeModal(undefined, "github-convert");
      openPreview(records, rejected);
    });

    footer.append(cancel, convert);
    openModal({ title: "Review repositories", content, footer, size: "lg" });
  }

  /**
   * Shows the generated JSON, with copy and download actions.
   *
   * The preview is a <pre> written with textContent, so even a description that
   * contains markup is shown as characters, not rendered.
   *
   * @param {Array<Object>} records
   * @param {number} rejected
   * @returns {void}
   */
  function openPreview(records, rejected) {
    const payload = { schemaVersion: 1, projects: records };
    const json = JSON.stringify(payload, null, 2);

    const content = el("div", { className: "details-panel" });

    content.append(
      el("p", {
        className: "details-panel__text",
        text: rejected > 0
          ? `${records.length} project record(s) prepared; ${rejected} skipped because the title was empty.`
          : `${records.length} project record(s) prepared.`
      })
    );

    content.append(
      el("p", {
        className: "details-panel__note",
        text: "This page cannot write to the repository. Download the file, replace data/projects.json (or merge the records), then commit and push with git."
      })
    );

    const pre = el("pre", { className: "github-json" });
    pre.textContent = json;
    content.append(pre);

    const footer = el("div", { className: "details-panel__actions" });

    const copy = el("button", {
      className: "btn btn--ghost btn--small",
      text: "Copy JSON",
      attrs: { type: "button" }
    });
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(json);
        toast?.show?.({ message: "Project JSON copied.", type: "success" });
      } catch {
        toast?.show?.({ message: "Clipboard access was refused; select the text instead.", type: "error" });
      }
    });

    const download = el("button", {
      className: "btn btn--primary btn--small",
      text: "Download projects.json",
      attrs: { type: "button" }
    });
    download.addEventListener("click", () => {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "projects.json";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    });

    footer.append(copy, download);
    openModal({ title: "Project JSON", content, footer, size: "lg" });
  }

  /**
   * Fetches the public repository list once, on demand.
   *
   * The unauthenticated API allows 60 requests per hour per IP, which is why this
   * never runs at boot. Status handling is explicit: 403/429 is a quota message,
   * 404 means the username is wrong, and any other non-OK response names the
   * status instead of silently showing an empty list.
   *
   * @param {boolean} [force] - Bypass the cache (the Refresh action).
   * @returns {Promise<void>}
   */
  async function loadRepositories(force = false) {
    const typed = asText(usernameInput.value);
    const candidate = parseUsername(typed);

    if (!candidate) {
      statusLine.textContent =
        "Enter a GitHub username or a github.com profile URL, for example: ershubhambhagat.";
      toast?.show?.({ message: "That is not a GitHub username or profile URL.", type: "error" });
      return;
    }

    username = candidate;
    usernameInput.value = candidate;

    if (!force) {
      const cached = readCache();

      if (cached && cached.repos.length > 0) {
        repos = cached.repos;
        loadedAt = cached.fetchedAt;
        visible = PAGE_SIZE;
        selected.clear();
        syncLanguageOptions();
        render();
        statusLine.textContent = loadedAt
          ? `Showing the list cached on ${formatDate(loadedAt.slice(0, 10), "long")}. Press Refresh to spend a GitHub request.`
          : "Showing the cached list. Press Refresh to spend a GitHub request.";
        return;
      }
    }

    if (loading) {
      return;
    }

    loading = true;
    loadButton.disabled = true;
    statusLine.textContent = `Loading repositories for ${username}\u2026`;

    try {
      const response = await fetch(repositoriesEndpoint(username), {
        headers: { Accept: "application/vnd.github+json" },
        cache: "no-cache"
      });

      if (response.status === 403 || response.status === 429) {
        throw new Error("GitHub's hourly request limit for this network is used up. Try again later.");
      }

      if (response.status === 404) {
        throw new Error(`GitHub user "${username}" was not found.`);
      }

      if (!response.ok) {
        throw new Error(`GitHub answered with HTTP ${response.status}.`);
      }

      const payload = await response.json();

      if (!Array.isArray(payload)) {
        throw new Error("GitHub returned an unexpected payload.");
      }

      repos = payload.map(normalizeRepo).filter(Boolean);
      visible = PAGE_SIZE;
      selected.clear();
      loadedAt = new Date().toISOString();
      writeCache();
      syncLanguageOptions();
      render();

      statusLine.textContent =
        repos.length === 1
          ? "1 repository loaded."
          : `${repos.length} repositories loaded.`;
      toast?.show?.({ message: "Repository list loaded.", type: "success" });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "The repository list could not be loaded.";
      statusLine.textContent = message;
      toast?.show?.({ message, type: "error" });
    } finally {
      loading = false;
      loadButton.disabled = false;
    }
  }

  // Cached data is presented immediately, with its timestamp, so the visitor
  // sees content without spending quota. The button still allows a refresh.
  const cached = readCache();

  if (cached) {
    repos = cached.repos;
    loadedAt = cached.fetchedAt;
    syncLanguageOptions();
    render();
    statusLine.textContent = loadedAt
      ? `Showing the list cached on ${formatDate(loadedAt.slice(0, 10), "long")}. Press Refresh to spend a GitHub request.`
      : "Showing the cached list. Press Refresh to spend a GitHub request.";

    const labelNode = loadButton.querySelector(".btn__label");
    if (labelNode) {
      labelNode.textContent = "Refresh repositories";
    }
  } else {
    render();
  }

  void appContext?.bus;
}
