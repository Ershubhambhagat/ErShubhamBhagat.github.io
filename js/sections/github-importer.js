/**
 * js/sections/github-importer.js - public repositories from the GitHub API.
 *
 * This section is the only network call the site makes after boot. Three
 * decisions follow from that:
 *
 *  1. It does not fetch on page load. The unauthenticated GitHub API allows 60
 *     requests per hour per IP, shared by everyone behind the same address, so a
 *     portfolio that fetched on every visit would exhaust the quota and then show
 *     errors to the next visitor. The owner presses "Load repositories" once; the
 *     result is cached in storage (portfolio.draft.githubImport) for the next visit.
 *  2. It never carries a token. .build/CONTRACT.md forbids embedding one, and a
 *     token in client-side JavaScript is public the moment it is deployed.
 *  3. Everything the API returns is untrusted text: it is written with
 *     textContent, and repo URLs pass the same allow-list as every other link.
 *
 * The username is the one attested in README.md and every social handle
 * (.build/FACTS.md section 1).
 */

import { createButton } from "../components/button.js";
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

/** Attested GitHub username; change here if the account is renamed. */
const GITHUB_USERNAME = "ershubhambhagat";

/** API endpoint: public, unauthenticated, newest first. */
const REPOS_ENDPOINT = `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100&sort=updated&type=owner`;

/** How many repositories the section renders before offering the full list. */
const INITIAL_VISIBLE = 6;

/**
 * Normalises one API repository into the fields the section renders.
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
    updatedAt: asText(repo.updated_at),
    isFork: repo.fork === true,
    isArchived: repo.archived === true
  };
}

/**
 * @param {Object|undefined} sectionData - Unused: this section has no dataset.
 * @param {{storage?: Object, toast?: Object, config?: Object}} [appContext]
 * @returns {void}
 */
export function initializeGithubImporter(sectionData, appContext) {
  const section = prepareSection("github-importer", {
    title: "GitHub",
    intro: `Public repositories from github.com/${GITHUB_USERNAME}. Loaded on request, because the public GitHub API has a shared hourly quota.`
  });

  if (!section) {
    return;
  }

  const storage = appContext?.storage;
  const toast = appContext?.toast;
  const statusLine = el("p", {
    className: "github-status",
    attrs: { role: "status", "aria-live": "polite" }
  });
  const results = el("div", { className: "github-results" });

  let repos = [];
  let visible = INITIAL_VISIBLE;
  let loadedAt = "";

  /** Reads the cached fetch, tolerating any corrupt or old shape. */
  function readCache() {
    if (!storage?.getLocalData) {
      return null;
    }

    const cached = storage.getLocalData(STORAGE_KEYS.draft.githubImport, null);

    if (!isRecord(cached) || !Array.isArray(cached.repos)) {
      return null;
    }

    const records = cached.repos.map(normalizeRepo).filter(Boolean);

    return records.length > 0
      ? { repos: records, fetchedAt: asText(cached.fetchedAt) }
      : null;
  }

  /**
   * Stores the normalized list so the next visit does not spend GitHub quota.
   *
   * Only the fields normalizeRepo keeps are written; the raw API payload is not
   * cached, which keeps the entry small and stable if the API adds fields.
   */
  function writeCache() {
    storage?.saveLocalData?.(STORAGE_KEYS.draft.githubImport, {
      fetchedAt: new Date().toISOString(),
      repos
    });
  }

  /**
   * Draws the currently revealed slice of the repository list.
   *
   * "Show more" only increases `visible` and calls this again: rendering is a
   * pure function of `repos`, `visible` and the cached timestamp.
   */
  function render() {
    results.replaceChildren();

    if (repos.length === 0) {
      renderEmpty(results, {
        title: "Nothing loaded yet",
        message: "Use the button above to fetch the public repository list."
      });
      return;
    }

    const cards = el("div", { className: "github-grid card-grid" });
    const shown = repos.slice(0, visible);

    for (const repo of shown) {
      const card = el("article", { className: "github-card" });
      const heading = el("h3", { className: "github-card__title" });

      const link = document.createElement("a");
      link.className = "github-card__link";
      link.href = /^https:\/\/github\.com\//i.test(repo.url)
        ? repo.url
        : `https://github.com/${GITHUB_USERNAME}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = repo.name;
      heading.append(link);
      card.append(heading);

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
      if (repo.updatedAt) {
        facts.push(`Updated ${formatDate(repo.updatedAt.slice(0, 10), "long")}`);
      }
      if (repo.isArchived) {
        facts.push("Archived");
      }

      if (facts.length > 0) {
        const list = el("ul", { className: "github-card__facts" });
        facts.forEach((fact) => list.append(el("li", { text: fact })));
        card.append(list);
      }

      const topics = createTagList(repo.topics, {
        className: "tag-list github-card__topics",
        label: "Topics"
      });

      if (topics) {
        card.append(topics);
      }

      cards.append(card);
    }

    results.append(cards);

    if (repos.length > visible) {
      const more = createButton({
        label: `Show ${Math.min(INITIAL_VISIBLE, repos.length - visible)} more`,
        variant: "outline",
        size: "small",
        onClick: () => {
          visible += INITIAL_VISIBLE;
          render();
        }
      });
      results.append(more);
    }
  }

  /**
   * Fetches the public repository list once, on demand.
   *
   * The unauthenticated API allows 60 requests per hour per IP, which is why this
   * never runs at boot. Status handling is explicit: 403/429 is a quota message,
   * 404 means the configured username is wrong, and any other non-OK response
   * names the status instead of silently showing an empty list.
   */
  async function loadRepositories() {
    statusLine.textContent = "Loading repositories\u2026";
    loadButton.disabled = true;

    try {
      const response = await fetch(REPOS_ENDPOINT, {
        headers: { Accept: "application/vnd.github+json" },
        cache: "no-cache"
      });

      if (response.status === 403 || response.status === 429) {
        throw new Error(
          "GitHub's hourly request limit for this network is used up. Try again later."
        );
      }

      if (response.status === 404) {
        throw new Error(`GitHub user "${GITHUB_USERNAME}" was not found.`);
      }

      if (!response.ok) {
        throw new Error(`GitHub answered with HTTP ${response.status}.`);
      }

      const payload = await response.json();

      if (!Array.isArray(payload)) {
        throw new Error("GitHub returned an unexpected payload.");
      }

      repos = payload.map(normalizeRepo).filter(Boolean);
      visible = INITIAL_VISIBLE;
      loadedAt = new Date().toISOString();
      writeCache();
      render();

      statusLine.textContent =
        repos.length === 1
          ? "1 repository loaded."
          : `${repos.length} repositories loaded.`;
      toast?.success?.("Repository list loaded.");
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "The repository list could not be loaded.";
      statusLine.textContent = message;
      toast?.error?.(message);
    } finally {
      loadButton.disabled = false;
    }
  }

  const loadButton = createButton({
    label: "Load repositories",
    variant: "primary",
    onClick: () => {
      void loadRepositories();
    }
  });

  const controls = el("div", { className: "github-controls" });
  controls.append(loadButton);

  section.body.append(controls, statusLine, results);

  // A cached fetch is presented immediately, with its timestamp, so the visitor
  // sees content without spending quota. The button stays for a refresh.
  const cached = readCache();

  if (cached) {
    repos = cached.repos;
    loadedAt = cached.fetchedAt;
    render();
    statusLine.textContent = loadedAt
      ? `Showing the list cached on ${formatDate(loadedAt.slice(0, 10), "long")}. Use the button to refresh.`
      : "Showing the cached list. Use the button to refresh.";
    // Update the label inside the button rather than its textContent: the
    // component keeps its label in .btn__label, and replacing the whole button
    // text would drop the class the stylesheet targets.
    const labelNode = loadButton.querySelector(".btn__label");
    if (labelNode) {
      labelNode.textContent = "Refresh repositories";
    }
  } else {
    render();
  }
}
