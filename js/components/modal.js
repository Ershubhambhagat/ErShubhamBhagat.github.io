/**
 * js/components/modal.js - the shapes this portfolio actually opens in a dialog.
 *
 * Owns:
 *  - three documented dialog shapes from Prompt/components/MODAL_COMPONENT.md:
 *    standard details (§ 5.1), confirmation (§ 5.2 / § 16) and image preview
 *    (§ 5.4 / § 18);
 *  - the size class names (§ 6) and the footer action buttons those shapes need;
 *  - URL checking for preview media (§ 26).
 *
 * Does not own, because js/core/modal-manager.js already does it:
 *  - the <dialog> element, ::backdrop, focus trap, initial focus, focus
 *    restoration, Escape/backdrop handling, the scroll lock and the
 *    aria-labelledby/aria-describedby wiring. This module never builds an
 *    overlay of its own and never listens for Escape: a second handler would
 *    close the dialog twice or fight the trap.
 *  - section business logic. confirmModal() resolves true/false and the
 *    consumer runs its own delete/import operation afterwards, so a failure
 *    there can be reported honestly instead of inside a dialog that is gone.
 *
 * Why the buttons are plain <button class="btn ..."> and not js/components/button.js:
 * a modal must not depend on another component module loading, and a failed
 * button import would otherwise take the dialog down with it. The class contract
 * (btn, btn--primary, btn--secondary, btn--danger, btn--icon) is the one
 * css/components/buttons.css owns, so the visual layer stays in one place.
 */

import { closeModal, initializeModalManager, openModal } from "../core/modal-manager.js";

// Re-exported so a section can import the whole dialog surface from one module.
// These are pass-throughs, not a second implementation of the manager.
export { closeModal, openModal };

/**
 * Size classes from MODAL_COMPONENT.md § 6. The widths themselves live in
 * css/components/modals.css so Theme Studio can retune them per theme.
 */
const SIZE_CLASS = Object.freeze({
  sm: "modal--sm", // 420px - confirmations and compact forms
  md: "modal--md", // 640px - standard details
  lg: "modal--lg", // 900px - project details, previews
  xl: "modal--xl", // 1120px - complex content
  full: "modal--full" // viewport - large workspaces
});

/**
 * Protocols allowed for preview media and links rendered by this module.
 * javascript:, data: and file: are rejected: an imported JSON record must not
 * be able to turn a modal into a script or local-file reader.
 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Converts a caller value to trimmed text.
 *
 * @param {unknown} value
 * @returns {string}
 */
function toText(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

/**
 * Resolves a documented size key to its class name.
 *
 * @param {string|undefined} size
 * @returns {string} The size class, or "" for the stylesheet default.
 */
function sizeClass(size) {
  return SIZE_CLASS[toText(size)] ?? "";
}

/**
 * Validates a URL before it reaches the DOM.
 *
 * Relative paths are accepted because they resolve against document.baseURI
 * (the GitHub Pages origin). Anything that resolves to a non-http(s) protocol,
 * or that cannot be parsed at all, is refused.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSafeMediaUrl(value) {
  const text = toText(value);

  if (!text) {
    return false;
  }

  const base =
    typeof document !== "undefined" && document.baseURI
      ? document.baseURI
      : // Only reachable in a non-browser test harness; keeps the function pure
        // enough to unit-test outside a page.
        "https://portfolio.invalid/";

  try {
    return ALLOWED_PROTOCOLS.has(new URL(text, base).protocol);
  } catch {
    return false;
  }
}

/**
 * Builds one footer/cancel/confirm button.
 *
 * SECURITY: the label is written with textContent, and the variant comes from a
 * fixed set, so a section cannot inject markup or an arbitrary class list.
 *
 * @param {Object} options
 * @param {string} options.label - Visible, explicit action text.
 * @param {"primary"|"secondary"|"ghost"} [options.variant="secondary"]
 * @param {boolean} [options.destructive=false] - Uses the danger button variant.
 * @param {(event: MouseEvent) => void} [options.onClick]
 * @returns {HTMLButtonElement}
 */
export function createModalButton({
  label,
  variant = "secondary",
  destructive = false,
  onClick
} = {}) {
  const button = document.createElement("button");
  button.type = "button";

  const safeVariant = ["primary", "secondary", "ghost"].includes(variant) ? variant : "secondary";
  // "destructive" is the variant BUTTON_COMPONENT.md defines and
  // css/components/buttons.css implements. This used to emit "danger", a class
  // with no rule anywhere, so every destructive confirm rendered as a neutral
  // button (component audit).
  button.className = `btn btn--${destructive ? "destructive" : safeVariant}`;

  const text = toText(label);
  if (!text) {
    console.warn("createModalButton(): a visible label is required; using \"OK\".");
  }
  button.textContent = text || "OK";

  if (typeof onClick === "function") {
    button.addEventListener("click", onClick);
  }

  return button;
}

/**
 * Opens a standard content dialog.
 *
 * The caller owns the content nodes; this function only chooses the shell and
 * forwards the whitelisted options, so no caller value can set an unintended
 * manager option.
 *
 * @param {Object} options
 * @param {string} options.title - Required accessible name; without it the
 *   manager has nothing to announce and the call is refused.
 * @param {string} [options.description] - Short consequence/context sentence,
 *   wired to aria-describedby by the manager.
 * @param {Node|Node[]|string} options.content - Body content. A string is
 *   treated as plain text by the manager (never as markup).
 * @param {Node|Node[]} [options.footer] - Action area; use createModalButton().
 * @param {"sm"|"md"|"lg"|"xl"|"full"} [options.size="md"]
 * @param {string} [options.className] - Extra trusted class names.
 * @param {HTMLElement|string} [options.initialFocus]
 * @param {boolean} [options.closable=true]
 * @param {(reason: string) => void} [options.onClose]
 * @returns {HTMLDialogElement|null}
 */
export function openDetailsModal(options = {}) {
  const title = toText(options.title);

  if (!title) {
    console.warn("openDetailsModal(): a title is required for an accessible dialog.");
    return null;
  }

  const extraClass = toText(options.className);
  const className = [sizeClass(options.size) || SIZE_CLASS.md, extraClass]
    .filter(Boolean)
    .join(" ");

  return openModal({
    title,
    description: toText(options.description) || undefined,
    content: options.content ?? null,
    footer: options.footer ?? null,
    closable: options.closable !== false,
    initialFocus: options.initialFocus,
    onClose: typeof options.onClose === "function" ? options.onClose : undefined,
    className
  });
}

/**
 * Asks the visitor to confirm an action and reports the answer.
 *
 * The returned promise resolves true only for an explicit activation of the
 * confirm button. Every other exit - Escape, the close button, the backdrop -
 * resolves false, and the manager's backdrop dismissal is safe here precisely
 * because nothing destructive runs inside the dialog: the consumer performs its
 * operation after the promise resolves, then reports success or failure with a
 * toast (MODAL_COMPONENT.md § 16, TOAST_COMPONENT.md § 16).
 *
 * @param {Object} options
 * @param {string} [options.title="Confirm action"]
 * @param {string} options.message - What will happen, including the item name.
 * @param {string} [options.confirmLabel="Confirm"] - Explicit verb, not "OK".
 * @param {string} [options.cancelLabel="Cancel"]
 * @param {boolean} [options.destructive=false]
 * @returns {Promise<boolean>}
 */
export function confirmModal(options = {}) {
  const title = toText(options.title) || "Confirm action";
  const message = toText(options.message);
  const confirmLabel = toText(options.confirmLabel) || "Confirm";
  const cancelLabel = toText(options.cancelLabel) || "Cancel";
  const destructive = options.destructive === true;

  return new Promise((resolve) => {
    let settled = false;

    const settle = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    };

    let dialog = null;

    // Cancel is created first so it becomes the safe initial focus target: a
    // destructive dialog must not put the visitor one Enter away from deleting.
    const cancelButton = createModalButton({
      label: cancelLabel,
      variant: "secondary",
      onClick: () => {
        settle(false);
        closeModal(dialog, "button");
      }
    });

    const confirmButton = createModalButton({
      label: confirmLabel,
      variant: destructive ? "danger" : "primary",
      destructive,
      onClick: () => {
        settle(true);
        closeModal(dialog, "button");
      }
    });

    const footer = document.createElement("div");
    footer.className = "modal__actions";
    footer.append(cancelButton, confirmButton);

    dialog = openModal({
      title,
      // The consequence sentence is the accessible description, so a screen
      // reader announces what will happen together with the title.
      description: message || undefined,
      footer,
      className: `${SIZE_CLASS.sm} modal--confirm`,
      initialFocus: cancelButton,
      closable: true,
      onClose: () => settle(false)
    });

    if (!dialog) {
      // #modal-root is missing: report "not confirmed" rather than hanging the
      // consumer on a promise that never settles.
      settle(false);
    }
  });
}

/**
 * Opens an image preview dialog.
 *
 * @param {Object} options
 * @param {string} options.src - http(s) or a path relative to the site root.
 * @param {string} [options.title] - Dialog title; also the alt fallback.
 * @param {string} [options.alt] - Meaningful alternative text for the image.
 * @param {string} [options.caption] - Optional visible caption.
 * @returns {HTMLDialogElement|null} Null when the URL is not acceptable.
 */
export function openPreviewModal(options = {}) {
  const src = toText(options.src);

  if (!isSafeMediaUrl(src)) {
    console.warn("openPreviewModal(): refusing an unsafe or empty image URL.");
    return null;
  }

  const title = toText(options.title);
  const alt = toText(options.alt) || title || "Preview image";
  const caption = toText(options.caption);

  const figure = document.createElement("figure");
  figure.className = "modal__figure";

  const image = document.createElement("img");
  image.className = "modal__media";
  image.src = src;
  image.alt = alt;
  image.decoding = "async";
  // The visitor explicitly asked for this preview, so loading it now is the
  // requested work - not an eager request made on initialization.
  image.loading = "eager";

  // A broken asset must not leave an empty frame: replace it with honest text.
  image.addEventListener(
    "error",
    () => {
      image.remove();

      const fallback = document.createElement("p");
      fallback.className = "modal__media-error";
      fallback.textContent = "This preview could not be loaded.";
      figure.prepend(fallback);
    },
    { once: true }
  );

  figure.append(image);

  if (caption) {
    const figcaption = document.createElement("figcaption");
    figcaption.className = "modal__caption";
    figcaption.textContent = caption;
    figure.append(figcaption);
  }

  return openModal({
    title: title || "Image preview",
    content: figure,
    className: `${sizeClass(options.size) || SIZE_CLASS.lg} modal--preview`
  });
}

/**
 * Platform-shaped initializer (.build/CONTRACT.md, "Module contract").
 *
 * Every other entry point in this module stays lazy, so a section can open a
 * dialog without depending on boot order; this function only verifies the mount
 * point once and warns early if index.html lost #modal-root.
 *
 * @returns {boolean} True when the modal mount point exists.
 */
export function initializeModal() {
  if (typeof document === "undefined") {
    return false;
  }

  return initializeModalManager();
}
