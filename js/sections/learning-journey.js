/**
 * js/sections/learning-journey.js - dated learning activities.
 *
 * Data: data/learning-journey.json. Each record may carry a self-assessed
 * progress value; it is rendered as a real progressbar with an accessible name,
 * and only when `progress.enabled` is true. `progress.description` is shown as a
 * caption because a self-assessment needs to say that it is one.
 *
 * Why cards: a learning activity has a goal list and a progress bar, which do not
 * fit the timeline's single-line date rail. The category filter re-renders from
 * the dataset, so filtered and unfiltered views cannot disagree.
 */

import { initializeFilter } from "../components/filter.js";
import {
  asArray,
  asNumber,
  asText,
  createLink,
  createMetaList,
  createProgress,
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
 * @param {Object|undefined} sectionData - data/learning-journey.json.
 * @param {Object} [appContext]
 * @returns {void}
 */
export function initializeLearningJourney(sectionData, appContext) {
  if (typeof teardownPrevious === "function") {
    teardownPrevious();
    teardownPrevious = null;
  }

  const config = readSectionConfig(sectionData);
  const categories = readCollection(sectionData, "categories");
  const records = readCollection(sectionData, "learningActivities").filter(
    (record) => record.enabled !== false && asText(record.title)
  );

  if (config.enabled === false) {
    return;
  }

  const section = prepareSection("learning-journey", {
    title: asText(config.title) || "Learning journey",
    intro: asText(config.subtitle)
  });

  if (!section) {
    return;
  }

  if (records.length === 0) {
    renderEmpty(section.body, {
      title: "Nothing in the learning log yet",
      message: "Activities added to data/learning-journey.json appear here."
    });
    return;
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, asText(category.label) || asText(category.name)])
  );

  const ordered = sortByDateDesc(records, (record) => record.startDate);
  const list = el("div", { className: "journey-list card-grid" });

  /**
   * Redraws the activity cards for a category ("" means all).
   *
   * The progress bar is read only when `progress.enabled` is true: a disabled bar
   * is "not measured", not zero, so no bar is rendered rather than an empty one.
   */
  function render(selectedCategory) {
    list.replaceChildren();

    const visible = selectedCategory
      ? ordered.filter((record) => asText(record.categoryId) === selectedCategory)
      : ordered;

    for (const record of visible) {
      const title = asText(record.title);
      const card = el("article", { className: "journey-card" });

      const head = el("div", { className: "journey-card__head" });
      head.append(el("h3", { className: "journey-card__title", text: title }));

      const status = asText(record.status);
      if (status) {
        const badge = el("span", {
          className: `status-chip status-chip--${status === "completed" ? "done" : "active"}`,
          text: status === "in-progress" ? "In progress" : status
        });
        head.append(badge);
      }

      card.append(head);

      const period = formatDateRange(record.startDate, record.endDate, false);
      const meta = createMetaList(
        [
          { label: "Period", value: period },
          { label: "Category", value: categoryById.get(asText(record.categoryId)) || "" },
          { label: "Type", value: asText(record.learningType) }
        ],
        "journey-card__meta"
      );

      if (meta) {
        card.append(meta);
      }

      const description = asText(record.description);
      if (description) {
        card.append(el("p", { className: "journey-card__text", text: description }));
      }

      const progress = record.progress && typeof record.progress === "object" ? record.progress : null;

      if (config.showProgress !== false && progress?.enabled === true) {
        const value = asNumber(progress.value);
        const bar = createProgress(value ?? 0, `${title}: progress`);

        if (bar) {
          card.append(bar);

          const note = asText(progress.description);
          if (note) {
            card.append(el("p", { className: "journey-card__note", text: note }));
          }
        }
      }

      const goals = asArray(record.goals).map(asText).filter(Boolean);
      if (config.showGoals !== false && goals.length > 0) {
        card.append(el("h4", { className: "journey-card__subtitle", text: "Goals" }));
        const goalList = el("ul", { className: "journey-card__goals" });
        goals.forEach((goal) => goalList.append(el("li", { text: goal })));
        card.append(goalList);
      }

      const source = record.source && typeof record.source === "object" ? record.source : null;
      if (config.showRelatedItems !== false && source) {
        const link = createLink({
          href: asText(source.url),
          label: asText(source.name) || "Source",
          className: "journey-card__link",
          icon: null
        });

        if (link) {
          card.append(el("p", { className: "journey-card__source", children: [link] }));
        }
      }

      list.append(card);
    }

    if (visible.length === 0) {
      renderEmpty(list, {
        title: "Nothing in this category",
        message: "Choose another category or clear the filter."
      });
    }
  }

  const populated = new Set(records.map((record) => asText(record.categoryId)).filter(Boolean));

  if (config.showFilters !== false && populated.size > 1) {
    const filterMount = el("div", { className: "journey-toolbar" });
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
            options: categories
              .filter((category) => populated.has(asText(category.id)))
              .map((category) => ({
                value: asText(category.id),
                label: categoryById.get(category.id) || asText(category.id)
              }))
          }
        ]
      },
      layout: "horizontal",
      onChange(state) {
        render(asText(state.category));
      }
    });

    teardownPrevious = () => controller.destroy();
  }

  render("");
  section.body.append(list);
  renderSampleNotice(section.body, records);
}
