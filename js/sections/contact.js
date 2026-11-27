/**
 * js/sections/contact.js - contact details and the mailto form.
 *
 * Data: data/profile.json (email, location, availability, socialLinks). The
 * section is rendered from the same record as the hero so an address can never
 * appear in one place and be stale in the other.
 *
 * No backend exists, so the form does not pretend to send anything. It validates
 * locally, then hands a fully composed message to the visitor's mail client and
 * says so in the help text and in the toast. This is also why there is no
 * "success" message that would imply delivery.
 *
 * The email address is never assembled from obfuscated parts at runtime; it is
 * read from the dataset, which is the owner's editable source of truth.
 */

import { createButton } from "../components/button.js";
import {
  asArray,
  asText,
  copyText,
  createLink,
  el,
  isRecord,
  prepareSection,
  renderEmpty
} from "../core/section-kit.js";

/** A deliberately loose address check: the mail client is the real validator. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Copies the address and reports the result.
 *
 * @param {string} email
 * @param {Object|undefined} toast
 */
async function copyEmail(email, toast) {
  const copied = await copyText(email);

  if (copied) {
    toast?.success?.("Email address copied.");
  } else {
    toast?.warning?.("Could not copy automatically. Select the address instead.");
  }
}

/**
 * @param {Object|Array|undefined} sectionData - data/profile.json.
 * @param {{toast?: Object}} [appContext]
 * @returns {void}
 */
export function initializeContact(sectionData, appContext) {
  const profile = Array.isArray(sectionData)
    ? sectionData[0]
    : isRecord(sectionData)
      ? sectionData.profile
      : null;

  if (!isRecord(profile)) {
    return;
  }

  const section = prepareSection("contact", {
    title: "Let's connect",
    intro: "Have a project or an opportunity? Email is the reliable route."
  });

  if (!section) {
    return;
  }

  const email = asText(profile.email);
  const location = asText(profile.location);
  const availability = isRecord(profile.availability) ? profile.availability : null;
  const socials = asArray(profile.socialLinks).filter(
    (social) => isRecord(social) && social.enabled !== false && asText(social.url)
  );

  if (!email && !location && socials.length === 0) {
    renderEmpty(section.body, {
      title: "No contact details published",
      message: "Add an email or a social link to data/profile.json."
    });
    return;
  }

  // Contact cards ---------------------------------------------------------
  const cards = el("div", { className: "contact-cards" });

  if (email) {
    const card = el("div", { className: "contact-card" });
    card.append(el("h3", { className: "contact-card__label", text: "Email" }));

    const link = createLink({ href: `mailto:${email}`, label: email, className: "contact-card__value" });
    if (link) {
      card.append(link);
    } else {
      card.append(el("p", { className: "contact-card__value", text: email }));
    }

    const copy = createButton({
      label: "Copy address",
      variant: "outline",
      size: "small",
      icon: null,
      onClick: () => {
        void copyEmail(email, appContext?.toast);
      }
    });

    card.append(copy);
    cards.append(card);
  }

  if (location) {
    const card = el("div", { className: "contact-card" });
    card.append(el("h3", { className: "contact-card__label", text: "Location" }));
    card.append(el("p", { className: "contact-card__value", text: location }));
    cards.append(card);
  }

  if (availability?.enabled === true && asText(availability.label)) {
    const card = el("div", { className: "contact-card" });
    card.append(el("h3", { className: "contact-card__label", text: "Availability" }));
    card.append(el("p", { className: "contact-card__value", text: asText(availability.label) }));
    cards.append(card);
  }

  if (cards.childElementCount > 0) {
    section.body.append(cards);
  }

  // Social links ----------------------------------------------------------
  if (socials.length > 0) {
    const block = el("div", { className: "contact-socials" });
    block.append(el("h3", { className: "contact-socials__title", text: "Elsewhere" }));

    const list = el("ul", { className: "social-list", attrs: { "aria-label": "Social links" } });

    for (const social of socials) {
      const platform = asText(social.platform);
      const link = createLink({
        href: asText(social.url),
        label: platform,
        className: "social-link",
        ariaLabel: `${platform} (opens in a new tab)`
      });

      if (!link) {
        continue;
      }

      const mark = el("span", { className: "social-link__mark", attrs: { "aria-hidden": "true" } });
      mark.textContent = platform.slice(0, 2);
      link.prepend(mark);

      const item = document.createElement("li");
      item.append(link);
      list.append(item);
    }

    block.append(list);
    section.body.append(block);
  }

  // Form ------------------------------------------------------------------
  if (!email) {
    return;
  }

  const form = el("form", { className: "contact-form" });
  // Native validation is disabled so this module owns the messages and the
  // focus move. `novalidate` and `required` are boolean attributes; the el()
  // helper skips empty-string values, so they are set as properties instead.
  form.noValidate = true;
  form.append(el("h3", { className: "contact-form__title", text: "Write a message" }));
  form.append(
    el("p", {
      className: "contact-form__help",
      text: "This form does not send anything by itself. It opens your email app with the message filled in, so you keep a copy in your sent folder."
    })
  );

  const fields = [
    { name: "name", label: "Your name", type: "text", autocomplete: "name", required: true },
    { name: "email", label: "Your email", type: "email", autocomplete: "email", required: true },
    { name: "subject", label: "Subject", type: "text", autocomplete: "off", required: false }
  ];

  const inputs = new Map();
  const errors = el("div", { className: "contact-form__errors", attrs: { role: "alert" } });
  errors.hidden = true;

  for (const field of fields) {
    const id = `contact-${field.name}`;
    const wrapper = el("div", { className: `field field--${field.name}` });
    const label = el("label", { className: "field__label", text: field.label, attrs: { for: id } });
    const input = el("input", {
      className: "field__input",
      attrs: {
        id,
        name: field.name,
        type: field.type,
        autocomplete: field.autocomplete
      }
    });

    if (field.required) {
      input.required = true;
    }

    wrapper.append(label, input);
    form.append(wrapper);
    inputs.set(field.name, input);
  }

  const messageId = "contact-message";
  const messageWrapper = el("div", { className: "field field--message" });
  messageWrapper.append(
    el("label", { className: "field__label", text: "Message", attrs: { for: messageId } })
  );
  const message = el("textarea", {
    className: "field__input field__input--textarea",
    attrs: { id: messageId, name: "message", rows: "5" }
  });
  message.required = true;
  messageWrapper.append(message);
  form.append(messageWrapper);
  inputs.set("message", message);

  const status = el("p", { className: "contact-form__status", attrs: { role: "status", "aria-live": "polite" } });
  const submit = el("button", {
    className: "btn btn--primary",
    text: "Open email draft",
    attrs: { type: "submit" }
  });

  form.append(errors, status, submit);

  /**
   * Validates locally, then hands the composed message to the mail client.
   *
   * There is no endpoint to post to, so preventing the default submit is what
   * stops the browser from navigating away, and the status line says "email app",
   * never "sent". Errors are announced in one live region and focus moves to the
   * first field that needs attention.
   */
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const problems = [];
    const name = inputs.get("name").value.trim();
    const sender = inputs.get("email").value.trim();
    const subject = inputs.get("subject").value.trim() || "Portfolio enquiry";
    const body = inputs.get("message").value.trim();

    if (!name) {
      problems.push("Your name is required.");
    }
    if (!sender || !EMAIL_PATTERN.test(sender)) {
      problems.push("A valid email address is required.");
    }
    if (!body) {
      problems.push("A message is required.");
    }

    if (problems.length > 0) {
      errors.replaceChildren();
      problems.forEach((problem) => errors.append(el("p", { text: problem })));
      errors.hidden = false;
      status.textContent = "";
      inputs.get(!name ? "name" : "email").focus();
      return;
    }

    errors.hidden = true;

    const mailto = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      `${body}\n\nFrom: ${name} <${sender}>`
    )}`;

    // Handing off to the mail client is the only delivery path this site has,
    // and the message says so rather than claiming a send.
    window.location.href = mailto;
    status.textContent = "Your email app should be open now. Send the message from there.";
  });

  section.body.append(form);
}
