/**
 * js/core/modal-manager.js - the one dialog controller for the whole page.
 *
 * Every dialog in this application (project details, certificate preview,
 * bookmark preview, JSON review) is rendered into #modal-root by this module.
 * Sections never build their own overlay: one controller means one focus trap,
 * one Escape handler, one scroll lock and one place where the accessibility
 * rules are enforced.
 *
 * Markup follows Prompt/components/MODAL_COMPONENT.md:
 *
 *   <dialog class="modal" aria-labelledby="...">
 *     <div class="modal__container">
 *       <header class="modal__header">
 *         <div><h2 class="modal__title">...</h2></div>
 *         <button class="btn btn--icon" data-modal-close aria-label="Close dialog">
 *       </header>
 *       <div class="modal__body">...</div>
 *       <footer class="modal__footer">...</footer>
 *     </div>
 *   </dialog>
 *
 * Why a native <dialog> element and not a div overlay: showModal() puts the
 * dialog in the browser's top layer, above the sticky header and the toast
 * stack, without depending on the z-index values in css/components/modals.css
 * (still a placeholder). It also paints a real ::backdrop and makes the rest of
 * the document inert for pointer and screen-reader navigation. The explicit
 * focus trap below is still implemented: it keeps Tab cycling identical in
 * browsers whose inertness support differs, and it is the behaviour the
 * component specification requires rather than an incidental browser default.
 *
 * Limitations, stated rather than hidden:
 *   - one dialog at a time. Opening a second closes the first with reason
 *     "replaced"; the app has no nested-dialog flow.
 *   - the scroll lock is applied to document.scrollingElement (<html> in
 *     standards mode), not to <body>. css/main.css sets overflow-x: clip on
 *     <body>, which prevents body overflow from propagating to the viewport, so
 *     locking the body left the page scrollable - measured, not assumed.
 *     Horizontal compensation goes on <body> so the page does not shift when the
 *     scrollbar disappears.
 *
 * Dependency: js/core/event-bus.js is imported to emit the contract event
 * "modal:close". It is a leaf module, so this creates no import cycle.
 */

import { emit } from "./event-bus.js";

/** Everything that can receive focus inside a dialog, in DOM order. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

/** Increment used to give generated dialogs a unique id. */
let dialogCounter = 0;

/** The dialog currently on screen, or null. */
let activeDialog = null;

/** Resolved options for the active dialog (closable flag, onClose callback, ...). */
let activeOptions = null;

/** Element that had focus before the dialog opened, restored on close. */
let lastFocusedElement = null;

/** True when this module created the dialog and should remove it on close. */
let ownsActiveElement = false;

/** Saved scroll state while scrolling is locked, or null when unlocked. */
let scrollLockState = null;

/**
 * Handlers attached to the active dialog, kept so they can be removed on close.
 * A caller-supplied <dialog> stays in the document after closing, so leaving its
 * listeners attached would fire them twice if it were opened again.
 *
 * @type {{cancel: ((event: Event) => void), click: ((event: MouseEvent) => void)}|null}
 */
let activeDialogHandlers = null;

/**
 * Reference to the keydown listener so it can be removed on close.
 * A named function (not an inline arrow) cannot be duplicated by a second open.
 */
function handleDocumentKeydown(event) {
  if (!activeDialog) {
    return;
  }

  if (event.key === "Escape") {
    // Stop the event from reaching page-level shortcuts (Global Search, mobile
    // navigation) that also listen for Escape: while a dialog is open, Escape
    // belongs to the dialog.
    event.preventDefault();
    event.stopPropagation();

    // A blocking dialog (closable:false) must survive Escape. It used to close
    // anyway, which defeated the one guarantee the option makes - a destructive
    // or in-flight operation could be dismissed by a stray key press.
    if (activeOptions && activeOptions.closable === false) {
      return;
    }

    closeModal(activeDialog, "escape");
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusable = getFocusableElements(activeDialog);

  if (focusable.length === 0) {
    // Nothing focusable inside: keep focus on the dialog itself so Tab cannot
    // escape into the inert page behind it.
    event.preventDefault();
    activeDialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const current = document.activeElement;

  if (event.shiftKey) {
    if (current === first || !activeDialog.contains(current)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (current === last || !activeDialog.contains(current)) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Resolves the dialog mount point.
 *
 * @returns {HTMLElement|null}
 */
function getModalRoot() {
  return document.getElementById("modal-root");
}

/**
 * Lists the focusable descendants of `container` that are actually visible.
 *
 * getClientRects() is used instead of offsetParent because a dialog painted in
 * the top layer has no offsetParent even when it is on screen.
 *
 * @param {HTMLElement} container
 * @returns {HTMLElement[]}
 */
function getFocusableElements(container) {
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => {
    if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") {
      return false;
    }

    if (element.closest("[inert]")) {
      return false;
    }

    return element.getClientRects().length > 0;
  });
}

/**
 * Locks page scrolling while a dialog is open.
 *
 * The lock must go on the element that actually scrolls the document
 * (document.scrollingElement, <html> in standards mode). Locking <body> is the
 * common recipe but it fails on this page: css/main.css gives <body>
 * overflow-x: clip, and an element whose overflow is not "visible" no longer
 * propagates its overflow to the viewport, so the document kept scrolling while
 * a dialog was open.
 *
 * The right padding compensation stays on <body>: the scrollbar belongs to the
 * viewport, but the page content is laid out in the body box, and padding there
 * is what stops the sideways jump.
 */
function lockScroll() {
  if (scrollLockState) {
    return;
  }

  const { body, documentElement } = document;
  const target = document.scrollingElement ?? documentElement;
  const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

  scrollLockState = {
    target,
    targetOverflow: target.style.overflow,
    bodyPaddingRight: body.style.paddingRight
  };

  target.style.overflow = "hidden";

  if (scrollbarWidth > 0) {
    const currentPadding = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
  }

  // A hook for CSS: a sticky header can drop its shadow while a dialog is open.
  documentElement.dataset.modalOpen = "true";
}

/** Restores the exact inline styles that were present before the lock. */
function unlockScroll() {
  if (!scrollLockState) {
    return;
  }

  const { target, targetOverflow, bodyPaddingRight } = scrollLockState;

  target.style.overflow = targetOverflow;
  document.body.style.paddingRight = bodyPaddingRight;
  delete document.documentElement.dataset.modalOpen;
  scrollLockState = null;
}

/**
 * Appends caller-supplied content without ever interpreting it as markup.
 *
 * Strings are treated as untrusted text (they often come from JSON), so they
 * become text nodes inside a paragraph. A caller that needs structure passes
 * nodes it built itself.
 *
 * @param {HTMLElement} container
 * @param {Node|Node[]|string|number|null|undefined} content
 */
function appendContent(container, content) {
  if (content === null || typeof content === "undefined") {
    return;
  }

  if (Array.isArray(content)) {
    for (const item of content) {
      appendContent(container, item);
    }
    return;
  }

  if (content instanceof Node) {
    container.append(content);
    return;
  }

  const paragraph = document.createElement("p");
  paragraph.textContent = String(content);
  container.append(paragraph);
}

/**
 * Builds the dialog shell described at the top of this file.
 *
 * @param {Object} options - Normalised openModal() options.
 * @returns {HTMLDialogElement}
 */
function buildDialog(options) {
  const id = options.id || `portfolio-modal-${++dialogCounter}`;
  const dialog = document.createElement("dialog");

  dialog.id = id;
  dialog.className = options.className ? `modal ${options.className}` : "modal";
  dialog.setAttribute("aria-modal", "true");
  // Programmatic focus target when nothing inside can take focus.
  dialog.setAttribute("tabindex", "-1");

  const container = document.createElement("div");
  container.className = "modal__container";

  const header = document.createElement("header");
  header.className = "modal__header";

  const headingWrapper = document.createElement("div");

  if (options.title) {
    const heading = document.createElement("h2");
    heading.className = "modal__title";
    heading.id = `${id}-title`;
    heading.tabIndex = -1;
    heading.textContent = options.title;
    headingWrapper.append(heading);
    dialog.setAttribute("aria-labelledby", heading.id);
  } else if (options.labelledBy) {
    // The caller already rendered a heading elsewhere and points at it.
    dialog.setAttribute("aria-labelledby", options.labelledBy);
  }

  header.append(headingWrapper);

  if (options.closable) {
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "btn btn--icon";
    closeButton.setAttribute("data-modal-close", "");
    closeButton.setAttribute("aria-label", "Close dialog");
    closeButton.textContent = "\u00D7";
    closeButton.addEventListener("click", () => closeModal(dialog, "button"));
    header.append(closeButton);
  }

  container.append(header);

  const body = document.createElement("div");
  body.className = "modal__body";

  if (options.description) {
    const description = document.createElement("p");
    description.className = "modal__description";
    description.id = `${id}-description`;
    description.textContent = options.description;
    body.append(description);
    dialog.setAttribute("aria-describedby", description.id);
  } else if (options.describedBy) {
    dialog.setAttribute("aria-describedby", options.describedBy);
  }

  appendContent(body, options.content);
  container.append(body);

  if (options.footer) {
    const footer = document.createElement("footer");
    footer.className = "modal__footer";
    appendContent(footer, options.footer);
    container.append(footer);
  }

  dialog.append(container);

  return dialog;
}

/**
 * Finds the element that should receive focus when the dialog opens.
 *
 * @param {HTMLDialogElement} dialog
 * @param {HTMLElement|string|undefined} initialFocus - Element, CSS selector, or
 *   the literal "title" that the component specification uses.
 * @returns {HTMLElement}
 */
function resolveInitialFocus(dialog, initialFocus) {
  if (initialFocus instanceof HTMLElement && dialog.contains(initialFocus)) {
    return initialFocus;
  }

  if (initialFocus === "title") {
    const title = dialog.querySelector(".modal__title");
    if (title instanceof HTMLElement) {
      return title;
    }
  }

  if (typeof initialFocus === "string" && initialFocus !== "title") {
    try {
      const match = dialog.querySelector(initialFocus);
      if (match instanceof HTMLElement) {
        return match;
      }
    } catch {
      // An invalid selector is a caller mistake, not a reason to fail opening.
      console.warn(`openModal(): invalid initialFocus selector "${initialFocus}".`);
    }
  }

  return getFocusableElements(dialog)[0] ?? dialog;
}

/**
 * Opens a dialog.
 *
 * Accepts either a configuration object (the common case) or a <dialog> element
 * that a component already built. In both cases the dialog is mounted into
 * #modal-root, given the accessibility attributes and focus management, and the
 * page scroll is locked.
 *
 * @param {Object|HTMLDialogElement} optionsOrElement
 * @param {string} [optionsOrElement.id] - Dialog id. Generated when omitted.
 * @param {string} [optionsOrElement.title] - Untrusted text, written with textContent.
 * @param {string} [optionsOrElement.description] - Optional text, wired to aria-describedby.
 * @param {Node|Node[]|string} [optionsOrElement.content] - Body content.
 * @param {Node|Node[]|string} [optionsOrElement.footer] - Optional footer content.
 * @param {boolean} [optionsOrElement.closable=true] - Adds the close button and
 *   enables Escape and backdrop dismissal. Set false for a blocking dialog.
 * @param {string} [optionsOrElement.labelledBy] - Existing element id to use as
 *   the accessible name instead of `title`.
 * @param {string} [optionsOrElement.describedBy] - Existing element id to use as
 *   the accessible description instead of `description`.
 * @param {string} [optionsOrElement.className] - Extra class for the dialog.
 * @param {HTMLElement|string} [optionsOrElement.initialFocus] - "title", a
 *   selector, or an element.
 * @param {(reason: string) => void} [optionsOrElement.onClose]
 * @returns {HTMLDialogElement|null} The open dialog, or null when the mount
 *   point is missing (already logged).
 */
export function openModal(optionsOrElement = {}) {
  const root = getModalRoot();

  if (!root) {
    // Returning null instead of throwing keeps this safe to call from an event
    // handler, where an exception would surface as an uncaught error.
    console.error("openModal(): #modal-root is missing from the document.");
    return null;
  }

  // Validate the argument before anything is torn down: rejecting a bad call
  // must not close the dialog the visitor is currently reading.
  const isElement = optionsOrElement instanceof Element;

  if (isElement && optionsOrElement.tagName !== "DIALOG") {
    throw new TypeError(
      "openModal() accepts a <dialog> element or an options object, not a generic element."
    );
  }

  // Single-dialog policy: close whatever is open before building the next one,
  // so the scroll lock and the focus trap are never held by two dialogs.
  if (activeDialog) {
    closeModal(activeDialog, "replaced");
  }

  const options = isElement
    ? { id: optionsOrElement.id || "", closable: true, initialFocus: undefined, onClose: null }
    : { title: "", content: null, footer: null, closable: true, ...optionsOrElement };

  let dialog;

  if (isElement) {
    dialog = optionsOrElement;
    dialog.classList.add("modal");

    if (!dialog.hasAttribute("aria-modal")) {
      dialog.setAttribute("aria-modal", "true");
    }

    if (!dialog.hasAttribute("tabindex")) {
      dialog.setAttribute("tabindex", "-1");
    }
  } else {
    dialog = buildDialog(options);
  }

  // A dialog with the same id may be left over from a previous open (a component
  // may reuse ids). Remove the stale copy so ids stay unique in the document.
  if (dialog.id) {
    const stale = root.querySelector(`#${CSS.escape(dialog.id)}`);
    if (stale && stale !== dialog) {
      stale.remove();
    }
  }

  root.append(dialog);

  lastFocusedElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeDialog = dialog;
  activeOptions = options;
  ownsActiveElement = !isElement;

  lockScroll();

  // Capture phase: the dialog's own handlers must see Tab and Escape before any
  // component inside it does, otherwise a nested widget can swallow the trap.
  document.addEventListener("keydown", handleDocumentKeydown, true);

  // Native Escape produces "cancel" instead of a keydown in some engines. Both
  // paths funnel into closeModal(), which is idempotent - and both must honour
  // closable:false, or the native path would reopen the hole the keydown path
  // now closes.
  const handleCancel = (event) => {
    event.preventDefault();

    if (activeOptions && activeOptions.closable === false) {
      return;
    }

    closeModal(dialog, "escape");
  };

  const handleBackdropClick = (event) => {
    if (!activeOptions || activeOptions.closable === false) {
      return;
    }

    // A click inside the panel bubbles with a child as target; target === dialog
    // therefore means the visitor clicked the backdrop area.
    if (event.target === dialog) {
      closeModal(dialog, "backdrop");
    }
  };

  dialog.addEventListener("cancel", handleCancel);
  dialog.addEventListener("click", handleBackdropClick);
  activeDialogHandlers = { cancel: handleCancel, click: handleBackdropClick };

  try {
    dialog.showModal();
  } catch (error) {
    // showModal() throws when the element is not connected or the browser is
    // old. Falling back to the open attribute keeps the content reachable.
    console.warn("showModal() unavailable; falling back to the open attribute.", error);
    dialog.setAttribute("open", "");
  }

  resolveInitialFocus(dialog, options.initialFocus).focus();

  return dialog;
}

/**
 * Closes the open dialog and restores the page state.
 *
 * Steps run in this order on purpose: listeners are removed before the element
 * is removed, the scroll lock is released before focus moves (focusing an
 * element scrolls it into view, which a locked body would prevent), and the
 * caller's onClose runs last so it can safely open another dialog.
 *
 * @param {HTMLDialogElement|string} [target] - Dialog or id to close. Defaults to
 *   the active dialog. A non-matching target is ignored.
 * @param {string} [reason="api"] - "escape", "backdrop", "button", "replaced",
 *   "api" - passed to onClose and to the modal:close event.
 * @returns {boolean} True when a dialog was closed.
 */
export function closeModal(target = undefined, reason = "api") {
  const dialog = activeDialog;

  if (!dialog) {
    return false;
  }

  if (target !== undefined && target !== null) {
    const resolved = typeof target === "string" ? document.getElementById(target) : target;

    if (resolved !== dialog) {
      return false;
    }
  }

  document.removeEventListener("keydown", handleDocumentKeydown, true);

  if (activeDialogHandlers) {
    dialog.removeEventListener("cancel", activeDialogHandlers.cancel);
    dialog.removeEventListener("click", activeDialogHandlers.click);
    activeDialogHandlers = null;
  }

  if (typeof dialog.close === "function" && dialog.open) {
    try {
      dialog.close();
    } catch {
      dialog.removeAttribute("open");
    }
  } else {
    dialog.removeAttribute("open");
  }

  // Return focus before the dialog leaves the DOM: some browsers move focus to
  // <body> when the focused element is removed, and restoring afterwards then
  // fights the browser's own restoration.
  const restoreTarget = lastFocusedElement;

  if (ownsActiveElement) {
    dialog.remove();
  } else {
    dialog.removeAttribute("open");
  }

  activeDialog = null;
  const closedOptions = activeOptions;
  activeOptions = null;
  lastFocusedElement = null;
  ownsActiveElement = false;

  unlockScroll();

  if (restoreTarget && restoreTarget.isConnected) {
    restoreTarget.focus();
  }

  if (closedOptions && typeof closedOptions.onClose === "function") {
    try {
      closedOptions.onClose(reason);
    } catch (error) {
      console.error("modal onClose callback failed:", error);
    }
  }

  emit("modal:close", { id: dialog.id, reason });

  return true;
}

/**
 * @returns {boolean} True while a dialog is open. Global Search and the mobile
 *   navigation check this before acting on Escape.
 */
export function isModalOpen() {
  return activeDialog !== null;
}

/**
 * Verifies the mount point once during boot and warns early when it is missing.
 *
 * Called by js/app.js as part of the initialization sequence; every other entry
 * point stays lazy so a module can open a dialog without depending on boot order.
 *
 * @returns {boolean} True when #modal-root exists.
 */
export function initializeModalManager() {
  const root = getModalRoot();

  if (!root) {
    console.error("initializeModalManager(): #modal-root is missing from the document.");
    return false;
  }

  return true;
}
