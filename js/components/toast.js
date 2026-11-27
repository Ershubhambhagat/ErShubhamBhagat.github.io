/**
 * js/components/toast.js - the shared transient notification service.
 *
 * Owns:
 *  - one toast stack rendered into #toast-root (the live region that
 *    index.html already marks aria-live="polite" aria-atomic="true");
 *  - the four tones from Prompt/components/TOAST_COMPONENT.md § 5
 *    (success, error, warning, info), their default durations, the close
 *    control, the optional one-shot action, duplicate suppression and the
 *    dismissal timers;
 *  - the service object other modules call: appContext.toast.
 *
 * Does not own:
 *  - any business operation. A consumer calls success() only *after* its save,
 *    copy or import actually succeeded (TOAST_COMPONENT.md § 16);
 *  - persistence. Notifications are in-memory by design (§ 27): a reload must
 *    not resurrect an outdated "Saved" message;
 *  - a second live region. #toast-root is the announcement surface, so the
 *    individual .toast elements deliberately carry no role="status"/"alert":
 *    a nested live region would announce every message twice.
 *
 * Mount point and degradation
 * #toast-root is declared in index.html. When it is missing this module still
 * returns a complete service whose methods only log with console.info, so a
 * caller in a partial deploy gets no exception, no alert() and no broken page.
 * js/app.js tolerates exactly that: it prefers initializeToastManager() and
 * falls back to its own renderer only when the returned value has no show().
 *
 * Integration notes for the next developer
 *  - initializeToastManager() is idempotent per container: calling it twice
 *    returns the same service, which is what keeps one stack and one timer map.
 *    The position/maxVisible options are therefore read on the first call only.
 *  - initializeToast() is kept as the platform-shaped initializer name
 *    (.build/CONTRACT.md, "Module contract") and simply forwards to the
 *    manager, so no caller depends on which name it imports.
 */

/** Tones the component accepts. Anything else falls back to "info". */
const TOAST_TYPES = new Set(["success", "error", "warning", "info"]);

/**
 * Default lifetime per tone, in milliseconds (TOAST_COMPONENT.md § 10):
 * success is short, an error needs enough time to be read and acted on.
 */
const DEFAULT_DURATION_MS = {
  success: 4000,
  info: 4500,
  warning: 6000,
  error: 7000
};

/**
 * Bounds applied to any caller-supplied duration. The minimum stops a toast
 * from vanishing before it can be read; the maximum stops a mistyped value from
 * parking a notification on screen for the rest of the session.
 */
const MIN_DURATION_MS = 1500;
const MAX_DURATION_MS = 15000;

/** Default number of simultaneously visible notifications (§ 12). */
const MAX_VISIBLE_DEFAULT = 3;

/**
 * Window used to collapse the same message produced twice by one event (for
 * example a save that reports both a validation and a catch-all failure).
 */
const DUPLICATE_WINDOW_MS = 1000;

/**
 * Delay before re-checking whether a toast has left keyboard focus. A timed-out
 * toast whose inner control still has focus must not be removed under the
 * visitor, so it is re-scheduled instead (§ 10, § 18).
 */
const FOCUS_DEFER_MS = 1600;

/**
 * Text glyphs for the icon slot. They are decorative: each icon is
 * aria-hidden, and the tone is also carried by the border colour and the title,
 * so the meaning never depends on a glyph or a colour alone (§ 22).
 */
const TYPE_GLYPHS = {
  success: "\u2713",
  error: "!",
  warning: "!",
  info: "i"
};

/** Valid placements; the matching CSS modifiers live in css/components/toast.css. */
const POSITIONS = new Set(["top-right", "top-center", "bottom-right", "bottom-center"]);

/** One service per container, so a second init cannot create a second stack. */
const servicesByRoot = new WeakMap();

/** Monotonic suffix for notification ids. */
let toastCounter = 0;

/**
 * Resolves the toast container.
 *
 * Returns null (never throws) when the document or the mount point is absent,
 * which is the documented degraded mode for this component.
 *
 * @param {Element|null|undefined} candidate - Optional explicit container.
 * @returns {Element|null}
 */
function resolveRoot(candidate) {
  if (typeof Element !== "undefined" && candidate instanceof Element) {
    return candidate;
  }

  if (typeof document === "undefined") {
    return null;
  }

  return document.getElementById("toast-root");
}

/**
 * Converts a caller value to trimmed display text.
 *
 * SECURITY: every string that reaches the DOM is written with textContent, so
 * imported data cannot inject markup. This helper only normalises the type.
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
 * Clamps a requested duration to the documented range.
 *
 * @param {string} type - Already validated tone.
 * @param {unknown} requested - Caller value; 0 means "stay until dismissed".
 * @returns {number} Milliseconds, or 0 for a persistent notification.
 */
function resolveDuration(type, requested) {
  if (requested === 0) {
    return 0;
  }

  if (!Number.isFinite(requested)) {
    return DEFAULT_DURATION_MS[type];
  }

  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(requested)));
}

/**
 * Builds a service that renders nothing.
 *
 * Used only when #toast-root is missing. Every method keeps the documented
 * signature and return type so a caller never needs a guard of its own.
 *
 * @returns {Object}
 */
function createSilentService() {
  const announce = (message, tone) => {
    console.info(`Toast (${tone}): ${message}`);
    return null;
  };

  return {
    show(config = {}) {
      return announce(toText(config.message) || "(empty message)", toText(config.type) || "info");
    },
    success: (message) => announce(toText(message), "success"),
    error: (message) => announce(toText(message), "error"),
    warning: (message) => announce(toText(message), "warning"),
    info: (message) => announce(toText(message), "info"),
    dismiss: () => false,
    dismissAll: () => false,
    destroy: () => false
  };
}

/**
 * Creates (or returns) the toast service for #toast-root.
 *
 * @param {Object} [options]
 * @param {Element} [options.root] - Explicit container; defaults to #toast-root.
 * @param {"top-right"|"top-center"|"bottom-right"|"bottom-center"} [options.position="top-right"]
 *   Placement of the whole stack. Applied as a class on the container, so the
 *   CSS in css/components/toast.css owns the actual coordinates.
 * @param {number} [options.maxVisible=3] - Notifications kept on screen; the
 *   oldest is dropped when a newer one would exceed the limit. The stack never
 *   grows tall enough to cover the page.
 * @returns {Object} Service with show/success/error/warning/info/dismiss/
 *   dismissAll/destroy. Always an object: the silent variant when there is no
 *   container.
 */
export function initializeToastManager(options = {}) {
  const root = resolveRoot(options.root);

  if (!root) {
    return createSilentService();
  }

  const existingService = servicesByRoot.get(root);

  if (existingService) {
    // Reuse: a second call must not duplicate the stack or the timers.
    return existingService;
  }

  const maxVisible =
    Number.isInteger(options.maxVisible) && options.maxVisible > 0
      ? options.maxVisible
      : MAX_VISIBLE_DEFAULT;

  const position = POSITIONS.has(options.position) ? options.position : "top-right";

  // The container carries the layout classes; CSS positions #toast-root by
  // default so the app.js fallback renderer (which adds no classes) is also
  // placed correctly.
  root.classList.add("toast-container", `toast-container--${position}`);
  root.setAttribute("data-toast-position", position);

  /**
   * Live notifications, keyed by element.
   *
   * @type {Map<Element, {
   *   id: string,
   *   type: string,
   *   signature: string,
   *   duration: number,
   *   remaining: number,
   *   endsAt: number,
   *   timer: number,
   *   progress: Element|null
   * }>}
   */
  const records = new Map();

  /** Signature and time of the most recent notification, for deduplication. */
  let lastSignature = "";
  let lastShownAt = 0;
  let lastElement = null;

  /**
   * Returns the record for an id, or null when the id is unknown.
   *
   * @param {string} id
   * @returns {Object|null}
   */
  function findRecord(id) {
    for (const [element, record] of records) {
      if (record.id === id) {
        return { element, record };
      }
    }

    return null;
  }

  /**
   * Starts or restarts the dismissal timer for a record.
   *
   * @param {Object} record
   * @param {number} delayMs
   */
  function schedule(record, delayMs) {
    if (record.duration === 0) {
      return;
    }

    if (record.timer) {
      window.clearTimeout(record.timer);
    }

    record.remaining = Math.max(0, delayMs);
    record.endsAt = Date.now() + record.remaining;

    record.timer = window.setTimeout(() => {
      record.timer = 0;

      // Never remove a notification that currently holds keyboard focus; the
      // visitor may be about to activate its action or close control.
      if (record.element.contains(document.activeElement)) {
        schedule(record, FOCUS_DEFER_MS);
        return;
      }

      dismiss(record.id);
    }, record.remaining);
  }

  /**
   * Freezes the remaining time, e.g. while the pointer or focus is inside.
   *
   * @param {Object} record
   */
  function pause(record) {
    if (!record.timer) {
      return;
    }

    window.clearTimeout(record.timer);
    record.timer = 0;
    record.remaining = Math.max(0, record.endsAt - Date.now());

    if (record.progress) {
      record.progress.style.animationPlayState = "paused";
    }
  }

  /**
   * Resumes a paused timer with the time that was left.
   *
   * @param {Object} record
   */
  function resume(record) {
    if (record.timer || record.duration === 0) {
      return;
    }

    if (record.progress) {
      record.progress.style.animationPlayState = "running";
    }

    schedule(record, record.remaining);
  }

  /**
   * Removes one notification and its timer.
   *
   * @param {string} id
   * @returns {boolean} True when a notification was removed.
   */
  function dismiss(id) {
    const match = findRecord(id);

    if (!match) {
      return false;
    }

    const { element, record } = match;

    if (record.timer) {
      window.clearTimeout(record.timer);
      record.timer = 0;
    }

    // Keyboard recovery: if the visitor closed the toast they were focused in,
    // move focus to the next toast's close control instead of dropping it on
    // <body>, where the next Tab would restart at the top of the page.
    const heldFocus = element.contains(document.activeElement);

    element.remove();
    records.delete(element);

    if (lastElement === element) {
      lastElement = null;
    }

    if (heldFocus) {
      const nextToast = root.querySelector(".toast__close, .toast__dismiss");
      if (nextToast instanceof HTMLElement) {
        nextToast.focus();
      }
    }

    return true;
  }

  /** Drops the oldest visible notification when the stack is full. */
  function enforceLimit() {
    while (records.size >= maxVisible) {
      const oldest = root.firstElementChild;

      if (!oldest) {
        return;
      }

      const id = records.get(oldest)?.id;

      if (!id) {
        // A node this service does not own (the app.js fallback renderer may
        // have appended one before the component took over): drop it anyway,
        // otherwise the stack can never shrink below the limit.
        oldest.remove();
        continue;
      }

      dismiss(id);
    }
  }

  /**
   * Builds the notification element.
   *
   * SECURITY: title, message and action label are untrusted text from sections
   * or imported JSON, so they are written with textContent only. Classes are
   * chosen from the fixed tables above, never from caller strings.
   *
   * @param {Object} config - Normalised notification configuration.
   * @param {string} id
   * @returns {HTMLElement}
   */
  function buildToast(config, id) {
    const element = document.createElement("div");
    element.className = `toast toast--${config.type}`;
    element.setAttribute("data-toast-id", id);

    const icon = document.createElement("span");
    icon.className = "toast__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = TYPE_GLYPHS[config.type];
    element.append(icon);

    const content = document.createElement("div");
    content.className = "toast__content";

    if (config.title) {
      const title = document.createElement("p");
      title.className = "toast__title";
      title.textContent = config.title;
      content.append(title);
    }

    const message = document.createElement("p");
    message.className = "toast__message";
    message.textContent = config.message;
    content.append(message);

    if (config.action) {
      const actions = document.createElement("div");
      actions.className = "toast__actions";

      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.className = "toast__action";
      actionButton.textContent = config.action.label;

      // One-shot: double activation (pointer + Enter, or a slow double click)
      // must not run the callback twice. The toast then leaves, because its
      // action has been used.
      let executed = false;
      actionButton.addEventListener("click", () => {
        if (executed) {
          return;
        }

        executed = true;

        try {
          const result = config.action.callback();

          if (result && typeof result.then === "function") {
            result.then(undefined, (error) => {
              console.error("Toast action failed:", error);
            });
          }
        } catch (error) {
          // A broken consumer callback must not take the toast manager down.
          console.error("Toast action failed:", error);
        }

        dismiss(id);
      });

      actions.append(actionButton);
      content.append(actions);
    }

    element.append(content);

    if (config.dismissible) {
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "toast__close";
      closeButton.setAttribute("aria-label", "Dismiss notification");

      const glyph = document.createElement("span");
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = "\u00D7";
      closeButton.append(glyph);
      closeButton.addEventListener("click", () => dismiss(id));

      element.append(closeButton);
    }

    let progress = null;

    if (config.duration > 0) {
      // A thin bar that empties over the notification's lifetime: the only
      // indication that an auto-dismissing message is about to disappear.
      progress = document.createElement("span");
      progress.className = "toast__progress";
      progress.setAttribute("aria-hidden", "true");
      progress.style.setProperty("--toast-duration", `${config.duration}ms`);
      element.append(progress);
    }

    // Pause while the visitor reads or interacts; resume with the time left.
    element.addEventListener("pointerenter", () => {
      const record = records.get(element);
      if (record) {
        pause(record);
      }
    });

    element.addEventListener("pointerleave", () => {
      const record = records.get(element);
      if (record) {
        resume(record);
      }
    });

    element.addEventListener("focusin", () => {
      const record = records.get(element);
      if (record) {
        pause(record);
      }
    });

    element.addEventListener("focusout", (event) => {
      if (element.contains(event.relatedTarget)) {
        return;
      }

      const record = records.get(element);
      if (record) {
        resume(record);
      }
    });

    return { element, progress };
  }

  /**
   * Displays one notification.
   *
   * @param {Object} config
   * @param {"success"|"error"|"warning"|"info"} [config.type="info"]
   * @param {string} [config.title] - Optional; omitted entirely when empty.
   * @param {string} config.message - Required, non-empty.
   * @param {number} [config.duration] - Milliseconds; 0 keeps it until dismissed.
   * @param {boolean} [config.dismissible=true]
   * @param {{label: string, callback: Function}} [config.action] - Must be
   *   supplied by trusted application code; a label without a function is dropped.
   * @returns {{id: string, dismiss: Function, element: Element}|null}
   */
  function show(config = {}) {
    const requestedType = typeof config.type === "string" ? config.type.trim().toLowerCase() : "";
    const type = TOAST_TYPES.has(requestedType) ? requestedType : "info";

    if (requestedType && !TOAST_TYPES.has(requestedType)) {
      console.warn(`toast.show(): unknown type "${requestedType}"; using "info".`);
    }

    const message = toText(config.message);

    if (!message) {
      // A notification with no text would be an empty visual box: reject it.
      console.warn("toast.show(): a non-empty message is required.");
      return null;
    }

    const title = toText(config.title);
    const dismissible = config.dismissible !== false;
    const duration = resolveDuration(type, config.duration);

    const actionLabel = toText(config.action?.label);
    const action =
      actionLabel && typeof config.action?.callback === "function"
        ? { label: actionLabel, callback: config.action.callback }
        : null;

    if (config.action && !action) {
      console.warn("toast.show(): an action needs both a label and a callback; dropping it.");
    }

    const signature = `${type}|${title}|${message}`;
    const now = Date.now();

    if (
      signature === lastSignature &&
      now - lastShownAt < DUPLICATE_WINDOW_MS &&
      lastElement?.isConnected
    ) {
      // Same message from the same burst of events: keep one notification and
      // give it its full reading time again instead of stacking copies.
      const record = records.get(lastElement);

      if (record) {
        schedule(record, record.duration);
        return {
          id: record.id,
          dismiss: () => dismiss(record.id),
          element: record.element
        };
      }
    }

    enforceLimit();

    const id = `toast-${++toastCounter}`;
    const { element, progress } = buildToast(
      { type, title, message, dismissible, duration, action },
      id
    );

    const record = {
      id,
      type,
      signature,
      duration,
      remaining: duration,
      endsAt: 0,
      timer: 0,
      progress
    };

    records.set(element, record);
    root.append(element);
    schedule(record, duration);

    lastSignature = signature;
    lastShownAt = now;
    lastElement = element;

    return { id, dismiss: () => dismiss(id), element };
  }

  /**
   * Convenience wrapper: tone first, message second.
   *
   * @param {"success"|"error"|"warning"|"info"} type
   * @param {string} message
   * @param {Object} [options] - title, duration, dismissible, action.
   * @returns {{id: string, dismiss: Function, element: Element}|null}
   */
  function showTone(type, message, options = {}) {
    return show({ ...options, type, message });
  }

  const service = {
    show,
    success: (message, options = {}) => showTone("success", message, options),
    error: (message, options = {}) => showTone("error", message, options),
    warning: (message, options = {}) => showTone("warning", message, options),
    info: (message, options = {}) => showTone("info", message, options),
    dismiss,
    dismissAll() {
      for (const record of records.values()) {
        if (record.timer) {
          window.clearTimeout(record.timer);
          record.timer = 0;
        }
      }

      records.clear();
      lastElement = null;
      root.replaceChildren();
      return true;
    },
    destroy() {
      service.dismissAll();
      root.classList.remove("toast-container", `toast-container--${position}`);
      root.removeAttribute("data-toast-position");
      servicesByRoot.delete(root);
      return true;
    }
  };

  servicesByRoot.set(root, service);

  return service;
}

/**
 * Platform-shaped initializer (.build/CONTRACT.md, "Module contract").
 *
 * app.js calls initializeToastManager() first and only falls back to its own
 * renderer when that is unavailable, so this export exists for any caller that
 * follows the section-initializer convention. It ignores the arguments: a toast
 * stack needs no dataset and no app context.
 *
 * @returns {Object} The same service initializeToastManager() returns.
 */
export function initializeToast() {
  return initializeToastManager();
}
