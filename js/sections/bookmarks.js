/**
 * js/sections/bookmarks.js - the curated page collection.
 *
 * Data: data/bookmarks.json. Local pages ("./Old_Data/Blog/HTML/blog.html") are
 * the normal case here: they live in this repository, so they open in the same
 * tab and are not marked as external. An http(s) bookmark opens in a new tab with
 * rel="noopener noreferrer" through the card component's link handling.
 *
 * Selection: search, category, sorting and the favourite-first rule are applied
 * to the immutable dataset on every pass. The section keeps its own toolbar
 * because the output is grouped by category, which the shared collection view
 * does not model; matching still comes from js/core/search-engine.js so the rules
 * are identical to every other section.
 *
 * Editing boundary (decision recorded here and in docs/ARCHIVE/PROJECT_HISTORY.md): permanent
 * create/edit/delete belongs to tools/json-editor, which can write the file. This
 * page offers export and a session import with a preview, because a static page
 * cannot commit to its own repository and a fake save button would be worse than
 * none. Imported records live in memory for the session and are announced on the
 * bus; nothing is uploaded anywhere.
 *
 * Media: faviconUrl, image and screenshot are optional. A missing or broken file
 * collapses the slot (createImage) instead of leaving an empty frame.
 *
 * Favourites are the one piece of state this section owns. They are stored as an
 * array of bookmark ids under portfolio.favorites through the storage facade, so
 * a visitor keeps them across reloads, and a disabled-storage browser simply
 * starts with none instead of throwing.
 */

import {
  emptyDrafts,
  isEmptyDrafts,
  mergeBookmarks,
  normalizeDrafts,
  toExportDataset,
  validateBookmark
} from "../core/bookmark-drafts.js";
import { createButton, toSafeHref } from "../components/button.js";
import { createCard } from "../components/card.js";
import { closeModal, confirmModal, openModal } from "../components/modal.js";
import { matchesQuery } from "../core/search-engine.js";
import { STORAGE_KEYS } from "../core/storage-manager.js";
import {
  asArray,
  asText,
  createImage,
  createMetaList,
  createTagList,
  el,
  isRecord,
  prepareSection,
  readCollection,
  readSectionConfig,
  renderEmpty
} from "../core/section-kit.js";

/** Teardown for a previous initialization. */
let teardownPrevious = null;

/** Owner mode is a URL switch, not a permission: it only reveals draft controls. */
const OWNER_PARAM = "owner";

/** Sort modes offered above the groups. */
const SORT_OPTIONS = Object.freeze([
  { value: "curated", label: "Curated order" },
  { value: "alphabetical", label: "Name A to Z" },
  { value: "favorites", label: "Favourites first" }
]);

/**
 * Reads a bookmark's display name.
 *
 * @param {Object} record
 * @returns {string}
 */
function readName(record) {
  return asText(record.name) || asText(record.title);
}

/**
 * Validates one imported record.
 *
 * An import is owner data, but it is still untrusted input: it must have a name
 * and a URL that survives the same allow-list as every rendered link. Anything
 * else is counted as rejected rather than silently dropped.
 *
 * @param {unknown} value
 * @returns {{ok: true, record: Object} | {ok: false}}
 */
function normalizeImported(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false };
  }

  const name = asText(value.name) || asText(value.title);
  const url = toSafeHref(asText(value.url));

  if (!name || !url) {
    return { ok: false };
  }

  return {
    ok: true,
    record: {
      ...value,
      id: asText(value.id) || "",
      name,
      url,
      enabled: value.enabled !== false
    }
  };
}

/**
 * @param {Object|undefined} sectionData - data/bookmarks.json.
 * @param {{storage?: Object, bus?: Object, toast?: Object}} [appContext]
 * @returns {void}
 */
export function initializeBookmarks(sectionData, appContext) {
  if (typeof teardownPrevious === "function") {
    teardownPrevious();
    teardownPrevious = null;
  }

  const config = readSectionConfig(sectionData);
  const categories = readCollection(sectionData, "categories").filter(
    (category) => category.enabled !== false && asText(category.name)
  );

  const dataset = isRecord(sectionData) ? sectionData : {};
  const publishedRecords = readCollection(sectionData, "bookmarks").filter(
    (record) => record.enabled !== false && readName(record) && asText(record.url)
  );
  // Owner drafts are an overlay on the published array, never a mutation of it.
  const ownerMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get(OWNER_PARAM) === "1";
  let drafts = emptyDrafts();
  let records = publishedRecords;

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
  const toast = appContext?.toast;

  /** Reads the stored favourite ids, tolerating a missing or corrupt value. */
  function readFavorites() {
    if (!storage?.getLocalData) {
      return new Set();
    }

    const stored = storage.getLocalData(STORAGE_KEYS.favorites, []);
    return new Set(asArray(stored).map(asText).filter(Boolean));
  }

  let favorites = readFavorites();

  if (ownerMode) {
    drafts = normalizeDrafts(storage?.getLocalData?.(STORAGE_KEYS.draft.bookmarkDrafts, null));
    records = mergeBookmarks(publishedRecords, drafts);
  }

  /**
   * Persists the draft overlay and redraws from the merged records.
   *
   * Storage is optional: without it the edits stay in memory for the session and
   * the owner bar says so, instead of pretending they were saved.
   */
  function saveDrafts(nextDrafts) {
    drafts = normalizeDrafts(nextDrafts);
    records = mergeBookmarks(publishedRecords, drafts);

    if (storage?.saveLocalData) {
      storage.saveLocalData(STORAGE_KEYS.draft.bookmarkDrafts, drafts);
    }

    bus?.emit?.("bookmarks:drafts", { pending: !isEmptyDrafts(drafts) });
    render();
    updateOwnerBar();
  }

  /** @returns {number} Order value that places a new record first. */
  function nextOrder() {
    let lowest = 0;

    for (const record of records) {
      const order = Number(record.order);

      if (Number.isFinite(order)) {
        lowest = Math.min(lowest, order);
      }
    }

    return lowest - 1;
  }

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

  const state = { query: "", category: "", sort: "curated" };
  const container = el("div", { className: "bookmarks-groups" });
  const status = el("p", {
    className: "collection-status",
    attrs: { role: "status", "aria-live": "polite" }
  });

  /**
   * Applies search/category/sort to the current records.
   *
   * @returns {Array<Object>}
   */
  function selectRecords() {
    let selected = records;

    if (state.category) {
      selected = selected.filter((record) => asText(record.categoryId) === state.category);
    }

    if (state.query.trim()) {
      selected = selected.filter((record) =>
        matchesQuery(record, state.query, {
          fields: ["name", "title", "description", "tags", "notes"]
        })
      );
    }

    const sorted = selected.slice();

    if (state.sort === "alphabetical") {
      sorted.sort((a, b) =>
        readName(a).localeCompare(readName(b), undefined, { sensitivity: "base", numeric: true })
      );
    } else {
      sorted.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    }

    // "Favourites first" and the section's configured default share one rule:
    // favourites float, everything else keeps its curated order.
    if (state.sort === "favorites" || (state.sort === "curated" && config.showFavoritesFirst !== false)) {
      sorted.sort((a, b) => {
        const favA = favorites.has(asText(a.id)) ? 0 : 1;
        const favB = favorites.has(asText(b.id)) ? 0 : 1;
        return favA - favB;
      });
    }

    return sorted;
  }

  /**
   * Opens the preview dialog for one bookmark.
   *
   * An iframe is only used for an absolute https URL and always carries a
   * sandbox plus a visible fallback link: many sites send X-Frame-Options and
   * simply refuse to render, and a local ./ page inside an iframe would be a
   * second copy of the site inside itself.
   *
   * @param {Object} record
   * @returns {void}
   */
  function openPreview(record) {
    const name = readName(record);
    const safeUrl = toSafeHref(asText(record.url));
    const content = el("div", { className: "details-panel" });
    const description = asText(record.description);

    if (description) {
      content.append(el("p", { className: "details-panel__text", text: description }));
    }

    const meta = createMetaList([
      { label: "Category", value: categoryNameById.get(asText(record.categoryId)) || "" },
      { label: "Address", value: safeUrl || "" }
    ]);

    if (meta) {
      content.append(meta);
    }

    const tags = createTagList(asArray(record.tags).map(asText).filter(Boolean), { label: "Tags" });
    if (tags) {
      content.append(tags);
    }

    const notes = asText(record.notes);
    if (notes) {
      content.append(el("p", { className: "details-panel__note", text: notes }));
    }

    const image = createImage({
      src: asText(record.screenshot) || asText(record.image),
      alt: `${name} preview`,
      className: "bookmark-preview__image",
      width: 960,
      height: 540
    });

    if (image) {
      content.append(image);
    }

    if (safeUrl && /^https:\/\//i.test(safeUrl)) {
      const frame = el("iframe", {
        className: "bookmark-preview__frame",
        attrs: {
          src: safeUrl,
          title: `Preview of ${name}`,
          loading: "lazy",
          sandbox: "allow-scripts allow-same-origin allow-popups",
          referrerpolicy: "no-referrer"
        }
      });
      content.append(frame);
      content.append(
        el("p", {
          className: "bookmark-preview__note",
          text: "Some sites refuse to be embedded; use the link below if the frame stays empty."
        })
      );
    }

    const footer = el("div", { className: "details-panel__actions" });
    const openLink = document.createElement("a");
    openLink.className = "btn btn--primary btn--small";
    openLink.href = safeUrl || "#bookmarks";

    if (safeUrl && /^https?:/i.test(safeUrl)) {
      openLink.target = "_blank";
      openLink.rel = "noopener noreferrer";
    }

    openLink.textContent = "Open bookmark";
    footer.append(openLink);

    openModal({
      title: name,
      content,
      footer,
      size: "lg"
    });
  }

  // ---- Owner mode: draft create/edit/delete ------------------------------
  // The published file is never written here. Owner mode edits a LocalStorage
  // overlay, shows the result immediately, and the existing Export JSON action
  // becomes the publish step: export, then commit data/bookmarks.json.
  let ownerParts = null;

  /** @returns {{wrapper: HTMLElement, input: HTMLElement, error: HTMLElement}} */
  function createFormControl({ id, label, value, type = "text", multiline = false, placeholder = "" }) {
    const wrapper = el("div", { className: "field bookmarks-form__field" });
    const control = multiline
      ? el("textarea", {
          className: "field__input field__input--textarea",
          attrs: { id, name: id, rows: "3" }
        })
      : el("input", {
          className: "field__input",
          attrs: { id, name: id, type, placeholder, autocomplete: "off" }
        });

    control.value = asText(value);

    if (placeholder && multiline) {
      control.setAttribute("placeholder", placeholder);
    }

    const error = el("p", {
      className: "bookmarks-form__error",
      attrs: { id: `${id}-error` }
    });
    error.hidden = true;

    wrapper.append(
      el("label", { className: "field__label", text: label, attrs: { for: id } }),
      control,
      error
    );
    return { wrapper, input: control, error };
  }

  /**
   * Opens the create/edit form.
   *
   * @param {Object|null} record - Existing bookmark, or null to create.
   */
  function openBookmarkForm(record = null) {
    const editingId = asText(record?.id);
    const form = el("form", {
      className: "bookmarks-form",
      attrs: { id: "bookmark-draft-form", novalidate: "" }
    });
    form.noValidate = true;

    const name = createFormControl({
      id: "bookmark-name",
      label: "Name",
      value: record?.name,
      placeholder: "MDN Web Docs"
    });
    const url = createFormControl({
      id: "bookmark-url",
      label: "Address",
      value: record?.url,
      placeholder: "https://example.com or ./Blog/page.html"
    });
    const description = createFormControl({
      id: "bookmark-description",
      label: "Description",
      value: record?.description,
      multiline: true
    });
    const tags = createFormControl({
      id: "bookmark-tags",
      label: "Tags (comma separated)",
      value: asArray(record?.tags).join(", ")
    });
    const notes = createFormControl({
      id: "bookmark-notes",
      label: "Notes",
      value: record?.notes,
      multiline: true
    });

    const categoryWrapper = el("div", { className: "field bookmarks-form__field" });
    categoryWrapper.append(
      el("label", { className: "field__label", text: "Category", attrs: { for: "bookmark-category" } })
    );
    const categorySelect = el("select", {
      className: "field__input field__input--select",
      attrs: { id: "bookmark-category", name: "categoryId" }
    });
    categorySelect.append(el("option", { text: "No category", attrs: { value: "" } }));

    for (const category of categories) {
      const option = el("option", {
        text: asText(category.name),
        attrs: { value: asText(category.id) }
      });

      if (asText(category.id) === asText(record?.categoryId)) {
        option.selected = true;
      }

      categorySelect.append(option);
    }

    categoryWrapper.append(categorySelect);

    const media = createFormControl({
      id: "bookmark-favicon",
      label: "Favicon URL (optional)",
      value: record?.faviconUrl
    });
    const image = createFormControl({
      id: "bookmark-image",
      label: "Image URL (optional)",
      value: record?.image
    });
    const screenshot = createFormControl({
      id: "bookmark-screenshot",
      label: "Screenshot URL (optional)",
      value: record?.screenshot
    });

    const featuredWrapper = el("div", {
      className: "field bookmarks-form__field bookmarks-form__check"
    });
    const featured = el("input", {
      className: "field__checkbox",
      attrs: { id: "bookmark-featured", name: "featured", type: "checkbox" }
    });
    featured.checked = record?.featured === true;
    featuredWrapper.append(
      featured,
      el("label", {
        className: "field__label",
        text: "Featured",
        attrs: { for: "bookmark-featured" }
      })
    );

    const errors = el("div", { className: "bookmarks-form__errors", attrs: { role: "alert" } });
    errors.hidden = true;

    form.append(
      name.wrapper,
      url.wrapper,
      description.wrapper,
      categoryWrapper,
      tags.wrapper,
      notes.wrapper,
      media.wrapper,
      image.wrapper,
      screenshot.wrapper,
      featuredWrapper,
      errors
    );

    const fields = { name, url, description, tags, notes };
    const footer = el("div", { className: "details-panel__actions" });
    const cancel = createButton({
      label: "Cancel",
      variant: "outline",
      size: "small",
      onClick: () => closeModal()
    });
    // The footer sits outside the <form> element, so the commit control asks the
    // form to submit instead of relying on a cross-tree `form` attribute.
    const save = createButton({
      label: editingId ? "Save changes" : "Add bookmark",
      variant: "primary",
      size: "small",
      onClick: () => form.requestSubmit()
    });

    const clearErrors = () => {
      errors.hidden = true;
      errors.replaceChildren();

      for (const field of Object.values(fields)) {
        field.error.hidden = true;
        field.input.removeAttribute("aria-invalid");
        field.input.removeAttribute("aria-describedby");
      }
    };

    const showErrors = (messages) => {
      clearErrors();
      const entries = Object.entries(messages);
      let first = null;

      for (const [key, message] of entries) {
        const field = fields[key];

        if (!field) {
          continue;
        }

        first = first ?? field;
        field.error.textContent = message;
        field.error.hidden = false;
        field.input.setAttribute("aria-invalid", "true");
        field.input.setAttribute("aria-describedby", `${field.input.id}-error`);
      }

      if (first) {
        first.input.focus();
        return;
      }

      errors.hidden = false;
      errors.append(el("p", { text: "Check the highlighted fields." }));
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      clearErrors();

      const result = validateBookmark(
        {
          name: name.input.value,
          url: url.input.value,
          description: description.input.value,
          categoryId: categorySelect.value,
          tags: tags.input.value,
          notes: notes.input.value,
          faviconUrl: media.input.value,
          image: image.input.value,
          screenshot: screenshot.input.value,
          featured: featured.checked
        },
        {
          records,
          editingId,
          order: editingId ? Number(record?.order) || 0 : nextOrder()
        }
      );

      if (!result.ok) {
        showErrors(result.errors);
        return;
      }

      const next = normalizeDrafts(drafts);

      if (editingId) {
        const createdIndex = next.created.findIndex((entry) => asText(entry.id) === editingId);

        if (createdIndex >= 0) {
          next.created[createdIndex] = { ...next.created[createdIndex], ...result.record };
        } else {
          next.updated[editingId] = { ...(next.updated[editingId] ?? {}), ...result.record };
        }
      } else {
        next.created.unshift(result.record);
      }

      closeModal();
      saveDrafts(next);
      toast?.show?.({
        message: editingId
          ? "Bookmark updated in this browser's drafts. Export to publish."
          : "Bookmark added to this browser's drafts. Export to publish.",
        type: "success"
      });
    });

    footer.append(cancel, save);
    openModal({
      title: editingId ? "Edit bookmark" : "Add bookmark",
      content: form,
      footer,
      size: "lg"
    });
  }

  /** Asks before removing a bookmark from the draft set. */
  function requestDelete(record) {
    const name = readName(record);

    void confirmModal({
      title: "Delete bookmark",
      message: `Delete "${name}"? It disappears from this browser's drafts; data/bookmarks.json changes only when you export and commit it.`,
      confirmLabel: "Delete bookmark",
      destructive: true
    }).then((confirmed) => {
      if (!confirmed) {
        return;
      }

      const id = asText(record.id);
      const next = normalizeDrafts(drafts);
      const createdIndex = next.created.findIndex((entry) => asText(entry.id) === id);

      if (createdIndex >= 0) {
        next.created.splice(createdIndex, 1);
      } else if (id) {
        delete next.updated[id];
        next.deleted = [...new Set([...next.deleted, id])];
      }

      favorites.delete(id);
      writeFavorites();
      saveDrafts(next);
      toast?.show?.({
        message: `"${name}" removed from this browser's drafts.`,
        type: "success"
      });
    });
  }

  /** Refreshes the owner bar text and button states after every change. */
  function updateOwnerBar() {
    if (!ownerParts) {
      return;
    }

    const pending =
      drafts.created.length + drafts.deleted.length + Object.keys(drafts.updated).length;

    ownerParts.note.textContent = pending
      ? `${pending} pending change${pending === 1 ? "" : "s"} in this browser. Export JSON, then commit data/bookmarks.json to publish them.`
      : "No pending changes. Added, edited and deleted bookmarks stay in this browser until you export and commit them.";
    ownerParts.discard.disabled = pending === 0;
  }

  /** Builds the owner bar once, when the page is opened with ?owner=1. */
  function createOwnerBar() {
    const bar = el("div", {
      className: "bookmarks-owner",
      attrs: { role: "group", "aria-label": "Owner tools" }
    });
    const note = el("p", { className: "bookmarks-owner__note" });
    const actions = el("div", { className: "bookmarks-owner__actions" });

    const add = createButton({
      label: "Add bookmark",
      variant: "primary",
      size: "small",
      onClick: () => openBookmarkForm()
    });

    const discard = createButton({
      label: "Discard drafts",
      variant: "ghost",
      size: "small",
      onClick: () => {
        void confirmModal({
          title: "Discard drafts",
          message:
            "Remove every pending bookmark change from this browser? The published data/bookmarks.json is not affected.",
          confirmLabel: "Discard drafts",
          destructive: true
        }).then((confirmed) => {
          if (confirmed) {
            saveDrafts(emptyDrafts());
            toast?.show?.({ message: "Bookmark drafts discarded.", type: "success" });
          }
        });
      }
    });

    actions.append(add, discard);
    bar.append(note, actions);
    return { bar, note, discard };
  }

  /**
   * Rebuilds every category block from the dataset and the favourite set.
   *
   * Rebuilding, rather than patching one card, keeps the "favourites first" order
   * truthful after a toggle. A bookmark whose categoryId matches no category is
   * kept in an Other group instead of disappearing.
   */
  function render() {
    container.replaceChildren();

    const visible = selectRecords();

    // Group order follows the categories array; bookmarks with an unknown
    // category still render, last, because hiding a working link because of a
    // typo in its categoryId loses content.
    const groups = new Map();

    for (const category of categories) {
      groups.set(asText(category.id), []);
    }

    const uncategorised = [];

    for (const record of visible) {
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

      for (const record of group.items) {
        const id = asText(record.id);
        const name = readName(record);
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

        actions.push(
          createButton({
            label: "Preview",
            variant: "ghost",
            size: "small",
            onClick: () => openPreview(record)
          })
        );

        if (ownerMode) {
          // Owner controls live behind ?owner=1 and never appear in the public
          // view; they edit the local draft overlay, not the published file.
          actions.push(
            createButton({
              label: "Edit",
              variant: "ghost",
              size: "small",
              ariaLabel: `Edit ${name}`,
              onClick: () => openBookmarkForm(record)
            }),
            createButton({
              label: "Delete",
              variant: "ghost",
              size: "small",
              ariaLabel: `Delete ${name}`,
              onClick: () => requestDelete(record)
            })
          );
        }

        const card = createCard({
          id: id || undefined,
          title: name,
          subtitle: categoryNameById.get(asText(record.categoryId)) || "",
          description: asText(record.description),
          badges: asArray(record.tags).map(asText).filter(Boolean),
          actions,
          headingLevel: 4,
          image: asText(record.image) || asText(record.screenshot)
            ? {
                src: asText(record.image) || asText(record.screenshot),
                alt: `${name} preview`,
                ratio: "wide"
              }
            : undefined,
          onClick: () => openPreview(record)
        });

        grid.append(card);
      }

      if (grid.childElementCount > 0) {
        block.append(grid);
        container.append(block);
      }
    }

    status.textContent = visible.length === 1 ? "1 bookmark" : `${visible.length} bookmarks`;

    if (container.childElementCount === 0) {
      renderEmpty(container, {
        title: "No bookmarks match",
        message: "Clear the search or choose another category."
      });
    }
  }

  /**
   * Downloads the current bookmark array as a bookmarks-shaped file.
   *
   * The file is what the owner commits with git; this page cannot write to its
   * own repository, which is why the UI says so instead of showing a fake save.
   */
  function exportBookmarks() {
    // Export always reflects what is on screen, so a draft set can be committed
    // as-is. The category list travels with the records because a bookmark whose
    // categoryId has no category would otherwise lose its group.
    const payload = toExportDataset(
      { ...dataset, categories: categories.map((category) => ({ ...category })) },
      records
    );
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bookmarks.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    toast?.show?.({
      message: isEmptyDrafts(drafts)
        ? "Bookmarks exported as bookmarks.json"
        : "Bookmarks exported as bookmarks.json, including pending drafts",
      type: "success"
    });
  }

  /**
   * Imports a bookmarks file into the session after a preview.
   *
   * Merge keeps the existing records and appends new URLs; replace swaps the
   * whole array. Duplicates are compared by normalised URL, because the same page
   * can be recorded with a trailing slash in two files.
   *
   * @param {File} file
   * @returns {Promise<void>}
   */
  async function importBookmarks(file) {
    let parsed;

    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast?.show?.({ message: "That file is not valid JSON.", type: "error" });
      return;
    }

    const incomingRaw = Array.isArray(parsed?.bookmarks)
      ? parsed.bookmarks
      : Array.isArray(parsed)
        ? parsed
        : [];

    if (incomingRaw.length === 0) {
      toast?.show?.({ message: "No bookmark records found in that file.", type: "error" });
      return;
    }

    const accepted = [];
    let rejected = 0;

    for (const value of incomingRaw) {
      const normalized = normalizeImported(value);

      if (normalized.ok) {
        accepted.push(normalized.record);
      } else {
        rejected += 1;
      }
    }

    const existingUrls = new Set(records.map((record) => asText(record.url).toLowerCase()));
    const fresh = accepted.filter((record) => !existingUrls.has(asText(record.url).toLowerCase()));
    const duplicates = accepted.length - fresh.length;

    const content = el("div", { className: "details-panel" });
    content.append(
      el("p", {
        className: "details-panel__text",
        text: `${incomingRaw.length} record(s) read, ${accepted.length} usable, ${rejected} rejected, ${duplicates} already present.`
      })
    );
    content.append(
      el("p", {
        className: "details-panel__text",
        text: "Merge adds only new URLs. Replace discards the current list for this session. Nothing is uploaded; export the result and commit it with git."
      })
    );

    const footer = el("div", { className: "details-panel__actions" });

    const merge = el("button", {
      className: "btn btn--primary btn--small",
      text: `Merge ${fresh.length} new`,
      attrs: { type: "button" }
    });

    merge.addEventListener("click", () => {
      records = [...records, ...fresh];
      closeModal(undefined, "bookmarks-import");
      render();
      bus?.emit?.("bookmarks:changed", { ids: [...favorites] });
      toast?.show?.({ message: `${fresh.length} bookmark(s) merged for this session.`, type: "success" });
    });

    const replace = el("button", {
      className: "btn btn--outline btn--small",
      text: `Replace with ${accepted.length}`,
      attrs: { type: "button" }
    });

    replace.addEventListener("click", () => {
      records = accepted;
      closeModal(undefined, "bookmarks-import");
      render();
      bus?.emit?.("bookmarks:changed", { ids: [...favorites] });
      toast?.show?.({ message: `Replaced the list with ${accepted.length} bookmark(s) for this session.`, type: "success" });
    });

    const cancel = el("button", {
      className: "btn btn--ghost btn--small",
      text: "Cancel",
      attrs: { type: "button" }
    });
    cancel.addEventListener("click", () => closeModal(undefined, "bookmarks-cancel"));

    footer.append(merge, replace, cancel);

    openModal({
      title: "Import bookmarks",
      content,
      footer,
      size: "md"
    });
  }

  // ---- Toolbar -----------------------------------------------------------
  const toolbar = el("div", { className: "collection-toolbar" });

  const searchField = el("div", { className: "field collection-toolbar__search" });
  searchField.append(
    el("label", { className: "field__label", text: "Search bookmarks", attrs: { for: "bookmarks-search" } })
  );
  const searchInput = el("input", {
    className: "field__input",
    attrs: {
      id: "bookmarks-search",
      type: "search",
      placeholder: "Name, tag or note",
      autocomplete: "off",
      spellcheck: "false"
    }
  });
  searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    render();
  });
  searchField.append(searchInput);
  toolbar.append(searchField);

  if (categories.length > 1) {
    const field = el("div", { className: "field collection-toolbar__field" });
    field.append(
      el("label", { className: "field__label", text: "Category", attrs: { for: "bookmarks-category" } })
    );
    const select = el("select", {
      className: "field__input field__input--select",
      attrs: { id: "bookmarks-category" }
    });
    select.append(el("option", { text: "All categories", attrs: { value: "all" } }));

    for (const category of categories) {
      select.append(
        el("option", { text: asText(category.name), attrs: { value: asText(category.id) } })
      );
    }

    select.addEventListener("change", () => {
      state.category = select.value === "all" ? "" : select.value;
      render();
    });

    field.append(select);
    toolbar.append(field);
  }

  const sortField = el("div", { className: "field collection-toolbar__field" });
  sortField.append(
    el("label", { className: "field__label", text: "Sort by", attrs: { for: "bookmarks-sort" } })
  );
  const sortSelect = el("select", {
    className: "field__input field__input--select",
    attrs: { id: "bookmarks-sort" }
  });

  for (const option of SORT_OPTIONS) {
    const node = el("option", { text: option.label, attrs: { value: option.value } });
    if (option.value === state.sort) {
      node.selected = true;
    }
    sortSelect.append(node);
  }

  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    render();
  });

  sortField.append(sortSelect);
  toolbar.append(sortField);

  // Real buttons in a plain row: the file input is visually hidden but still
  // labelled, so the import is keyboard operable without a custom drop zone.
  const fileActions = el("div", { className: "bookmarks-file-actions" });

  const exportButton = el("button", {
    className: "btn btn--ghost btn--small",
    text: "Export JSON",
    attrs: { type: "button" }
  });
  exportButton.addEventListener("click", exportBookmarks);

  const importLabel = el("label", {
    className: "btn btn--ghost btn--small",
    text: "Import JSON",
    attrs: { for: "bookmarks-import-input" }
  });

  const fileInput = el("input", {
    className: "visually-hidden",
    attrs: {
      id: "bookmarks-import-input",
      type: "file",
      accept: "application/json,.json"
    }
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];

    if (file) {
      void importBookmarks(file);
    }

    // Allow the same file to be chosen twice in a row.
    fileInput.value = "";
  });

  fileActions.append(exportButton, importLabel, fileInput);
  toolbar.append(fileActions);

  if (ownerMode) {
    ownerParts = createOwnerBar();
    section.body.append(ownerParts.bar);
  }

  section.body.append(toolbar, status, container);
  render();
  updateOwnerBar();

  teardownPrevious = () => {
    container.replaceChildren();
  };

  void appContext?.toast;
}
