/**
 * Shared Badge component — js/components/badge.js
 *
 * OWNS
 *   - Badge markup construction: a non-interactive <span> for informational
 *     labels, a native <button> for filter/selection badges.
 *   - Variant / size class mapping, optional icon slot, optional count node and
 *     badge group (<div class="badge-list">) construction.
 *   - The presentation helpers setBadgeVariant / setBadgeLabel / setBadgeCount.
 *
 * MUST NOT OWN
 *   - Status interpretation. Deciding that a record is "Completed" or
 *     "Verified" belongs to the section that owns the data; a badge only
 *     renders the label it was given (BADGE_COMPONENT.md § 11).
 *   - Filtering, searching, sorting or any other state change. An interactive
 *     badge receives its handler from the consuming section and calls it; the
 *     component never reads or writes filter state.
 *   - Appearance values: colours, radius, spacing and motion come from
 *     css/variables.css via css/components/badges.css.
 *
 * Spec: Prompt/components/BADGE_COMPONENT.md.
 * Contract: .build/CONTRACT.md (§ "Security and accessibility").
 *
 * SECURITY:
 *   Labels, icon glyphs and count labels are written with textContent only, so
 *   an imported tag such as `<script>` is displayed as text and never executed.
 *   Variant and size values are validated against a fixed list, which also
 *   blocks CSS class injection through JSON.
 */

/** Variants defined by the shared stylesheet. */
export const BADGE_VARIANTS = Object.freeze([
    "neutral",
    "primary",
    "success",
    "warning",
    "danger",
    "info",
    "outline"
]);

/** Sizes defined by the shared stylesheet. */
export const BADGE_SIZES = Object.freeze(["small", "medium", "large"]);

/**
 * Unclassified labels (technology tags, categories) fall back to "outline":
 * the lightest variant, so a wrong value never implies a status meaning the
 * data does not support.
 */
const DEFAULT_VARIANT = "outline";
const DEFAULT_SIZE = "medium";

/** Upper bound for a displayed count; larger values are more likely corruption. */
const MAX_COUNT = 999999;

const warnedMessages = new Set();

function warnOnce(message) {
    if (!warnedMessages.has(message)) {
        warnedMessages.add(message);
        console.warn(message);
    }
}

function normalizeVariant(variant) {
    if (BADGE_VARIANTS.includes(variant)) {
        return variant;
    }

    if (variant !== undefined && variant !== null) {
        warnOnce(`Badge: unknown variant "${String(variant)}"; using "${DEFAULT_VARIANT}".`);
    }

    return DEFAULT_VARIANT;
}

function normalizeSize(size) {
    if (BADGE_SIZES.includes(size)) {
        return size;
    }

    if (size !== undefined && size !== null) {
        warnOnce(`Badge: unknown size "${String(size)}"; using "${DEFAULT_SIZE}".`);
    }

    return DEFAULT_SIZE;
}

function appendExtraClasses(classNames, className) {
    if (typeof className !== "string") {
        return classNames;
    }

    className
        .split(/\s+/)
        .filter((token) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(token))
        .forEach((token) => classNames.push(token));

    return classNames;
}

function normalizeCount(count) {
    if (count === undefined || count === null) {
        return null;
    }

    const numeric = Number(count);

    if (!Number.isInteger(numeric) || numeric < 0 || numeric > MAX_COUNT) {
        warnOnce(`Badge: count "${String(count)}" is not a valid non-negative integer; count hidden.`);
        return null;
    }

    return numeric;
}

/**
 * Builds the optional count node.
 *
 * The visible number is preceded by a visually hidden word supplied by the
 * section ("results", "bookmarks"), because a bare "3" next to a label is
 * ambiguous when read aloud. Without that word the number is still announced
 * after the label, which is the best this component can do alone.
 */
function createCountNode(count, countLabel) {
    const numeric = normalizeCount(count);

    if (numeric === null) {
        return null;
    }

    const countNode = document.createElement("span");
    countNode.className = "badge__count";

    const accessibleLabel = typeof countLabel === "string" ? countLabel.trim() : "";

    if (accessibleLabel) {
        const hidden = document.createElement("span");
        hidden.className = "visually-hidden"; // utility from css/main.css
        hidden.textContent = `${accessibleLabel} `;
        countNode.append(hidden);
    }

    countNode.append(document.createTextNode(String(numeric)));

    return countNode;
}

/**
 * Creates a badge.
 *
 * A static badge is a <span>. Passing `interactive: true` *and* an onClick
 * handler produces a real <button aria-pressed> — the spec allows that only
 * when the badge performs a real filter or selection action, so an interactive
 * request without a handler degrades to a plain label instead of a fake
 * control (BADGE_COMPONENT.md § 16, § 23).
 *
 * @param {Object} options
 * @param {string} options.label Short label text. Required.
 * @param {"neutral"|"primary"|"success"|"warning"|"danger"|"info"|"outline"} [options.variant]
 * @param {"small"|"medium"|"large"} [options.size]
 * @param {string|Node} [options.icon] Decorative glyph text or trusted node.
 * @param {number} [options.count] Optional non-negative integer count.
 * @param {string} [options.countLabel] Hidden noun for the count ("results").
 * @param {boolean} [options.interactive] Render a button instead of a span.
 * @param {boolean} [options.pressed] Initial aria-pressed state.
 * @param {(event: MouseEvent) => void} [options.onClick] Trusted filter handler.
 * @param {string} [options.title] Native tooltip text.
 * @param {string} [options.ariaLabel] Overrides the accessible name.
 * @param {string} [options.id]
 * @param {string} [options.className] Extra layout classes for the consumer.
 * @returns {HTMLElement} <span> or <button>.
 * @throws {TypeError} When the label is missing or empty.
 */
export function createBadge(options = {}) {
    if (!options || typeof options !== "object") {
        throw new TypeError("createBadge(options): options must be an object.");
    }

    const label = typeof options.label === "string" ? options.label.trim() : "";

    if (!label) {
        throw new TypeError("Badge: a non-empty label is required; refusing to render an empty badge.");
    }

    const wantsInteraction = options.interactive === true;
    const hasHandler = typeof options.onClick === "function";
    const isInteractive = wantsInteraction && hasHandler;

    if (wantsInteraction && !hasHandler) {
        warnOnce("Badge: interactive badge without an action rendered as a static label.");
    }

    const element = document.createElement(isInteractive ? "button" : "span");
    const classNames = [
        "badge",
        `badge--${normalizeVariant(options.variant)}`,
        `badge--${normalizeSize(options.size)}`
    ];

    if (isInteractive) {
        classNames.push("badge--interactive");
        element.type = "button";
        element.setAttribute("aria-pressed", String(options.pressed === true));
    }

    element.className = appendExtraClasses(classNames, options.className).join(" ");

    if (options.id) {
        element.id = String(options.id);
    }

    if (options.title) {
        element.title = String(options.title);
    }

    if (typeof options.ariaLabel === "string" && options.ariaLabel.trim()) {
        element.setAttribute("aria-label", options.ariaLabel.trim());
    }

    if (options.icon) {
        const icon = document.createElement("span");
        icon.className = "badge__icon";
        icon.setAttribute("aria-hidden", "true");

        if (typeof options.icon === "string") {
            icon.textContent = options.icon;
        } else if (options.icon instanceof Node) {
            icon.append(options.icon);
        } else {
            warnOnce("Badge: icon must be a string glyph or a DOM node; icon ignored.");
        }

        // Only append when something actually landed in the slot.
        if (icon.firstChild) {
            element.append(icon);
        }
    }

    const labelNode = document.createElement("span");
    labelNode.className = "badge__label";
    labelNode.textContent = label;
    element.append(labelNode);

    const countNode = createCountNode(options.count, options.countLabel);

    if (countNode) {
        element.append(countNode);
    }

    if (isInteractive) {
        element.addEventListener("click", options.onClick);
    }

    return element;
}

/**
 * Creates a wrapping group of badges.
 *
 * The group is a plain div (not a list) because these labels are descriptive
 * metadata, not a sequence of items; `aria-label` on the group gives the set a
 * name such as "Project technologies". Invalid entries are skipped so one bad
 * record cannot empty the group.
 *
 * @param {Object} options
 * @param {Array<string|Object>} options.items Strings or createBadge options.
 * @param {string} [options.variant] Default variant for string items.
 * @param {"small"|"medium"|"large"} [options.size] Default size.
 * @param {string} [options.ariaLabel] Accessible name for the group.
 * @param {string} [options.className]
 * @returns {HTMLDivElement|null} Null when nothing valid was supplied.
 */
export function createBadgeList(options = {}) {
    const items = Array.isArray(options.items) ? options.items : [];

    if (items.length === 0) {
        return null;
    }

    // Only the shared defaults are forwarded; the group's own ariaLabel and
    // className must not leak onto every badge inside it.
    const badgeDefaults = { variant: options.variant, size: options.size };

    const list = document.createElement("div");
    const classNames = ["badge-list"];

    // The Card component adds its own spacing hook through className, so the
    // group stays a single shared class rather than a section-specific one.
    list.className = appendExtraClasses(classNames, options.className).join(" ");

    if (typeof options.ariaLabel === "string" && options.ariaLabel.trim()) {
        list.setAttribute("aria-label", options.ariaLabel.trim());
    }

    let rendered = 0;

    items.forEach((item) => {
        try {
            const badge =
                typeof item === "string"
                    ? createBadge({ ...badgeDefaults, label: item })
                    : createBadge({ ...badgeDefaults, ...item });

            list.append(badge);
            rendered += 1;
        } catch (error) {
            // One malformed tag must not remove the rest of the group.
            warnOnce(`Badge: item skipped — ${error.message}`);
        }
    });

    return rendered > 0 ? list : null;
}

/**
 * Swaps a badge's variant class in place.
 *
 * Only known variant classes are removed, so consumer layout classes survive.
 * Returns the badge so a caller can chain.
 *
 * @param {HTMLElement} badge
 * @param {string} variant
 * @returns {HTMLElement}
 */
export function setBadgeVariant(badge, variant) {
    if (!badge || typeof badge.classList?.add !== "function") {
        throw new TypeError("setBadgeVariant expects a DOM element.");
    }

    badge.classList.remove(...BADGE_VARIANTS.map((name) => `badge--${name}`));
    badge.classList.add(`badge--${normalizeVariant(variant)}`);

    return badge;
}

/**
 * Replaces a badge's visible label text.
 *
 * Creates the label node when a hand-written badge does not have one, so the
 * component works on markup it did not build. The value is written with
 * textContent — imported text stays text.
 *
 * @param {HTMLElement} badge
 * @param {string} label
 * @returns {HTMLElement}
 */
export function setBadgeLabel(badge, label) {
    if (!badge || typeof badge.querySelector !== "function") {
        throw new TypeError("setBadgeLabel expects a DOM element.");
    }

    const text = typeof label === "string" ? label.trim() : "";

    if (!text) {
        throw new TypeError("Badge: setBadgeLabel requires a non-empty label.");
    }

    let labelNode = badge.querySelector(".badge__label");

    if (!labelNode) {
        labelNode = document.createElement("span");
        labelNode.className = "badge__label";
        badge.append(labelNode);
    }

    labelNode.textContent = text;

    return badge;
}

/**
 * Sets or removes a badge's count.
 *
 * `null`/`undefined` removes the count entirely (no "0" stand-in, per
 * BADGE_COMPONENT.md § 14); an invalid number is treated as corruption and also
 * removed, after a single console warning. A valid count on a badge that has
 * none yet is appended after the label.
 *
 * @param {HTMLElement} badge
 * @param {number|null|undefined} count
 * @returns {HTMLElement}
 */
export function setBadgeCount(badge, count) {
    if (!badge || typeof badge.querySelector !== "function") {
        throw new TypeError("setBadgeCount expects a DOM element.");
    }

    const existing = badge.querySelector(".badge__count");
    const numeric = normalizeCount(count);

    if (numeric === null) {
        existing?.remove();
        return badge;
    }

    if (existing) {
        // Preserve the visually hidden noun if the badge already had one.
        const hidden = existing.querySelector(".visually-hidden");
        existing.replaceChildren();

        if (hidden) {
            existing.append(hidden);
        }

        existing.append(document.createTextNode(String(numeric)));
        return badge;
    }

    badge.append(createCountNode(numeric));

    return badge;
}
