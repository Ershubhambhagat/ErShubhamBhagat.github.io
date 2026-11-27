/**
 * js/sections/profile.js - the identity block.
 *
 * Reads data/profile.json (one record under `profile`) and renders the hero:
 * name, role, introduction, actions, social links, and a facts panel. This is
 * the only section that uses an <h1>: the page needs exactly one, and the
 * visitor's name is it; every other section starts at <h2>, so the document
 * outline stays linear. .build/CONTRACT.md requires each section to own its
 * heading - this module owns this one.
 *
 * Data honesty: the portrait is deliberately absent. .build/FACTS.md records
 * that the old photo is a personal image that may not be carried over without
 * an explicit decision, so an initials monogram is drawn instead of a blank
 * <img>. Optional fields (availability, resume, highlights) disappear entirely
 * when absent rather than leaving an empty slot.
 *
 * Security: every value from the JSON is written with textContent, and every
 * URL goes through createLink/toSafeHref. The email address becomes a mailto:
 * link only after the same allow-list check.
 */

import { createButtonLink } from "../components/button.js";
import {
  asArray,
  asText,
  createIcon,
  createLink,
  el,
  isRecord,
  prepareSection
} from "../core/section-kit.js";

/**
 * Initials for the monogram fallback, e.g. "Er Shubham Bhagat" -> "SB".
 *
 * Used instead of a placeholder portrait: the old photo is not approved for
 * reuse, and an empty frame looks broken while initials look intentional.
 *
 * @param {string} name
 * @returns {string} One or two uppercase letters, never empty.
 */

function getInitials(name) {
  const words = asText(name).split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  // "Er" is an honorific, not a name: skip it when a fuller name follows.
  const meaningful = words.length > 1 && /^(er|mr|mrs|ms|dr)\.?$/i.test(words[0])
    ? words.slice(1)
    : words;

  return meaningful
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

/**
 * One social link with a letter-mark instead of a brand SVG.
 *
 * Why not brand icons: they would need one path per platform (seven here), and a
 * wrong or outdated logo is worse than a neutral mark. The platform name is
 * always visible as text, so the mark is decorative.
 */
function createSocialLink(social) {
  const platform = asText(social.platform);
  const url = asText(social.url);

  if (!platform || !url) {
    return null;
  }

  const link = createLink({
    href: url,
    label: platform,
    className: "social-link",
    ariaLabel: `${platform} (opens in a new tab)`
  });

  if (!link) {
    return null;
  }

  const mark = document.createElement("span");
  mark.className = "social-link__mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = platform.slice(0, 2);
  link.prepend(mark);

  return link;
}

/**
 * @param {Object|Array|undefined} sectionData - data/profile.json payload.
 * @param {Object} [appContext] - Shared context; unused here, kept for the
 *   uniform (sectionData, appContext) signature in .build/CONTRACT.md.
 * @returns {void}
 */
export function initializeProfile(sectionData, appContext) {
  const profile = Array.isArray(sectionData)
    ? sectionData[0]
    : isRecord(sectionData)
      ? sectionData.profile
      : null;

  if (!isRecord(profile)) {
    return;
  }

  const name = asText(profile.name);

  if (!name) {
    return;
  }

  const section = prepareSection("profile");
  if (!section) {
    return;
  }

  const { body } = section;
  const hero = el("div", { className: "profile-hero" });
  const intro = el("div", { className: "profile-hero__intro" });

  const tagline = asText(profile.tagline);
  if (tagline) {
    intro.append(el("p", { className: "profile-hero__eyebrow", text: tagline }));
  }

  const heading = el("h1", {
    className: "profile-hero__name",
    text: name,
    attrs: { id: "profile-title" }
  });
  intro.append(heading);
  section.section.setAttribute("aria-labelledby", heading.id);

  // The alternate name is recorded in the data because two forms are attested;
  // showing it small keeps the page honest without splitting the brand.
  const alternate = asText(profile.alternateName);
  if (alternate && alternate !== name) {
    intro.append(el("p", { className: "profile-hero__alias", text: `Also known as ${alternate}` }));
  }

  const role = asText(profile.professionalTitle);
  if (role) {
    intro.append(el("p", { className: "profile-hero__role", text: role }));
  }

  const summary = asText(profile.shortIntroduction);
  if (summary) {
    intro.append(el("p", { className: "profile-hero__summary", text: summary }));
  }

  // Availability: only rendered when explicitly enabled and labelled.
  const availability = isRecord(profile.availability) ? profile.availability : null;
  if (availability?.enabled === true && asText(availability.label)) {
    const status = el("p", { className: "status-pill" });
    const dot = el("span", { className: "status-pill__dot", attrs: { "aria-hidden": "true" } });
    status.append(dot, el("span", { text: asText(availability.label) }));
    intro.append(status);
  }

  const actions = asArray(profile.primaryActions).filter(
    (action) => isRecord(action) && action.enabled !== false && asText(action.label)
  );

  if (actions.length > 0) {
    const actionRow = el("div", { className: "profile-hero__actions" });

    actions.forEach((action, index) => {
      const target = asText(action.target);

      // Only in-page section targets are honoured. A URL action would need its
      // own allow-list, and no dataset currently uses one.
      if (!target) {
        return;
      }

      actionRow.append(
        createButtonLink({
          label: asText(action.label),
          href: `#${target}`,
          variant: index === 0 ? "primary" : "outline",
          size: "large"
        })
      );
    });

    if (actionRow.childElementCount > 0) {
      intro.append(actionRow);
    }
  }

  const socials = asArray(profile.socialLinks)
    .filter((social) => isRecord(social) && social.enabled !== false)
    .map(createSocialLink)
    .filter(Boolean);

  if (socials.length > 0) {
    const list = el("ul", { className: "social-list", attrs: { "aria-label": "Social links" } });
    socials.forEach((link) => {
      const item = document.createElement("li");
      item.append(link);
      list.append(item);
    });
    intro.append(list);
  }

  hero.append(intro);

  // Facts panel. Built as a definition list so each label/value pair is
  // announced as a pair rather than as loose text.
  const facts = [];
  const location = asText(profile.location);
  if (location) {
    facts.push({ label: "Based in", value: location });
  }

  const email = asText(profile.email);
  if (email) {
    facts.push({ label: "Email", value: email, href: `mailto:${email}` });
  }

  for (const highlight of asArray(profile.highlights)) {
    if (isRecord(highlight) && asText(highlight.label) && asText(highlight.value)) {
      facts.push({ label: asText(highlight.label), value: asText(highlight.value) });
    }
  }

  const aside = el("aside", {
    className: "profile-card",
    attrs: { "aria-label": "At a glance" }
  });

  const portrait = el("div", {
    className: "profile-card__portrait",
    attrs: { "aria-hidden": "true" }
  });
  portrait.append(el("span", { className: "profile-card__initials", text: getInitials(name) }));
  aside.append(portrait);

  if (facts.length > 0) {
    const list = el("dl", { className: "profile-facts" });

    facts.forEach((fact) => {
      const row = el("div", { className: "profile-facts__row" });
      row.append(
        el("dt", { className: "profile-facts__label", text: fact.label }),
        el("dd", { className: "profile-facts__value" })
      );

      const valueCell = row.lastElementChild;

      if (fact.href) {
        const link = createLink({
          href: fact.href,
          label: fact.value,
          className: "profile-facts__link"
        });
        if (link) {
          valueCell.append(link);
        } else {
          valueCell.textContent = fact.value;
        }
      } else {
        valueCell.textContent = fact.value;
      }

      list.append(row);
    });

    aside.append(list);
  }

  hero.append(aside);
  body.append(hero);

  // Biography is optional and never invented: if the dataset has none, the
  // block is absent rather than an empty paragraph.
  const biography = asText(profile.biography);
  if (biography) {
    const about = el("div", { className: "profile-about prose" });
    about.append(el("h2", { className: "profile-about__title", text: "About" }));
    about.append(el("p", { text: biography }));
    body.append(about);
  }

  // The resume action is owned by the same data record; it only appears when a
  // file is actually configured, so no button ever points at nothing.
  const resume = isRecord(profile.resume) ? profile.resume : null;
  if (resume?.enabled === true && asText(resume.file)) {
    const link = createButtonLink({
      label: asText(resume.label) || "Download resume",
      href: asText(resume.file),
      variant: "ghost",
      icon: createIcon("download"),
      // The configured file is a real PDF in this repository, so the click is a
      // download rather than a navigation away from the portfolio.
      download: true
    });

    if (link) {
      body.append(link);
    }
  }
}
