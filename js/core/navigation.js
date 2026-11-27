/**
 * js/core/navigation.js - the global navigation shell.
 *
 * Owns, for the whole application:
 *   - the brand link and the primary link list in header#site-header, rendered
 *     from data/navigation.json into the mount #site-navigation;
 *   - the mobile disclosure (button#mobile-menu-toggle controls the same nav
 *     element, restyled as a panel below the desktop breakpoint);
 *   - the active-section indicator, driven by an IntersectionObserver;
 *   - hash navigation, including landing on a hash that is already in the URL
 *     when the page finishes rendering;
 *   - footer#site-footer (internal links, contact/social links, copyright);
 *   - button#back-to-top.
 *
 * Does NOT own:
 *   - section content, section ids or their headings (js/sections/*.js);
 *   - Global Search or Theme Studio UI (js/features/*). Their mount points are
 *     not inside the header and .build/CONTRACT.md defines no event for opening
 *     them, so this module renders no search or theme trigger rather than a
 *     button that would do nothing. See "decisions" in the build report;
 *   - theme state (Theme Studio), storage keys, routing or search indexing.
 *
 * Data contract: data/navigation.json is public, owner-editable and importable
 * through the JSON Manager, so every string read here is untrusted. Labels are
 * written with textContent, internal targets must resolve to a real
 * `<section id>` inside #main-content, and external URLs must parse as http(s).
 *
 * Initialization contract: `initializeNavigation(sectionData, appContext)` is
 * called once by js/app.js with the parsed navigation.json payload and the
 * shared appContext ({ data, config, bus, storage, toast }). It returns nothing,
 * as the module contract requires, and keeps its teardown internally so a
 * second call (JSON Manager re-import, tests) cannot stack duplicate observers
 * or listeners.
 */

/** Desktop breakpoint. MUST match the `min-width` in css/layout/navigation.css. */
const DESKTOP_QUERY = "(min-width: 1120px)";

/** Used only to decide whether a scroll may animate. */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Scroll distance (px) after which the header gains its elevated state. */
const SCROLLED_THRESHOLD_PX = 4;

/** Scroll distance (px) after which the back-to-top button becomes visible. */
const BACK_TO_TOP_THRESHOLD_PX = 480;

/** Page height (px) within which Back is considered "at the bottom". */
const BOTTOM_TOLERANCE_PX = 2;

/**
 * Fallback top inset for the active-section band, in px.
 *
 * The real value comes from `layout.scrollOffset` in navigation.json so an owner
 * can tune it without a code change; this constant only covers a missing file.
 */
const FALLBACK_SCROLL_OFFSET_PX = 90;

/**
 * How long to wait for the "data:loaded" bus event before assuming it will not
 * arrive (navigation dataset failed, a section threw, or the bus is missing) and
 * landing the deep link anyway.
 */
const HASH_LANDING_TIMEOUT_MS = 1500;

/**
 * Teardown of the most recent initialization.
 *
 * Module-scoped instead of returned because the contract fixes the initializer
 * signature as `(sectionData, appContext) => void`. Re-initialization runs it
 * first, which is what keeps a re-import from doubling the observers.
 *
 * @type {null | (() => void)}
 */
let teardownPreviousInstance = null;

/**
 * Renders and wires the whole navigation shell.
 *
 * Every subsystem is isolated in its own try/catch: a footer or back-to-top
 * failure must leave the header usable, and a header failure must not stop the
 * page (js/app.js also wraps this call, but the page is more useful with half a
 * shell than with an error panel where the header used to be).
 *
 * @param {Object|Array|undefined} sectionData - data/navigation.json payload.
 * @param {{data?: Object, config?: Object, bus?: Object}} [appContext]
 * @returns {void}
 */
export function initializeNavigation(sectionData, appContext) {
  // Safe import from Node/tooling: nothing below touches the DOM before this.
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  if (typeof teardownPreviousInstance === "function") {
    try {
      teardownPreviousInstance();
    } catch (error) {
      console.warn("[navigation] Teardown of the previous instance failed:", error);
    }
    teardownPreviousInstance = null;
  }

  const context = isRecord(appContext) ? appContext : {};
  const data = isRecord(context.data) ? context.data : {};
  const sections = getSectionMap();
  const config = normalizeConfiguration(sectionData, context.config, sections);

  const cleanups = [];

  /** Runs one subsystem, converting a throw into a console warning. */
  const runSafely = (label, task) => {
    try {
      task();
    } catch (error) {
      console.warn(`[navigation] ${label} failed:`, error);
    }
  };

  const header = document.getElementById("site-header");
  const mount = document.getElementById("site-navigation");

  if (!header || !mount) {
    // Without both mount points there is nowhere to render and no element to
    // toggle. Leave the page alone instead of throwing.
    console.warn("[navigation] #site-header or #site-navigation is missing; the header was not rendered.");
    return;
  }

  const navigationEnabled = config.enabled && config.showOnDesktop !== false;

  // 1. Brand ---------------------------------------------------------------
  runSafely("brand", () => {
    applyBrand(header.querySelector(".site-brand"), config.brand, config.showBrand);
  });

  // 2. Primary link list ---------------------------------------------------
  /** @type {Map<string, HTMLAnchorElement>} target section id -> header link */
  let linkByTarget = new Map();

  runSafely("primary links", () => {
    if (!navigationEnabled || config.items.length === 0) {
      mount.replaceChildren();
      if (config.items.length === 0) {
        console.warn("[navigation] No valid navigation items were configured; the header list stays empty.");
      }
      return;
    }

    linkByTarget = renderLinkList(mount, config.items);
  });

  // 3. Active-section indication ------------------------------------------
  const orderedTargets = config.items.map((item) => item.target);
  let activeTarget = "";

  /**
   * Applies the active state to exactly the link that changed.
   *
   * `aria-current="location"` is the semantic signal; the CSS adds weight and an
   * underline so the state does not rely on colour (16_NAVIGATION_AND_LAYOUT §8).
   *
   * @param {string} targetId
   */
  const setActiveTarget = (targetId) => {
    if (!targetId || targetId === activeTarget) {
      return;
    }

    activeTarget = targetId;

    for (const [id, link] of linkByTarget) {
      const isActive = id === targetId;
      if (link.classList.contains("is-active") === isActive) {
        continue;
      }
      link.classList.toggle("is-active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  };

  runSafely("active section tracking", () => {
    if (!navigationEnabled || orderedTargets.length === 0) {
      return;
    }

    // A deep link wins over the first item on the initial state, otherwise the
    // indicator would name "Home" while the visitor is looking at #projects.
    const initialTarget = readHashTarget(sections);
    setActiveTarget(initialTarget && linkByTarget.has(initialTarget) ? initialTarget : orderedTargets[0]);

    const observed = orderedTargets
      .map((target) => sections.get(target))
      .filter((section) => section instanceof HTMLElement);

    if (observed.length === 0) {
      return;
    }

    const observerOffset = Math.max(0, Math.round(config.scrollOffset));

    if (typeof IntersectionObserver === "function") {
      /**
       * Observed ids currently inside the band.
       *
       * The band is the strip just under the sticky header, so a section is
       * "current" while it crosses that line rather than while it merely exists
       * in the viewport. Only a boolean per id is stored; the choice of the
       * active item is made in document order below, which keeps behaviour
       * predictable even when two sections meet at a boundary.
       */
      const visibility = new Map();

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            visibility.set(entry.target.id, entry.isIntersecting);
          }

          for (const target of orderedTargets) {
            if (visibility.get(target)) {
              setActiveTarget(target);
              return;
            }
          }
          // No section in the band (a gap between sections): keep the last one
          // rather than clearing the indicator, so the nav never flickers empty.
        },
        {
          // Top inset = sticky header + a little breathing room; bottom inset
          // -55% shrinks the band to the upper part of the viewport, so a
          // section only becomes current once it reaches the reading area.
          rootMargin: `-${observerOffset}px 0px -55% 0px`,
          threshold: 0
        }
      );

      for (const section of observed) {
        observer.observe(section);
      }

      cleanups.push(() => observer.disconnect());
    } else {
      // Fallback for engines without IntersectionObserver: bounded arithmetic
      // over at most eleven elements, on a rAF-throttled passive listener.
      const updateFromScroll = () => {
        const line = observerOffset + 8;
        let candidate = orderedTargets[0];

        for (const target of orderedTargets) {
          const section = sections.get(target);
          if (section && section.getBoundingClientRect().top - line <= 0) {
            candidate = target;
          }
        }

        setActiveTarget(candidate);
      };

      cleanups.push(createScrollWatcher([updateFromScroll]));
    }

    // The observer cannot see the last section when it never reaches the band
    // (short final section at the very bottom of a long page), so the bottom
    // edge is handled explicitly. Guarded against short pages where the bottom
    // is always "reached" and the last item would otherwise win immediately.
    const updateAtBottom = () => {
      const root = document.documentElement;
      if (root.scrollHeight <= window.innerHeight + 8) {
        return;
      }
      const atBottom = window.scrollY + window.innerHeight >= root.scrollHeight - BOTTOM_TOLERANCE_PX;
      if (atBottom) {
        setActiveTarget(orderedTargets[orderedTargets.length - 1]);
      }
    };

    cleanups.push(createScrollWatcher([updateAtBottom]));
  });

  // 4. Mobile disclosure ---------------------------------------------------
  const toggle = document.getElementById("mobile-menu-toggle");
  const desktopQuery = typeof window.matchMedia === "function" ? window.matchMedia(DESKTOP_QUERY) : null;
  let menuOpen = false;

  /**
   * Writes the state to both consumers: the header class the CSS reads and the
   * ARIA attributes assistive technology reads. Keeping them in one function is
   * what prevents "looks open, announced closed".
   */
  const applyMenuState = () => {
    header.classList.toggle("is-menu-open", menuOpen);

    if (!toggle) {
      return;
    }

    toggle.setAttribute("aria-expanded", String(menuOpen));
    toggle.setAttribute("aria-label", menuOpen ? "Close navigation menu" : "Open navigation menu");
  };

  const closeMenu = ({ returnFocus = false } = {}) => {
    if (menuOpen) {
      menuOpen = false;
      applyMenuState();
    }

    // Focus is returned even when the menu was already closed, so Escape on a
    // stale state still puts the visitor back on the control that owns the menu.
    if (returnFocus && toggle) {
      toggle.focus();
    }
  };

  const openMenu = () => {
    if (!toggle || menuOpen) {
      return;
    }
    menuOpen = true;
    applyMenuState();
  };

  runSafely("mobile menu", () => {
    if (!navigationEnabled) {
      if (toggle) {
        toggle.hidden = true;
      }
      return;
    }

    if (!toggle) {
      // Desktop navigation stays usable; there is simply nothing to open on a
      // narrow viewport. Reported so the missing markup is not silent.
      console.warn("[navigation] #mobile-menu-toggle is missing; the mobile menu is unavailable.");
      return;
    }

    const onToggleClick = () => {
      if (menuOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    };

    toggle.addEventListener("click", onToggleClick);
    cleanups.push(() => toggle.removeEventListener("click", onToggleClick));

    const onKeydown = (event) => {
      if (event.key !== "Escape" || !menuOpen) {
        return;
      }
      if (config.closeOnEscape === false) {
        return;
      }
      event.preventDefault();
      closeMenu({ returnFocus: true });
    };

    document.addEventListener("keydown", onKeydown);
    cleanups.push(() => document.removeEventListener("keydown", onKeydown));

    // A click anywhere outside the header dismisses the panel. Clicks inside the
    // header are ignored here: the toggle and the links have their own handlers,
    // and this listener would otherwise close the menu on the opening click.
    const onDocumentClick = (event) => {
      if (!menuOpen) {
        return;
      }
      if (event.target instanceof Node && header.contains(event.target)) {
        return;
      }
      closeMenu();
    };

    document.addEventListener("click", onDocumentClick);
    cleanups.push(() => document.removeEventListener("click", onDocumentClick));

    // Crossing into the desktop layout while the panel is open would leave the
    // header in a state where the class says "open" but nothing is collapsible.
    if (desktopQuery) {
      const onDesktopChange = (event) => {
        if (event.matches) {
          closeMenu();
        }
      };

      if (typeof desktopQuery.addEventListener === "function") {
        desktopQuery.addEventListener("change", onDesktopChange);
        cleanups.push(() => desktopQuery.removeEventListener("change", onDesktopChange));
      } else if (typeof desktopQuery.addListener === "function") {
        // Safari < 14 compatibility; the media query object still supports it.
        desktopQuery.addListener(onDesktopChange);
        cleanups.push(() => desktopQuery.removeListener(onDesktopChange));
      }
    }
  });

  // 5. Hash navigation -----------------------------------------------------
  runSafely("hash navigation", () => {
    const onNavigationClick = (event) => {
      const link = event.target instanceof Element ? event.target.closest("a[data-nav-target]") : null;

      if (!(link instanceof HTMLAnchorElement) || !mount.contains(link)) {
        return;
      }

      const targetId = link.dataset.navTarget ?? "";
      const section = sections.get(targetId);
      if (!section) {
        return;
      }

      const wasOpen = menuOpen;

      if (wasOpen && config.closeOnNavigate !== false) {
        // Closing removes the panel from the focus order (visibility: hidden),
        // so focus is handed to the destination heading first. Without this the
        // browser drops focus to <body> and a keyboard visitor loses their place.
        focusSectionHeading(section);
      }

      closeMenu();

      // Respond immediately instead of waiting for the observer's next callback.
      setActiveTarget(targetId);

      if (window.location.hash === `#${targetId}`) {
        // The browser does nothing when the hash is already current, so an
        // in-page click on the active item would look broken. Scroll manually
        // and keep the URL as it is.
        event.preventDefault();
        section.scrollIntoView({ behavior: getMotionBehavior(), block: "start" });
      }
      // Every other case is left to the browser: the hash is updated, the CSS
      // `scroll-behavior: smooth` and the section's scroll-margin-block-start
      // handle the motion and the sticky-header offset, and Back/Forward keep
      // working. Re-implementing that in JS would break all three.
    };

    mount.addEventListener("click", onNavigationClick);
    cleanups.push(() => mount.removeEventListener("click", onNavigationClick));

    const brand = header.querySelector(".site-brand");
    if (brand) {
      const onBrandClick = () => closeMenu();
      brand.addEventListener("click", onBrandClick);
      cleanups.push(() => brand.removeEventListener("click", onBrandClick));
    }

    const onHashChange = () => {
      const targetId = readHashTarget(sections);
      if (targetId && linkByTarget.has(targetId)) {
        setActiveTarget(targetId);
      }
    };

    window.addEventListener("hashchange", onHashChange);
    cleanups.push(() => window.removeEventListener("hashchange", onHashChange));
  });

  // 6. Landing on a URL that already carries a hash ------------------------
  runSafely("initial hash landing", () => {
    const stopWaiting = scheduleHashLanding({
      sections,
      setActiveTarget,
      bus: context.bus
    });
    cleanups.push(stopWaiting);
  });

  // 7. Footer --------------------------------------------------------------
  runSafely("footer", () => {
    renderFooter({
      footerConfig: config.footer,
      items: config.items,
      brandLabel: config.brand.label,
      profile: readProfile(data),
      showSocialLinks: config.footer.showSocialLinks
    });
  });

  // 8. Back to top ---------------------------------------------------------
  runSafely("back to top", () => {
    cleanups.push(...createBackToTop(config.showBackToTop));
  });

  // 9. Sticky header chrome ------------------------------------------------
  runSafely("sticky header", () => {
    const updateScrolledState = () => {
      header.classList.toggle("is-scrolled", window.scrollY > SCROLLED_THRESHOLD_PX);
    };

    cleanups.push(createScrollWatcher([updateScrolledState]));
  });

  teardownPreviousInstance = () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (typeof cleanup === "function") {
        cleanup();
      }
    }
    header.classList.remove("is-menu-open", "is-scrolled");
  };
}

/* ==========================================================================
   CONFIGURATION
   ========================================================================== */

/**
 * Accepts both the structured payload (navigation.json as documented in
 * 16_NAVIGATION_AND_LAYOUT §6) and the flat legacy shape that shipped in this
 * repository before (a bare `navigation` array). Supporting both is deliberate:
 * the JSON Manager lets an owner import an older file, and a shape change must
 * not take the header down.
 *
 * @param {unknown} sectionData
 * @param {Object|undefined} appConfig - APP_CONFIG, only for the brand fallback.
 * @param {Map<string, HTMLElement>} sections
 * @returns {Object} Normalized configuration.
 */
function normalizeConfiguration(sectionData, appConfig, sections) {
  const container = isRecord(sectionData)
    ? sectionData
    : Array.isArray(sectionData)
      ? { navigation: sectionData }
      : {};

  const navigationValue = container.navigation;
  const navigationBlock = isRecord(navigationValue) ? navigationValue : {};

  const rawItems = Array.isArray(navigationValue)
    ? navigationValue
    : Array.isArray(navigationBlock.items)
      ? navigationBlock.items
      : Array.isArray(container.items)
        ? container.items
        : [];

  const items = normalizeItems(rawItems, sections);

  const brandBlock = isRecord(container.brand) ? container.brand : {};
  const configuredLabel = typeof brandBlock.label === "string" ? brandBlock.label.trim() : "";
  const configLabel = typeof appConfig?.name === "string" ? appConfig.name.trim() : "";

  // No invented owner name: the configured label wins, then the canonical name
  // from js/config.js, then a neutral word that carries no false identity.
  const label = configuredLabel || configLabel || "Portfolio";

  const configuredHref = typeof brandBlock.href === "string" ? brandBlock.href.replace(/^#/, "").trim() : "";
  const brandTarget = sections.has(configuredHref) ? configuredHref : items[0]?.target ?? "";
  const href = brandTarget ? `#${brandTarget}` : "#main-content";

  const headerBlock = isRecord(container.header) ? container.header : {};
  const layoutBlock = isRecord(container.layout) ? container.layout : {};
  const footerBlock = isRecord(container.footer) ? container.footer : {};

  const image = typeof brandBlock.image === "string" ? brandBlock.image.trim() : "";

  return {
    enabled: navigationBlock.enabled !== false,
    showOnDesktop: navigationBlock.showOnDesktop !== false,
    showOnMobile: navigationBlock.showOnMobile !== false,
    closeOnEscape: navigationBlock.closeOnEscape !== false,
    closeOnNavigate: navigationBlock.closeOnNavigate !== false,
    showBrand: headerBlock.showBrand !== false,
    scrollOffset: toPositiveNumber(layoutBlock.scrollOffset, FALLBACK_SCROLL_OFFSET_PX),
    brand: {
      label,
      href,
      // Only an http(s) URL survives validation, so a data: or javascript:
      // value cannot become an image source.
      image: brandBlock.showImage === true ? toSafeHttpUrl(image)?.href ?? "" : ""
    },
    items,
    footer: {
      enabled: footerBlock.enabled !== false,
      showCopyright: footerBlock.showCopyright !== false,
      showSocialLinks: footerBlock.showSocialLinks !== false,
      copyrightText: typeof footerBlock.copyrightText === "string" ? footerBlock.copyrightText : ""
    },
    showBackToTop: footerBlock.showBackToTop !== false
  };
}

/**
 * Validates, de-duplicates and orders the configured items.
 *
 * Rules from 16_NAVIGATION_AND_LAYOUT §6: disabled items are not rendered,
 * duplicate ids and duplicate targets are reported and dropped, empty labels and
 * targets are rejected, an invalid target is skipped, and `order` decides the
 * sequence. Problems are warnings, never throws: the header must render what is
 * valid even when one record is broken.
 *
 * @param {Array<unknown>} rawItems
 * @param {Map<string, HTMLElement>} sections
 * @returns {Array<{id: string, label: string, target: string, order: number}>}
 */
function normalizeItems(rawItems, sections) {
  const seenIds = new Set();
  const seenTargets = new Set();
  const items = [];

  rawItems.forEach((rawItem, index) => {
    if (!isRecord(rawItem)) {
      console.warn(`[navigation] Item ${index} is not an object and was skipped.`);
      return;
    }

    if (rawItem.enabled === false) {
      // Deliberately silent: a disabled item is a configuration decision, not a
      // problem to report.
      return;
    }

    const label = typeof rawItem.label === "string" ? rawItem.label.trim() : "";
    if (label === "") {
      console.warn(`[navigation] Item ${index} has no label and was skipped.`);
      return;
    }

    const target = typeof rawItem.target === "string" ? rawItem.target.replace(/^#/, "").trim() : "";
    if (target === "") {
      console.warn(`[navigation] Item "${label}" has no target and was skipped.`);
      return;
    }

    if (!sections.has(target)) {
      console.warn(`[navigation] Item "${label}" targets #${target}, which is not a section in #main-content; skipped.`);
      return;
    }

    if (seenTargets.has(target)) {
      console.warn(`[navigation] A second item targets #${target}; only the first one is rendered.`);
      return;
    }

    const configuredId = typeof rawItem.id === "string" ? rawItem.id.trim() : "";
    const id = configuredId === "" ? target : configuredId;

    if (seenIds.has(id)) {
      console.warn(`[navigation] Duplicate item id "${id}" was skipped.`);
      return;
    }

    // A non-numeric order would sort unpredictably (NaN comparisons), so it
    // falls back to the source position, which is stable and obvious.
    const parsedOrder = Number(rawItem.order);
    const order = Number.isFinite(parsedOrder) ? parsedOrder : index;

    seenIds.add(id);
    seenTargets.add(target);
    items.push({ id, label, target, order, sourceIndex: index });
  });

  return items
    .sort((a, b) => a.order - b.order || a.sourceIndex - b.sourceIndex)
    .map(({ id, label, target, order }) => ({ id, label, target, order }));
}

/* ==========================================================================
   RENDERING
   ========================================================================== */

/**
 * Builds the primary list inside #site-navigation.
 *
 * One list serves both layouts: the desktop row and the mobile panel are the
 * same DOM, restyled by CSS. Two lists would double every link in the tab order
 * and in the accessibility tree.
 *
 * @param {HTMLElement} mount
 * @param {Array<{label: string, target: string}>} items
 * @returns {Map<string, HTMLAnchorElement>} target id -> link
 */
function renderLinkList(mount, items) {
  const list = document.createElement("ul");
  list.className = "nav-list";
  // role="list" keeps the list semantics that `list-style: none` removes in
  // some screen readers (css/reset.css styles the same selector).
  list.setAttribute("role", "list");

  const links = new Map();

  for (const item of items) {
    const listItem = document.createElement("li");
    listItem.className = "nav-list__item";

    const link = document.createElement("a");
    link.className = "nav-link";
    link.href = `#${item.target}`;
    link.dataset.navTarget = item.target;
    // SECURITY: labels come from editable JSON. textContent cannot create markup.
    link.textContent = item.label;

    listItem.append(link);
    list.append(listItem);
    links.set(item.target, link);
  }

  mount.replaceChildren(list);
  return links;
}

/**
 * Applies the configured brand to the static anchor in the header.
 *
 * @param {Element|null} brandElement
 * @param {{label: string, href: string, image: string}} brand
 * @param {boolean} visible
 */
function applyBrand(brandElement, brand, visible) {
  if (!(brandElement instanceof HTMLAnchorElement)) {
    console.warn("[navigation] The brand anchor is missing from #site-header.");
    return;
  }

  brandElement.hidden = visible === false;
  brandElement.href = brand.href;

  if (brand.image !== "") {
    const image = document.createElement("img");
    image.className = "site-brand__image";
    image.src = brand.image;
    image.width = 28;
    image.height = 28;
    // Decorative: the label next to it already names the portfolio.
    image.alt = "";
    // A broken image would render an icon and push the label around, so it is
    // removed on the first failure ({once}) instead of being retried.
    image.addEventListener("error", () => image.remove(), { once: true });
    brandElement.prepend(image);
  }

  const label = brandElement.querySelector(".site-brand__label");
  if (label) {
    label.textContent = brand.label;
  }
}

/**
 * Renders the footer: identity, internal links, optional contact/social links
 * and the copyright line.
 *
 * Contact and social values are read from data/profile.json, the same dataset
 * the Profile and Contact sections render (16_NAVIGATION_AND_LAYOUT §13: do not
 * duplicate contact records). When they are absent - which is the current state
 * of the repository - those groups are omitted entirely rather than shown empty.
 *
 * @param {{footerConfig: Object, items: Array, brandLabel: string, profile: Object|null, showSocialLinks: boolean}} input
 */
function renderFooter({ footerConfig, items, brandLabel, profile, showSocialLinks }) {
  const mount = document.getElementById("site-footer");

  if (!mount) {
    console.warn("[navigation] #site-footer is missing; the footer was not rendered.");
    return;
  }

  if (footerConfig.enabled === false) {
    mount.replaceChildren();
    return;
  }

  const inner = document.createElement("div");
  // Reuses the shared container from css/main.css so the footer text aligns with
  // every section without a second width definition.
  inner.className = "site-footer__inner container";

  const top = document.createElement("div");
  top.className = "site-footer__top";

  const name = document.createElement("p");
  name.className = "site-footer__name";
  name.textContent = brandLabel;
  top.append(name);

  if (items.length > 0) {
    const nav = document.createElement("nav");
    nav.className = "site-footer__nav";
    // Second navigation landmark on the page: it needs its own name so screen
    // reader landmarks stay distinguishable from "Main navigation".
    nav.setAttribute("aria-label", "Footer navigation");

    const list = document.createElement("ul");
    list.className = "footer-links";
    list.setAttribute("role", "list");

    for (const item of items) {
      const listItem = document.createElement("li");
      const link = document.createElement("a");
      link.className = "footer-link";
      link.href = `#${item.target}`;
      link.dataset.navTarget = item.target;
      link.textContent = item.label;
      listItem.append(link);
      list.append(listItem);
    }

    nav.append(list);
    top.append(nav);
  }

  inner.append(top);

  const email = readEmail(profile);
  const socialLinks = showSocialLinks === false ? [] : readSocialLinks(profile);

  if (email !== "" || socialLinks.length > 0) {
    const contact = document.createElement("div");
    contact.className = "site-footer__contact";

    if (email !== "") {
      const mailLink = document.createElement("a");
      mailLink.className = "footer-link footer-link--email";
      mailLink.href = `mailto:${email}`;
      mailLink.textContent = email;
      contact.append(mailLink);
    }

    if (socialLinks.length > 0) {
      const socialNav = document.createElement("nav");
      socialNav.className = "site-footer__social";
      socialNav.setAttribute("aria-label", "Social links");

      const list = document.createElement("ul");
      list.className = "footer-social";
      list.setAttribute("role", "list");

      for (const social of socialLinks) {
        const listItem = document.createElement("li");
        const link = document.createElement("a");
        link.className = "footer-social__link";
        link.href = social.url;
        // External by definition: open in a new tab, and never hand the opener
        // window to the destination.
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = social.label;

        const hint = document.createElement("span");
        hint.className = "visually-hidden";
        hint.textContent = " (opens in a new tab)";
        link.append(hint);

        listItem.append(link);
        list.append(listItem);
      }

      socialNav.append(list);
      contact.append(socialNav);
    }

    inner.append(contact);
  }

  if (footerConfig.showCopyright !== false) {
    const copyright = document.createElement("p");
    copyright.className = "site-footer__copyright";
    copyright.textContent = buildCopyrightText(footerConfig, brandLabel);
    inner.append(copyright);
  }

  mount.replaceChildren(inner);
}

/**
 * Copyright line. The year is generated so it cannot go stale; `{year}` in a
 * configured string is replaced so an owner can add a fixed range
 * ("2019-{year}") without hardcoding the current year in JSON.
 *
 * @param {{copyrightText: string}} footerConfig
 * @param {string} brandLabel
 * @returns {string}
 */
function buildCopyrightText(footerConfig, brandLabel) {
  const year = String(new Date().getFullYear());
  const configured = typeof footerConfig.copyrightText === "string" ? footerConfig.copyrightText.trim() : "";

  if (configured !== "") {
    return configured.replace(/\{year\}/g, year);
  }

  return `\u00A9 ${year} ${brandLabel}`;
}

/* ==========================================================================
   PROFILE-DERIVED CONTACT DATA
   ========================================================================== */

/**
 * Resolves the single profile record from data/profile.json.
 *
 * The schema in 02_PROFILE_SECTION.md stores one object (`profile: { ... }`),
 * while the placeholder file in this repository uses an array. Both shapes are
 * accepted so the footer does not depend on which phase landed first.
 *
 * @param {Object} data - Whole dataset map from appContext.
 * @returns {Object|null}
 */
function readProfile(data) {
  const value = data.profile;

  if (Array.isArray(value)) {
    return value.find((entry) => isRecord(entry) && entry.enabled !== false) ?? null;
  }

  if (isRecord(value)) {
    return isRecord(value.profile) ? value.profile : value;
  }

  return null;
}

/**
 * Returns a usable email address, or "" when none is configured.
 *
 * Accepts a plain string (profile.email) and the contactDetails shape from
 * 15_CONTACT_AND_SOCIAL.md. The regex is a format gate, not a validity proof:
 * it only stops a malformed value from producing a broken mailto: link.
 *
 * @param {Object|null} profile
 * @returns {string}
 */
function readEmail(profile) {
  if (!isRecord(profile)) {
    return "";
  }

  const contactEmail = isRecord(profile.contactDetails) && isRecord(profile.contactDetails.email)
    ? profile.contactDetails.email.value
    : "";

  const candidates = [profile.email, contactEmail, profile.emailAddress];

  for (const candidate of candidates) {
    const value = typeof candidate === "string"
      ? candidate.trim()
      : isRecord(candidate) && typeof candidate.value === "string"
        ? candidate.value.trim()
        : "";

    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      return value;
    }
  }

  return "";
}

/**
 * Returns the enabled external social links with http(s) URLs only.
 *
 * @param {Object|null} profile
 * @returns {Array<{url: string, label: string}>}
 */
function readSocialLinks(profile) {
  if (!isRecord(profile)) {
    return [];
  }

  const rawList = Array.isArray(profile.socialLinks)
    ? profile.socialLinks
    : Array.isArray(profile.socials)
      ? profile.socials
      : [];

  const seen = new Set();
  const links = [];

  for (const entry of rawList) {
    if (!isRecord(entry) || entry.enabled === false) {
      continue;
    }

    const url = toSafeHttpUrl(entry.url);
    if (!url) {
      continue;
    }

    const label = [entry.label, entry.platform, entry.name]
      .find((value) => typeof value === "string" && value.trim() !== "");

    if (!label) {
      continue;
    }

    if (seen.has(url.href)) {
      continue;
    }

    seen.add(url.href);
    // The parsed href is used, not the raw string, so an odd but valid URL is
    // normalised before it reaches the DOM.
    links.push({ url: url.href, label: label.trim() });
  }

  return links;
}

/* ==========================================================================
   HASH NAVIGATION
   ========================================================================== */

/**
 * The section id in the current URL, when it names a real section.
 *
 * @param {Map<string, HTMLElement>} sections
 * @returns {string} "" when the hash is absent or unknown.
 */
function readHashTarget(sections) {
  const raw = window.location.hash.replace(/^#/, "");

  if (raw === "") {
    return "";
  }

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // A malformed escape sequence is not worth an exception; the raw value is
    // simply checked against the known ids below.
    decoded = raw;
  }

  return sections.has(decoded) ? decoded : "";
}

/**
 * Fixes the landing position for a URL that arrives with `#section`.
 *
 * Why this exists: index.html ships empty sections that js/sections/*.js fill
 * after the data loads, and css/main.css hides an empty section
 * (`:empty { display: none }`). The browser therefore runs its native hash jump
 * against a target with zero height and lands at the top of the document. This
 * re-runs the jump once the content exists - on the "data:loaded" event, or
 * after HASH_LANDING_TIMEOUT_MS if that event never arrives.
 *
 * Motion is instant on purpose: a deep link is not a request for animation, and
 * the target may be far down a long page.
 *
 * @param {{sections: Map<string, HTMLElement>, setActiveTarget: Function, bus: Object|undefined}} input
 * @returns {() => void} Cleanup.
 */
function scheduleHashLanding({ sections, setActiveTarget, bus }) {
  const targetId = readHashTarget(sections);
  const section = targetId ? sections.get(targetId) : null;

  if (!section) {
    return () => {};
  }

  let settled = false;
  let timer = 0;

  const land = () => {
    if (settled) {
      return;
    }
    settled = true;

    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }

    bus?.off?.("data:loaded", land);
    section.scrollIntoView({ behavior: "auto", block: "start" });
    setActiveTarget(targetId);
  };

  bus?.on?.("data:loaded", land);
  timer = window.setTimeout(land, HASH_LANDING_TIMEOUT_MS);

  // A warm cache can finish rendering before this module runs; in that case the
  // section already has height and no event is needed.
  window.requestAnimationFrame(() => {
    if (section.getBoundingClientRect().height > 0) {
      land();
    }
  });

  return () => {
    if (timer) {
      window.clearTimeout(timer);
    }
    bus?.off?.("data:loaded", land);
  };
}

/**
 * Moves focus to the destination section's first heading after a mobile link
 * selection.
 *
 * The panel becomes `visibility: hidden` when it closes, which removes the
 * clicked link from the focus order; without this the browser would drop focus
 * to <body> and a keyboard visitor would have to start over. The transient
 * tabindex="-1" is the standard way to focus a non-interactive heading and is
 * left in place (harmless, and it lets a later re-focus work).
 *
 * @param {HTMLElement} section
 */
function focusSectionHeading(section) {
  const heading = section.querySelector("h1, h2, h3");

  if (!heading) {
    return;
  }

  if (!heading.hasAttribute("tabindex")) {
    heading.setAttribute("tabindex", "-1");
  }

  heading.focus({ preventScroll: true });
}

/* ==========================================================================
   BACK TO TOP
   ========================================================================== */

/**
 * Wires button#back-to-top.
 *
 * The button ships hidden in index.html because it is meaningless before the
 * page can scroll; this unhides it past a threshold and hides it again near the
 * top. `[hidden]` wins over the CSS display rule (css/reset.css), so the control
 * is genuinely removed from the tab order while invisible, not just transparent.
 *
 * @param {boolean} enabled
 * @returns {Array<() => void>} Cleanups.
 */
function createBackToTop(enabled) {
  const button = document.getElementById("back-to-top");

  if (!button) {
    console.warn("[navigation] #back-to-top is missing; the control was not rendered.");
    return [];
  }

  if (enabled === false) {
    button.hidden = true;
    return [];
  }

  const updateVisibility = () => {
    const shouldShow = window.scrollY > BACK_TO_TOP_THRESHOLD_PX;
    if (button.hidden === !shouldShow) {
      return;
    }
    button.hidden = !shouldShow;
  };

  const onClick = () => {
    window.scrollTo({ top: 0, behavior: getMotionBehavior() });

    // Focus follows the scroll: a keyboard visitor who activated the control is
    // returned to the start of the content instead of to a button that is about
    // to disappear. preventScroll keeps the smooth scroll uninterrupted.
    const main = document.getElementById("main-content");
    main?.focus?.({ preventScroll: true });
  };

  button.addEventListener("click", onClick);
  const stopWatching = createScrollWatcher([updateVisibility]);

  return [
    () => {
      button.removeEventListener("click", onClick);
      stopWatching();
      button.hidden = true;
    }
  ];
}

/* ==========================================================================
   SHARED HELPERS
   ========================================================================== */

/**
 * One rAF-throttled scroll/resize listener shared by every scroll-dependent
 * task.
 *
 * Why not one listener per task: scroll fires continuously, and three separate
 * handlers would each force a layout read on the same frame. The throttle also
 * keeps the work off the scroll event itself, so the main thread stays free.
 *
 * @param {Array<() => void>} tasks
 * @returns {() => void} Cleanup.
 */
function createScrollWatcher(tasks) {
  let frame = 0;

  const run = () => {
    frame = 0;
    for (const task of tasks) {
      try {
        task();
      } catch (error) {
        // A failing task must not stop the others (e.g. a missing element).
        console.warn("[navigation] Scroll task failed:", error);
      }
    }
  };

  const schedule = () => {
    if (frame !== 0) {
      return;
    }
    frame = window.requestAnimationFrame(run);
  };

  // Passive: these handlers never call preventDefault, and passive lets the
  // browser scroll without waiting for them.
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  schedule();

  return () => {
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);

    if (frame !== 0) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

/**
 * Maps section id to element, in contract order.
 *
 * #main-content is the scope so an element with a section id inside a modal or a
 * rendered result list can never be mistaken for a page section.
 *
 * @returns {Map<string, HTMLElement>}
 */
function getSectionMap() {
  const main = document.getElementById("main-content");
  const scope = main ?? document;
  const selector = main ? "#main-content > section[id]" : "section[id]";
  const map = new Map();

  for (const section of scope.querySelectorAll(selector)) {
    if (!map.has(section.id)) {
      map.set(section.id, section);
    }
  }

  return map;
}

/**
 * "smooth" unless the visitor asked for reduced motion.
 *
 * Read on every call rather than cached: the OS setting can change while the
 * page is open, and css/animations.css already honours the same query for the
 * native scroll path.
 *
 * @returns {"smooth"|"auto"}
 */
function getMotionBehavior() {
  if (typeof window.matchMedia !== "function") {
    return "smooth";
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth";
}

/**
 * Parses a number or CSS length ("90px", "5rem" is rejected) into a positive
 * pixel value.
 *
 * Rem/em values are deliberately not converted: the value is only used as an
 * IntersectionObserver rootMargin, which takes pixels, and a wrong guess would
 * silently shift the active band.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toPositiveNumber(value, fallback) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Validates an external URL.
 *
 * SECURITY: the only protocols allowed out of JSON configuration are http and
 * https. `javascript:`, `data:` and `file:` all parse successfully with
 * `new URL()`, so the protocol list - not the parse alone - is the gate.
 *
 * @param {unknown} value
 * @returns {URL|null}
 */
function toSafeHttpUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const url = new URL(value.trim(), document.baseURI);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @returns {boolean} True for a plain object (not null, not an array).
 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
