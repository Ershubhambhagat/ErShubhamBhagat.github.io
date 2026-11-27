/**
 * js/sections/education.js - degrees and institutions.
 *
 * Data: data/education.json. The only attested record is the degree level
 * ("Bachelor of Technology"); the institution and the years were never stated on
 * the old site, so the renderer treats every one of those fields as optional and
 * omits what is missing rather than printing a blank row.
 *
 * Cards rather than a timeline: with dates absent a timeline would show markers
 * with no dates, which reads as broken. The record becomes a card that grows the
 * date line only once dates exist.
 */

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

/**
 * Renders one qualification as a card.
 *
 * Optional fields are appended only when present: the only published record
 * carries a degree level and nothing else, and empty label/value rows would read
 * as missing data rather than as "not published". Website links go through
 * createLink, so a non-http URL can never become a hyperlink.
 *
 * @param {Object} record
 * @returns {HTMLElement|null} null when the record has no qualification.
 */
function createEducationCard(record) {
  const qualification = asText(record.qualification);

  if (!qualification) {
    return null;
  }

  const card = el("article", { className: "education-card" });
  const institution = record.institution && typeof record.institution === "object"
    ? record.institution
    : {};
  const institutionName = asText(institution.name);

  if (institutionName) {
    const heading = el("h3", { className: "education-card__institution" });
    const website = asText(institution.website);
    const link = /^https?:\/\//i.test(website)
      ? createLink({ href: website, label: institutionName, className: "education-card__link" })
      : null;

    if (link) {
      heading.append(link);
    } else {
      heading.textContent = institutionName;
    }

    card.append(heading);
  }

  card.append(el("p", { className: "education-card__qualification", text: qualification }));

  const fieldOfStudy = asText(record.fieldOfStudy);
  if (fieldOfStudy) {
    card.append(el("p", { className: "education-card__field", text: fieldOfStudy }));
  }

  const period = formatDateRange(record.startDate, record.endDate, record.isCurrent === true);
  const location = asText(institution.location);
  const grade = record.grade && typeof record.grade === "object" ? asText(record.grade.display) : "";

  const meta = createMetaList(
    [
      { label: "Period", value: period },
      { label: "Location", value: location },
      { label: "Result", value: grade }
    ],
    "education-card__meta"
  );

  if (meta) {
    card.append(meta);
  }

  const description = asText(record.description);
  if (description) {
    card.append(el("p", { className: "education-card__text", text: description }));
  }

  const coursework = createTagList(asArray(record.coursework), {
    className: "tag-list education-card__coursework",
    label: "Coursework"
  });

  if (coursework) {
    card.append(coursework);
  }

  // An empty card body (only a qualification) still needs to say something
  // useful, otherwise it looks unfinished rather than sparse.
  if (card.childElementCount <= 1) {
    card.append(
      el("p", {
        className: "education-card__text education-card__text--muted",
        text: "Institution and dates are not published."
      })
    );
  }

  return card;
}

/**
 * @param {Object|undefined} sectionData - data/education.json.
 * @param {Object} [appContext]
 * @returns {void}
 */
export function initializeEducation(sectionData, appContext) {
  const config = readSectionConfig(sectionData);
  const records = readCollection(sectionData, "education").filter(
    (record) => record.enabled !== false
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

  const list = el("div", { className: "education-list" });
  ordered.forEach((record) => {
    const card = createEducationCard(record);
    if (card) {
      list.append(card);
    }
  });

  if (list.childElementCount === 0) {
    renderEmpty(section.body, { title: "Nothing to show", message: "No record had a qualification to display." });
    return;
  }

  section.body.append(list);
  renderSampleNotice(section.body, records);
}
