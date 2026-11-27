/**
 * js/features/seo.js - document metadata from data, not from markup.
 *
 * Why run at all: index.html ships a title and a description so a visitor without
 * JavaScript still gets a sensible document. Once the data loads, the values in
 * data/profile.json are the owner-editable truth, and this module makes the
 * document agree with them: title, description, canonical URL, Open Graph,
 * Twitter card and one Person JSON-LD block.
 *
 * Rules:
 *   - existing tags are updated, missing ones are created; nothing is duplicated
 *     on a second initialization;
 *   - the canonical URL is derived from the current origin, so a local preview
 *     does not advertise the production URL as its own canonical;
 *   - no image is claimed when the profile has none. A broken og:image is worse
 *     than an absent one, and .build/FACTS.md records that the portrait is not
 *     approved for reuse.
 *
 * Security: values are inserted with setAttribute/textContent, and JSON-LD is
 * written through textContent. A string from the dataset can therefore not close
 * the script element or inject markup.
 */

import {
  asArray,
  asText,
  isRecord
} from "../core/section-kit.js";

/** Id of the structured-data block this module owns. */
const JSON_LD_ID = "seo-person-jsonld";

/**
 * Sets or creates a meta tag and returns it.
 *
 * @param {string} attribute - "name" or "property".
 * @param {string} key
 * @param {string} content
 */
function setMeta(attribute, key, content) {
  const value = asText(content);

  if (!value) {
    return;
  }

  let tag = document.head.querySelector(`meta[${attribute}="${key}"]`);

  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, key);
    document.head.append(tag);
  }

  tag.setAttribute("content", value);
}

/**
 * Sets the canonical link, creating it when index.html's copy is missing.
 *
 * @param {string} href
 */
function setCanonical(href) {
  const value = asText(href);

  if (!value) {
    return;
  }

  let link = document.head.querySelector('link[rel="canonical"]');

  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.append(link);
  }

  link.href = value;
}

/**
 * @param {Object|Array|undefined} sectionData - data/profile.json.
 * @param {{config?: Object}} [appContext]
 * @returns {void}
 */
export function initializeSeo(sectionData, appContext) {
  if (typeof document === "undefined") {
    return;
  }

  const profile = Array.isArray(sectionData)
    ? sectionData[0]
    : isRecord(sectionData)
      ? sectionData.profile
      : null;

  if (!isRecord(profile)) {
    return;
  }

  const name = asText(profile.name);
  const role = asText(profile.professionalTitle);
  const summary = asText(profile.shortIntroduction);
  const description = summary || asText(appContext?.config?.description);

  if (!name) {
    return;
  }

  // Title: "Name - Role" when a role exists, otherwise just the name. The
  // separator is an en dash, not a pipe: the name already reads like a brand.
  document.title = role ? `${name} \u2013 ${role}` : name;

  setMeta("name", "description", description);
  setMeta("name", "author", name);

  const origin = window.location?.origin ?? "";
  const canonical = /^https?:$/.test(window.location?.protocol ?? "")
    ? `${origin}${window.location.pathname}`
    : "";

  if (canonical) {
    setCanonical(canonical);
    setMeta("property", "og:url", canonical);
  }

  setMeta("property", "og:type", "profile");
  setMeta("property", "og:title", document.title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:site_name", name);
  setMeta("name", "twitter:card", "summary");
  setMeta("name", "twitter:title", document.title);
  setMeta("name", "twitter:description", description);

  // Profile image is intentionally only advertised when the dataset has one.
  const image = asText(profile.profileImage);

  if (image) {
    setMeta("property", "og:image", image);
    setMeta("name", "twitter:image", image);
    setMeta("name", "twitter:card", "summary_large_image");
  }

  // Structured data -------------------------------------------------------
  const socials = asArray(profile.socialLinks)
    .filter((social) => isRecord(social) && social.enabled !== false)
    .map((social) => asText(social.url))
    .filter(Boolean);

  const address = asText(profile.location);

  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    ...(asText(profile.alternateName) ? { alternateName: asText(profile.alternateName) } : {}),
    ...(role ? { jobTitle: role } : {}),
    ...(canonical ? { url: canonical } : {}),
    ...(image ? { image } : {}),
    ...(asText(profile.email) ? { email: `mailto:${asText(profile.email)}` } : {}),
    ...(address ? { address: { "@type": "PostalAddress", addressRegion: address } } : {}),
    ...(socials.length > 0 ? { sameAs: socials } : {})
  };

  let block = document.getElementById(JSON_LD_ID);

  if (!block) {
    block = document.createElement("script");
    block.type = "application/ld+json";
    block.id = JSON_LD_ID;
    document.head.append(block);
  }

  // textContent, never innerHTML: the JSON contains dataset strings and the
  // browser must not parse any of it as markup.
  block.textContent = JSON.stringify(person);

  // The theme-color meta cannot follow a runtime theme, but the description of
  // the page's colour scheme can at least stay correct for the default.
  setMeta("name", "theme-color", "#08090c");
}
