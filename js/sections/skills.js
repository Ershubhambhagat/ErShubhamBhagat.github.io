/**
 * js/sections/skills.js - skill groups with stated levels.
 *
 * Data: data/skills.json. Each skill has an optional `proficiency` (0-100).
 * A skill without one is shown as a tag, never as a 0% bar: .build/FACTS.md
 * records ten tools that are attested by name only, and a bar would invent a
 * number the owner never gave.
 *
 * Selection: a text query, a category select and a sort select. This section
 * keeps its own small toolbar instead of js/core/collection-view.js because the
 * output is grouped by category and one of the sort modes (highest level) is
 * specific to this dataset; the matching and the alphabetical comparator still
 * come from the shared engines, so the rules cannot drift from the rest of the
 * page.
 *
 * Grouping is rebuilt from the immutable dataset on every pass. Toggling
 * `hidden` on old nodes would let a filtered view keep a card the data no longer
 * matches, and the empty state would disagree with the count.
 *
 * Icons: `skill.icon` is a name from the owner's data. A name that matches the
 * shared icon set renders that glyph; anything else renders the skill's initial
 * in a tile. No brand logo is fetched or imitated - a wrong logo is worse than
 * an honest letter.
 */

import { createBadge } from "../components/badge.js";
import { initializeSearch } from "../components/search.js";
import { matchesQuery, normalizeText } from "../core/search-engine.js";
import {
  asArray,
  asNumber,
  asText,
  createIcon,
  createProgress,
  el,
  prepareSection,
  readCollection,
  readSectionConfig,
  renderEmpty
} from "../core/section-kit.js";

/** Teardown for a previous initialization (JSON Manager re-import, tests). */
let teardownPrevious = null;

/** Search controller, kept so teardown removes the suggestion listbox too. */
let searchController = null;

/** Sort modes this section offers, in menu order. */
const SORT_OPTIONS = Object.freeze([
  { value: "default", label: "Category order" },
  { value: "alphabetical", label: "Name A to Z" },
  { value: "level", label: "Highest level first" }
]);

/**
 * Builds the small leading tile for one skill.
 *
 * @param {Object} skill
 * @returns {HTMLElement}
 */
function createSkillIcon(skill) {
  const iconName = asText(skill.icon);
  const tile = el("span", {
    className: "skill__icon",
    attrs: { "aria-hidden": "true" }
  });

  const glyph = iconName ? createIcon(iconName) : null;

  if (glyph) {
    tile.append(glyph);
    return tile;
  }

  tile.classList.add("skill__icon--letter");
  tile.textContent = asText(skill.name).charAt(0).toUpperCase() || "?";
  return tile;
}

/**
 * @param {Object|undefined} sectionData - data/skills.json.
 * @param {Object} [appContext]
 * @returns {void}
 */
export function initializeSkills(sectionData, appContext) {
  if (typeof teardownPrevious === "function") {
    teardownPrevious();
    teardownPrevious = null;
  }

  const config = readSectionConfig(sectionData);
  const categories = readCollection(sectionData, "categories").filter(
    (category) => category.enabled !== false && asText(category.name)
  );
  const skills = readCollection(sectionData, "skills").filter(
    (skill) => skill.enabled !== false && asText(skill.name)
  );

  if (config.enabled === false) {
    return;
  }

  const section = prepareSection("skills", {
    title: asText(config.title) || "Skills",
    intro: asText(config.subtitle)
  });

  if (!section) {
    return;
  }

  if (skills.length === 0) {
    renderEmpty(section.body, {
      title: "No skills published yet",
      message: "Records added to data/skills.json appear here."
    });
    return;
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  // Curated order: the category's own order, then the skill's order, then name.
  // The dataset ships `order` on both records, so the owner's arrangement is
  // preserved instead of being re-derived alphabetically.
  const categoryOrder = new Map(
    categories.map((category, index) => [category.id, Number(category.order) || index])
  );

  const curated = skills.slice().sort((a, b) => {
    const categoryA = categoryOrder.get(asText(a.categoryId)) ?? Number.MAX_SAFE_INTEGER;
    const categoryB = categoryOrder.get(asText(b.categoryId)) ?? Number.MAX_SAFE_INTEGER;

    if (categoryA !== categoryB) {
      return categoryA - categoryB;
    }

    const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
    const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;

    return orderA - orderB;
  });

  const state = { query: "", category: "", sort: "default" };

  /**
   * Applies the current query, category and sort to the curated list.
   *
   * @returns {Array<Object>} New array; `curated` is never mutated.
   */
  function selectSkills() {
    let selected = curated;

    if (state.category) {
      selected = selected.filter((skill) => asText(skill.categoryId) === state.category);
    }

    if (state.query.trim()) {
      selected = selected.filter((skill) =>
        matchesQuery(skill, state.query, {
          fields: ["name", "description", "tags", "proficiencyLabel"]
        })
      );
    }

    if (state.sort === "alphabetical") {
      selected = selected.slice().sort((a, b) =>
        asText(a.name).localeCompare(asText(b.name), undefined, { sensitivity: "base", numeric: true })
      );
    }

    if (state.sort === "level") {
      // Level-less skills go last in both directions: "highest first" must not
      // end with a block of 0% bars that imply a measurement nobody made.
      selected = selected.slice().sort((a, b) => {
        const levelA = asNumber(a.proficiency);
        const levelB = asNumber(b.proficiency);

        if (levelA === null && levelB === null) {
          return asText(a.name).localeCompare(asText(b.name));
        }
        if (levelA === null) {
          return 1;
        }
        if (levelB === null) {
          return -1;
        }

        return levelB - levelA;
      });
    }

    return selected;
  }

  /**
   * Groups records in category order, with uncategorised skills last.
   *
   * @param {Array<Object>} records
   * @returns {Array<{category: Object, items: Array<Object>}>}
   */
  function groupByCategory(records) {
    const groups = new Map();
    const uncategorised = [];

    for (const category of categories) {
      groups.set(category.id, []);
    }

    for (const skill of records) {
      const categoryId = asText(skill.categoryId);

      if (groups.has(categoryId)) {
        groups.get(categoryId).push(skill);
      } else {
        uncategorised.push(skill);
      }
    }

    const result = categories
      .map((category) => ({ category, items: groups.get(category.id) }))
      .filter((group) => group.items.length > 0);

    if (uncategorised.length > 0) {
      result.push({
        category: { id: "other", name: "Other", description: "" },
        items: uncategorised
      });
    }

    return result;
  }

  /** One skill list item, including its optional level, description and tags. */
  function createSkillItem(skill) {
    const name = asText(skill.name);
    const level = asNumber(skill.proficiency);
    const item = el("li", {
      className: "skill",
      attrs: { id: asText(skill.id) || null }
    });

    const head = el("div", { className: "skill__head" });
    head.append(createSkillIcon(skill));
    head.append(el("h4", { className: "skill__name", text: name }));

    if (skill.featured === true) {
      head.append(
        createBadge({ label: "Featured", variant: "primary", size: "small" })
      );
    }

    if (skill.currentlyLearning === true) {
      head.append(
        createBadge({ label: "Learning now", variant: "info", size: "small" })
      );
    }

    if (level !== null) {
      const levelLabel = asText(skill.proficiencyLabel) || `${Math.round(level)}%`;
      head.append(el("span", { className: "skill__level", text: levelLabel }));
    }

    item.append(head);

    if (level !== null) {
      const bar = createProgress(level, `${name}: ${Math.round(level)} percent`);
      if (bar) {
        item.append(bar);
      }
    }

    const description = asText(skill.description);
    if (description) {
      item.append(el("p", { className: "skill__text", text: description }));
    }

    // Tag-only skills carry no level; the tags say what kind of thing it is
    // instead of implying a score.
    const tags = asArray(skill.tags).map(asText).filter(Boolean);
    if (level === null && tags.length > 0) {
      const tagRow = el("ul", { className: "skill__tags" });
      for (const tag of tags) {
        tagRow.append(el("li", { className: "skill__tag", text: tag }));
      }
      item.append(tagRow);
    }

    return item;
  }

  /** One category block. */
  function createGroupBlock(group) {
    const block = el("section", {
      className: "skills-group",
      attrs: { "aria-label": asText(group.category.name) }
    });

    block.append(el("h3", { className: "skills-group__title", text: asText(group.category.name) }));

    const description = asText(group.category.description);
    if (description) {
      block.append(el("p", { className: "skills-group__text", text: description }));
    }

    const items = el("ul", { className: "skills-list" });
    group.items.forEach((skill) => items.append(createSkillItem(skill)));
    block.append(items);

    return block;
  }

  const list = el("div", { className: "skills-groups" });
  const status = el("p", {
    className: "collection-status",
    attrs: { role: "status", "aria-live": "polite" }
  });

  /** Rebuilds the whole grouped list from the current state. */
  function renderGroups() {
    const selected = selectSkills();
    list.replaceChildren();

    const learning = selected.filter((skill) => skill.currentlyLearning === true);
    const remaining = selected.filter((skill) => skill.currentlyLearning !== true);

    // "Currently learning" is a cross-category view, so it cannot live inside
    // one category block. It is rendered first and the same record is not
    // repeated below.
    if (config.showLearning === true && learning.length > 0 && !state.category) {
      list.append(
        createGroupBlock({
          category: {
            id: "learning-now",
            name: "Currently learning",
            description: "Skills I am studying now, kept separate from the levels above."
          },
          items: learning
        })
      );
    }

    for (const group of groupByCategory(remaining)) {
      list.append(createGroupBlock(group));
    }

    status.textContent =
      selected.length === 1 ? "1 skill" : `${selected.length} skills`;

    if (list.childElementCount === 0) {
      renderEmpty(list, {
        title: "No skills match",
        message: "Clear the search or choose another category."
      });
    }
  }

  // ---- Toolbar -----------------------------------------------------------
  const toolbar = el("div", { className: "collection-toolbar" });

  if (config.showSearch !== false) {
    const field = el("div", { className: "field collection-toolbar__search search" });
    field.append(
      el("label", {
        className: "field__label",
        text: "Search skills",
        attrs: { for: "skills-search" }
      })
    );

    const searchField = el("div", { className: "search__field" });
    const input = el("input", {
      className: "search__input",
      attrs: {
        id: "skills-search",
        type: "search",
        placeholder: "Name, tool or description",
        autocomplete: "off",
        spellcheck: "false"
      }
    });
    searchField.append(input);
    field.append(searchField);

    // Shared field: debounce, clear control and suggestions come from
    // js/components/search.js. Suggestions are skill names only, because a skill
    // name is what the visitor can act on; a description fragment would be a
    // suggestion the result list cannot honour as a single value.
    searchController = initializeSearch(field, {
      label: "Search skills",
      labelVisible: true,
      debounceMs: 0,
      onInput(value) {
        state.query = value;
        renderGroups();
      },
      getSuggestions(query) {
        const needle = normalizeText(query);

        if (!needle) {
          return [];
        }

        return skills
          .map((skill) => asText(skill.name))
          .filter((name) => name && normalizeText(name).includes(needle))
          .filter((name, index, all) => all.findIndex((entry) => entry.toLowerCase() === name.toLowerCase()) === index)
          .slice(0, 6);
      },
      onSuggestionSelect(suggestion) {
        state.query = suggestion.value;
        renderGroups();
      }
    });

    toolbar.append(field);
  }

  const populated = new Set(
    skills.map((skill) => asText(skill.categoryId)).filter((id) => categoryById.has(id))
  );

  if (config.showFilters !== false && populated.size > 1) {
    const field = el("div", { className: "field collection-toolbar__field" });
    field.append(
      el("label", {
        className: "field__label",
        text: "Category",
        attrs: { for: "skills-category" }
      })
    );

    const select = el("select", {
      className: "field__input field__input--select",
      attrs: { id: "skills-category" }
    });
    select.append(el("option", { text: "All categories", attrs: { value: "all" } }));

    for (const category of categories) {
      if (!populated.has(asText(category.id))) {
        continue;
      }
      select.append(
        el("option", { text: asText(category.name), attrs: { value: asText(category.id) } })
      );
    }

    select.addEventListener("change", () => {
      state.category = select.value === "all" ? "" : select.value;
      renderGroups();
    });

    field.append(select);
    toolbar.append(field);
  }

  if (config.showSort !== false) {
    const field = el("div", { className: "field collection-toolbar__field" });
    field.append(
      el("label", {
        className: "field__label",
        text: "Sort by",
        attrs: { for: "skills-sort" }
      })
    );

    const select = el("select", {
      className: "field__input field__input--select",
      attrs: { id: "skills-sort" }
    });

    for (const option of SORT_OPTIONS) {
      const node = el("option", { text: option.label, attrs: { value: option.value } });
      if (option.value === state.sort) {
        node.selected = true;
      }
      select.append(node);
    }

    select.addEventListener("change", () => {
      state.sort = select.value;
      renderGroups();
    });

    field.append(select);
    toolbar.append(field);
  }

  section.body.append(toolbar, status, list);
  renderGroups();

  // The shared search controller owns a listbox appended inside the toolbar and a
  // document-level debounce timer; a re-initialization must remove both.
  teardownPrevious = () => {
    searchController?.destroy();
    searchController = null;
  };
}
