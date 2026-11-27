/**
 * js/sections/certificates.js - certificates and course completions.
 *
 * Data: data/certificates.json. Cards come from the shared card component, so
 * the media slot, the badge row and the action row behave like the project grid.
 *
 * Selection: search, category, issuer, status, issue year, sort and paging run
 * through js/core/collection-view.js. Count, grid and empty state therefore
 * describe the same set.
 *
 * Rules that matter for trust:
 *   - issuer is an object in this dataset ({name, ...}); reading it with asText
 *     would silently produce an empty string, so the name is extracted here;
 *   - a verification link is rendered only when credentialUrl is present and
 *     passes the URL allow-list; a "Verify" button that goes nowhere is worse
 *     than no button;
 *   - credential IDs are hidden on the card unless the dataset explicitly
 *     enables them, because an ID is only useful with a working verification URL
 *     beside it. The dialog always offers the ID with a copy control: that is
 *     the one place the visitor asked for the record's details;
 *   - expiry is a derived label (Expired / Expires soon / Valid) from the date,
 *     never invented, and never conveyed by colour alone;
 *   - `status` is the record's own state (completed / in-progress / ...), which
 *     is a different fact from expiry. Both are shown as words;
 *   - the year filter is derived from issueDate, never hardcoded, and records
 *     without a date stay reachable through "All years";
 *   - records flagged isSample raise the section notice.
 */

import { createButton, createButtonLink } from "../components/button.js";
import { createCard } from "../components/card.js";
import { closeModal, openDetailsModal } from "../components/modal.js";
import { createCollectionView } from "../core/collection-view.js";
import {
  asArray,
  asText,
  copyText,
  createImage,
  createLink,
  createMetaList,
  createTagList,
  el,
  formatDate,
  parseDate,
  prepareSection,
  readCollection,
  readSectionConfig,
  renderEmpty,
  renderSampleNotice
} from "../core/section-kit.js";

/** Teardown for a previous initialization. */
let teardownPrevious = null;

/** How close an expiry has to be before it is called out. */
const EXPIRY_WARNING_DAYS = 90;

/**
 * Documented status vocabulary from the certificate schema.
 *
 * An unrecognised status is humanised instead of hidden: the owner recorded it,
 * and a filter option labelled with the raw value is still truthful.
 */
const STATUS_LABELS = Object.freeze({
  completed: "Completed",
  "in-progress": "In progress",
  expired: "Expired",
  revoked: "Revoked"
});

/**
 * @param {unknown} issuer
 * @returns {string} Issuer name from an object or a plain string.
 */
function readIssuerName(issuer) {
  if (issuer && typeof issuer === "object" && !Array.isArray(issuer)) {
    return asText(issuer.name) || asText(issuer.label);
  }

  return asText(issuer);
}

/**
 * @param {unknown} status
 * @returns {string} Display label, "" when the record has no status.
 */
function readStatusLabel(status) {
  const raw = asText(status);

  if (!raw) {
    return "";
  }

  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return STATUS_LABELS[key] || `${raw.charAt(0).toUpperCase()}${raw.slice(1).replace(/[-_]+/g, " ")}`;
}

/**
 * Issue year from the record's own date, used by the generated year filter.
 *
 * A full Date is not created here: parseDate() keeps "YYYY" and "YYYY-MM" at
 * their recorded precision, so a year-only record still contributes its year.
 *
 * @param {Object} record
 * @returns {number|null}
 */
function readIssueYear(record) {
  const date = parseDate(record?.issueDate);
  return date ? date.year : null;
}

/**
 * Derives the validity label from the expiry date.
 *
 * @param {string} expiryDate
 * @returns {{label: string, tone: string}|null}
 */
function readExpiryStatus(expiryDate) {
  const expiry = parseDate(expiryDate);

  if (!expiry) {
    return null;
  }

  const today = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate()
  );
  const days = Math.round((expiry.time - today) / 86400000);

  if (days < 0) {
    return { label: "Expired", tone: "danger" };
  }

  if (days <= EXPIRY_WARNING_DAYS) {
    return { label: "Expires soon", tone: "warning" };
  }

  return { label: "Valid", tone: "success" };
}

/**
 * Builds the details dialog body.
 *
 * @param {Object} record
 * @param {string} categoryLabel
 * @param {string} issuerName
 * @param {string} statusLabel
 * @returns {HTMLElement}
 */
function buildDetails(record, categoryLabel, issuerName, statusLabel) {
  const content = el("div", { className: "details-panel" });
  const description = asText(record.description);

  if (description) {
    content.append(el("p", { className: "details-panel__text", text: description }));
  }

  const meta = createMetaList(
    [
      { label: "Issuer", value: issuerName },
      { label: "Category", value: categoryLabel },
      { label: "Status", value: statusLabel },
      { label: "Issued", value: formatDate(record.issueDate, "long") },
      { label: "Expires", value: formatDate(record.expiryDate, "long") },
      {
        label: "Credential ID",
        value: asText(record.credentialId)
      }
    ],
    "details-panel__meta meta-list"
  );

  if (meta) {
    content.append(meta);
  }

  const skills = asArray(record.skills).map(asText).filter(Boolean);
  const tags = createTagList(skills, { label: "Skills" });

  if (tags) {
    content.append(el("h3", { className: "details-panel__heading", text: "Skills" }));
    content.append(tags);
  }

  const image = createImage({
    src: asText(record.certificateImage),
    alt: `${asText(record.title)} certificate`,
    className: "certificate-preview",
    width: 960,
    height: 680
  });

  if (image) {
    content.append(image);
  }

  const document = asText(record.certificateDocument);

  if (/^https?:\/\//i.test(document) || /^\.{0,2}\//.test(document)) {
    const link = createLink({
      href: document,
      label: "Open the certificate document",
      className: "details-panel__document"
    });

    if (link) {
      content.append(link);
    }
  }

  return content;
}

/**
 * Builds the dialog footer for one record.
 *
 * The previous/next controls walk the records the visitor can currently see, not
 * the whole dataset: after filtering to 2023, "next" must not jump to a record
 * the toolbar has hidden. Both controls are disabled at the ends rather than
 * wrapping around, so the visitor can tell where they are in the list.
 *
 * @param {Object} record
 * @param {{index: number, total: number, onNavigate: (index: number) => void, config: Object, toast: Object}} context
 * @returns {HTMLElement|null}
 */
function buildFooter(record, context) {
  const footer = el("div", { className: "details-panel__actions" });

  if (context.total > 1) {
    const nav = el("div", { className: "certificate-nav" });

    const previous = createButton({
      label: "Previous",
      ariaLabel: "Previous certificate",
      variant: "outline",
      size: "small",
      onClick: () => context.onNavigate(context.index - 1)
    });

    const next = createButton({
      label: "Next",
      ariaLabel: "Next certificate",
      variant: "outline",
      size: "small",
      onClick: () => context.onNavigate(context.index + 1)
    });

    previous.disabled = context.index <= 0;
    next.disabled = context.index >= context.total - 1;

    nav.append(previous, next);
    footer.append(nav);
  }

  const credentialId = asText(record.credentialId);

  if (credentialId) {
    // copyText() already handles the non-secure-context fallback, so this works
    // when the page is opened over plain http during local checks too.
    const copy = createButton({
      label: "Copy credential ID",
      variant: "ghost",
      size: "small",
      onClick: async () => {
        const copied = await copyText(credentialId);

        if (copied) {
          context.toast?.success?.("Credential ID copied.");
        } else {
          context.toast?.error?.("The credential ID could not be copied. It is shown in the details above.");
        }
      }
    });

    footer.append(copy);
  }

  const verifyHref = asText(record.credentialUrl);

  if (context.config.showVerificationButton !== false && verifyHref) {
    const verify = createButtonLink({
      label: "Verify certificate",
      href: verifyHref,
      variant: "primary",
      size: "small"
    });

    if (verify) {
      footer.append(verify);
    }
  }

  return footer.childElementCount > 0 ? footer : null;
}

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
    categories.map((category) => [
      asText(category.id),
      asText(category.label) || asText(category.name)
    ])
  );

  const issuerOptions = [
    ...new Set(records.map((record) => readIssuerName(record.issuer)).filter(Boolean))
  ];

  // Derived views of the record, never a rewritten dataset: the copies add the
  // two comparable fields the toolbar needs (a numeric issue year and a status
  // label) while the record itself stays untouched.
  const viewRecords = records.map((record) => {
    const issueYear = readIssueYear(record);
    const statusLabel = readStatusLabel(record.status);

    return {
      ...record,
      categoryLabel: categoryLabelById.get(asText(record.categoryId)) || "",
      issuerName: readIssuerName(record.issuer),
      statusLabel,
      issueYear: issueYear === null ? "" : issueYear
    };
  });

  const statusValues = [
    ...new Set(
      viewRecords
        .map((record) => ({ value: asText(record.status), label: record.statusLabel }))
        .filter((entry) => entry.value && entry.label)
    )
  ];

  const yearValues = [
    ...new Set(
      viewRecords
        .map((record) => record.issueYear)
        .filter((year) => year !== "" && Number.isFinite(Number(year)))
    )
  ].sort((a, b) => Number(b) - Number(a));

  /** Records currently drawn, in display order, for the dialog's prev/next. */
  let pageRecords = [];

  /**
   * Opens (or replaces) the dialog for one record of the visible page.
   *
   * @param {number} index
   * @returns {void}
   */
  function openRecord(index) {
    const record = pageRecords[index];

    if (!record) {
      return;
    }

    // The modal manager keeps one dialog at a time; closing first means "next"
    // replaces the content instead of stacking a second dialog or failing.
    closeModal();

    const categoryLabel = asText(record.categoryLabel) || categoryLabelById.get(asText(record.categoryId)) || "";
    const issuerName = asText(record.issuerName) || readIssuerName(record.issuer);
    const statusLabel = asText(record.statusLabel) || readStatusLabel(record.status);

    openDetailsModal({
      title: asText(record.title),
      description: issuerName || categoryLabel,
      content: buildDetails(record, categoryLabel, issuerName, statusLabel),
      footer: buildFooter(record, {
        index,
        total: pageRecords.length,
        onNavigate: openRecord,
        config,
        toast: appContext?.toast
      }),
      size: "lg"
    });
  }

  const view = createCollectionView({
    mount: section.body,
    records: viewRecords,
    idPrefix: "certificates",
    search: config.showSearch === false
      ? null
      : {
          label: "Search certificates",
          placeholder: "Title, issuer, skill or credential ID",
          fields: [
            "title",
            "issuerName",
            "description",
            "skills",
            "credentialId",
            "statusLabel",
            "categoryLabel"
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
              allLabel: "All certificates",
              options: categories
                .filter((category) =>
                  records.some((record) => asText(record.categoryId) === asText(category.id))
                )
                .map((category) => ({
                  value: asText(category.id),
                  label: categoryLabelById.get(asText(category.id)) || asText(category.id)
                }))
            },
            {
              id: "issuer",
              label: "Issuer",
              key: "issuerName",
              allLabel: "All issuers",
              options: issuerOptions.map((name) => ({ value: name, label: name }))
            },
            // Only statuses that occur, so no choice can produce an empty grid.
            // A single-status dataset therefore hides this control by design.
            {
              id: "status",
              label: "Status",
              key: "status",
              allLabel: "All statuses",
              options: statusValues.map((entry) => ({ value: entry.value, label: entry.label }))
            },
            // Derived from issueDate; records without a date stay under "All
            // years" rather than disappearing.
            {
              id: "year",
              label: "Issue year",
              key: "issueYear",
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
            getDate: (record) => record.issueDate,
            getLabel: (record) => record.title
          },
    // showLoadMore false means "render the whole list": a page size without the
    // control would silently truncate the dataset.
    pageSize:
      config.showLoadMore === false
        ? 0
        : Number.isFinite(config.itemsPerPage)
          ? Number(config.itemsPerPage)
          : 0,
    countLabel: (total) => (total === 1 ? "1 certificate" : `${total} certificates`),
    empty: {
      title: "No certificates match",
      message: "Clear the search or choose another category, status, year or issuer."
    },
    listClassName: "certificates-grid card-grid",
    renderList(visible) {
      pageRecords = visible;

      const cards = [];

      visible.forEach((record, index) => {
        const title = asText(record.title);
        const issuerName = asText(record.issuerName) || readIssuerName(record.issuer);
        const issued = formatDate(record.issueDate, "long");
        const expiry = formatDate(record.expiryDate, "long");
        const categoryLabel = asText(record.categoryLabel) || categoryLabelById.get(asText(record.categoryId)) || "";
        const expiryStatus = readExpiryStatus(record.expiryDate);
        const statusLabel = asText(record.statusLabel) || readStatusLabel(record.status);

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

        const badges = asArray(record.skills).map(asText).filter(Boolean);
        if (expiryStatus) {
          badges.unshift(expiryStatus.label);
        }

        const card = createCard({
          id: asText(record.id),
          title,
          subtitle: config.showIssuer === false ? "" : issuerName,
          description: asText(record.description),
          badges,
          meta,
          headingLevel: 3,
          ariaLabel: `View details for ${title}`,
          image: asText(record.certificateImage)
            ? {
                src: asText(record.certificateImage),
                alt: `${title} certificate`,
                ratio: "wide",
                fit: "contain",
                width: 640,
                height: 360
              }
            : undefined,
          onClick: () => openRecord(index)
        });

        // The record's own status is a card fact (spec 06 §7.2). The expiry badge
        // above is a different, derived fact and stays separate from it.
        if (statusLabel) {
          const chip = el("p", { className: "certificate-status" });
          chip.append(el("span", { className: "visually-hidden", text: "Status: " }));
          chip.append(el("span", { className: "certificate-status__value", text: statusLabel }));
          card.querySelector(".card__body")?.append(chip);
        }

        cards.push(card);
      });

      return cards;
    }
  });

  renderSampleNotice(section.body, records);

  teardownPrevious = () => view.destroy();
}
