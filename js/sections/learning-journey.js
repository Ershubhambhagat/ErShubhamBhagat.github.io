/**
 * js/sections/learning-journey.js - dated learning activities.
 *
 * Data: data/learning-journey.json. Each record may carry a self-assessed
 * progress value; it is rendered as a real progressbar with an accessible name,
 * and only when `progress.enabled` is true. `progress.description` is shown as a
 * caption because a self-assessment needs to say that it is one.
 *
 * Why cards: a learning activity has a goal list and a progress bar, which do not
 * fit the timeline's single-line date rail. `section.layout` still selects the
 * arrangement: "grid" (the default), "list" (one column of full-width cards) or
 * "timeline" (one column on a dated rail). The rail is a layout choice, not a
 * second renderer: the progress bar, the goals and the details dialog survive in
 * all three, which a createTimelineItem() rail would drop.
 *
 * "Currently learning" block: in-progress records are highlighted above the
 * toolbar, because that is the part of the log a visitor can act on today. The
 * block is derived from the same records and disappears when nothing is in
 * progress; it never invents an activity.
 *
 * Selection: search, category, status, learning-type and start-year filters, sort
 * and paging run through js/core/collection-view.js, so the count and the cards
 * cannot disagree.
 *
 * keyLearnings were previously read by nothing. They are shown in the card (the
 * first few, as the point of the record) and in full in the details dialog. The
 * card truncation is a display choice, not a data change: the same array is
 * rendered in full on demand.
 */

import { createCard } from "../components/card.js";
import { openDetailsModal } from "../components/modal.js";
import { createCollectionView } from "../core/collection-view.js";
import {
  asArray,
  asNumber,
  asText,
  createLink,
  createMetaList,
  createProgress,
  createTagList,
  el,
  formatDateRange,
  parseDate,
  prepareSection,
  readCollection,
  readSectionConfig,
  renderEmpty,
  renderSampleNotice
} from "../core/section-kit.js";

/** Teardown for a previous initialization. */
let teardownPrevious = null;

/** How many key learnings the card shows before the dialog. */
const CARD_LEARNINGS = 3;

/** How many goals the card shows before the dialog. */
const CARD_GOALS = 2;

/** Layout values the section understands; anything else falls back to grid. */
const LAYOUTS = Object.freeze(["grid", "list", "timeline"]);

/**
 * @param {unknown} status
 * @returns {string} Display label for a record status.
 */
function readStatusLabel(status) {
  const raw = asText(status);

  if (!raw) {
    return "";
  }

  return raw === "in-progress" ? "In progress" : `${raw.charAt(0).toUpperCase()}${raw.slice(1)}`;
}

/**
 * Start year from the record's own date, used by the generated year filter.
 *
 * @param {Object} record
 * @returns {number|string} The year, or "" when the record has no usable date.
 */
function readStartYear(record) {
  const date = parseDate(record?.startDate);
  return date ? date.year : "";
}

/**
 * Resolves the related-record ids this section declares.
 *
 * Only records that exist are listed: a dangling id is not a thing the visitor
 * can look up, and printing it would look like a broken link.
 *
 * @param {Object} record
 * @param {Object|undefined} data - appContext.data
 * @returns {Array<{label: string, href: string}>}
 */
function readRelatedItems(record, data) {
  const entries = [];
  const definitions = [
    { ids: record.relatedSkillIds, list: data?.skills?.skills, field: "name", href: "#skills" },
    {
      ids: record.relatedProjectIds,
      list: data?.projects?.projects,
      field: "title",
      href: "#projects"
    },
    {
      ids: record.relatedCertificateIds,
      list: data?.certificates?.certificates,
      field: "title",
      href: "#certificates"
    },
    {
      ids: record.relatedJourneyIds,
      list: data?.learningJourney?.learningActivities,
      field: "title",
      href: "#learning-journey"
    }
  ];

  for (const definition of definitions) {
    const ids = asArray(definition.ids).map(asText).filter(Boolean);

    if (ids.length === 0) {
      continue;
    }

    const byId = new Map(
      asArray(definition.list).map((entry) => [asText(entry?.id), asText(entry?.[definition.field])])
    );

    for (const id of ids) {
      const label = byId.get(id);

      if (label) {
        entries.push({ label, href: definition.href });
      }
    }
  }

  return entries;
}

/**
 * @param {Object} record
 * @param {string} categoryLabel
 * @param {Array<{label: string, href: string}>} relatedItems
 * @param {Object} config
 * @returns {HTMLElement}
 */
function buildDetails(record, categoryLabel, relatedItems, config) {
  const content = el("div", { className: "details-panel" });
  const description = asText(record.description);

  if (description) {
    content.append(el("p", { className: "details-panel__text", text: description }));
  }

  const meta = createMetaList([
    { label: "Category", value: categoryLabel },
    { label: "Topic", value: asText(record.topic) },
    { label: "Type", value: asText(record.learningType) },
    { label: "Status", value: readStatusLabel(record.status) },
    {
      label: "Period",
      value: formatDateRange(record.startDate, record.endDate, record.status === "in-progress")
    }
  ]);

  if (meta) {
    content.append(meta);
  }

  const progress = record.progress && typeof record.progress === "object" ? record.progress : null;

  if (config.showProgress !== false && progress?.enabled === true) {
    const bar = createProgress(asNumber(progress.value) ?? 0, "Self-assessed progress");
    if (bar) {
      content.append(bar);
    }

    const note = asText(progress.description);
    if (note) {
      content.append(el("p", { className: "details-panel__note", text: note }));
    }
  }

  const goals = asArray(record.goals).map(asText).filter(Boolean);
  if (goals.length > 0 && config.showGoals !== false) {
    content.append(el("h3", { className: "details-panel__heading", text: "Goals" }));
    const list = el("ul", { className: "details-panel__list" });
    goals.forEach((goal) => list.append(el("li", { text: goal })));
    content.append(list);
  }

  const learnings = asArray(record.keyLearnings).map(asText).filter(Boolean);
  if (learnings.length > 0) {
    content.append(el("h3", { className: "details-panel__heading", text: "Key learnings" }));
    const list = el("ul", { className: "details-panel__list" });
    learnings.forEach((item) => list.append(el("li", { text: item })));
    content.append(list);
  }

  // showRelatedItems gates this block: with the switch off the dialog stays a
  // report of the record itself, without cross-section links.
  if (config.showRelatedItems !== false && relatedItems.length > 0) {
    content.append(el("h3", { className: "details-panel__heading", text: "Related" }));
    const tags = createTagList(
      relatedItems.map((entry) => entry.label),
      { label: "Related records" }
    );

    if (tags) {
      content.append(tags);
    }

    const list = el("ul", { className: "details-panel__list journey-related" });
    for (const entry of relatedItems) {
      const link = createLink({
        href: entry.href,
        label: entry.label,
        className: "details-panel__related-link"
      });

      if (link) {
        const item = el("li", {});
        item.append(link);
        list.append(item);
      }
    }

    if (list.childElementCount > 0) {
      content.append(list);
    }
  }

  const source = record.source && typeof record.source === "object" ? record.source : null;
  const sourceUrl = asText(source?.url);

  if (sourceUrl) {
    const link = createLink({
      href: sourceUrl,
      label: asText(source?.name) || "Source",
      className: "details-panel__document"
    });

    if (link) {
      content.append(link);
    }
  }

  return content;
}

/**
 * Builds the "Currently learning" block.
 *
 * Every entry is a button that opens the same details dialog as the card, so the
 * block is a shortcut rather than a second, differently-behaving list.
 *
 * @param {Array<Object>} records - In-progress records only.
 * @param {(record: Object) => void} onOpen
 * @returns {HTMLElement|null}
 */
function buildCurrentLearning(records, onOpen) {
  if (records.length === 0) {
    return null;
  }

  const block = el("section", {
    className: "journey-highlights",
    attrs: { "aria-labelledby": "learning-current-heading" }
  });

  block.append(
    el("h3", {
      className: "journey-highlights__heading",
      text: "Currently learning",
      attrs: { id: "learning-current-heading" }
    })
  );

  const list = el("ul", { className: "journey-highlights__list" });

  for (const record of records) {
    const title = asText(record.title);
    const item = el("li", { className: "journey-highlights__item" });

    const button = el("button", {
      className: "journey-highlights__button",
      attrs: { type: "button" }
    });
    button.append(el("span", { className: "journey-highlights__title", text: title }));

    const topic = asText(record.topic);
    if (topic) {
      button.append(el("span", { className: "journey-highlights__topic", text: topic }));
    }

    // The percentage is the record's own self-assessed value; a disabled
    // progress block contributes no number at all.
    const progress = record.progress && typeof record.progress === "object" ? record.progress : null;
    const value = asNumber(progress?.value);
    if (progress?.enabled === true && value !== null) {
      button.append(
        el("span", {
          className: "journey-highlights__progress",
          text: `${Math.round(value)}% self-assessed`
        })
      );
    }

    button.addEventListener("click", () => onOpen(record));
    item.append(button);
    list.append(item);
  }

  block.append(list);
  return block;
}

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

  // Derived fields the toolbar needs. The dataset is never rewritten: these are
  // copies, so a filter cannot change what another section renders.
  const viewRecords = records.map((record) => ({
    ...record,
    categoryLabel: categoryById.get(asText(record.categoryId)) || "",
    statusLabel: readStatusLabel(record.status),
    startYear: readStartYear(record)
  }));

  const layoutValue = asText(config.layout).toLowerCase();
  const layout = LAYOUTS.includes(layoutValue) ? layoutValue : "grid";

  if (layoutValue && !LAYOUTS.includes(layoutValue)) {
    // Documented fallback: an unsupported layout renders the default grid rather
    // than a half-built arrangement.
    console.warn(
      `Learning journey: unsupported layout "${layoutValue}"; using "${layout}".`
    );
  }

  const listClassName =
    layout === "timeline"
      ? "journey-list journey-list--timeline"
      : layout === "list"
        ? "journey-list journey-list--list"
        : "journey-list card-grid";

  const distinctOptions = (readValue, readLabel) => {
    const seen = new Map();

    for (const record of viewRecords) {
      const value = asText(readValue(record));
      const label = asText(readLabel(record));

      if (value && label && !seen.has(value)) {
        seen.set(value, label);
      }
    }

    return [...seen].map(([value, label]) => ({ value, label }));
  };

  const yearValues = [
    ...new Set(viewRecords.map((record) => record.startYear).filter((year) => year !== ""))
  ].sort((a, b) => Number(b) - Number(a));

  const openDetails = (record) => {
    const relatedItems =
      config.showRelatedItems === false ? [] : readRelatedItems(record, appContext?.data);

    openDetailsModal({
      title: asText(record.title),
      description: asText(record.categoryLabel) || asText(record.topic),
      content: buildDetails(record, asText(record.categoryLabel), relatedItems, config),
      size: "md"
    });
  };

  // The block is built before the collection view so it sits above the toolbar,
  // and it is omitted entirely when no record is in progress.
  const currentLearning = buildCurrentLearning(
    viewRecords.filter((record) => asText(record.status) === "in-progress"),
    openDetails
  );

  if (currentLearning) {
    section.body.append(currentLearning);
  }

  const view = createCollectionView({
    mount: section.body,
    records: viewRecords,
    idPrefix: "learning",
    search:
      config.showSearch === false
        ? null
        : {
            label: "Search learning",
            placeholder: "Title, topic, goal or source",
            fields: [
              "title",
              "topic",
              "description",
              "goals",
              "keyLearnings",
              "learningType",
              "source.name",
              "statusLabel"
            ]
          },
    filters:
      config.showFilters === false
        ? []
        : [
            {
              id: "category",
              label: "Category",
              key: "categoryId",
              allLabel: "All categories",
              options: distinctOptions(
                (record) => record.categoryId,
                (record) => record.categoryLabel
              )
            },
            {
              id: "status",
              label: "Status",
              key: "statusLabel",
              allLabel: "All statuses",
              options: distinctOptions((record) => record.statusLabel, (record) => record.statusLabel)
            },
            {
              id: "type",
              label: "Learning type",
              key: "learningType",
              allLabel: "All types",
              options: distinctOptions((record) => record.learningType, (record) => record.learningType)
            },
            // Derived from startDate; an undated record stays under "All years".
            {
              id: "year",
              label: "Start year",
              key: "startYear",
              allLabel: "All years",
              options: yearValues.map((year) => ({ value: String(year), label: String(year) }))
            }
          ],
    sort:
      config.showSort === false
        ? null
        : {
            label: "Sort by",
            initial: asText(config.defaultSort) === "oldest" ? "oldest" : "newest",
            options: [
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
              { value: "alphabetical", label: "Title A to Z" }
            ],
            getDate: (record) => record.startDate,
            getLabel: (record) => record.title
          },
    pageSize:
      config.showLoadMore === false
        ? 0
        : Number.isFinite(config.itemsPerPage)
          ? Number(config.itemsPerPage)
          : 0,
    countLabel: (total) => (total === 1 ? "1 activity" : `${total} activities`),
    empty: {
      title: "Nothing matches",
      message: "Clear the search or choose another category, status, type or year."
    },
    listClassName,
    renderList(visible) {
      const cards = [];

      for (const record of visible) {
        const title = asText(record.title);
        const categoryLabel = asText(record.categoryLabel);
        const statusLabel = asText(record.statusLabel);
        const progress = record.progress && typeof record.progress === "object" ? record.progress : null;
        const learnings = asArray(record.keyLearnings).map(asText).filter(Boolean);
        const goals = asArray(record.goals).map(asText).filter(Boolean);

        const badges = [];
        if (statusLabel) {
          badges.push(statusLabel);
        }
        if (categoryLabel) {
          badges.push(categoryLabel);
        }

        const card = createCard({
          id: asText(record.id),
          title,
          subtitle: asText(record.topic),
          description: asText(record.description),
          badges,
          meta: [
            {
              label: "Period",
              value: formatDateRange(
                record.startDate,
                record.endDate,
                asText(record.status) === "in-progress"
              )
            },
            { label: "Type", value: asText(record.learningType) }
          ],
          headingLevel: 3,
          ariaLabel: `View details for ${title}`,
          image: asText(record.image)
            ? { src: asText(record.image), alt: `${title} illustration`, ratio: "wide" }
            : undefined,
          footer:
            config.showProgress !== false && progress?.enabled === true
              ? createProgress(asNumber(progress.value) ?? 0, `${title}: self-assessed progress`)
              : null,
          onClick: () => openDetails(record)
        });

        // Goals are part of the record's own story, so the card shows the first
        // few when the schema switch allows them; the dialog keeps the full list.
        if (config.showGoals === true && goals.length > 0) {
          const goalList = el("ul", { className: "journey-card__goals" });
          goals.slice(0, CARD_GOALS).forEach((goal) => {
            goalList.append(el("li", { text: goal }));
          });
          card.querySelector(".card__body")?.append(goalList);
        }

        // A short "Key learnings" list under the card body: this is the part of
        // the record a visitor can act on, so it is not hidden behind the dialog.
        if (learnings.length > 0) {
          const preview = el("ul", { className: "journey-card__learnings" });
          learnings.slice(0, CARD_LEARNINGS).forEach((item) => {
            preview.append(el("li", { text: item }));
          });

          if (learnings.length > CARD_LEARNINGS) {
            preview.append(
              el("li", {
                className: "journey-card__more",
                text: `+${learnings.length - CARD_LEARNINGS} more in the details`
              })
            );
          }

          card.querySelector(".card__body")?.append(preview);
        }

        cards.push(card);
      }

      return cards;
    }
  });

  renderSampleNotice(section.body, records);

  teardownPrevious = () => view.destroy();
}
