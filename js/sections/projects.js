/**
 * js/sections/projects.js - the project grid.
 *
 * Data: data/projects.json. Records are rendered with the shared card component
 * (js/components/card.js), which owns the media slot, the stretched title link
 * and the action row. This module owns only the selection: a text query and a
 * category filter, both applied to the immutable dataset so the count, the grid
 * and the empty state always describe the same set.
 *
 * What is deliberately not invented: cover images, dates, technologies and links.
 * .build/FACTS.md records that the only real project material is a list of names;
 * a card without a media slot collapses it instead of showing a broken frame.
 *
 * Security: every card string is written by the component with textContent, and
 * links pass the button component's URL allow-list. Details open in the shared
 * modal manager, never in a new window.
 */

import { createCard } from "../components/card.js";
import { createButtonLink } from "../components/button.js";
import { initializeFilter } from "../components/filter.js";
import { openDetailsModal } from "../components/modal.js";
import { matchesQuery } from "../core/search-engine.js";
import {
  asArray,
  asText,
  createTagList,
  el,
  formatDateRange,
  prepareSection,
  readCollection,
  readSectionConfig,
  renderEmpty,
  renderSampleNotice,
  sortByDateDesc
} from "../core/section-kit.js";

/** Teardown for a previous initialization. */
let teardownPrevious = null;

/**
 * Builds the dialog body for one project.
 *
 * Plain text and lists only: the description is owner-authored data and could
 * contain anything, so it never becomes markup.
 */
function buildProjectDetails(project, categoryName) {
  const content = el("div", { className: "details-panel" });
  const description = asText(project.description) || asText(project.shortDescription);

  if (description) {
    content.append(el("p", { className: "details-panel__text", text: description }));
  }

  const facts = [];
  const period = formatDateRange(project.startDate, project.endDate, false);
  if (period) {
    facts.push(`Period: ${period}`);
  }
  if (categoryName) {
    facts.push(`Category: ${categoryName}`);
  }
  const role = asText(project.role);
  if (role) {
    facts.push(`Role: ${role}`);
  }
  const status = asText(project.status);
  if (status) {
    facts.push(`Status: ${status}`);
  }

  if (facts.length > 0) {
    const list = el("ul", { className: "details-panel__facts" });
    facts.forEach((fact) => list.append(el("li", { text: fact })));
    content.append(list);
  }

  const contributions = asArray(project.contributions).map(asText).filter(Boolean);
  if (contributions.length > 0) {
    content.append(el("h3", { className: "details-panel__heading", text: "What I built" }));
    const list = el("ul", { className: "details-panel__list" });
    contributions.forEach((item) => list.append(el("li", { text: item })));
    content.append(list);
  }

  const technologies = asArray(project.technologies).map(asText).filter(Boolean);
  const tags = createTagList(technologies, {
    className: "tag-list details-panel__tags",
    label: "Technologies"
  });

  if (tags) {
    content.append(el("h3", { className: "details-panel__heading", text: "Technologies" }));
    content.append(tags);
  }

  return content;
}

/** Builds the dialog footer from whatever links the record actually has. */
function buildProjectFooter(project) {
  const links = project.links && typeof project.links === "object" ? project.links : {};
  const footer = el("div", { className: "details-panel__actions" });

  const definitions = [
    { href: asText(links.liveDemo), label: "Open live demo", variant: "primary" },
    { href: asText(links.sourceCode), label: "View source", variant: "outline" },
    { href: asText(links.documentation), label: "Documentation", variant: "ghost" }
  ];

  for (const definition of definitions) {
    if (!definition.href) {
      continue;
    }

    const button = createButtonLink({
      label: definition.label,
      href: definition.href,
      variant: definition.variant,
      size: "small"
    });

    if (button) {
      footer.append(button);
    }
  }

  return footer.childElementCount > 0 ? footer : null;
}

/**
 * @param {Object|undefined} sectionData - data/projects.json.
 * @param {Object} [appContext]
 * @returns {void}
 */
export function initializeProjects(sectionData, appContext) {
  if (typeof teardownPrevious === "function") {
    teardownPrevious();
    teardownPrevious = null;
  }

  const config = readSectionConfig(sectionData);
  const categories = readCollection(sectionData, "categories");
  const records = readCollection(sectionData, "projects").filter(
    (project) => project.enabled !== false && asText(project.title)
  );

  if (config.enabled === false) {
    return;
  }

  const section = prepareSection("projects", {
    title: asText(config.title) || "Projects",
    intro: asText(config.subtitle)
  });

  if (!section) {
    return;
  }

  if (records.length === 0) {
    renderEmpty(section.body, {
      title: "No projects published yet",
      message: "Projects added to data/projects.json appear here."
    });
    return;
  }

  const categoryNameById = new Map(
    categories.map((category) => [asText(category.id), asText(category.name)])
  );

  const state = { query: "", category: "" };

  /** Applies the section's default order, then keeps it stable for filtering. */
  const ordered =
    asText(config.defaultSort) === "manual"
      ? records.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      : sortByDateDesc(records, (project) => project.startDate);

  // Toolbar: search field plus the shared filter component.
  const toolbar = el("div", { className: "projects-toolbar" });
  const searchWrap = el("div", { className: "field projects-toolbar__search" });
  const searchId = "projects-search";
  const searchLabel = el("label", {
    className: "field__label",
    text: "Search projects",
    attrs: { for: searchId }
  });
  const searchInput = el("input", {
    className: "field__input",
    attrs: {
      id: searchId,
      type: "search",
      placeholder: "Title or technology",
      autocomplete: "off",
      spellcheck: "false"
    }
  });
  searchWrap.append(searchLabel, searchInput);
  toolbar.append(searchWrap);

  const count = el("p", {
    className: "projects-toolbar__count",
    attrs: { role: "status", "aria-live": "polite" }
  });

  const grid = el("div", { className: "projects-grid card-grid" });

  /**
   * Applies the current query and category to the ordered records and redraws.
   *
   * The count, the grid and the empty state are written in one pass so they
   * cannot disagree. Filtering always starts from `ordered`, never from the
   * current DOM, which keeps repeated filtering idempotent.
   */
  function render() {
    const visible = ordered.filter((project) => {
      if (state.category && asText(project.categoryId) !== state.category) {
        return false;
      }

      return matchesQuery(project, state.query, {
        fields: ["title", "shortDescription", "description", "technologies"]
      });
    });

    grid.replaceChildren();

    for (const project of visible) {
      const title = asText(project.title);
      const categoryName = categoryNameById.get(asText(project.categoryId)) || "";
      const period = formatDateRange(project.startDate, project.endDate, false);
      const technologies = asArray(project.technologies).map(asText).filter(Boolean);
      const links = project.links && typeof project.links === "object" ? project.links : {};

      const actions = [];
      const liveDemoHref = asText(links.liveDemo);
      const sourceHref = asText(links.sourceCode);

      // Button-link creation throws on an empty href by design: a control that
      // goes nowhere is a bug, not a placeholder. Absent links are therefore
      // skipped here instead of being passed through and caught.
      if (liveDemoHref) {
        const liveDemo = createButtonLink({
          label: "Live demo",
          href: liveDemoHref,
          variant: "ghost",
          size: "small"
        });
        if (liveDemo) {
          actions.push(liveDemo);
        }
      }

      if (sourceHref) {
        const source = createButtonLink({
          label: "Source",
          href: sourceHref,
          variant: "ghost",
          size: "small"
        });
        if (source) {
          actions.push(source);
        }
      }

      const card = createCard({
        title,
        subtitle: categoryName,
        description: asText(project.shortDescription),
        badges: technologies,
        meta: period ? [{ label: "Period", value: period }] : [],
        actions,
        headingLevel: 3,
        onClick: () => {
          openDetailsModal({
            title,
            description: categoryName,
            content: buildProjectDetails(project, categoryName),
            footer: buildProjectFooter(project),
            size: "lg"
          });
        }
      });

      grid.append(card);
    }

    count.textContent =
      visible.length === 1 ? "1 project" : `${visible.length} projects`;

    if (visible.length === 0) {
      renderEmpty(grid, {
        title: "No projects match",
        message: "Clear the search or choose another category."
      });
    }
  }

  const populatedCategories = [...new Set(ordered.map((project) => asText(project.categoryId)).filter(Boolean))];

  if (config.showFilters !== false && populatedCategories.length > 1) {
    const filterMount = el("div", { className: "projects-toolbar__filters" });
    toolbar.append(filterMount);

    const controller = initializeFilter(filterMount, {
      heading: "",
      config: {
        groups: [
          {
            id: "category",
            label: "Category",
            type: "select",
            allLabel: "All projects",
            options: categories
              .filter((category) => populatedCategories.includes(asText(category.id)))
              .map((category) => ({
                value: asText(category.id),
                label: asText(category.name)
              }))
          }
        ]
      },
      layout: "compact",
      onChange(next) {
        state.category = asText(next.category);
        render();
      }
    });

    teardownPrevious = () => controller.destroy();
  }

  searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    render();
  });

  section.body.append(toolbar, count, grid);
  render();
  renderSampleNotice(section.body, records);
}
