/**
 * js/sections/education.js - degrees and institutions.
 *
 * Data: data/education.json. The only attested record is the degree level
 * ("Bachelor of Technology"); the institution and the years were never stated on
 * the old site, so the renderer treats every one of those fields as optional and
 * omits what is missing rather than printing a blank row.
 *
 * Cards rather than a timeline: with dates absent a timeline would show markers
 * with no dates, which reads as broken. The card grows a date line only once
 * dates exist.
 *
 * Selection: search, sorting and paging run through js/core/collection-view.js.
 * Search, sort and paging are offered only when the dataset has something to
 * sort or page, so a two-record list does not grow three dead controls.
 *
 * Detail preview: the full record (description, coursework, achievements,
 * institution link) opens in the shared modal. The card itself stays a summary.
 */

import { createCard } from "../components/card.js";
import { openDetailsModal } from "../components/modal.js";
import { createCollectionView } from "../core/collection-view.js";
import {
  asArray,
  asText,
  createLink,
  createMetaList,
  createTagList,
  el,
  formatDateRange,
  prepareSection,
  readCollection,
  readSectionConfig,
  renderEmpty,
  renderSampleNotice
} from "../core/section-kit.js";

/** Teardown for a previous initialization. */
let teardownPrevious = null;

/**
 * Reads the nested institution block defensively.
 *
 * @param {Object} record
 * @returns {{name: string, website: string, location: string, logo: string}}
 */
function readInstitution(record) {
  const block = record.institution && typeof record.institution === "object"
    ? record.institution
    : {};

  return {
    name: asText(block.name),
    website: asText(block.website),
    location: asText(block.location),
    logo: asText(block.logo)
  };
}

/**
 * @param {unknown} grade
 * @returns {string}
 */
function readGrade(grade) {
  if (grade && typeof grade === "object" && !Array.isArray(grade)) {
    return asText(grade.display) || asText(grade.value);
  }

  return asText(grade);
}

/**
 * Builds the details dialog.
 *
 * @param {Object} record
 * @param {Object} institution
 * @returns {HTMLElement}
 */
function buildDetails(record, institution) {
  const content = el("div", { className: "details-panel" });
  const description = asText(record.description);

  if (description) {
    content.append(el("p", { className: "details-panel__text", text: description }));
  }

  const meta = createMetaList([
    { label: "Institution", value: institution.name },
    { label: "Qualification", value: asText(record.qualification) },
    { label: "Field", value: asText(record.fieldOfStudy) },
    { label: "Type", value: asText(record.educationType) },
    { label: "Study mode", value: asText(record.studyMode) },
    {
      label: "Period",
      value: formatDateRange(record.startDate, record.endDate, record.isCurrent === true)
    },
    { label: "Result", value: readGrade(record.grade) }
  ]);

  if (meta) {
    content.append(meta);
  }

  const coursework = asArray(record.coursework).map(asText).filter(Boolean);
  const courseworkTags = createTagList(coursework, { label: "Coursework" });

  if (courseworkTags) {
    content.append(el("h3", { className: "details-panel__heading", text: "Coursework" }));
    content.append(courseworkTags);
  }

  const achievements = asArray(record.achievements).map(asText).filter(Boolean);

  if (achievements.length > 0) {
    content.append(el("h3", { className: "details-panel__heading", text: "Achievements" }));
    const list = el("ul", { className: "details-panel__list" });
    achievements.forEach((item) => list.append(el("li", { text: item })));
    content.append(list);
  }

  if (institution.website) {
    const link = createLink({
      href: institution.website,
      label: `Visit ${institution.name || "the institution"}`,
      className: "details-panel__document"
    });

    if (link) {
      content.append(link);
    }
  }

  return content;
}

/**
 * @param {Object|undefined} sectionData - data/education.json.
 * @param {Object} [appContext]
 * @returns {void}
 */
export function initializeEducation(sectionData, appContext) {
  if (typeof teardownPrevious === "function") {
    teardownPrevious();
    teardownPrevious = null;
  }

  const config = readSectionConfig(sectionData);
  const records = readCollection(sectionData, "education").filter(
    (record) => record.enabled !== false && asText(record.qualification)
  );

  if (config.enabled === false) {
    return;
  }

  const section = prepareSection("education", {
    title: asText(config.title) || "Education",
    intro: asText(config.subtitle)
  });

  if (!section) {
    return;
  }

  if (records.length === 0) {
    renderEmpty(section.body, {
      title: "No education records yet",
      message: "Degrees added to data/education.json appear here."
    });
    return;
  }

  const ordered = records
    .slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

  const view = createCollectionView({
    mount: section.body,
    records: ordered,
    idPrefix: "education",
    search:
      config.showSearch === true
        ? {
            label: "Search education",
            placeholder: "Institution, qualification or field",
            fields: ["institution.name", "qualification", "fieldOfStudy", "description", "coursework"]
          }
        : null,
    filters: [],
    sort:
      config.showSort === true
        ? {
            label: "Sort by",
            initial: "newest",
            options: [
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
              { value: "alphabetical", label: "Qualification A to Z" }
            ],
            getDate: (record) => record.startDate,
            getLabel: (record) => record.qualification
          }
        : null,
    pageSize: config.showLoadMore === true && Number.isFinite(config.itemsPerPage)
      ? Number(config.itemsPerPage)
      : 0,
    countLabel: (total) => (total === 1 ? "1 qualification" : `${total} qualifications`),
    empty: {
      title: "No education records match",
      message: "Clear the search or choose another sort order."
    },
    listClassName: "education-list",
    renderList(visible) {
      const cards = [];

      for (const record of visible) {
        const institution = readInstitution(record);
        const period = formatDateRange(
          record.startDate,
          record.endDate,
          record.isCurrent === true
        );

        const meta = [
          { label: "Period", value: period },
          { label: "Location", value: institution.location },
          { label: "Result", value: config.showGrade === true ? readGrade(record.grade) : "" }
        ];

        cards.push(
          createCard({
            id: asText(record.id),
            title: asText(record.qualification),
            subtitle: institution.name,
            description: asText(record.description),
            badges: asArray(record.coursework).map(asText).filter(Boolean),
            meta,
            headingLevel: 3,
            image: institution.logo
              ? {
                  src: institution.logo,
                  alt: `${institution.name || "Institution"} logo`,
                  ratio: "square",
                  fit: "contain",
                  width: 160,
                  height: 160
                }
              : undefined,
            onClick: () =>
              openDetailsModal({
                title: asText(record.qualification),
                description: institution.name,
                content: buildDetails(record, institution),
                size: "md"
              })
          })
        );
      }

      return cards;
    }
  });

  renderSampleNotice(section.body, records);

  teardownPrevious = () => view.destroy();
}
