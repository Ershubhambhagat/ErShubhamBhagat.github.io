/**
 * js/sections/certificates.js - certificates and course completions.
 *
 * Data: data/certificates.json. Cards come from the shared card component, so
 * the media slot, the badge row and the action row behave like the project grid.
 *
 * Rules that matter for trust:
 *   - a verification link is rendered only when credentialUrl is present and
 *     passes the URL allow-list; a "Verify" button that goes nowhere is worse
 *     than no button;
 *   - credential IDs are hidden unless the dataset explicitly enables them,
 *     because an ID is only useful with a working verification URL beside it;
 *   - records flagged isSample raise the section notice.
 */

import { createButtonLink } from "../components/button.js";
import { createCard } from "../components/card.js";
import { initializeFilter } from "../components/filter.js";
import {
  asArray,
  asText,
  el,
  formatDate,
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
 * @param {Object|undefined} sectionData - data/certificates.json.
 * @param {Object} [appContext]
 * @returns {void}
 */
export function initializeCertificates(sectionData, appContext) {
  if (typeof teardownPrevious === "function") {
    teardownPrevious();
    teardownPrevious = null;
  }

  const config = readSectionConfig(sectionData);
  const categories = readCollection(sectionData, "categories");
  const records = readCollection(sectionData, "certificates").filter(
    (record) => record.enabled !== false && asText(record.title)
  );

  if (config.enabled === false) {
    return;
  }

  const section = prepareSection("certificates", {
    title: asText(config.title) || "Certificates",
    intro: asText(config.subtitle)
  });

  if (!section) {
    return;
  }

  if (records.length === 0) {
    renderEmpty(section.body, {
      title: "No certificates yet",
      message: "Certificates added to data/certificates.json appear here."
    });
    return;
  }

  const categoryLabelById = new Map(
    categories.map((category) => [asText(category.id), asText(category.label) || asText(category.name)])
  );

  const ordered = sortByDateDesc(records, (record) => record.issueDate);
  const grid = el("div", { className: "certificates-grid card-grid" });

  /**
   * Redraws the grid for a category ("" means all).
   *
   * Category labels are resolved once into `categoryLabelById`; a record with an
   * unknown categoryId still renders, just without that meta row, because losing
   * a certificate over a typo in an id would be worse than a missing label.
   */
  function render(selectedCategory) {
    grid.replaceChildren();

    const visible = selectedCategory
      ? ordered.filter((record) => asText(record.categoryId) === selectedCategory)
      : ordered;

    for (const record of visible) {
      const title = asText(record.title);
      const issuer = asText(record.issuer);
      const issued = formatDate(record.issueDate, "long");
      const expiry = formatDate(record.expiryDate, "long");
      const categoryLabel = categoryLabelById.get(asText(record.categoryId)) || "";

      const meta = [];
      if (issued && config.showDate !== false) {
        meta.push({ label: "Issued", value: issued });
      }
      if (expiry) {
        meta.push({ label: "Expires", value: expiry });
      }
      if (categoryLabel) {
        meta.push({ label: "Category", value: categoryLabel });
      }
      if (config.showCredentialId === true && asText(record.credentialId)) {
        meta.push({ label: "Credential", value: asText(record.credentialId) });
      }

      const actions = [];
      if (config.showVerificationButton !== false && asText(record.credentialUrl)) {
        const verify = createButtonLink({
          label: "Verify certificate",
          href: asText(record.credentialUrl),
          variant: "outline",
          size: "small"
        });
        if (verify) {
          actions.push(verify);
        }
      }

      const card = createCard({
        title,
        subtitle: config.showIssuer === false ? "" : issuer,
        description: asText(record.description),
        badges: asArray(record.skills).map(asText).filter(Boolean),
        meta,
        actions,
        headingLevel: 3
      });

      grid.append(card);
    }

    if (visible.length === 0) {
      renderEmpty(grid, {
        title: "No certificates in this category",
        message: "Choose another category or clear the filter."
      });
    }
  }

  const populated = new Set(ordered.map((record) => asText(record.categoryId)).filter(Boolean));

  if (config.showFilters !== false && populated.size > 1) {
    const filterMount = el("div", { className: "certificates-toolbar" });
    section.body.append(filterMount);

    const controller = initializeFilter(filterMount, {
      heading: "",
      config: {
        groups: [
          {
            id: "category",
            label: "Category",
            type: "select",
            allLabel: "All certificates",
            options: categories
              .filter((category) => populated.has(asText(category.id)))
              .map((category) => ({
                value: asText(category.id),
                label: categoryLabelById.get(category.id) || asText(category.id)
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
  section.body.append(grid);
  renderSampleNotice(section.body, records);
}
