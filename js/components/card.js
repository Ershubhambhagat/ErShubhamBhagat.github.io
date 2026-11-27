/**
 * Shared Card component — js/components/card.js
 *
 * OWNS
 *   - Card markup construction: the shared shell (<article class="card">), the
 *     optional media / header / body / meta / badge / footer areas, and the
 *     rule that an absent area leaves no empty container behind.
 *   - The interactive shell: when a card navigates, the title becomes the
 *     anchor and an invisible overlay makes the whole surface clickable; when
 *     it performs an action the section supplies a button instead (see below).
 *   - Low-level presentation helpers: updateCardContent, setCardLoading,
 *     setCardSelected, createCardSkeleton.
 *
 * MUST NOT OWN
 *   - Records, filtering, sorting, search, deletion or any other section rule.
 *     This module never fetches, never reads storage and never emits events.
 *   - Button, badge or dialog appearance/behaviour. Buttons are built with
 *     js/components/button.js, badges with js/components/badge.js, dialogs with
 *     js/core/modal-manager.js.
 *   - Page grid arrangement. Sections decide their own grid; the shared
 *     `.card-grid` class in css/components/cards.css is opt-in.
 *   - Appearance values: colours, radius, spacing, shadows and motion come from
 *     css/variables.css via css/components/cards.css.
 *
 * Spec: Prompt/components/CARD_COMPONENT.md.
 * Contract: .build/CONTRACT.md (§ "Optional fields are hidden completely when
 * absent — never an empty label, empty badge, empty button or reserved blank
 * space", § "Security and accessibility").
 *
 * SECURITY:
 *   Every text value (title, subtitle, description, category, metadata, alt)
 *   is written with textContent; no imported string is parsed as HTML. Image
 *   sources and navigation targets are validated by toSafeHref in button.js, so
 *   javascript:/data: URLs are dropped before an element exists. Click
 *   behaviour is only ever a function reference supplied by trusted code.
 *
 * STRUCTURE DECISION — why the card root is always a non-interactive <article>:
 *   BUTTON_COMPONENT.md / CARD_COMPONENT.md forbid interactive elements inside
 *   interactive elements. A whole-card <button> or <a> that also holds action
 *   buttons would nest them, and a <button> may not legally contain the card's
 *   block structure at all. The card therefore stays a container and the title
 *   becomes the single link or button, extended over the whole card by CSS
 *   (.card__link::after). Footer actions sit above that overlay, so multiple
 *   independent actions remain legal and keyboard-reachable.
 */

import { createBadge } from "./badge.js";
import { createButton, createButtonLink, toSafeHref } from "./button.js";

/** Variants defined by the shared stylesheet. */
export const CARD_VARIANTS = Object.freeze([
    "standard",
    "elevated",
    "featured",
    "compact",
    "horizontal"
]);

/** Variant used when a section passes an unknown or missing value. */
const DEFAULT_VARIANT = "standard";

/** Optional media shape classes; anything else keeps the default 16/10 ratio. */
const MEDIA_RATIOS = Object.freeze({
    wide: "card__media--wide",
    square: "card__media--square",
    portrait: "card__media--portrait"
});

const warnedMessages = new Set();

function warnOnce(message) {
    if (!warnedMessages.has(message)) {
        warnedMessages.add(message);
        console.warn(message);
    }
}

function normalizeVariant(variant) {
    if (CARD_VARIANTS.includes(variant)) {
        return variant;
    }

    if (variant !== undefined && variant !== null) {
        warnOnce(`Card: unknown variant "${String(variant)}"; using "${DEFAULT_VARIANT}".`);
    }

    return DEFAULT_VARIANT;
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

/**
 * Maps headingLevel to a real heading tag.
 *
 * 0 or null means "this card is not a heading" and yields a <span>, which is
 * how a consumer avoids breaking the section's heading hierarchy. Values are
 * clamped to 2..6 because an <h1> belongs to the page, not to a repeated card.
 */
function resolveHeadingTag(level) {
    if (level === 0 || level === null) {
        return "span";
    }

    const numeric = Number(level);

    if (!Number.isInteger(numeric) || numeric < 2 || numeric > 6) {
        if (level !== undefined) {
            warnOnce(`Card: headingLevel "${String(level)}" is outside 2-6; using 3.`);
        }

        return "h3";
    }

    return `h${numeric}`;
}

/**
 * Builds the media area, or returns null when there is nothing usable.
 *
 * Returning null is what keeps a card without an image free of a reserved blank
 * block. A broken URL replaces the <img> with a neutral, aria-hidden fallback
 * once; the error listener is `once` and the image is removed, so a failing URL
 * cannot loop.
 */
function createMedia(image) {
    if (!image || typeof image !== "object") {
        return null;
    }

    const src = toSafeHref(image.src);

    if (!src) {
        if (image.src) {
            warnOnce("Card: image src rejected by the URL allow-list; media omitted.");
        }

        return null;
    }

    const wrapper = document.createElement("div");
    wrapper.className = appendExtraClasses(
        ["card__media"],
        MEDIA_RATIOS[image.ratio]
    ).join(" ");

    if (image.fit === "contain") {
        // Logos and screenshots must not be cropped like photos.
        wrapper.classList.add("card__media--contain");
    }

    const img = document.createElement("img");
    img.className = "card__image";
    img.src = src;
    // An empty alt is correct for a decorative image; a missing alt would make
    // assistive technology read the file name instead.
    img.alt = typeof image.alt === "string" ? image.alt : "";
    img.loading = image.eager ? "eager" : "lazy";
    img.decoding = "async";

    const width = Number(image.width);
    const height = Number(image.height);

    // Preserving intrinsic dimensions is what stops the grid from shifting
    // while images load.
    if (Number.isFinite(width) && width > 0) {
        img.width = width;
    }

    if (Number.isFinite(height) && height > 0) {
        img.height = height;
    }

    img.addEventListener(
        "error",
        () => {
            const fallback = document.createElement("div");
            fallback.className = "card__media-fallback";
            fallback.setAttribute("aria-hidden", "true");
            wrapper.replaceChildren(fallback);
        },
        { once: true }
    );

    wrapper.append(img);

    return wrapper;
}

/** Category eyebrow. Returns null when absent so no empty header is rendered. */
function createHeader(category) {
    const text = typeof category === "string" ? category.trim() : "";

    if (!text) {
        return null;
    }

    const header = document.createElement("div");
    header.className = "card__header";

    const label = document.createElement("span");
    label.className = "card__category";
    label.textContent = text;

    header.append(label);

    return header;
}

/**
 * Normalises metadata into displayable pairs.
 *
 * Accepts "Free text" strings and {label, value} objects; entries without a
 * value are dropped rather than rendered as an empty row.
 */
function normalizeMetaEntries(meta) {
    if (!Array.isArray(meta)) {
        return [];
    }

    return meta
        .map((entry) => {
            if (typeof entry === "string") {
                return { label: "", value: entry.trim() };
            }

            if (!entry || typeof entry !== "object") {
                return null;
            }

            const value = typeof entry.value === "string" ? entry.value.trim() : "";
            const label = typeof entry.label === "string" ? entry.label.trim() : "";

            return value ? { label, value } : null;
        })
        .filter(Boolean);
}

function createMeta(meta) {
    const entries = normalizeMetaEntries(meta);

    if (entries.length === 0) {
        return null;
    }

    const list = document.createElement("dl");
    list.className = "card__meta";

    entries.forEach(({ label, value }) => {
        const row = document.createElement("div");
        row.className = "card__meta-row";

        if (label) {
            const term = document.createElement("dt");
            term.className = "card__meta-label";
            term.textContent = label;
            row.append(term);
        }

        const detail = document.createElement("dd");
        detail.className = "card__meta-value";
        detail.textContent = value;
        row.append(detail);

        list.append(row);
    });

    return list;
}

/** Builds one badge, skipping (not crashing on) an invalid record. */
function createBadgeNode(badge, defaults) {
    try {
        if (typeof badge === "string") {
            return createBadge({ ...defaults, label: badge });
        }

        if (!badge || typeof badge !== "object") {
            return null;
        }

        return createBadge({ ...defaults, ...badge });
    } catch (error) {
        warnOnce(`Card: badge skipped — ${error.message}`);
        return null;
    }
}

function createBadgeList(badges, defaults) {
    if (!Array.isArray(badges) || badges.length === 0) {
        return null;
    }

    const group = document.createElement("div");
    // Reuses the shared badge-list layout; card__badges only adds the card's
    // vertical rhythm.
    group.className = "badge-list card__badges";

    let rendered = 0;

    badges.forEach((badge) => {
        const node = createBadgeNode(badge, defaults);

        if (node) {
            group.append(node);
            rendered += 1;
        }
    });

    return rendered > 0 ? group : null;
}

/**
 * Builds one footer action.
 *
 * Accepts a ready-made node (the consumer keeps full control) or an options
 * object delegated to the Button component. A malformed action is skipped so a
 * single bad record cannot remove the card or the footer.
 */
function createActionNode(action, defaultSize) {
    if (action instanceof Node) {
        return action;
    }

    if (!action || typeof action !== "object") {
        return null;
    }

    const options = { size: defaultSize, ...action };

    try {
        return action.href
            ? createButtonLink(options)
            : createButton(options);
    } catch (error) {
        warnOnce(`Card: action skipped — ${error.message}`);
        return null;
    }
}

function createFooter(actions, footerContent, defaultSize) {
    const footer = document.createElement("div");
    footer.className = "card__footer";

    if (Array.isArray(actions) && actions.length > 0) {
        const group = document.createElement("div");
        group.className = "card__actions";

        actions.forEach((action) => {
            const node = createActionNode(action, defaultSize);

            if (node) {
                group.append(node);
            }
        });

        if (group.childElementCount > 0) {
            footer.append(group);
        }
    }

    if (footerContent instanceof Node) {
        footer.append(footerContent);
    }

    return footer.childElementCount > 0 ? footer : null;
}

/**
 * Creates a card.
 *
 * @param {Object} options
 * @param {string} options.title Required, non-empty. Also the link/button name
 *        when the card is interactive.
 * @param {"standard"|"elevated"|"featured"|"compact"|"horizontal"} [options.variant]
 * @param {string} [options.subtitle]
 * @param {string} [options.description]
 * @param {string} [options.category] Eyebrow label above the title.
 * @param {2|3|4|5|6|0} [options.headingLevel] Defaults to 3; 0 renders a span.
 * @param {{src: string, alt?: string, ratio?: "wide"|"square"|"portrait", fit?: "cover"|"contain", width?: number, height?: number, eager?: boolean}} [options.image]
 * @param {Array<string|{label: string, variant?: string, size?: string}>} [options.badges]
 * @param {Array<string|{label?: string, value: string}>} [options.meta]
 * @param {Array<Node|Object>} [options.actions] Button options or ready nodes.
 * @param {Node} [options.footer] Extra non-interactive footer content.
 * @param {string} [options.href] Makes the card navigate; validated.
 * @param {() => void} [options.onClick] Makes the card perform one action.
 * @param {string} [options.ariaLabel] Accessible name for the card link.
 * @param {string} [options.id]
 * @param {string} [options.className] Extra layout classes for the consumer.
 * @returns {HTMLElement} The <article class="card"> root.
 * @throws {TypeError} When the title is missing or empty.
 */
export function createCard(options = {}) {
    if (!options || typeof options !== "object") {
        throw new TypeError("createCard(options): options must be an object.");
    }

    const title = typeof options.title === "string" ? options.title.trim() : "";

    if (!title) {
        throw new TypeError("Card: a non-empty title is required.");
    }

    const variant = normalizeVariant(options.variant);
    const href = options.href ? toSafeHref(options.href) : null;
    const hasAction = typeof options.onClick === "function";

    if (options.href && !href) {
        warnOnce("Card: href rejected by the URL allow-list; rendering a non-interactive card.");
    }

    const root = document.createElement("article");
    root.className = appendExtraClasses(
        ["card", `card--${variant}`],
        options.className
    ).join(" ");

    if (href || hasAction) {
        root.classList.add("card--interactive", "card--stretched");
    }

    if (options.id) {
        root.id = String(options.id);
    }

    root.append(...[
        createMedia(options.image),
        createHeader(options.category)
    ].filter(Boolean));

    const body = document.createElement("div");
    body.className = "card__body";

    const headingTag = variant === "compact" ? "span" : resolveHeadingTag(options.headingLevel);
    const titleNode = document.createElement(headingTag);
    titleNode.className = "card__title";
    titleNode.textContent = title;

    if (href || hasAction) {
        // The title is the single interactive element; CSS stretches its hit
        // area over the card. A heading inside an <a> is valid HTML and keeps
        // the section's outline intact.
        const control = href ? document.createElement("a") : document.createElement("button");
        control.className = "card__link";

        if (href) {
            control.href = href;

            if (/^https?:/i.test(href) && new URL(href).origin !== (globalThis.location?.origin ?? "")) {
                control.target = "_blank";
                control.rel = "noopener noreferrer";
            }
        } else {
            control.type = "button";
            control.addEventListener("click", options.onClick);
        }

        if (typeof options.ariaLabel === "string" && options.ariaLabel.trim()) {
            control.setAttribute("aria-label", options.ariaLabel.trim());
        }

        control.append(titleNode);
        body.append(control);
    } else {
        body.append(titleNode);
    }

    const subtitle = typeof options.subtitle === "string" ? options.subtitle.trim() : "";

    if (subtitle) {
        const subtitleNode = document.createElement("p");
        subtitleNode.className = "card__subtitle";
        subtitleNode.textContent = subtitle;
        body.append(subtitleNode);
    }

    const description =
        typeof options.description === "string" ? options.description.trim() : "";

    if (description) {
        const descriptionNode = document.createElement("p");
        descriptionNode.className = "card__description";
        descriptionNode.textContent = description;
        body.append(descriptionNode);
    }

    root.append(body);

    // Technology/category tags default to the lightest shared treatment: an
    // outline badge at the compact size.
    root.append(
        ...[
            createMeta(options.meta),
            createBadgeList(options.badges, { variant: "outline", size: "small" }),
            createFooter(options.actions, options.footer, variant === "compact" ? "small" : "medium")
        ].filter(Boolean)
    );

    return root;
}

/**
 * Updates the text and image fields an existing card already shows.
 *
 * Structural changes (adding a media area, a badge group or a footer that the
 * card was not built with) require rebuilding the card: silently inserting new
 * blocks would put content in an order the consumer did not choose. Pass an
 * empty string to clear a field the card already has.
 *
 * @param {HTMLElement} card Root returned by createCard.
 * @param {{title?: string, subtitle?: string, description?: string, category?: string, image?: {src: string, alt?: string}}} content
 * @returns {HTMLElement} The same card, for chaining.
 */
export function updateCardContent(card, content = {}) {
    if (!card || typeof card.querySelector !== "function") {
        throw new TypeError("updateCardContent expects a card element.");
    }

    if (!content || typeof content !== "object") {
        return card;
    }

    const fields = [
        [".card__title", content.title],
        [".card__subtitle", content.subtitle],
        [".card__description", content.description],
        [".card__category", content.category]
    ];

    fields.forEach(([selector, value]) => {
        if (typeof value !== "string") {
            return;
        }

        const node = card.querySelector(selector);

        if (node) {
            node.textContent = value.trim();
        }
    });

    if (content.image && typeof content.image === "object") {
        const img = card.querySelector(".card__image");
        const src = toSafeHref(content.image.src);

        if (img && src) {
            img.src = src;

            if (typeof content.image.alt === "string") {
                img.alt = content.image.alt;
            }
        } else if (content.image.src) {
            warnOnce("Card: updateCardContent rejected an unsafe image src.");
        }
    }

    return card;
}

/**
 * Marks a card busy while its content is being replaced.
 *
 * aria-busy tells assistive technology to wait for the update; the visible
 * treatment is CSS only, so it degrades silently if the class is not styled.
 *
 * @param {HTMLElement} card
 * @param {boolean} loading
 * @returns {HTMLElement}
 */
export function setCardLoading(card, loading) {
    if (!card || typeof card.classList?.toggle !== "function") {
        throw new TypeError("setCardLoading expects a card element.");
    }

    const isLoading = Boolean(loading);
    card.classList.toggle("card--loading", isLoading);

    if (isLoading) {
        card.setAttribute("aria-busy", "true");
    } else {
        card.removeAttribute("aria-busy");
    }

    return card;
}

/**
 * Applies a selected state to a card.
 *
 * The class is the visual channel. The semantic channel depends on the
 * interactive element: aria-pressed for an action card (a real button),
 * aria-current for a navigation card (a link). A card with no interactive
 * element only gets the class, because inventing a role for a plain <article>
 * would be a lie to assistive technology.
 *
 * @param {HTMLElement} card
 * @param {boolean} selected
 * @returns {HTMLElement}
 */
export function setCardSelected(card, selected) {
    if (!card || typeof card.classList?.toggle !== "function") {
        throw new TypeError("setCardSelected expects a card element.");
    }

    const isSelected = Boolean(selected);
    card.classList.toggle("card--selected", isSelected);

    const control = card.querySelector(".card__link");

    if (!control) {
        return card;
    }

    if (control.tagName === "BUTTON") {
        control.setAttribute("aria-pressed", String(isSelected));
    } else if (isSelected) {
        control.setAttribute("aria-current", "true");
    } else {
        control.removeAttribute("aria-current");
    }

    return card;
}

/**
 * Creates a placeholder card for a loading grid.
 *
 * aria-hidden because a skeleton is pure decoration: the section owns the
 * accessible "loading" announcement. Lines are fixed-height blocks that match
 * the real card's rhythm closely enough to avoid a large layout shift.
 *
 * @param {{withMedia?: boolean, lines?: number}} [options]
 * @returns {HTMLDivElement}
 */
export function createCardSkeleton(options = {}) {
    const withMedia = options.withMedia !== false;
    const lines = Number.isInteger(options.lines) ? Math.max(1, options.lines) : 2;

    const card = document.createElement("div");
    card.className = "card card--skeleton";
    card.setAttribute("aria-hidden", "true");

    if (withMedia) {
        const media = document.createElement("div");
        media.className = "card__skeleton-media";
        card.append(media);
    }

    const title = document.createElement("div");
    title.className = "card__skeleton-line card__skeleton-line--title";
    card.append(title);

    for (let index = 0; index < lines; index += 1) {
        const line = document.createElement("div");
        line.className = "card__skeleton-line";
        card.append(line);
    }

    return card;
}
