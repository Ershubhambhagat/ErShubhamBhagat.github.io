/**
 * js/sections/experience.js - employment and freelance history.
 *
 * Data: data/experience.json. Records are rendered with the shared timeline
 * component (js/components/timeline-item.js) so the marker, the date line and
 * the expandable details behave like every other timeline on the page.
 *
 * Honesty rules applied here:
 *   - a missing end date means "Present" only when `current` is true; otherwise
 *     the range simply stops at the start date;
 *   - an empty company name is dropped instead of rendering a company badge
 *     with nothing in it;
 *   - records flagged isSample raise one notice above the timeline.
 */

import { createTimelineItem } from "../components/timeline-item.js";
import {
  asArray,
  asText,
  createTimeline,
  formatDateRange,
  prepareSection,
  readCollection,
  readSectionConfig,
  renderEmpty,
  renderSampleNotice,
  sortByDateDesc
} from "../core/section-kit.js";

/**
 * Maps one experience record to the timeline component's event shape.
 *
 * The component renders details as plain paragraphs, so responsibilities become
 * bullet-prefixed paragraphs rather than a nested <ul>: passing markup through
 * would break the component's "text only" contract. Badges carry the facts that
 * the timeline has no dedicated slot for (company, arrangement, skills).
 */

function toTimelineEvent(experience) {
  const role = asText(experience.role);

  if (!role) {
    return null;
  }

  const company = experience.company && typeof experience.company === "object"
    ? asText(experience.company.name)
    : "";

  const badges = [
    company,
    asText(experience.employmentType),
    asText(experience.workArrangement),
    asText(experience.location)
  ].filter(Boolean);

  // Technology names are shown as separate badges after the role facts.
  for (const skill of asArray(experience.skills)) {
    const label = asText(skill);
    if (label && !badges.includes(label)) {
      badges.push(label);
    }
  }

  const shortDescription = asText(experience.shortDescription);
  const description = asText(experience.description);
  const details = [];

  if (description) {
    details.push(description);
  }

  for (const responsibility of asArray(experience.responsibilities)) {
    const text = asText(responsibility);
    if (text) {
      details.push(`\u2022 ${text}`);
    }
  }

  for (const achievement of asArray(experience.achievements)) {
    const text = asText(achievement);
    if (text) {
      details.push(`Achievement: ${text}`);
    }
  }

  return {
    id: asText(experience.id) || role,
    title: role,
    eventType: "experience",
    dateLabel: formatDateRange(
      experience.startDate,
      experience.endDate,
      experience.current === true
    ),
    description: shortDescription ? [shortDescription] : [],
    details,
    badges,
    featured: experience.featured === true
  };
}

/**
 * @param {Object|undefined} sectionData - data/experience.json.
 * @param {Object} [appContext]
 * @returns {void}
 */
export function initializeExperience(sectionData, appContext) {
  const config = readSectionConfig(sectionData);
  const records = readCollection(sectionData, "experiences").filter(
    (record) => record.enabled !== false
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

  const ordered =
    asText(config.sortOrder) === "oldest-first"
      ? sortByDateDesc(records, (record) => record.startDate).reverse()
      : sortByDateDesc(records, (record) => record.startDate);

  const items = ordered.map(toTimelineEvent).filter(Boolean).map((event) => createTimelineItem(event));

  const timeline = createTimeline(items, { label: "Professional experience" });

  if (timeline) {
    section.body.append(timeline);
  } else {
    renderEmpty(section.body, {
      title: "Nothing to show in this view",
      message: "The records loaded, but none of them could be rendered."
    });
  }

  renderSampleNotice(section.body, records);
}
