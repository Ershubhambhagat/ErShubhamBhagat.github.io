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
 */

import { createTimelineItem } from "../components/timeline-item.js";
import { initializeFilter } from "../components/filter.js";
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
    title: (record) => asText(record.role),
    text: (record) => asText(record.shortDescription) || asText(record.description)
  },
  project: {
    dataset: "projects",
    collection: "projects",
    title: (record) => asText(record.title),
    text: (record) => asText(record.shortDescription) || asText(record.description)
  },
  certificate: {
    dataset: "certificates",
    collection: "certificates",
    title: (record) => asText(record.title),
    text: (record) => asText(record.issuer)
  },
  education: {
    dataset: "education",
    collection: "education",
    title: (record) => asText(record.qualification),
    text: (record) => asText(record.fieldOfStudy)
  },
  learning: {
    dataset: "learningJourney",
    collection: "learningActivities",
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

    if (!parseDate(event.date)) {
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

    renderable.push({ event, record, resolver, type, title });
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

  const list = el("div", { className: "timeline-panel" });
  const timelineMount = el("div", { className: "timeline-panel__mount" });
  list.append(timelineMount);

  /**
   * Draws the events matching a type ("" means all), newest first.
   *
   * References were resolved once during initialization, so this only filters and
   * orders. parseDate is reused for the comparison because events may use year or
   * year-month precision; a plain string sort would rank "2024" after "2024-01".
   */
  function render(selectedType) {
    timelineMount.replaceChildren();

    const visible = renderable
      .filter((entry) => !selectedType || entry.type === selectedType)
      .sort((a, b) => (parseDate(b.event.date)?.time ?? 0) - (parseDate(a.event.date)?.time ?? 0));

    const items = visible.map((entry) => {
      const typeLabel = typeLabels.get(entry.type) || entry.type;
      const text = entry.resolver.text(entry.record);

      return createTimelineItem({
        id: asText(entry.event.id) || asText(entry.record.id),
        title: entry.title,
        eventType: entry.type === "learning" ? "learning" : entry.type,
        dateLabel: formatDateRange(entry.event.date, entry.event.endDate, false),
        description: text ? [text] : [],
        details: asArray(entry.record.details).map(asText).filter(Boolean),
        badges: [typeLabel].filter(Boolean),
        featured: entry.event.featured === true || entry.record.featured === true
      });
    }).filter(Boolean);

    const timeline = createTimeline(items, { label: "Career timeline" });

    if (timeline) {
      timelineMount.append(timeline);
    } else {
      renderEmpty(timelineMount, {
        title: "No events of this type",
        message: "Choose another type or clear the filter."
      });
    }
  }

  const populatedTypes = [...new Set(renderable.map((entry) => entry.type))];

  if (config.showFilters !== false && populatedTypes.length > 1) {
    const filterMount = el("div", { className: "timeline-panel__filters" });
    list.prepend(filterMount);

    const controller = initializeFilter(filterMount, {
      heading: "",
      config: {
        groups: [
          {
            id: "type",
            label: "Event type",
            type: "select",
            allLabel: "Everything",
            options: populatedTypes.map((type) => ({
              value: type,
              label: typeLabels.get(type) || type
            }))
          }
        ]
      },
      layout: "horizontal",
      onChange(state) {
        render(asText(state.type));
      }
    });

    teardownPrevious = () => controller.destroy();
  }

  render("");
  section.body.append(list);
  renderSampleNotice(section.body, referencedSamples);
}
