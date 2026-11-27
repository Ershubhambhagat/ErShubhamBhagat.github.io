/**
 * js/sections/bookmarks.js - the curated page collection.
 *
 * Data: data/bookmarks.json. Local pages ("./Blog/HTML/blog.html") are the
 * normal case here: they live in this repository, so they open in the same tab
 * and are not marked as external. An http(s) bookmark opens in a new tab with
 * rel="noopener noreferrer" through the card component's link handling.
 *
 * Favourites are the one piece of state this section owns. They are stored as an
 * array of bookmark ids under portfolio.favorites through the storage facade, so
 * a visitor keeps them across reloads, and a disabled-storage browser simply
 * starts with none instead of throwing.
 */

import { createButton, toSafeHref } from "../components/button.js";
import { createCard } from "../components/card.js";
import { STORAGE_KEYS } from "../core/storage-manager.js";
import {
  asArray,
  asText,
  el,
  prepareSection,
  readCollection,
  readSectionConfig,
  renderEmpty
} from "../core/section-kit.js";

/**
 * @param {Object|undefined} sectionData - data/bookmarks.json.
 * @param {{storage?: Object, bus?: Object, toast?: Object}} [appContext]
 * @returns {void}
 */
export function initializeBookmarks(sectionData, appContext) {
  const config = readSectionConfig(sectionData);
  const categories = readCollection(sectionData, "categories").filter(
    (category) => category.enabled !== false && asText(category.name)
  );
  const records = readCollection(sectionData, "bookmarks").filter(
    (record) => record.enabled !== false && asText(record.name) && asText(record.url)
  );

  if (config.enabled === false) {
    return;
  }

  const section = prepareSection("bookmarks", {
    title: asText(config.title) || "Bookmarks",
    intro: asText(config.description) || asText(config.subtitle)
  });

  if (!section) {
    return;
  }

  if (records.length === 0) {
    renderEmpty(section.body, {
      title: "No bookmarks yet",
      message: "Links added to data/bookmarks.json appear here."
    });
    return;
  }

  const storage = appContext?.storage;
  const bus = appContext?.bus;

  /** Reads the stored favourite ids, tolerating a missing or corrupt value. */
  function readFavorites() {
    if (!storage?.getLocalData) {
      return new Set();
    }

    const stored = storage.getLocalData(STORAGE_KEYS.favorites, []);
    return new Set(asArray(stored).map(asText).filter(Boolean));
  }

  let favorites = readFavorites();

  /**
   * Persists the favourite ids and announces the change.
   *
   * Storage is optional: a private-mode browser keeps toggles working for the
   * session and forgets them on reload. The bus event lets other modules react
   * without reading storage themselves.
   */
  function writeFavorites() {
    if (storage?.saveLocalData) {
      storage.saveLocalData(STORAGE_KEYS.favorites, [...favorites]);
    }

    bus?.emit?.("bookmarks:changed", { ids: [...favorites] });
  }

  const categoryNameById = new Map(
    categories.map((category) => [asText(category.id), asText(category.name)])
  );

  const container = el("div", { className: "bookmarks-groups" });

  /**
   * Rebuilds every category block from the dataset and the favourite set.
   *
   * Rebuilding, rather than patching one card, keeps the "favourites first" order
   * truthful after a toggle. A bookmark whose categoryId matches no category is
   * kept in an Other group instead of disappearing.
   */
  function render() {
    container.replaceChildren();

    // Group order follows the categories array; bookmarks with an unknown
    // category still render, last, because hiding a working link because of a
    // typo in its categoryId loses content.
    const groups = new Map();

    for (const category of categories) {
      groups.set(asText(category.id), []);
    }

    const uncategorised = [];

    for (const record of records) {
      const categoryId = asText(record.categoryId);

      if (groups.has(categoryId)) {
        groups.get(categoryId).push(record);
      } else {
        uncategorised.push(record);
      }
    }

    const orderedGroups = categories
      .map((category) => ({ category, items: groups.get(asText(category.id)) }))
      .filter((group) => group.items.length > 0);

    if (uncategorised.length > 0) {
      orderedGroups.push({
        category: { id: "other", name: "Other" },
        items: uncategorised
      });
    }

    for (const group of orderedGroups) {
      const block = el("section", { className: "bookmarks-group" });
      block.append(el("h3", { className: "bookmarks-group__title", text: asText(group.category.name) }));

      const description = asText(group.category.description);
      if (description) {
        block.append(el("p", { className: "bookmarks-group__text", text: description }));
      }

      const grid = el("div", { className: "bookmarks-grid card-grid" });
      const items = config.showFavoritesFirst === false
        ? group.items
        : group.items.slice().sort((a, b) => {
            const favA = favorites.has(asText(a.id)) ? 0 : 1;
            const favB = favorites.has(asText(b.id)) ? 0 : 1;
            return favA - favB || (Number(a.order) || 0) - (Number(b.order) || 0);
          });

      for (const record of items) {
        const id = asText(record.id);
        const name = asText(record.name);
        const favourite = favorites.has(id);

        const safeUrl = toSafeHref(asText(record.url));

        if (!safeUrl) {
          continue;
        }

        const openLink = document.createElement("a");
        openLink.className = "btn btn--ghost btn--small";
        openLink.href = safeUrl;
        openLink.textContent = "Open";

        if (/^https?:/i.test(safeUrl)) {
          openLink.target = "_blank";
          openLink.rel = "noopener noreferrer";
          openLink.setAttribute("aria-label", `Open ${name} (opens in a new tab)`);
        }

        const favouriteButton = createButton({
          label: favourite ? "\u2605" : "\u2606",
          ariaLabel: favourite
            ? `Remove ${name} from favourites`
            : `Add ${name} to favourites`,
          variant: "ghost",
          size: "small",
          className: "bookmark-favorite",
          onClick: () => {
            if (favorites.has(id)) {
              favorites.delete(id);
            } else {
              favorites.add(id);
            }

            writeFavorites();
            render();
          }
        });

        favouriteButton.setAttribute("aria-pressed", String(favourite));

        const actions = [openLink];

        if (id) {
          actions.push(favouriteButton);
        }

        const card = createCard({
          title: name,
          subtitle: categoryNameById.get(asText(record.categoryId)) || "",
          description: asText(record.description),
          badges: asArray(record.tags).map(asText).filter(Boolean),
          actions,
          headingLevel: 4
        });

        grid.append(card);
      }

      block.append(grid);
      container.append(block);
    }
  }

  render();
  section.body.append(container);
  void appContext?.toast;
}
