/**
 * js/app.js - application bootstrap and nothing else.
 *
 * This file owns the initialization ORDER. It contains no section logic, no
 * markup and no data handling of its own: it loads configuration and data,
 * builds the shared context, initializes navigation, then hands each section and
 * each cross-section feature its own slice of the data. Everything a visitor
 * sees is produced by js/sections/*.js and js/features/*.js.
 *
 * Sequence (matches .build/CONTRACT.md and 01_FOUNDATION.md section 8):
 *   config -> data -> storage -> event bus -> modal manager -> error handler
 *   -> navigation -> sections (contract order) -> features -> ready
 *
 * Failure policy, stated precisely:
 *   - a dataset that fails to load only disables the section that needs it;
 *   - a module that fails to load or throws only replaces its own section with
 *     an error panel (js/core/error-handler.js);
 *   - if EVERY dataset fails, the page-level panel is shown instead of eleven
 *     identical ones, because nothing below could render anything real.
 *
 * The script is loaded as a module at the end of <body>, so it is deferred by
 * default and the DOM is already parsed. There is no DOMContentLoaded listener
 * and no inline script in index.html.
 */

import { APP_CONFIG } from "./config.js";
import { loadPortfolioData } from "./core/data-loader.js";
import { emit, off, on } from "./core/event-bus.js";
import {
  getLocalData,
  isStorageAvailable,
  removeLocalData,
  saveLocalData,
  STORAGE_KEYS
} from "./core/storage-manager.js";
import { initializeModalManager } from "./core/modal-manager.js";
import {
  handleApplicationError,
  initializeErrorHandler,
  markApplicationReady,
  reportSectionError
} from "./core/error-handler.js";
import { initializeNavigation } from "./core/navigation.js";

/**
 * Section modules in contract order.
 *
 * `module` is the file path relative to this file; `initializer` is the single
 * export each module provides; `dataset` is the key in APP_CONFIG.dataPaths the
 * section renders, or null when the section needs no dataset (or needs the whole
 * map, in which case the orchestrator passes the entire data object).
 *
 * `featureFlag` names an APP_CONFIG.features switch. Two sections are optional
 * add-ons that an owner may hide without deleting data, so they can be switched
 * off like a feature.
 */
const SECTION_MODULES = Object.freeze([
  { id: "profile", module: "./sections/profile.js", initializer: "initializeProfile", dataset: "profile" },
  { id: "skills", module: "./sections/skills.js", initializer: "initializeSkills", dataset: "skills" },
  { id: "experience", module: "./sections/experience.js", initializer: "initializeExperience", dataset: "experience" },
  { id: "projects", module: "./sections/projects.js", initializer: "initializeProjects", dataset: "projects" },
  { id: "certificates", module: "./sections/certificates.js", initializer: "initializeCertificates", dataset: "certificates" },
  { id: "education", module: "./sections/education.js", initializer: "initializeEducation", dataset: "education" },
  { id: "learning-journey", module: "./sections/learning-journey.js", initializer: "initializeLearningJourney", dataset: "learningJourney" },
  { id: "career-timeline", module: "./sections/career-timeline.js", initializer: "initializeCareerTimeline", dataset: "careerTimeline" },
  {
    id: "github-importer",
    module: "./sections/github-importer.js",
    initializer: "initializeGithubImporter",
    dataset: null,
    featureFlag: "githubImporter"
  },
  {
    id: "bookmarks",
    module: "./sections/bookmarks.js",
    initializer: "initializeBookmarks",
    dataset: "bookmarks",
    featureFlag: "bookmarks"
  },
  { id: "contact", module: "./sections/contact.js", initializer: "initializeContact", dataset: "profile" }
]);

/**
 * Cross-section feature modules, initialized after every section.
 *
 * Features come last so they can index content that already exists in the DOM
 * and so a feature failure cannot prevent a section from rendering.
 *
 * seo receives data/profile.json (the source of title, description and social
 * links); Global Search and the JSON Manager receive the whole data map.
 */
const FEATURE_MODULES = Object.freeze([
  {
    id: "global-search",
    module: "./features/global-search.js",
    initializer: "initializeGlobalSearch",
    dataset: null,
    featureFlag: "globalSearch"
  },
  {
    id: "theme-studio",
    module: "./features/theme-studio.js",
    initializer: "initializeThemeStudio",
    dataset: "themePresets",
    featureFlag: "themeStudio"
  },
  {
    id: "json-manager",
    module: "./features/json-manager.js",
    initializer: "initializeJsonManager",
    dataset: null,
    featureFlag: "jsonManager"
  },
  {
    id: "seo",
    module: "./features/seo.js",
    initializer: "initializeSeo",
    dataset: "profile",
    featureFlag: "seo"
  }
]);

/**
 * Number of consecutive auto-dismiss toasts the fallback keeps on screen.
 * Matches the component specification's default maxVisible.
 */
const MAX_VISIBLE_TOASTS = 3;

/**
 * How long a fallback toast stays before removing itself (ms).
 * Long enough to read a sentence, short enough not to clutter a page.
 */
const TOAST_DURATION_MS = 4000;

/**
 * Loads one module and calls its initializer.
 *
 * Why `await import()` instead of a static import at the top of this file:
 * a static import graph fails as a unit - if js/sections/projects.js is missing
 * or throws while evaluating, the browser never evaluates app.js at all, and no
 * try/catch here could save the other ten sections. Dynamic import is the only
 * form that actually delivers "one section can fail without killing the page",
 * which is what this orchestrator is required to do. It also lets the error name
 * the exact missing export instead of a bare module-resolution failure.
 *
 * @param {{module: string, initializer: string}} entry
 * @param {unknown} sectionData - Dataset slice for the module.
 * @param {Object} appContext
 * @returns {Promise<void>}
 */
async function runInitializer(entry, sectionData, appContext) {
  const module = await import(entry.module);
  const initializer = module[entry.initializer];

  if (typeof initializer !== "function") {
    throw new TypeError(
      `${entry.module} does not export ${entry.initializer}() as required by the module contract.`
    );
  }

  // Awaiting covers initializers that do async work internally: a rejection is
  // then reported against this section instead of escaping as an unhandled one.
  await initializer(sectionData, appContext);
}

/**
 * Creates the toast service used by every section through appContext.toast.
 *
 * The shared component (js/components/toast.js) owns this UI, but it is a
 * placeholder in this build: its factory exists and returns nothing. That is not
 * an error - the resolver falls back to a minimal renderer over #toast-root, in
 * the same shape the component specification documents. When the component
 * starts returning a service (initializeToastManager() or initializeToast()),
 * it is used automatically and the fallback stops being reached.
 *
 * @returns {Promise<Object>} Service with show/success/error/warning/info/dismiss/
 *   dismissAll/destroy, matching Prompt/components/TOAST_COMPONENT.md.
 */
async function createToastService() {
  try {
    const module = await import("./components/toast.js");

    // The specification names the factory initializeToastManager(); the
    // placeholder module currently in the tree exports initializeToast(). Both
    // are accepted, and neither is trusted blindly: the returned value must
    // look like a toast service, otherwise this falls through to the fallback.
    // A placeholder that returns undefined therefore costs nothing.
    const factory = module.initializeToastManager ?? module.initializeToast;

    if (typeof factory === "function") {
      const service = factory({
        root: document.getElementById("toast-root")
      });

      if (service && typeof service.show === "function") {
        return service;
      }
    }
  } catch {
    // Only a genuinely missing module reaches this point (partial deploy). The
    // application still boots: a toast is never a reason to fail.
    console.info("Toast component not available; using the built-in fallback.");
  }

  return createFallbackToastService();
}

/**
 * Minimal, accessible toast renderer used only while the shared component is
 * absent. It writes text with textContent (messages can carry imported data) and
 * removes itself on a timer or by the visitor's dismiss button.
 *
 * @returns {Object} Same shape as the component service.
 */
function createFallbackToastService() {
  const root = document.getElementById("toast-root");
  const timers = new Map();

  /**
   * @param {string} message
   * @param {"info"|"success"|"warning"|"error"} tone
   * @param {{duration?: number}} [options]
   * @returns {{dismiss: () => void}|null}
   */
  function showTone(message, tone, options = {}) {
    if (!root) {
      // Without the live region there is no non-intrusive way to announce this.
      console.info(`Toast (${tone}): ${message}`);
      return null;
    }

    const element = document.createElement("div");
    element.className = `toast toast--${tone}`;
    element.setAttribute("role", tone === "error" ? "alert" : "status");

    const text = document.createElement("p");
    text.className = "toast__message";
    text.textContent = String(message);
    element.append(text);

    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.className = "toast__dismiss";
    dismissButton.setAttribute("aria-label", "Dismiss notification");
    dismissButton.textContent = "\u00D7";
    element.append(dismissButton);

    const dismiss = () => {
      const timer = timers.get(element);
      if (timer) {
        clearTimeout(timer);
        timers.delete(element);
      }
      element.remove();
    };

    dismissButton.addEventListener("click", dismiss);
    root.append(element);

    while (root.children.length > MAX_VISIBLE_TOASTS) {
      const oldest = root.firstElementChild;
      if (!oldest) {
        break;
      }
      const oldestTimer = timers.get(oldest);
      if (oldestTimer) {
        clearTimeout(oldestTimer);
        timers.delete(oldest);
      }
      oldest.remove();
    }

    const duration = Number.isFinite(options.duration) ? options.duration : TOAST_DURATION_MS;

    if (duration > 0) {
      timers.set(element, setTimeout(dismiss, duration));
    }

    return { dismiss };
  }

  /** Removes every toast and cancels its timer. */
  function dismissAll() {
    if (root) {
      root.replaceChildren();
    }

    for (const timer of timers.values()) {
      clearTimeout(timer);
    }

    timers.clear();
  }

  return {
    show(options = {}) {
      const tone = ["info", "success", "warning", "error"].includes(options.tone)
        ? options.tone
        : "info";
      return showTone(options.message ?? "", tone, options);
    },
    success(message, options = {}) {
      return showTone(message, "success", options);
    },
    error(message, options = {}) {
      return showTone(message, "error", options);
    },
    warning(message, options = {}) {
      return showTone(message, "warning", options);
    },
    info(message, options = {}) {
      return showTone(message, "info", options);
    },
    dismiss(notification) {
      if (notification instanceof Element) {
        notification.remove();
      }
    },
    dismissAll,
    destroy() {
      dismissAll();
    }
  };
}

/**
 * Builds the immutable object every section and feature receives.
 *
 * One context instance is shared by every module, which is what makes the event
 * bus, the storage facade and the toast service singletons. It is frozen so a
 * section cannot swap the data loader out from under another one.
 *
 * @param {Object<string, Object|Array>} data
 * @param {Object} toast
 * @returns {{data: Object, config: Object, bus: Object, storage: Object, toast: Object}}
 */
function createAppContext(data, toast) {
  return Object.freeze({
    // Read-only by contract: mutating a dataset would change what every other
    // section renders from the same object.
    data,
    config: APP_CONFIG,
    bus: Object.freeze({ on, off, emit }),
    storage: Object.freeze({
      saveLocalData,
      getLocalData,
      removeLocalData,
      isStorageAvailable,
      STORAGE_KEYS
    }),
    toast
  });
}

/**
 * Runs one group of modules (sections or features) in array order.
 *
 * Sequential, not Promise.all: sections are ordered content and several of them
 * measure layout or scroll to an anchor, which is only stable once the previous
 * section is in the DOM.
 *
 * @param {Array<Object>} entries
 * @param {Object} data - Dataset map.
 * @param {Array<{key: string, path: string}>} datasetFailures
 * @param {Object} appContext
 * @returns {Promise<{initialized: number, failed: number, skipped: number}>}
 */
async function initializeModuleGroup(entries, data, datasetFailures, appContext) {
  const counts = { initialized: 0, failed: 0, skipped: 0 };

  for (const entry of entries) {
    if (entry.featureFlag && APP_CONFIG.features[entry.featureFlag] === false) {
      console.info(`Skipping "${entry.id}": disabled in APP_CONFIG.features.`);
      counts.skipped += 1;
      continue;
    }

    const failedDataset = entry.dataset
      ? datasetFailures.find((failure) => failure.key === entry.dataset)
      : null;

    if (failedDataset) {
      // The dataset is absent, so there is nothing truthful to render. Reporting
      // it here (instead of passing undefined to the section) names the file in
      // the panel and keeps the reason in one place.
      reportSectionError(
        entry.id,
        new Error(
          `Dataset "${entry.dataset}" could not be loaded (${failedDataset.path}), so this module was not initialized.`
        )
      );
      counts.failed += 1;
      continue;
    }

    const sectionData = entry.dataset ? data[entry.dataset] : data;

    try {
      await runInitializer(entry, sectionData, appContext);
      counts.initialized += 1;
    } catch (error) {
      // The whole point of this catch: one module's failure becomes one panel,
      // and the loop continues with the next module.
      reportSectionError(entry.id, error);
      counts.failed += 1;
    }
  }

  return counts;
}

/**
 * Boot sequence. Called once at the bottom of this file.
 *
 * @returns {Promise<void>}
 */
async function initializeApplication() {
  const config = APP_CONFIG;

  // 1. Data. Every failure is collected rather than thrown, so the sections that
  //    do have data still render and the missing files are all named at once.
  /** @type {Array<{key: string, path: string, error: Error}>} */
  const datasetFailures = [];
  let data;

  try {
    data = await loadPortfolioData({
      onDatasetError: (error, failure) => {
        datasetFailures.push({ key: failure.key, path: failure.path, error });
      }
    });
  } catch (error) {
    // Only reachable for a caller error or a bug in the loader itself.
    handleApplicationError(error);
    markApplicationReady();
    return;
  }

  const datasetCount = Object.keys(config.dataPaths).length;

  if (datasetFailures.length === datasetCount) {
    // Nothing loaded. Eleven section panels would say the same thing eleven
    // times, so one page-level panel replaces the content instead.
    const fatal = new Error(
      `None of the ${datasetCount} data files could be loaded, so no section can render.`
    );
    fatal.name = "DataLoadError";
    fatal.failures = datasetFailures.map((failure) => ({
      path: failure.path,
      error: failure.error
    }));

    handleApplicationError(fatal);
    markApplicationReady();
    return;
  }

  if (datasetFailures.length > 0) {
    console.warn(
      `Continuing without ${datasetFailures.length} dataset(s):`,
      datasetFailures.map((failure) => failure.path)
    );
  }

  // 2. Storage. Probed once here so every later save can assume a known state
  //    and the visitor gets one clear console note instead of one per failure.
  if (!isStorageAvailable()) {
    console.info("Preferences will not persist: browser storage is unavailable.");
  }

  // 3. Shared systems. The bus and storage facade are module singletons; the
  //    modal manager and the error handler get an explicit init so a missing
  //    mount point or a duplicate boot is reported at the right moment.
  if (!initializeModalManager()) {
    console.warn("Dialogs are unavailable: #modal-root is missing.");
  }

  initializeErrorHandler();

  // 4. Toast service, then the context every module receives.
  const toast = await createToastService();
  const appContext = createAppContext(data, toast);

  // 5. Navigation. Its own try/catch because a navigation failure must not stop
  //    the sections: the header is broken, the page is still readable.
  try {
    initializeNavigation(data.navigation, appContext);
  } catch (error) {
    reportSectionError("site-header", error);
  }

  // 6. Sections, in contract order.
  const sections = await initializeModuleGroup(
    SECTION_MODULES,
    data,
    datasetFailures,
    appContext
  );

  // 7. Cross-section features.
  const features = await initializeModuleGroup(
    FEATURE_MODULES,
    data,
    datasetFailures,
    appContext
  );

  // 8. Ready. The event is emitted after the sections rather than immediately
  //    after loading, so a module that subscribes while initializing still
  //    receives it; every listener registered so far sees the final state.
  markApplicationReady();
  emit("data:loaded", {
    datasets: Object.keys(data),
    failed: datasetFailures.map((failure) => failure.path)
  });

  console.info(
    `Portfolio initialized: ${sections.initialized}/${SECTION_MODULES.length} sections, ` +
      `${features.initialized}/${FEATURE_MODULES.length} features, ` +
      `${datasetFailures.length} dataset failure(s).`
  );
}

// A rejection here would mean a bug outside the per-module try/catch blocks. It
// still reaches the page-level panel instead of dying silently in the console.
initializeApplication().catch((error) => {
  handleApplicationError(error);
  markApplicationReady();
});
