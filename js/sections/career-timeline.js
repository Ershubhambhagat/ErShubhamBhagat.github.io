/**
 * js/sections/career-timeline.js - cross-section timeline.
 *
 * Data: data/career-timeline.json holds events that point at records in the other
 * datasets by stable id (`referenceId`). This module resolves those ids against
 * appContext.data and renders the referenced record's own title and description,
 * so a timeline entry can never drift from the section it came from.
 *
 * A reference that does not resolve is skipped with a console note and no visible
 * placeholder: a dangling id is an authoring mistake, and printing "[missing]"
 * on a public page helps nobody. The count of skipped references is reported in
 * the console once, which is where the owner will look.
 *
 * No date is synthesised: events without a usable date are dropped, because an
 * undated entry on a dated rail reads as a bug.
 *
 * Selection: search, type, featured-only, sorting and paging run through
 * js/core/collection-view.js. The resolved records become thin view models so the
 * shared pipeline never needs to understand the reference graph.
 *
 * Click-through: each event links to the section that owns the record. The
 * link is a plain in-page anchor, so the browser, the sticky-header offset and
 * the Back button all keep working; the projects section additionally opens the
 * exact card because it understands its own id deep links.
 */

import { createTimelineItem } from "../components/timeline-item.js";
import { createCollectionView } from "../core/collection-view.js";
import {
  asArray,
  asText,
  createTimeline,
  el,
  formatDateRange,
  isRecord,
  parseDate,
  prepareSection,
  readCollection,
  readSectionConfig,
  renderEmpty,
  renderSampleNotice
} from "../core/section-kit.js";

/** Teardown for a previous initialization. */
let teardownPrevious = null;

/**
 * How each event type finds its records in the data map.
 * `title` and `text` receive the referenced record; both must return a string.
 */
const RESOLVERS = Object.freeze({
  experience: {
    dataset: "experience",
    collection: "experiences",
    sectionId: "experience",
    title: (record) => asText(record.role),
    text: (record) => asText(record.shortDescription) || asText(record.description)
  },
  project: {
    dataset: "projects",
    collection: "projects",
    sectionId: "projects",
    title: (record) => asText(record.title),
    text: (record) => asText(record.shortDescription) || asText(record.description)
  },
  certificate: {
    dataset: "certificates",
    collection: "certificates",
    sectionId: "certificates",
    title: (record) => asText(record.title),
    // issuer is an object in this dataset; asText(record.issuer) would be "".
    text: (record) =>
      (record.issuer && typeof record.issuer === "object"
        ? asText(record.issuer.name)
        : asText(record.issuer))
  },
  education: {
    dataset: "education",
    collection: "education",
    sectionId: "education",
    title: (record) => asText(record.qualification),
    text: (record) => asText(record.fieldOfStudy)
  },
  learning: {
    dataset: "learningJourney",
    collection: "learningActivities",
    sectionId: "learning-journey",
    title: (record) => asText(record.title),
    text: (record) => asText(record.description)
  }
});

/**
 * Builds id -> record maps for every dataset the timeline can reference.
 *
 * @param {Object} data - appContext.data (may be empty in a partial deploy).
 * @returns {Map<string, Map<string, Object>>} Keyed by resolver key.
 */
function buildIndex(data) {
  const index = new Map();

  for (const [type, resolver] of Object.entries(RESOLVERS)) {
    const dataset = isRecord(data) ? data[resolver.dataset] : undefined;
    const records = readCollection(dataset, resolver.collection);
    const byId = new Map();

    for (const record of records) {
      const id = asText(record.id);
      if (id) {
        byId.set(id, record);
      }
    }

    index.set(type, byId);
  }

  return index;
}

/**
 * @param {Object|undefined} sectionData - data/career-timeline.json.
 * @param {{data?: Object}} [appContext]
 * @returns {void}
 */
export function initializeCareerTimeline(sectionData, appContext) {
  if (typeof teardownPrevious === "function") {
    teardownPrevious();
    teardownPrevious = null;
  }

  const config = readSectionConfig(sectionData);
  const typeLabels = new Map(
    readCollection(sectionData, "eventTypes")
      .filter((type) => type.enabled !== false)
      .map((type) => [asText(type.id), asText(type.label) || asText(type.id)])
  );
  const events = readCollection(sectionData, "events").filter(
    (event) => event.enabled !== false
  );

  if (config.enabled === false) {
    return;
  }

  const section = prepareSection("career-timeline", {
    title: asText(config.title) || "Timeline",
    intro: asText(config.subtitle)
  });

  if (!section) {
    return;
  }

  if (events.length === 0) {
    renderEmpty(section.body, {
      title: "The timeline is empty",
      message: "Events added to data/career-timeline.json appear here."
    });
    return;
  }

  const index = buildIndex(appContext?.data);
  const unresolved = [];
  const referencedSamples = [];
  const renderable = [];

  for (const event of events) {
    const type = asText(event.type);
    const resolver = RESOLVERS[type];
    const referenceId = asText(event.referenceId);
    const record = resolver ? index.get(type)?.get(referenceId) : null;

    if (!record) {
      unresolved.push(`${asText(event.id) || "(no id)"} -> ${type}:${referenceId}`);
      continue;
    }

    const parsed = parseDate(event.date);

    if (!parsed) {
      unresolved.push(`${asText(event.id) || "(no id)"} has no usable date`);
      continue;
    }

    if (record.isSample === true) {
      referencedSamples.push(record);
    }

    const title = resolver.title(record);

    if (!title) {
      unresolved.push(`${asText(event.id)} resolves to a record without a title`);
      continue;
    }

    renderable.push({ event, record, resolver, type, title, time: parsed.time });
  }

  if (unresolved.length > 0) {
    console.warn(
      `[career-timeline] ${unresolved.length} event(s) skipped:`,
      unresolved
    );
  }

  if (renderable.length === 0) {
    renderEmpty(section.body, {
      title: "Nothing to place on the timeline",
      message: "The events loaded, but none of them resolved to a dated record."
    });
    return;
  }

  // Thin view models: the shared pipeline filters and sorts these, while the
  // original event and record stay available to the renderer.
  const models = renderable.map((entry) => ({
    id: asText(entry.event.id) || asText(entry.record.id),
    recordId: asText(entry.record.id),
    title: entry.title,
    text: entry.resolver.text(entry.record),
    type: entry.type,
    typeLabel: typeLabels.get(entry.type) || entry.type,
    sectionId: entry.resolver.sectionId,
    date: asText(entry.event.date),
    endDate: asText(entry.event.endDate),
    time: entry.time,
    featured: entry.event.featured === true || entry.record.featured === true,
    // A string key, because the shared filter engine compares values and has no
    // concept of booleans. "featured"/"other" keeps the select honest without
    // teaching the engine a second matching rule.
    highlight: entry.event.featured === true || entry.record.featured === true ? "featured" : "other",
    details: asArray(entry.record.details).map(asText).filter(Boolean)
  }));

  const populatedTypes = [...new Set(models.map((model) => model.type))];

  const view = createCollectionView({
    mount: section.body,
    records: models,
    idPrefix: "timeline",
    search:
      config.showSearch === true
        ? {
            label: "Search the timeline",
            placeholder: "Title, type or description",
            fields: ["title", "text", "typeLabel"]
          }
        : null,
    filters: [
      {
        id: "type",
        label: "Event type",
        key: "type",
        allLabel: "Everything",
        options: populatedTypes.map((type) => ({
          value: type,
          label: typeLabels.get(type) || type
        }))
      },
      ...(config.showFeaturedOnlyOption === true
        ? [
            {
              id: "featured",
              label: "Highlight",
              key: "highlight",
              allLabel: "All events",
              options: [
                { value: "featured", label: "Featured only" },
                { value: "other", label: "Not featured" }
              ]
            }
          ]
        : [])
    ],
    sort: {
      label: "Sort by",
      initial: asText(config.defaultSort) === "oldest" ? "oldest" : "newest",
      options: [
        { value: "newest", label: "Newest first" },
        { value: "oldest", label: "Oldest first" }
      ],
      getDate: (model) => model.date
    },
    pageSize: config.showLoadMore === true && Number.isFinite(config.itemsPerPage)
      ? Number(config.itemsPerPage)
      : 0,
    countLabel: (total) => (total === 1 ? "1 event" : `${total} events`),
    empty: {
      title: "No events match",
      message: "Clear the search or choose another type."
    },
    listClassName: "timeline-panel",
    renderList(visible) {
      const container = el("div", { className: "timeline-panel__body" });

      const shown = visible;
      const useYears = config.showYearGroups !== false;
      const groups = new Map();

      for (const model of shown) {
        const key = useYears ? String(parseDate(model.date)?.year ?? "Undated") : "all";
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key).push(model);
      }

      for (const [year, entries] of groups) {
        if (useYears) {
          container.append(el("h3", { className: "timeline-panel__year", text: year }));
        }

        const items = entries
          .map((model) => {
            const target = `#${model.sectionId}`;
            return createTimelineItem(
              {
                id: model.id,
                title: model.title,
                eventType: ["experience", "project", "certificate", "education", "learning"].includes(model.type)
                  ? model.type
                  : "milestone",
                dateLabel: formatDateRange(model.date, model.endDate, false),
                description: model.text ? [model.text] : [],
                details: model.details,
                badges: [model.typeLabel].filter(Boolean),
                featured: model.featured,
                actions: [{ id: "source", label: "View record", href: target }]
              },
              { idPrefix: `timeline-${model.id}` }
            );
          })
          .filter(Boolean);

        const timeline = createTimeline(items, { label: useYears ? `Events in ${year}` : "Career timeline" });

        if (timeline) {
          container.append(timeline);
        }
      }

      if (shown.length === 0) {
        renderEmpty(container, {
          title: "No events of this type",
          message: "Choose another type or clear the filter."
        });
      }

      return container;
    }
  });

  renderSampleNotice(section.body, referencedSamples);

  teardownPrevious = () => view.destroy();
}
