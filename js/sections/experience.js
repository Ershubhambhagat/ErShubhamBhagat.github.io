/**
 * js/sections/experience.js - employment and freelance history.
 *
 * Data: data/experience.json. Records are rendered with the shared timeline
 * component (js/components/timeline-item.js) so the marker, the date line and
 * the expandable details behave like every other timeline on the page.
 *
 * Selection: search, employment-type / arrangement filters and sorting run
 * through js/core/collection-view.js. The timeline itself is rebuilt from the
 * page slice, so the count and the list cannot disagree.
 *
 * Honesty rules applied here:
 *   - a missing end date means "Present" only when `current` is true; otherwise
 *     the range simply stops at the start date;
 *   - duration is computed from the recorded dates and is omitted when only one
 *     date exists - it is never estimated from a job title;
 *   - an empty company name is dropped instead of rendering a company badge
 *     with nothing in it;
 *   - records flagged isSample raise one notice above the timeline.
 */

/** Teardown for the most recent initialization. */
let teardownPrevious = null;

import { createTimelineItem } from "../components/timeline-item.js";
import { createCollectionView } from "../core/collection-view.js";
import {
  asArray,
  asText,
  createTimeline,
  el,
  formatDateRange,
  parseDate,
  prepareSection,
  readCollection,
  readSectionConfig,
  renderEmpty,
  renderSampleNotice
} from "../core/section-kit.js";

/**
 * Formats the span between two partial ISO dates.
 *
 * Whole months only: a portfolio claim of "2 yrs 3 mos" is a summary, and
 * counting days would imply a precision the data does not have. An end date
 * before the start date is treated as a data error and yields "" rather than a
 * negative duration.
 *
 * @param {string} startDate
 * @param {string} endDate
 * @param {boolean} current
 * @returns {string} e.g. "2 yrs 3 mos", "" when it cannot be computed.
 */
function formatDuration(startDate, endDate, current = false) {
  const start = parseDate(startDate);
  const end = current ? { year: new Date().getUTCFullYear(), month: new Date().getUTCMonth() + 1, day: 1 } : parseDate(endDate);

  if (!start || !end) {
    return "";
  }

  let months = (end.year - start.year) * 12 + ((end.month ?? 1) - (start.month ?? 1));

  if (months < 0) {
    return "";
  }

  // A same-month record still lasted some time; reporting "0 mos" reads like a
  // mistake, so the smallest unit shown is one month.
  months = Math.max(1, months + 1);

  const years = Math.floor(months / 12);
  const remainder = months % 12;

  if (years === 0) {
    return `${remainder} mo${remainder === 1 ? "" : "s"}`;
  }

  const yearLabel = `${years} yr${years === 1 ? "" : "s"}`;
  return remainder === 0 ? yearLabel : `${yearLabel} ${remainder} mo${remainder === 1 ? "" : "s"}`;
}

/**
 * Maps one experience record to the timeline component's event shape.
 *
 * The component renders details as plain paragraphs, so responsibilities become
 * bullet-prefixed paragraphs rather than a nested <ul>: passing markup through
 * would break the component's "text only" contract. Badges carry the facts that
 * the timeline has no dedicated slot for (company, arrangement, skills).
 *
 * @param {Object} experience
 * @param {{showAchievements: boolean, showTechnologies: boolean, projects: Map<string, Object>}} options
 * @returns {Object|null}
 */
function toTimelineEvent(experience, options) {
  const role = asText(experience.role);

  if (!role) {
    return null;
  }

  const companyBlock = experience.company && typeof experience.company === "object"
    ? experience.company
    : {};
  const company = asText(companyBlock.name);

  const badges = [
    company,
    asText(experience.employmentType),
    asText(experience.workArrangement),
    asText(experience.location)
  ].filter(Boolean);

  // Technology names are shown as separate badges after the role facts. The
  // timeline has no dedicated slot for them, so `showTechnologies: false` simply
  // leaves them out of the badge row.
  if (options.showTechnologies) {
    for (const skill of asArray(experience.skills)) {
      const label = asText(skill);
      if (label && !badges.includes(label)) {
        badges.push(label);
      }
    }
  }

  const shortDescription = asText(experience.shortDescription);
  const description = asText(experience.description);
  const details = [];

  if (description) {
    details.push(description);
  }

  const isCurrent = experience.current === true;
  const duration = formatDuration(experience.startDate, experience.endDate, isCurrent);

  if (duration) {
    details.push(`Duration: ${duration}`);
  }

  for (const responsibility of asArray(experience.responsibilities)) {
    const text = asText(responsibility);
    if (text) {
      details.push(`\u2022 ${text}`);
    }
  }

  // Achievements are { title, description, metric } objects in the current
  // schema; the previous asText() pass turned each one into "" and dropped the
  // whole list. The metric is a separate sentence because it is the measurable
  // part and must not be swallowed by the description.
  if (options.showAchievements) {
    for (const achievement of asArray(experience.achievements)) {
      if (!achievement || achievement.enabled === false) {
        continue;
      }

      if (typeof achievement === "object" && !Array.isArray(achievement)) {
        const title = asText(achievement.title);
        const text = asText(achievement.description);
        const metric = asText(achievement.metric);

        if (!title && !text && !metric) {
          continue;
        }

        const parts = [title, text, metric ? `Result: ${metric}` : ""].filter(Boolean);
        details.push(`Achievement: ${parts.join(" \u2014 ")}`);
        continue;
      }

      const text = asText(achievement);
      if (text) {
        details.push(`Achievement: ${text}`);
      }
    }
  }

  const website = asText(companyBlock.website);
  const actions = website
    ? [{ id: "company", label: `Visit ${company || "company"}`, href: website }]
    : [];

  // relatedProjectIds were declared in the schema and never read. Only ids that
  // resolve to a project are linked: a dangling id is not navigable, and the
  // projects section already opens a dialog from #project-001 style hashes.
  for (const id of asArray(experience.relatedProjectIds)) {
    const project = options.projects.get(asText(id));
    const title = asText(project?.title);

    if (project && title) {
      actions.push({ id: asText(project.id), label: `Related project: ${title}`, href: `#${asText(project.id)}` });
    }
  }

  const logo = asText(companyBlock.logo);

  return {
    id: asText(experience.id) || role,
    title: role,
    eventType: "experience",
    dateLabel: formatDateRange(experience.startDate, experience.endDate, isCurrent),
    description: shortDescription ? [shortDescription] : [],
    details,
    badges,
    featured: experience.featured === true,
    image: logo ? { src: logo, alt: `${company || "Company"} logo` } : null,
    actions
  };
}

/**
 * Normalises the records the section will render.
 *
 * Three data faults are rejected here instead of being drawn as facts (spec
 * 04-7.3): a malformed start date, a duplicate id, and `current: true` on a role
 * that also carries an end date. The last one is the dangerous case - it would
 * print "Present" over a finished role - so the end date wins and the conflict
 * is logged with the record id.
 *
 * The result is a copy: the loaded dataset is shared with other sections and is
 * never mutated.
 *
 * @param {Array<Object>} records
 * @returns {Array<Object>}
 */
function normalizeExperience(records) {
  const seen = new Set();
  const normalized = [];

  for (const record of records) {
    const id = asText(record.id) || asText(record.role);
    const startDate = asText(record.startDate);

    if (startDate && !parseDate(startDate)) {
      console.warn(`Experience "${id}": startDate "${startDate}" is not an ISO date; record skipped.`);
      continue;
    }

    if (seen.has(id)) {
      console.warn(`Experience "${id}": duplicate id; later record skipped.`);
      continue;
    }

    seen.add(id);

    let current = record.current === true;

    if (current && asText(record.endDate)) {
      console.warn(
        `Experience "${id}": current is true but endDate is set; rendering the recorded end date.`
      );
      current = false;
    }

    normalized.push({
      ...record,
      current,
      statusGroup: current ? "current" : "previous"
    });
  }

  return normalized;
}

/**
 * @param {Object|undefined} sectionData - data/experience.json.
 * @param {Object} [appContext]
 * @returns {void}
 */
export function initializeExperience(sectionData, appContext) {
  const config = readSectionConfig(sectionData);
  const records = normalizeExperience(
    readCollection(sectionData, "experiences").filter(
      (record) => record.enabled !== false && asText(record.role)
    )
  );

  if (config.enabled === false) {
    return;
  }

  const section = prepareSection("experience", {
    title: asText(config.title) || "Experience",
    intro: asText(config.subtitle)
  });

  if (!section) {
    return;
  }

  if (records.length === 0) {
    renderEmpty(section.body, {
      title: "No experience records yet",
      message: "Roles added to data/experience.json appear here as a timeline."
    });
    return;
  }

  /**
   * Distinct non-empty values, used to decide whether a filter is worth showing.
   *
   * @param {string} key
   * @returns {Array<{value: string, label: string}>}
   */
  function filterOptions(key) {
    const values = [...new Set(records.map((record) => asText(record[key])).filter(Boolean))];

    return values.length > 1
      ? values.map((value) => ({ value, label: value }))
      : [];
  }

  // Projects are needed to turn relatedProjectIds into a navigable label. Only
  // the id and title are read, and only for ids the record actually names.
  const projectsById = new Map();

  for (const project of asArray(appContext?.data?.projects?.projects)) {
    const id = asText(project?.id);

    if (id) {
      projectsById.set(id, project);
    }
  }

  const timelineOptions = {
    showAchievements: config.showAchievements !== false,
    showTechnologies: config.showTechnologies !== false,
    projects: projectsById
  };

  const view = createCollectionView({
    mount: section.body,
    records,
    idPrefix: "experience",
    search:
      config.showSearch === false
        ? null
        : {
            label: "Search experience",
            placeholder: "Role, company, place or skill",
            fields: [
              "role",
              "company.name",
              "location",
              "employmentType",
              "workArrangement",
              "shortDescription",
              "description",
              "responsibilities",
              "achievements",
              "skills"
            ]
          },
    filters:
      config.showFilters === false
        ? []
        : [
            // Current/previous is the question a visitor asks of a CV first, so
            // it is a filter of its own rather than a reading of the dates. The
            // value is derived from the validated `current` flag, never from an
            // open end date.
            {
              id: "status",
              label: "Role status",
              key: "statusGroup",
              allLabel: "All roles",
              options: [
                { value: "current", label: "Current role" },
                { value: "previous", label: "Previous role" }
              ]
            },
            {
              id: "type",
              label: "Employment type",
              key: "employmentType",
              allLabel: "All types",
              options: filterOptions("employmentType")
            },
            {
              id: "arrangement",
              label: "Work arrangement",
              key: "workArrangement",
              allLabel: "All arrangements",
              options: filterOptions("workArrangement")
            }
          ],
    sort:
      config.showSort === false
        ? null
        : {
            label: "Sort by",
            initial: asText(config.sortOrder) === "oldest-first" ? "oldest" : "newest",
            options: [
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
              { value: "alphabetical", label: "Role A to Z" }
            ],
            getDate: (record) => record.startDate,
            getLabel: (record) => record.role
          },
    countLabel: (total) => (total === 1 ? "1 role" : `${total} roles`),
    empty: {
      title: "No roles match",
      message: "Clear the search or choose another filter."
    },
    listClassName: "experience-list",
    renderList(visible) {
      const items = visible
        .map((record) => toTimelineEvent(record, timelineOptions))
        .filter(Boolean)
        .map((event, index) =>
          createTimelineItem(event, {
            idPrefix: `experience-${index}`,
            allowExpandableDetails: config.expandableDetails !== false
          })
        );

      const timeline = createTimeline(items, { label: "Professional experience" });
      return timeline ?? el("p", { className: "collection-status", text: "" });
    }
  });

  renderSampleNotice(section.body, records);

  // A second initialization (JSON Manager re-import) must not stack the view.
  registerTeardown(() => view.destroy());
}

/**
 * Stores the teardown of the current instance, running the previous one first.
 *
 * @param {() => void} teardown
 * @returns {void}
 */
function registerTeardown(teardown) {
  if (typeof teardownPrevious === "function") {
    teardownPrevious();
  }

  teardownPrevious = teardown;
}
