/**
 * js/components/timeline-item.js - shared Timeline presentation component.
 *
 * Owns:
 * - The vertical/horizontal/compact/grouped chronology markup: rail, event
 *   marker, date slot, title, type label, description, badges, optional image,
 *   optional details disclosure and optional actions.
 * - The disclosure interaction for event details and the event-action callback.
 *
 * Does not own:
 * - Which records become events, how references are resolved, how dates are
 *   interpreted, sorting or grouping decisions. The consuming section (and
 *   js/sections/career-timeline.js in particular) prepares the event list in the
 *   order it wants rendered; this module preserves that order and never invents
 *   a date, duration or relationship (TIMELINE_COMPONENT.md §4, §13).
 * - Filtering or searching events; the section passes the already-filtered list.
 *
 * Consumers: Career Timeline, Experience, Education, Learning Journey and any
 * other section that shows dated entries.
 *
 * Pairs with css/components/timeline.css. Event-type distinction is a data
 * attribute (`data-event-type`) so the colours live in tokens; the type is also
 * printed as text, because colour alone must not carry meaning.
 */

/** Layouts this component renders. Anything else falls back to "vertical". */
const SUPPORTED_LAYOUTS = Object.freeze(["vertical", "horizontal", "compact", "grouped"]);

/** Event types with a dedicated visual treatment; anything else is neutral. */
const EVENT_TYPE_LABELS = Object.freeze({
  experience: "Experience",
  project: "Project",
  certificate: "Certificate",
  education: "Education",
  learning: "Learning",
  achievement: "Achievement",
  milestone: "Milestone",
  other: "Other"
});

const MAX_HEADING_LEVEL = 6;
const MIN_HEADING_LEVEL = 2;

/** Distinguishes <details> ids when several timelines share one page. */
let instanceCounter = 0;

function reportError(message) {
  // One warning per invalid record; a bad event must not stop its siblings from
  // rendering (TIMELINE_COMPONENT.md §26).
  console.warn(`[Timeline] ${message}`);
}

/**
 * Keeps imported capitalisation, humanising only machine-shaped values.
 *
 * @param {unknown} value
 * @returns {string}
 */
function humanizeValue(value) {
  const text = String(value ?? "").trim();

  if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(text)) {
    return text;
  }

  return text
    .split(/[-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Validates an href before it reaches the DOM.
 *
 * SECURITY: only http(s) and same-site relative paths are accepted. A
 * "javascript:" or "data:" URL coming from JSON must never become a live link,
 * and protocol-relative "//host" is rejected because it silently points off-site.
 *
 * @param {unknown} value
 * @returns {string} Safe URL, or "" when the value must not be used.
 */
function safeHref(value) {
  if (typeof value !== "string") {
    return "";
  }

  const url = value.trim();

  if (!url) {
    return "";
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return "";
  }

  return url;
}

function isExternalUrl(url) {
  return /^https?:\/\//i.test(url);
}

/**
 * @param {unknown} value
 * @returns {string[]} Trimmed, non-empty strings; a single string becomes one
 *   entry. Accepts the array form because some source lists (highlights,
 *   responsibilities) are arrays rather than paragraphs.
 */
function normalizeTextList(value) {
  const raw = Array.isArray(value) ? value : [value];
  const output = [];

  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }

    const text = entry.trim();

    if (text) {
      output.push(text);
    }
  }

  return output;
}

/**
 * @param {unknown} rawType
 * @returns {{key: string, label: string}} `key` drives the token-based marker
 *   colour and is always a supported value; `label` keeps the supplied wording
 *   for an unrecognised type instead of discarding it.
 */
function normalizeEventType(rawType) {
  const text = typeof rawType === "string" ? rawType.trim().toLowerCase() : "";

  if (!text) {
    return { key: "other", label: "" };
  }

  if (Object.prototype.hasOwnProperty.call(EVENT_TYPE_LABELS, text)) {
    return { key: text, label: EVENT_TYPE_LABELS[text] };
  }

  return { key: "other", label: humanizeValue(text) };
}

/**
 * @param {unknown} rawImage
 * @returns {{src: string, alt: string}|null}
 */
function normalizeImage(rawImage) {
  if (typeof rawImage === "string") {
    const src = safeHref(rawImage);
    return src ? { src, alt: "" } : null;
  }

  if (rawImage && typeof rawImage === "object") {
    const src = safeHref(rawImage.src);
    return src ? { src, alt: typeof rawImage.alt === "string" ? rawImage.alt.trim() : "" } : null;
  }

  return null;
}

/**
 * Validates one event record into the shape the renderer uses.
 *
 * Presentation-level validation only: missing optional fields are dropped
 * rather than rendered as empty slots (contract "Data rules"), and an event
 * without a usable title is skipped because a timeline entry with no heading is
 * not meaningful.
 *
 * @param {Object} rawEvent
 * @param {number} index - Used to synthesise a stable id and a unique DOM id.
 * @returns {Object|null}
 */
function normalizeEvent(rawEvent, index) {
  if (!rawEvent || typeof rawEvent !== "object" || Array.isArray(rawEvent)) {
    reportError(`Event #${index} is not an object; skipped.`);
    return null;
  }

  const title = typeof rawEvent.title === "string" ? rawEvent.title.trim() : "";

  if (!title) {
    reportError(`Event #${index} has no title; skipped.`);
    return null;
  }

  // A missing id would silently merge two events for expandEvent(); synthesise
  // one from the position instead of dropping real content.
  const id =
    typeof rawEvent.id === "string" && rawEvent.id.trim()
      ? rawEvent.id.trim()
      : `timeline-auto-${index}`;

  const typeInfo = normalizeEventType(rawEvent.eventType);
  const badges = [];

  for (const badge of Array.isArray(rawEvent.badges) ? rawEvent.badges : []) {
    const text =
      typeof badge === "string"
        ? badge.trim()
        : badge && typeof badge === "object" && typeof badge.label === "string"
          ? badge.label.trim()
          : "";

    if (text) {
      badges.push(text);
    }
  }

  const actions = [];

  for (const action of Array.isArray(rawEvent.actions) ? rawEvent.actions : []) {
    if (!action || typeof action !== "object") {
      continue;
    }

    const label = typeof action.label === "string" ? action.label.trim() : "";

    if (!label) {
      continue;
    }

    actions.push({
      id: typeof action.id === "string" ? action.id.trim() : "",
      label,
      href: safeHref(action.href),
      actionType: typeof action.actionType === "string" ? action.actionType : ""
    });
  }

  return {
    id,
    title,
    description: normalizeTextList(rawEvent.description),
    details: normalizeTextList(rawEvent.details),
    typeKey: typeInfo.key,
    typeLabel: typeInfo.label,
    dateLabel: typeof rawEvent.dateLabel === "string" ? rawEvent.dateLabel.trim() : "",
    startDate: typeof rawEvent.startDate === "string" ? rawEvent.startDate.trim() : "",
    endDate: typeof rawEvent.endDate === "string" ? rawEvent.endDate.trim() : "",
    featured: rawEvent.featured === true,
    image: normalizeImage(rawEvent.image),
    badges,
    actions
  };
}

/**
 * Builds the date line from the supplied label, never from date arithmetic.
 *
 * When only structured dates exist they are shown as given; missing months or
 * days are never filled in (§8). The <time datetime> attribute is only set for
 * an ISO-shaped start date, so machine-readable precision matches the source.
 *
 * @param {Object} event - Normalised event.
 * @returns {HTMLParagraphElement|null}
 */
function createDateElement(event) {
  const label =
    event.dateLabel || [event.startDate, event.endDate].filter(Boolean).join(" \u2013 ");

  if (!label) {
    return null;
  }

  const paragraph = document.createElement("p");
  paragraph.className = "timeline__date";

  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(event.startDate)) {
    const time = document.createElement("time");
    time.setAttribute("datetime", event.startDate);
    time.textContent = label;
    paragraph.append(time);
  } else {
    paragraph.textContent = label;
  }

  return paragraph;
}

/**
 * @param {number|string} level
 * @param {string} className
 * @param {string} text
 * @returns {HTMLHeadingElement}
 */
function createHeading(level, className, text) {
  const numeric = Number(level);
  const safeLevel = Number.isFinite(numeric)
    ? Math.min(MAX_HEADING_LEVEL, Math.max(MIN_HEADING_LEVEL, Math.round(numeric)))
    : 3;
  const heading = document.createElement(`h${safeLevel}`);
  heading.className = className;
  heading.textContent = text;
  return heading;
}

/**
 * Renders one timeline event as a list item.
 *
 * @param {Object} event - Normalised event.
 * @param {Object} context
 * @param {number} context.headingLevel - Event title level (4 when grouped).
 * @param {boolean} context.showDates
 * @param {boolean} context.showBadges
 * @param {boolean} context.showImages
 * @param {boolean} context.allowExpandableDetails
 * @param {string} context.instanceId
 * @param {number} context.index
 * @param {Map} context.expandRefs - Collects the disclosure elements per id.
 * @returns {HTMLLIElement}
 */
function renderEvent(event, context) {
  const item = document.createElement("li");
  item.className = "timeline__event";
  item.dataset.eventType = event.typeKey;
  item.dataset.eventId = event.id;

  if (event.featured) {
    item.classList.add("timeline__event--featured");
  }

  // Decorative: the event heading and date already carry the information, so
  // the marker must not be announced twice.
  const marker = document.createElement("span");
  marker.className = "timeline__marker";
  marker.setAttribute("aria-hidden", "true");

  const content = document.createElement("article");
  content.className = "card timeline__content";

  const metadata = document.createElement("div");
  metadata.className = "timeline__metadata";

  if (context.showDates !== false) {
    const date = createDateElement(event);

    if (date) {
      metadata.append(date);
    }
  }

  if (event.typeLabel) {
    // Text label as well as the marker colour: categories stay distinguishable
    // without colour perception (§9).
    const type = document.createElement("span");
    type.className = "badge timeline__type";
    type.textContent = event.typeLabel;
    metadata.append(type);
  }

  if (metadata.childElementCount > 0) {
    content.append(metadata);
  }

  content.append(createHeading(context.headingLevel, "timeline__title", event.title));

  for (const paragraph of event.description) {
    const element = document.createElement("p");
    element.className = "timeline__description";
    element.textContent = paragraph;
    content.append(element);
  }

  if (context.showBadges !== false && event.badges.length > 0) {
    const list = document.createElement("ul");
    list.className = "timeline__badges";

    for (const label of event.badges) {
      const badge = document.createElement("li");
      badge.className = "badge timeline__badge";
      badge.textContent = label;
      list.append(badge);
    }

    content.append(list);
  }

  if (context.showImages !== false && event.image) {
    const image = document.createElement("img");
    image.className = "timeline__image";
    image.src = event.image.src;
    image.alt = event.image.alt;
    image.loading = "lazy";
    image.decoding = "async";
    // A broken image collapses to nothing rather than leaving an empty frame;
    // the error listener is delegated on the timeline root (see render()).
    content.append(image);
  }

  const detailsId = `${context.instanceId}-details-${context.index}`;
  const canExpand =
    context.allowExpandableDetails !== false && event.details.length > 0;

  if (canExpand) {
    const expand = document.createElement("button");
    expand.type = "button";
    expand.className = "timeline__expand";
    expand.dataset.timelineAction = "expand";
    expand.dataset.eventId = event.id;
    expand.setAttribute("aria-expanded", "false");
    expand.setAttribute("aria-controls", detailsId);
    expand.textContent = "Show details";

    const details = document.createElement("div");
    details.className = "timeline__details";
    details.id = detailsId;
    details.hidden = true;

    for (const paragraph of event.details) {
      const element = document.createElement("p");
      element.textContent = paragraph;
      details.append(element);
    }

    content.append(expand, details);
    context.expandRefs.set(event.id, { button: expand, panel: details });
  }

  const actionable = event.actions.filter(
    (action) =>
      // The disclosure above already covers "open details"; a second control
      // would toggle the same panel.
      action.actionType !== "open-details" &&
      (action.href || (typeof context.onAction === "function" && action.id))
  );

  if (actionable.length > 0) {
    const actions = document.createElement("div");
    actions.className = "timeline__actions";

    for (const action of actionable) {
      let control;

      if (action.href) {
        control = document.createElement("a");
        control.href = action.href;

        if (isExternalUrl(action.href)) {
          control.target = "_blank";
          control.rel = "noopener noreferrer";
        }
      } else {
        control = document.createElement("button");
        control.type = "button";
        control.dataset.timelineAction = "event";
        control.dataset.eventId = event.id;
        control.dataset.actionId = action.id;
      }

      control.className = "btn btn--ghost timeline__action";
      control.textContent = action.label;
      actions.append(control);
    }

    content.append(actions);
  }

  item.append(marker, content);
  return item;
}

/**
 * @param {Array<Object>} events - Normalised events.
 * @param {Object} context
 * @returns {HTMLOListElement}
 */
function createList(events, context) {
  const list = document.createElement("ol");
  list.className = "timeline__list";

  events.forEach((event, offset) => {
    // The index keeps DOM ids unique across grouped and flat renderings of the
    // same collection.
    const item = renderEvent(event, { ...context, index: context.offset + offset });
    list.append(item);
  });

  return list;
}

export function initializeTimelineItem(container, options = {}) {
  const settings = options && typeof options === "object" ? options : {};

  if (typeof Element === "undefined" || !(container instanceof Element)) {
    reportError("initializeTimelineItem needs a DOM element; nothing was rendered.");
    return {
      element: null,
      updateEvents() {},
      setLayout() {},
      expandEvent() {},
      collapseEvent() {},
      destroy() {}
    };
  }

  const instanceId = `tl${++instanceCounter}`;
  let layout = SUPPORTED_LAYOUTS.includes(settings.layout) ? settings.layout : "vertical";
  let events = Array.isArray(settings.events) ? settings.events : [];
  // Group headings are supplied by the consuming section; the component never
  // derives a year from a date.
  let groupSpecs = Array.isArray(settings.groups) ? settings.groups : [];

  const expandRefs = new Map();
  const eventIndex = new Map();
  let root = null;

  function handleExpandClick(event) {
    const trigger = event.target;

    if (!trigger || typeof trigger.closest !== "function") {
      return;
    }

    const control = trigger.closest("[data-timeline-action]");

    if (!control || !root?.contains(control)) {
      return;
    }

    const eventId = control.dataset.eventId;

    if (control.dataset.timelineAction === "expand") {
      const refs = expandRefs.get(eventId);

      if (!refs) {
        return;
      }

      const expanded = control.getAttribute("aria-expanded") === "true";
      control.setAttribute("aria-expanded", String(!expanded));
      refs.panel.hidden = expanded;
      control.textContent = expanded ? "Show details" : "Hide details";
      return;
    }

    if (control.dataset.timelineAction === "event") {
      const record = eventIndex.get(eventId);
      const action = record?.actions.find((entry) => entry.id === control.dataset.actionId);

      // Only ids that resolve to an action the section actually supplied are
      // forwarded; nothing is looked up by name or evaluated (§24).
      if (action && typeof settings.onEventAction === "function") {
        settings.onEventAction(action, record);
      }
    }
  }

  function handleImageError(event) {
    const image = event.target;

    if (image && image.tagName === "IMG" && image.classList.contains("timeline__image")) {
      image.classList.add("timeline__image--failed");
      image.removeAttribute("src");
    }
  }

  /**
   * Validates the raw collection and keeps only events that can be rendered.
   *
   * @param {Array<Object>} rawEvents
   * @returns {Array<Object>} Normalised events in the supplied order.
   */
  function prepareEvents(rawEvents) {
    if (!Array.isArray(rawEvents)) {
      reportError("Event collection is not an array; nothing was rendered.");
      return [];
    }

    const prepared = [];
    const seenIds = new Set();

    rawEvents.forEach((rawEvent, index) => {
      const event = normalizeEvent(rawEvent, index);

      if (!event) {
        return;
      }

      if (seenIds.has(event.id)) {
        reportError(`Duplicate event id "${event.id}"; the later event was skipped.`);
        return;
      }

      seenIds.add(event.id);
      prepared.push(event);
    });

    return prepared;
  }

  function render() {
    if (root) {
      root.removeEventListener("click", handleExpandClick);
      root.removeEventListener("error", handleImageError, true);
      root.remove();
    }

    container.textContent = "";
    expandRefs.clear();
    eventIndex.clear();

    const prepared = prepareEvents(events);

    if (prepared.length === 0) {
      // The section owns the empty state; rendering an empty rail here would
      // leave a stray line on the page.
      root = null;
      return;
    }

    root = document.createElement("div");
    root.className = `timeline timeline--${layout === "grouped" ? "vertical" : layout}`;
    root.dataset.timeline = "";

    const context = {
      headingLevel: 3,
      showDates: settings.showDates !== false,
      showBadges: settings.showBadges !== false,
      showImages: settings.showImages !== false,
      allowExpandableDetails: settings.allowExpandableDetails !== false,
      instanceId,
      expandRefs,
      onAction: settings.onEventAction,
      offset: 0
    };

    if (layout === "grouped") {
      root.classList.add("timeline--grouped");

      const groups = collectGroups(prepared, groupSpecs);

      if (groups.length === 0) {
        reportError("Grouped layout needs group headings; nothing was rendered.");
        root = null;
        return;
      }

      let offset = 0;

      for (const group of groups) {
        const section = document.createElement("section");
        section.className = "timeline__group";

        if (group.label) {
          section.append(createHeading(3, "timeline__group-heading", group.label));
        }

        section.append(createList(group.events, { ...context, headingLevel: 4, offset }));
        offset += group.events.length;
        root.append(section);
      }
    } else {
      // Flat rendering: index the prepared events so an event action can be
      // resolved back to the record the section supplied.
      for (const event of prepared) {
        eventIndex.set(event.id, event);
      }

      root.append(createList(prepared, context));
    }

    root.addEventListener("click", handleExpandClick);
    // "error" does not bubble, so the listener runs in the capture phase to
    // catch a failed <img> anywhere inside the timeline.
    root.addEventListener("error", handleImageError, true);
    container.append(root);
  }

  /**
   * Groups prepared events.
   *
   * Supplied groups win. Otherwise consecutive events sharing a `group` label
   * are kept together in the order given: that label is source data, so this
   * preserves it rather than inferring a period from a date.
   *
   * @param {Array<Object>} prepared
   * @param {Array<Object>} supplied
   * @returns {Array<{label: string, events: Array<Object>}>}
   */
  function collectGroups(prepared, supplied) {
    if (supplied.length > 0) {
      const groups = [];

      for (const group of supplied) {
        if (!group || typeof group !== "object") {
          continue;
        }

        const label = typeof group.label === "string" ? group.label.trim() : "";
        const rawEvents = Array.isArray(group.events) ? group.events : [];
        const groupEvents = prepareEvents(rawEvents);

        if (groupEvents.length === 0) {
          continue;
        }

        for (const event of groupEvents) {
          eventIndex.set(event.id, event);
        }

        groups.push({ label, events: groupEvents });
      }

      return groups;
    }

    const groups = [];

    for (const event of prepared) {
      const label = typeof event.group === "string" ? event.group.trim() : "";
      const last = groups[groups.length - 1];

      if (!last || last.label !== label) {
        groups.push({ label, events: [event] });
      } else {
        last.events.push(event);
      }
    }

    return groups;
  }

  render();

  return {
    /**
     * Replaces the displayed collection. Expanded details collapse because the
     * DOM nodes they belonged to are gone.
     *
     * @param {Array<Object>} nextEvents
     */
    updateEvents(nextEvents) {
      events = Array.isArray(nextEvents) ? nextEvents : [];
      render();
    },

    /**
     * @param {"vertical"|"horizontal"|"compact"|"grouped"} nextLayout
     */
    setLayout(nextLayout) {
      if (!SUPPORTED_LAYOUTS.includes(nextLayout)) {
        reportError(`Unsupported layout "${nextLayout}"; keeping "${layout}".`);
        return;
      }

      layout = nextLayout;
      render();
    },

    expandEvent(eventId) {
      const refs = expandRefs.get(eventId);

      if (!refs) {
        return;
      }

      refs.panel.hidden = false;
      refs.button.setAttribute("aria-expanded", "true");
      refs.button.textContent = "Hide details";
    },

    collapseEvent(eventId) {
      const refs = expandRefs.get(eventId);

      if (!refs) {
        return;
      }

      refs.panel.hidden = true;
      refs.button.setAttribute("aria-expanded", "false");
      refs.button.textContent = "Show details";
    },

    destroy() {
      if (root) {
        root.removeEventListener("click", handleExpandClick);
        root.removeEventListener("error", handleImageError, true);
        root.remove();
      }

      expandRefs.clear();
      eventIndex.clear();
      container.textContent = "";
      root = null;
    }
  };
}

/**
 * Renders a single event without the surrounding list.
 *
 * Sections that already own their <ol> (or want one event inside another
 * component) use this; the same validation, sanitising and type treatment apply
 * as in initializeTimelineItem().
 *
 * @param {Object} rawEvent
 * @param {Object} [options]
 * @param {number} [options.headingLevel] - Default 3.
 * @param {boolean} [options.showDates] - Default true.
 * @param {boolean} [options.showBadges] - Default true.
 * @param {boolean} [options.showImages] - Default true.
 * @param {boolean} [options.allowExpandableDetails] - Default true.
 * @param {(action: Object, event: Object) => void} [options.onEventAction]
 * @param {string} [options.idPrefix] - Keeps detail ids unique on the page.
 * @returns {HTMLLIElement|null}
 */
export function createTimelineItem(rawEvent, options = {}) {
  const settings = options && typeof options === "object" ? options : {};

  if (typeof document === "undefined") {
    reportError("createTimelineItem needs a DOM document.");
    return null;
  }

  const event = normalizeEvent(rawEvent, 0);

  if (!event) {
    return null;
  }

  const expandRefs = new Map();
  const prefix =
    typeof settings.idPrefix === "string" && settings.idPrefix.trim()
      ? settings.idPrefix.trim().replace(/[^a-zA-Z0-9_-]+/g, "-")
      : `tl${++instanceCounter}`;

  const item = renderEvent(event, {
    headingLevel: settings.headingLevel ?? 3,
    showDates: settings.showDates !== false,
    showBadges: settings.showBadges !== false,
    showImages: settings.showImages !== false,
    allowExpandableDetails: settings.allowExpandableDetails !== false,
    instanceId: prefix,
    index: 0,
    expandRefs,
    onAction: settings.onEventAction
  });

  // Wire the disclosure locally: this item is not owned by an initializer, so
  // no delegated listener from a timeline root would reach it.
  const refs = expandRefs.get(event.id);

  if (refs) {
    refs.button.addEventListener("click", () => {
      const expanded = refs.button.getAttribute("aria-expanded") === "true";
      refs.button.setAttribute("aria-expanded", String(!expanded));
      refs.panel.hidden = expanded;
      refs.button.textContent = expanded ? "Show details" : "Hide details";
    });
  }

  return item;
}
