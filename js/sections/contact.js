/**
 * js/sections/contact.js - contact details and the mailto form.
 *
 * Data: data/profile.json (email, location, availability, socialLinks). The
 * section is rendered from the same record as the hero so an address can never
 * appear in one place and be stale in the other.
 *
 * Delivery follows profile.contactForm and nothing else. The default is
 * "direct-link": the form validates locally, then hands a fully composed message
 * to the visitor's mail client, and the help text and status line say "email app",
 * never "sent". An owner who configures an approved external provider gets
 * "external-provider": one POST, and success appears only after the provider
 * confirms it. A provider-mode configuration without a usable HTTPS endpoint
 * resolves to "unavailable", which says so and offers the email address instead
 * of posting to a guess.
 *
 * The email address is never assembled from obfuscated parts at runtime; it is
 * read from the dataset, which is the owner's editable source of truth.
 */

import { createButton } from "../components/button.js";
import {
  CONTACT_MODES,
  normalizeProvider,
  resolveContactMode,
  submitToProvider
} from "../core/contact-provider.js";
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

  // Phone and WhatsApp are optional and absent from the shipped profile. They are
  // rendered only when the owner fills them in: a made-up number would be worse
  // than no number. wa.me needs digits only, so the same value feeds both links.
  const phone = asText(profile.phone);
  const whatsapp = asText(profile.whatsapp) || asText(profile.whatsappNumber);

  if (phone) {
    const card = el("div", { className: "contact-card" });
    card.append(el("h3", { className: "contact-card__label", text: "Phone" }));
    const link = createLink({ href: `tel:${phone}`, label: phone, className: "contact-card__value" });

    if (link) {
      card.append(link);
    } else {
      card.append(el("p", { className: "contact-card__value", text: phone }));
    }

    cards.append(card);
  }

  if (whatsapp) {
    const digits = whatsapp.replace(/[^\d]/g, "");

    if (digits) {
      const card = el("div", { className: "contact-card" });
      card.append(el("h3", { className: "contact-card__label", text: "WhatsApp" }));
      const link = createLink({
        href: `https://wa.me/${digits}`,
        label: whatsapp,
        className: "contact-card__value"
      });

      if (link) {
        card.append(link);
        cards.append(card);
      }
    }
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

  const contactForm = isRecord(profile.contactForm) ? profile.contactForm : null;
  const formMode = resolveContactMode(contactForm);
  const provider = normalizeProvider(contactForm?.provider);
  const formMessages = isRecord(contactForm?.messages) ? contactForm.messages : {};
  const configuredMessage = (key, fallback) => asText(formMessages[key]) || fallback;

  if (formMode === CONTACT_MODES.DISABLED) {
    // The owner turned the form off; the contact cards above are the whole
    // section, and no empty form shell is left behind.
    return;
  }

  const form = el("form", { className: "contact-form" });
  // Native validation is disabled so this module owns the messages and the
  // focus move. `novalidate` and `required` are boolean attributes; the el()
  // helper skips empty-string values, so they are set as properties instead.
  form.noValidate = true;
  form.append(el("h3", { className: "contact-form__title", text: "Write a message" }));
  const helpText =
    formMode === CONTACT_MODES.EXTERNAL_PROVIDER
      ? `This form is delivered by ${provider?.name ?? "the configured form provider"}. Submit it once; the status below reports what the provider answered.`
      : formMode === CONTACT_MODES.UNAVAILABLE
        ? "The contact form has no delivery method configured, so it cannot send. Use the email address above instead."
        : "This form does not send anything by itself. It opens your email app with the message filled in, so you keep a copy in your sent folder.";

  form.append(el("p", { className: "contact-form__help", text: helpText }));

  const fields = [
    { name: "name", label: "Your name", type: "text", autocomplete: "name", required: true },
    { name: "email", label: "Your email", type: "email", autocomplete: "email", required: true },
    { name: "subject", label: "Subject", type: "text", autocomplete: "off", required: false }
  ];

  const inputs = new Map();
  // Per-field error nodes: the summary region below says what went wrong, these
  // say which control is wrong. aria-describedby can only point at an element
  // that exists, so every field owns one from the start and it stays hidden
  // until its message is needed (quality audit A3).
  const fieldErrors = new Map();
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

    const error = el("p", {
      className: "field__error",
      attrs: { id: `${id}-error` }
    });
    error.hidden = true;

    wrapper.append(label, input, error);
    form.append(wrapper);
    inputs.set(field.name, input);
    fieldErrors.set(field.name, error);
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
  const messageError = el("p", { className: "field__error", attrs: { id: `${messageId}-error` } });
  messageError.hidden = true;
  messageWrapper.append(messageError);
  form.append(messageWrapper);
  inputs.set("message", message);
  fieldErrors.set("message", messageError);

  const status = el("p", { className: "contact-form__status", attrs: { role: "status", "aria-live": "polite" } });
  const submitLabel =
    formMode === CONTACT_MODES.EXTERNAL_PROVIDER
      ? configuredMessage("submitLabel", "Send message")
      : formMode === CONTACT_MODES.UNAVAILABLE
        ? "Email me instead"
        : configuredMessage("submitLabel", "Open email draft");
  const submit = el("button", {
    className: "btn btn--primary",
    text: submitLabel,
    attrs: { type: "submit" }
  });

  // Honeypot. A mailto: form has no server to filter spam on, but bots that fill
  // every field in the DOM are common; a hidden "company" field catches them
  // before the page composes a draft. It is aria-hidden and out of the tab order,
  // so a keyboard or screen-reader visitor never meets it.
  const honeypot = el("div", { className: "visually-hidden", attrs: { "aria-hidden": "true" } });
  const honeypotInput = el("input", {
    className: "field__input",
    attrs: {
      id: "contact-company",
      name: "company",
      type: "text",
      tabindex: "-1",
      autocomplete: "off"
    }
  });
  honeypot.append(
    el("label", { className: "field__label", text: "Company", attrs: { for: "contact-company" } }),
    honeypotInput
  );

  // A submission faster than a human can type is treated as automated. The value
  // is a timestamp, not a countdown, so a slow typist is never penalised.
  const renderedAt = Date.now();

  // A marked field stops being marked the moment the visitor edits it: leaving
  // a red border on a field the visitor has already fixed is a lie.
  for (const [fieldName, input] of inputs) {
    input.addEventListener("input", () => {
      const node = fieldErrors.get(fieldName);

      if (input.getAttribute("aria-invalid") === "true") {
        input.removeAttribute("aria-invalid");
        input.removeAttribute("aria-describedby");
        node.hidden = true;
        node.textContent = "";
      }
    });
  }

  form.append(honeypot, errors, status, submit);

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

    // Silent refusal: telling a bot which trap fired would help it adapt, and a
    // human never sees this branch.
    if (asText(honeypotInput.value) !== "" || Date.now() - renderedAt < 1500) {
      errors.hidden = true;
      status.textContent = "The form could not be prepared. Please email me directly.";
      return;
    }

    const name = inputs.get("name").value.trim();
    const sender = inputs.get("email").value.trim();
    const subject = inputs.get("subject").value.trim() || "Portfolio enquiry";
    const body = inputs.get("message").value.trim();

    // Clear the previous round before measuring this one, so a fixed field stops
    // being marked invalid.
    const problems = [];
    const invalid = [];

    const mark = (fieldName, message) => {
      const input = inputs.get(fieldName);
      const node = fieldErrors.get(fieldName);

      if (!input || !node) {
        return;
      }

      if (message) {
        node.textContent = message;
        node.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", node.id);
        problems.push(message);
        invalid.push(input);
        return;
      }

      node.textContent = "";
      node.hidden = true;
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    };

    mark("name", name ? "" : "Your name is required.");
    mark("email", sender && EMAIL_PATTERN.test(sender) ? "" : "A valid email address is required.");
    mark("message", body ? "" : "A message is required.");
    mark("subject", "");

    if (problems.length > 0) {
      errors.replaceChildren();
      problems.forEach((problem) => errors.append(el("p", { text: problem })));
      errors.hidden = false;
      status.textContent = "";
      // Focus the first control that needs attention, not a guessed one.
      invalid[0]?.focus();
      return;
    }

    errors.hidden = true;

    const mailto = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      `${body}\n\nFrom: ${name} <${sender}>`
    )}`;

    if (formMode === CONTACT_MODES.UNAVAILABLE) {
      // No delivery path exists. Saying so, with the address one click away, is
      // the honest answer; a fake success message is not.
      status.replaceChildren();
      status.append(
        el("span", {
          text: `${configuredMessage("unavailable", "The contact form is currently unavailable.")} `
        }),
        el("a", { text: "Email me instead", attrs: { href: `mailto:${email}` } })
      );
      return;
    }

    if (formMode === CONTACT_MODES.EXTERNAL_PROVIDER) {
      // One POST, disabled while in flight so a double click cannot send the
      // message twice. Success is reported only from submitToProvider's verdict.
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      status.textContent = "Sending...";

      const submission = { name, email: sender, subject, message: body };

      void submitToProvider(contactForm, submission).then((result) => {
        submit.disabled = false;
        submit.removeAttribute("aria-busy");

        if (result.ok) {
          status.textContent = configuredMessage(
            "success",
            "Your message was submitted successfully."
          );
          // The message is with the provider now; leaving it on screen invites a
          // second submission of the same text.
          inputs.get("message").value = "";
          inputs.get("subject").value = "";
          return;
        }

        status.replaceChildren();
        status.append(
          el("span", {
            text: `${configuredMessage("error", "Unable to submit your message. Please try again.")} `
          }),
          el("a", { text: "Email me instead", attrs: { href: `mailto:${email}` } })
        );
      });
      return;
    }
    // Handing off to the mail client is the only delivery path this site has,
    // and the message says so rather than claiming a send.
    window.location.href = mailto;
    status.textContent = "Your email app should be open now. Send the message from there.";
  });

  section.body.append(form);
}
