/**
 * js/sections/skills.js - skill groups with stated levels.
 *
 * Data: data/skills.json. Each skill has an optional `proficiency` (0-100).
 * A skill without one is shown as a tag, never as a 0% bar: .build/FACTS.md
 * records ten tools that are attested by name only, and a bar would invent a
 * number the owner never gave.
 *
 * Filtering: the category filter re-renders from the immutable dataset rather
 * than hiding DOM nodes, so a filtered view and an unfiltered one cannot drift
 * apart. The filter component (js/components/filter.js) owns the control UI.
 */

import { initializeFilter } from "../components/filter.js";
import {
  asArray,
  asNumber,
  asText,
  createProgress,
  el,
  prepareSection,
  readCollection,
  readSectionConfig,
  renderEmpty
} from "../core/section-kit.js";

/** Teardown for a previous initialization (JSON Manager re-import, tests). */
let teardownPrevious = null;

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

  /** Skills grouped in category order; uncategorised skills go last. */
  function groupSkills(selectedCategory) {
    const groups = new Map();

    for (const category of categories) {
      groups.set(category.id, []);
    }

    const uncategorised = [];

    for (const skill of skills) {
      const categoryId = asText(skill.categoryId);

      if (selectedCategory && categoryId !== selectedCategory) {
        continue;
      }

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

  const list = el("div", { className: "skills-groups" });

  /**
   * Rebuilds the category blocks for one selected category ("" means all).
   *
   * Rebuilding rather than toggling `hidden` keeps the DOM identical to the
   * dataset: a filtered view cannot keep a node the data no longer matches, and
   * the empty state is produced by the same path as the unfiltered one.
   */
  function renderGroups(selectedCategory) {
    list.replaceChildren();

    for (const group of groupSkills(selectedCategory)) {
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

      for (const skill of group.items) {
        const name = asText(skill.name);
        const level = asNumber(skill.proficiency);
        const item = el("li", { className: "skill" });

        const head = el("div", { className: "skill__head" });
        head.append(el("h4", { className: "skill__name", text: name }));

        if (level !== null) {
          const levelLabel =
            asText(skill.proficiencyLabel) || `${Math.round(level)}%`;
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

        items.append(item);
      }

      block.append(items);
      list.append(block);
    }

    if (list.childElementCount === 0) {
      renderEmpty(list, {
        title: "No skills in this category",
        message: "Choose another category or clear the filter."
      });
    }
  }

  // Filter control. Only offered when there is more than one populated
  // category: a filter with a single option is noise.
  const populated = new Set(
    skills.map((skill) => asText(skill.categoryId)).filter((id) => categoryById.has(id))
  );

  if (config.showFilters !== false && populated.size > 1) {
    const filterMount = el("div", { className: "skills-toolbar" });
    section.body.append(filterMount);

    const controller = initializeFilter(filterMount, {
      heading: "",
      config: {
        groups: [
          {
            id: "category",
            label: "Category",
            type: "select",
            allLabel: "All categories",
            options: categories.map((category) => ({
              value: category.id,
              label: asText(category.name)
            }))
          }
        ]
      },
      layout: "horizontal",
      onChange(state) {
        renderGroups(asText(state.category));
      }
    });

    teardownPrevious = () => controller.destroy();
  }

  renderGroups("");
  section.body.append(list);
}
