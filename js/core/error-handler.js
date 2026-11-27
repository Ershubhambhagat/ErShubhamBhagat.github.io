/**
 * js/core/error-handler.js - safe, contained failure UI.
 *
 * Two kinds of failure, two different responses:
 *
 *   handleApplicationError(error)  - the application cannot start at all
 *                                    (configuration or dataset loading failed).
 *                                    One panel replaces the section content,
 *                                    because nothing below it can be trusted.
 *
 *   reportSectionError(id, error)  - one section or feature threw. A panel is
 *                                    added inside that mount point and every
 *                                    other section keeps working. This is the
 *                                    common case and the reason the orchestrator
 *                                    wraps each initializer separately.
 *
 * Security: error messages are untrusted text. A message can embed a URL, a
 * JSON fragment or a file name taken from data, so every string is written with
 * textContent and the markup itself is built with createElement. There is no
 * innerHTML in this module, not even for fixed strings, so a future change
 * cannot accidentally interpolate a value into markup.
 *
 * Styling for .error-panel lives in css/main.css (placeholder until the global
 * CSS phase fills it). The panel stays readable without those rules because it
 * is plain text plus default button styling.
 */

/** Marks the panel so a second failure replaces the first instead of stacking. */
const PANEL_MARKER = "data-error-panel";

/**
 * Guards against installing the global listeners twice when the application
 * boot is retried or a second module imports this file.
 */
let listenersInstalled = false;

/**
 * False until js/app.js reports that sections and features have initialized.
 *
 * Before that point an uncaught error means the page never became usable, so
 * the visitor needs the page-level panel. After it, the page works and a stray
 * error in one interaction must not wipe the portfolio: it is logged instead.
 */
let applicationReady = false;

/**
 * Creates the visual part of a failure panel.
 *
 * @param {Object} options
 * @param {string} options.title - Short, application-authored heading.
 * @param {string} options.message - Application-authored explanation.
 * @param {string[]} [options.items] - Developer detail lines (error message,
 *   failing paths). Shown inside a collapsed <details> so they are available
 *   for a bug report without dominating the page.
 * @param {boolean} [options.withReload] - Adds a reload action.
 * @param {boolean} [options.heading] - Renders the title as an <h2> (page level)
 *   instead of a paragraph (inside a section that already has its own <h2>).
 * @returns {HTMLElement}
 */
function createFailurePanel({
  title,
  message,
  items = [],
  withReload = false,
  heading = false
}) {
  const panel = document.createElement("div");
  panel.className = "error-panel";
  panel.setAttribute("role", "alert");
  panel.setAttribute(PANEL_MARKER, "");

  const titleElement = document.createElement(heading ? "h2" : "p");
  titleElement.className = "error-panel__title";
  titleElement.textContent = title;
  panel.append(titleElement);

  const messageElement = document.createElement("p");
  messageElement.className = "error-panel__message";
  messageElement.textContent = message;
  panel.append(messageElement);

  const detailLines = [];
  for (const item of items) {
    if (item) {
      detailLines.push(item);
    }
  }

  if (detailLines.length > 0) {
    // <details> keeps the technical text out of the way but still selectable,
    // which is what a visitor needs to quote in a bug report. textContent keeps
    // a hostile path or message inert.
    const details = document.createElement("details");
    details.className = "error-panel__details";

    const summary = document.createElement("summary");
    summary.className = "error-panel__summary";
    summary.textContent = "Technical details";
    details.append(summary);

    for (const line of detailLines) {
      const lineElement = document.createElement("p");
      lineElement.textContent = line;
      details.append(lineElement);
    }

    panel.append(details);
  }

  if (withReload) {
    const actions = document.createElement("div");
    actions.className = "error-panel__actions";

    // Reload rather than a partial retry: a boot failure means at least one
    // dataset or module could not be fetched, and re-running the whole boot is
    // the only recovery that cannot leave half-initialized state behind.
    const reloadButton = document.createElement("button");
    reloadButton.type = "button";
    reloadButton.className = "btn btn--secondary";
    reloadButton.textContent = "Reload the page";
    reloadButton.addEventListener("click", () => {
      window.location.reload();
    });

    actions.append(reloadButton);
    panel.append(actions);
  }

  return panel;
}

/**
 * Collects the developer-facing lines for an error.
 *
 * Duck-typed instead of importing DataLoadError: this module must stay usable
 * when the failure is a module-resolution error, a TypeError from a section or
 * anything else that never touched the data loader.
 *
 * @param {unknown} error
 * @returns {string[]}
 */
function describeError(error) {
  const lines = [];

  if (error && typeof error === "object") {
    const name = error.name ? String(error.name) : "Error";
    const message = error.message ? String(error.message) : String(error);
    lines.push(`${name}: ${message}`);

    if (typeof error.path === "string" && error.path && !message.includes(error.path)) {
      lines.push(`Path: ${error.path}`);
    }

    if (Array.isArray(error.failures)) {
      for (const failure of error.failures) {
        const path = failure && failure.path ? String(failure.path) : "(unknown path)";
        const detail =
          failure && failure.error && failure.error.message
            ? ` - ${String(failure.error.message)}`
            : "";
        lines.push(`${path}${detail}`);
      }
    }
  } else {
    lines.push(String(error));
  }

  return lines;
}

/**
 * Renders the page-level failure panel and stops the boot.
 *
 * The panel replaces the contents of main#main-content: when datasets or
 * configuration are missing, leaving eleven empty sections behind would look
 * like a design choice rather than a failure. Focus moves to the panel heading
 * so a screen reader announces the problem instead of leaving focus on the
 * skip link.
 *
 * @param {unknown} error
 * @returns {boolean} True when a panel was rendered.
 */
export function handleApplicationError(error) {
  console.error("Application error:", error);

  const main = document.getElementById("main-content");

  if (!main) {
    // Nothing to render into. The console entry above is the only channel left.
    return false;
  }

  const existing = main.querySelector(`[${PANEL_MARKER}]`);
  if (existing) {
    existing.remove();
  }

  const panel = createFailurePanel({
    title: "The portfolio could not be loaded",
    message:
      "Part of the page data or code did not arrive. Reloading usually fixes a temporary network problem; if it keeps happening, the site needs attention.",
    items: describeError(error),
    withReload: true,
    heading: true
  });

  // The heading is focusable so focus can be moved to it programmatically
  // without adding the panel to the tab order.
  const headingElement = panel.querySelector(".error-panel__title");
  if (headingElement) {
    headingElement.setAttribute("tabindex", "-1");
  }

  main.replaceChildren(panel);

  if (headingElement) {
    headingElement.focus();
  }

  return true;
}

/**
 * Reports a failure in one section or feature without touching the rest.
 *
 * The panel is prepended rather than replacing the mount point: a section that
 * rendered most of its content before throwing keeps that content, and the
 * failure is stated above it. A second failure for the same mount point
 * replaces the previous panel instead of stacking.
 *
 * Feature mounts are addressed by their element id, which is the feature id
 * plus "-root" (#global-search-root), so features do not need a section wrapper.
 *
 * @param {string} sectionId - Stable section id (profile, projects, ...) or
 *   feature id (global-search, theme-studio, json-manager, seo).
 * @param {unknown} error
 * @returns {boolean} True when a panel was rendered.
 */
export function reportSectionError(sectionId, error) {
  const id = String(sectionId ?? "").trim();

  console.error(`Section "${id}" failed to initialize:`, error);

  if (!id) {
    return false;
  }

  const container =
    document.getElementById(id) ?? document.getElementById(`${id}-root`);

  if (!container) {
    // No mount point means nothing to show the visitor. The console entry above
    // is the trail a developer follows.
    return false;
  }

  const existing = container.querySelector(`[${PANEL_MARKER}]`);
  if (existing) {
    existing.remove();
  }

  const panel = createFailurePanel({
    title: "This section could not be displayed",
    message:
      "The rest of the page still works. Reloading may resolve it if the problem was temporary.",
    items: describeError(error)
  });

  container.prepend(panel);

  return true;
}

/**
 * Installs the two global error listeners that catch failures no try/catch saw.
 *
 * Both listeners ignore failures that are already handled:
 *   - resource load errors (a missing image, a stylesheet 404) arrive as a plain
 *     Event with a target element, not an ErrorEvent. Replacing the page because
 *     one image 404s would be worse than the missing image.
 *   - after markApplicationReady(), the page is usable and an uncaught error is
 *     logged only. Wiping eleven working sections because one click handler
 *     threw would be a worse outcome than a dead button.
 *
 * Safe to call more than once; the listeners are installed only once.
 */
export function initializeErrorHandler() {
  if (listenersInstalled || typeof window === "undefined") {
    return;
  }

  listenersInstalled = true;

  window.addEventListener("error", (event) => {
    if (!(event instanceof ErrorEvent)) {
      return;
    }

    const error = event.error ?? new Error(event.message || "Unknown script error");

    if (!applicationReady) {
      handleApplicationError(error);
      return;
    }

    console.error("Uncaught error after initialization:", error);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const error =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason ?? "Unhandled promise rejection"));

    if (!applicationReady) {
      handleApplicationError(error);
      return;
    }

    console.error("Unhandled promise rejection after initialization:", error);
  });
}

/**
 * Tells the error handler that the page reached a usable state.
 *
 * Called once by js/app.js after the sections and features have initialized,
 * and also on the fatal-data path so the page-level panel is not replaced by a
 * second copy if a late error arrives.
 */
export function markApplicationReady() {
  applicationReady = true;
}
