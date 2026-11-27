/**
 * js/sections/projects.js - the project grid.
 *
 * Data: data/projects.json. Records are rendered with the shared card component
 * (js/components/card.js), which owns the media slot, the stretched title link
 * and the action row. This module owns the record shape, the details dialog and
 * the media that the record happens to carry.
 *
 * Selection: search, category, technology, sorting and paging all run through
 * js/core/collection-view.js so the count, the grid, the empty state and the
 * "load more" control always describe the same set. Filtering starts from the
 * immutable dataset on every pass, so repeated filtering cannot drift.
 *
 * Media: coverImage/gallery are optional and may point at files the owner has
 * not added yet. createImage() validates the path, reserves the declared size
 * and removes a failed image instead of leaving a broken frame; the card then
 * simply has no media slot.
 *
 * Related records: relatedSkillIds and relatedProjectIds are resolved against
 * the loaded datasets by id. An id that does not resolve is skipped rather than
 * printed, because a dangling id is not a skill the visitor can look up.
 *
 * Deep link: #project-001 (or any record id) opens that project's dialog after
 * the data renders, and the hash is cleared on close so Back does not reopen a
 * dialog the visitor just dismissed. Unknown hashes are ignored.
 *
 * Security: every card string is written by the component with textContent, and
 * links pass the button component's URL allow-list. Details open in the shared
 * modal manager, never in a new window.
 */

import { createCard } from "../components/card.js";
import { createButtonLink } from "../components/button.js";
import { deriveFilterOptions, deriveRangeBounds } from "../components/filter.js";
import { openDetailsModal } from "../components/modal.js";
import { createCollectionView } from "../core/collection-view.js";
import { matchesQuery } from "../core/search-engine.js";
import {
  asArray,
  asText,
  createImage,
  createLink,
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
 * Known project statuses, in the vocabulary the dataset and the spec use.
 *
 * An unknown status is not dropped: the spec allows "a documented fallback", and
 * hiding a fact the owner recorded is worse than printing the raw value in a
 * neutral chip. The fallback is therefore "print the value, humanised".
 */
const STATUS_LABELS = Object.freeze({
  completed: "Completed",
  "in-progress": "In progress",
  ongoing: "Ongoing",
  planned: "Planned",
  archived: "Archived"
});

/**
 * @param {unknown} status
 * @returns {{key: string, label: string}|null}
 */
function readStatus(status) {
  const raw = asText(status);

  if (!raw) {
    return null;
  }

  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const label =
    STATUS_LABELS[key] || `${raw.charAt(0).toUpperCase()}${raw.slice(1).replace(/[-_]+/g, " ")}`;

  return { key, label };
}

/**
 * Reads a titled list entry (features, challenges) without inventing fields.
 *
 * Both lists are documented as objects, but a bare string still appears in older
 * exports; a string is treated as the entry's body text.
 *
 * @param {unknown} entry
 * @returns {{title: string, description: string, challenge: string, solution: string}}
 */
function readTitledEntry(entry) {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    return {
      title: asText(entry.title),
      description: asText(entry.description),
      challenge: asText(entry.challenge),
      solution: asText(entry.solution)
    };
  }

  return { title: "", description: asText(entry), challenge: "", solution: "" };
}

/**
 * Builds one gallery thumbnail.
 *
 * The thumbnail is decorative context for the dialog, so it is not a link: a
 * lightbox would need its own focus trap and Escape handling, and the shared
 * modal already owns those. The full-size file is one click away through the
 * project's own links when the owner provides one.
 *
 * @param {string} src
 * @param {string} alt
 * @returns {HTMLElement|null}
 */
function createGalleryItem(src, alt) {
  const image = createImage({
    src,
    alt,
    className: "project-gallery__image",
    width: 640,
    height: 360
  });

  if (!image) {
    return null;
  }

  const item = el("li", { className: "project-gallery__item" });
  item.append(image);
  return item;
}

/**
 * Builds the dialog body for one project.
 *
 * Plain text and lists only: the description is owner-authored data and could
 * contain anything, so it never becomes markup.
 *
 * @param {Object} project
 * @param {string} categoryName
 * @param {{skills: Map<string, Object>, projects: Map<string, Object>, experience: Map<string, Object>}} related
 * @returns {HTMLElement}
 */
function buildProjectDetails(project, categoryName, related) {
  const content = el("div", { className: "details-panel" });
  const description = asText(project.description) || asText(project.shortDescription);

  if (description) {
    content.append(el("p", { className: "details-panel__text", text: description }));
  }

  const facts = [];
  const period = formatDateRange(project.startDate, project.endDate, false);
  if (period) {
    facts.push(`Period: ${period}`);
  }
  if (categoryName) {
    facts.push(`Category: ${categoryName}`);
  }
  const role = asText(project.role);
  if (role) {
    facts.push(`Role: ${role}`);
  }
  const status = asText(project.status);
  if (status) {
    facts.push(`Status: ${status}`);
  }

  if (facts.length > 0) {
    const list = el("ul", { className: "details-panel__facts" });
    facts.forEach((fact) => list.append(el("li", { text: fact })));
    content.append(list);
  }

  const contributions = asArray(project.contributions).map(asText).filter(Boolean);
  if (contributions.length > 0) {
    content.append(el("h3", { className: "details-panel__heading", text: "What I built" }));
    const list = el("ul", { className: "details-panel__list" });
    contributions.forEach((item) => list.append(el("li", { text: item })));
    content.append(list);
  }

  // `features` is a documented part of the project schema; it was never read.
  // Each entry is { title, description } but a bare string is still accepted, so
  // an older dataset keeps working.
  const features = asArray(project.features)
    .filter((entry) => !(entry && entry.enabled === false))
    .map(readTitledEntry)
    .filter((entry) => entry.title || entry.description);

  if (features.length > 0) {
    content.append(el("h3", { className: "details-panel__heading", text: "Features" }));
    const list = el("ul", { className: "details-panel__list details-panel__list--titled" });

    for (const feature of features) {
      const item = el("li", { className: "details-panel__item" });
      if (feature.title) {
        item.append(el("span", { className: "details-panel__item-title", text: feature.title }));
      }
      if (feature.description) {
        item.append(el("p", { className: "details-panel__text", text: feature.description }));
      }
      list.append(item);
    }

    content.append(list);
  }

  // Challenges may be a string or { title, challenge, solution }. Reading them
  // with asText() silently produced an empty list for the object form, which is
  // the form the schema documents.
  const challenges = asArray(project.challenges)
    .filter((entry) => !(entry && entry.enabled === false))
    .map(readTitledEntry)
    .filter((entry) => entry.title || entry.challenge || entry.solution);

  if (challenges.length > 0) {
    content.append(el("h3", { className: "details-panel__heading", text: "Challenges" }));
    const list = el("ul", { className: "details-panel__list details-panel__list--titled" });

    for (const challenge of challenges) {
      const item = el("li", { className: "details-panel__item" });
      if (challenge.title) {
        item.append(el("span", { className: "details-panel__item-title", text: challenge.title }));
      }
      if (challenge.challenge) {
        item.append(el("p", { className: "details-panel__text", text: challenge.challenge }));
      }
      // The solution is a separate sentence in the data, so it keeps its own
      // label instead of being glued onto the problem text.
      if (challenge.solution) {
        item.append(
          el("p", { className: "details-panel__text", text: `Solution: ${challenge.solution}` })
        );
      }
      list.append(item);
    }

    content.append(list);
  }

  const technologies = asArray(project.technologies).map(asText).filter(Boolean);
  const tags = createTagList(technologies, {
    className: "tag-list details-panel__tags",
    label: "Technologies"
  });

  if (tags) {
    content.append(el("h3", { className: "details-panel__heading", text: "Technologies" }));
    content.append(tags);
  }

  const skillNames = asArray(project.relatedSkillIds)
    .map((id) => related.skills.get(asText(id)))
    .filter(Boolean)
    .map((skill) => asText(skill.name))
    .filter(Boolean);

  if (skillNames.length > 0) {
    const skillTags = createTagList(skillNames, {
      className: "tag-list details-panel__tags",
      label: "Related skills"
    });

    if (skillTags) {
      content.append(el("h3", { className: "details-panel__heading", text: "Related skills" }));
      content.append(skillTags);
    }
  }

  // Related experience was resolved into buildRelatedMaps() but never shown.
  // The label carries role and company because two roles at one employer would
  // otherwise be indistinguishable in the list.
  const relatedExperience = asArray(project.relatedExperienceIds)
    .map((id) => related.experience.get(asText(id)))
    .filter(Boolean)
    .map((role) => ({
      label: [asText(role.role), asText(role.company?.name)].filter(Boolean).join(" \u2014 "),
      id: asText(role.id)
    }))
    .filter((entry) => entry.label);

  if (relatedExperience.length > 0) {
    content.append(el("h3", { className: "details-panel__heading", text: "Related experience" }));
    const list = el("ul", { className: "details-panel__list" });

    for (const entry of relatedExperience) {
      const item = el("li", {});
      // The Experience section owns the record, so the link targets that section
      // (with the record id when one exists) instead of duplicating the role
      // text here.
      const link = createLink({
        href: "#experience",
        label: entry.label,
        className: "details-panel__related-link"
      });
      item.append(link || el("span", { text: entry.label }));
      list.append(item);
    }

    content.append(list);
  }

  const relatedProjects = asArray(project.relatedProjectIds)
    .map((id) => related.projects.get(asText(id)))
    .filter(Boolean)
    .map((entry) => asText(entry.title))
    .filter(Boolean);

  if (relatedProjects.length > 0) {
    const list = el("ul", { className: "details-panel__list" });
    relatedProjects.forEach((title) => list.append(el("li", { text: title })));
    content.append(el("h3", { className: "details-panel__heading", text: "Related projects" }));
    content.append(list);
  }

  // gallery is [{ id, src, alt }] in the schema; the previous asText() pass
  // turned every object into "" and dropped the whole block. A bare string is
  // still accepted so an older export keeps its screenshots.
  const gallery = asArray(project.gallery)
    .map((entry, index) => {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const src = asText(entry.src);
        return src
          ? createGalleryItem(
              src,
              asText(entry.alt) || `${asText(project.title)} screenshot ${index + 1}`
            )
          : null;
      }

      const src = asText(entry);
      return src
        ? createGalleryItem(src, `${asText(project.title)} screenshot ${index + 1}`)
        : null;
    })
    .filter(Boolean);

  if (gallery.length > 0) {
    content.append(el("h3", { className: "details-panel__heading", text: "Screenshots" }));
    const list = el("ul", { className: "project-gallery", attrs: { role: "list" } });
    list.append(...gallery);
    content.append(list);
  }

  return content;
}

/** Builds the dialog footer from whatever links the record actually has. */
function buildProjectFooter(project) {
  const links = project.links && typeof project.links === "object" ? project.links : {};
  const footer = el("div", { className: "details-panel__actions" });

  const definitions = [
    { href: asText(links.liveDemo), label: "Open live demo", variant: "primary" },
    { href: asText(links.sourceCode), label: "View source", variant: "outline" },
    { href: asText(links.documentation), label: "Documentation", variant: "ghost" }
  ];

  for (const definition of definitions) {
    if (!definition.href) {
      continue;
    }

    const button = createButtonLink({
      label: definition.label,
      href: definition.href,
      variant: definition.variant,
      size: "small"
    });

    if (button) {
      footer.append(button);
    }
  }

  return footer.childElementCount > 0 ? footer : null;
}

/**
 * Opens one project's dialog.
 *
 * @param {Object} project
 * @param {string} categoryName
 * @param {Object} related
 * @returns {void}
 */
function showProject(project, categoryName, related) {
  openDetailsModal({
    title: asText(project.title),
    description: categoryName,
    content: buildProjectDetails(project, categoryName, related),
    footer: buildProjectFooter(project),
    size: "lg"
  });
}

/**
 * Resolves the related-record maps once per render.
 *
 * @param {Object|undefined} data - appContext.data
 * @returns {{skills: Map<string, Object>, projects: Map<string, Object>, experience: Map<string, Object>}}
 */
function buildRelatedMaps(data) {
  const skills = new Map();
  const projects = new Map();
  const experience = new Map();

  for (const skill of asArray(data?.skills?.skills)) {
    if (skill && asText(skill.id)) {
      skills.set(asText(skill.id), skill);
    }
  }

  for (const project of asArray(data?.projects?.projects)) {
    if (project && asText(project.id)) {
      projects.set(asText(project.id), project);
    }
  }

  for (const role of asArray(data?.experience?.experiences)) {
    if (role && asText(role.id)) {
      experience.set(asText(role.id), role);
    }
  }

  return { skills, projects, experience };
}

/**
 * @param {Object|undefined} sectionData - data/projects.json.
 * @param {Object} [appContext]
 * @returns {void}
 */
export function initializeProjects(sectionData, appContext) {
  if (typeof teardownPrevious === "function") {
    teardownPrevious();
    teardownPrevious = null;
  }

  const config = readSectionConfig(sectionData);
  const categories = readCollection(sectionData, "categories");
  const records = readCollection(sectionData, "projects").filter(
    (project) => project.enabled !== false && asText(project.title)
  );

  if (config.enabled === false) {
    return;
  }

  const section = prepareSection("projects", {
    title: asText(config.title) || "Projects",
    intro: asText(config.subtitle)
  });

  if (!section) {
    return;
  }

  if (records.length === 0) {
    renderEmpty(section.body, {
      title: "No projects published yet",
      message: "Projects added to data/projects.json appear here."
    });
    return;
  }

  const categoryNameById = new Map(
    categories.map((category) => [asText(category.id), asText(category.name)])
  );
  const related = buildRelatedMaps(appContext?.data);

  // The dataset's curated order is the "default" sort; applySort only runs when
  // the visitor picks newest/oldest/alphabetical.
  const ordered =
    asText(config.defaultSort) === "manual"
      ? records.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      : records.slice();

  const technologyOptions = deriveFilterOptions(ordered, "technologies", {
    limit: 20
  }).map((option) => ({ value: option.value, label: option.label }));

  const categoryOptions = categories
    .filter((category) => asText(category.id) && asText(category.name))
    .filter((category) =>
      ordered.some((project) => asText(project.categoryId) === asText(category.id))
    )
    .map((category) => ({
      value: asText(category.id),
      label: asText(category.name)
    }));

  // A year range is a real interval in this dataset (2022 to 2025), so it is the
  // one place a range filter is offered. Bounds are derived, never hardcoded, and
  // the value is the start year because that is the date the cards show first.
  const startYear = (project) => {
    const match = /^(\d{4})/.exec(asText(project.startDate));
    return match ? Number(match[1]) : null;
  };
  const startYearBounds = deriveRangeBounds(ordered, startYear, { step: 1, round: true });

  const pageSize = Number.isFinite(config.projectsPerPage) ? Number(config.projectsPerPage) : 0;

  const view = createCollectionView({
    mount: section.body,
    records: ordered,
    idPrefix: "projects",
    search: config.showSearch === false
      ? null
      : {
          label: "Search projects",
          placeholder: "Title, description or technology",
          fields: ["title", "shortDescription", "description", "technologies", "role"]
        },
    filters: config.showFilters === false
      ? []
      : [
          {
            id: "category",
            label: "Category",
            key: "categoryId",
            allLabel: "All projects",
            options: categoryOptions
          },
          {
            id: "technology",
            label: "Technology",
            key: "technologies",
            allLabel: "All technologies",
            options: technologyOptions
          },
          ...(startYearBounds
            ? [
                {
                  id: "started",
                  label: "Started between",
                  type: "range",
                  key: "startDate",
                  min: startYearBounds.min,
                  max: startYearBounds.max,
                  step: startYearBounds.step,
                  getValue: startYear
                }
              ]
            : [])
        ],
    sort: {
      label: "Sort by",
      initial: asText(config.defaultSort) === "manual" ? "default" : "newest",
      options: [
        { value: "default", label: "Curated order" },
        { value: "newest", label: "Newest first" },
        { value: "oldest", label: "Oldest first" },
        { value: "alphabetical", label: "A to Z" }
      ],
      getDate: (project) => project.startDate,
      getLabel: (project) => project.title
    },
    pageSize,
    countLabel: (total) => (total === 1 ? "1 project" : `${total} projects`),
    empty: {
      title: "No projects match",
      message: "Clear the search or widen the year range."
    },
    listClassName: "projects-grid card-grid",
    renderList(visible) {
      const cards = [];

      for (const project of visible) {
        const title = asText(project.title);
        const categoryName = categoryNameById.get(asText(project.categoryId)) || "";
        const period = formatDateRange(project.startDate, project.endDate, false);
        const technologies = asArray(project.technologies).map(asText).filter(Boolean);
        const links = project.links && typeof project.links === "object" ? project.links : {};
        const featured = project.featured === true && config.showFeatured !== false;
        const status = readStatus(project.status);

        const actions = [];
        const liveDemoHref = asText(links.liveDemo);
        const sourceHref = asText(links.sourceCode);

        // Button-link creation throws on an empty href by design: a control that
        // goes nowhere is a bug, not a placeholder. Absent links are skipped.
        if (liveDemoHref) {
          const liveDemo = createButtonLink({
            label: "Live demo",
            href: liveDemoHref,
            variant: "ghost",
            size: "small"
          });
          if (liveDemo) {
            actions.push(liveDemo);
          }
        }

        if (sourceHref) {
          const source = createButtonLink({
            label: "Source",
            href: sourceHref,
            variant: "ghost",
            size: "small"
          });
          if (source) {
            actions.push(source);
          }
        }

        const badges = config.showTechnologies === false ? [] : [...technologies];
        if (featured) {
          badges.unshift("Featured");
        }

        // Status belongs on the card, not only in the dialog: "completed" vs
        // "in progress" is the first thing a visitor wants to know, and readStatus
        // was computed here but never rendered.
        const meta = [];
        if (period) {
          meta.push({ label: "Period", value: period });
        }
        if (status) {
          meta.push({ label: "Status", value: status.label });
        }

        const card = createCard({
          id: asText(project.id),
          title,
          subtitle: categoryName,
          description: asText(project.shortDescription),
          badges,
          meta,
          actions,
          variant: featured ? "featured" : "standard",
          image: asText(project.coverImage)
            ? {
                src: asText(project.coverImage),
                alt: asText(project.imageAlt) || `${title} cover image`,
                ratio: "wide",
                width: 640,
                height: 360
              }
            : undefined,
          headingLevel: 3,
          ariaLabel: `View details for ${title}`,
          // showDetails false removes the dialog, so the card stops being
          // interactive instead of opening an empty one.
          onClick: config.showDetails === false ? undefined : () => showProject(project, categoryName, related)
        });

        // The status is a card fact, not a dialog-only detail (spec 05 §8).
        // `showStatus` therefore selects its emphasis: the quiet inline chip is
        // always rendered when the record has a status, and the flag adds the
        // tinted treatment. Colour is never the only channel - the chip spells
        // the status out.
        if (status) {
          const chip = el("p", {
            className: `project-status project-status--${status.key}`
          });
          chip.append(el("span", { className: "visually-hidden", text: "Status: " }));
          chip.append(el("span", { className: "project-status__value", text: status.label }));

          if (config.showStatus !== false) {
            chip.classList.add("project-status--accent");
          }

          card.querySelector(".card__body")?.append(chip);
        }

        // A featured project also gets a class the grid can use for emphasis
        // without relying on the badge colour alone.
        if (featured) {
          card.classList.add("project-card--featured");
        }

        cards.push(card);
      }

      return cards;
    }
  });

  /**
   * Opens the project named in the URL hash.
   *
   * The hash is read after render because the records are needed to resolve it.
   * It is cleared when the dialog closes: a reload would otherwise reopen a
   * dialog the visitor dismissed, and Back would have nothing to go back to.
   */
  const openFromHash = () => {
    const raw = window.location.hash.replace(/^#/, "");

    if (!raw) {
      return;
    }

    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }

    const project = ordered.find((entry) => asText(entry.id) === decoded);

    if (!project) {
      return;
    }

    showProject(project, categoryNameById.get(asText(project.categoryId)) || "", related);

    if (window.history?.replaceState) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  const onHashChange = () => openFromHash();
  window.addEventListener("hashchange", onHashChange);
  window.requestAnimationFrame(openFromHash);

  const previousTeardown = teardownPrevious;
  teardownPrevious = () => {
    window.removeEventListener("hashchange", onHashChange);
    view.destroy();

    if (typeof previousTeardown === "function") {
      previousTeardown();
    }
  };

  renderSampleNotice(section.body, records);
}
