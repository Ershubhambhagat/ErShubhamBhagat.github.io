/**
 * Shared Button component — js/components/button.js
 *
 * OWNS
 *   - Button markup construction: native <button> for actions, native <a> for
 *     navigation, both carrying the shared `btn` classes.
 *   - Variant / size / modifier class mapping and validation.
 *   - The low-level state helpers the spec names: setButtonLoading,
 *     setButtonDisabled, getButtonLabel, plus runButtonAction (the try/finally
 *     wrapper from BUTTON_COMPONENT.md § 12).
 *   - The single href allow-list used by button-styled links and, through the
 *     exported toSafeHref, by the Card component's links and images.
 *
 * MUST NOT OWN
 *   - What a button does. Click handlers, save operations, deletion rules and
 *     confirmation flows belong to the consuming section, form or feature.
 *     No string from JSON is ever resolved into a callback here.
 *   - Navigation state, modal behaviour, toast messages and persistence —
 *     js/core/navigation.js, modal-manager.js, js/components/toast.js and
 *     storage-manager.js own those.
 *   - Appearance values. Every colour, radius, spacing and duration comes from
 *     css/variables.css via css/components/buttons.css; this module only sets
 *     class names and structure.
 *
 * Spec: Prompt/components/BUTTON_COMPONENT.md.
 * Contract: .build/CONTRACT.md (§ "Design tokens", § "Security and
 * accessibility": untrusted text through textContent, external links
 * target=_blank rel=noopener noreferrer, validate URLs).
 *
 * SECURITY:
 *   - Labels, titles and icon strings are written with textContent, so a JSON
 *     label such as `<img src=x onerror=alert(1)>` renders as text.
 *   - createButtonLink only emits hrefs on an allow-list of schemes
 *     (http, https, mailto, tel or site-relative). javascript:, data: and
 *     vbscript: are rejected before an element exists.
 *   - The module performs no network request and touches no storage.
 */

/** Variants defined by the shared stylesheet. Order is the spec's order. */
export const BUTTON_VARIANTS = Object.freeze([
    "primary",
    "secondary",
    "outline",
    "ghost",
    "destructive",
    "link"
]);

/** Sizes defined by the shared stylesheet. */
export const BUTTON_SIZES = Object.freeze(["small", "medium", "large"]);

/**
 * Fallback variant for an unknown value.
 *
 * "secondary" rather than "primary" on purpose: a typo in a section must not
 * silently create a second visually dominant action on the page. The spec only
 * requires a documented default (.build/… BUTTON_COMPONENT.md § 24).
 */
const DEFAULT_VARIANT = "secondary";
const DEFAULT_SIZE = "medium";

/** Legal values of the native `type` attribute; anything else becomes "button". */
const BUTTON_TYPES = new Set(["button", "submit", "reset"]);

/**
 * Schemes a button-styled link may use.
 * Relative URLs (no scheme) are always allowed — they cannot leave the origin.
 */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Bookmarks and repeated initialization render the same component many times,
 * so a single bad record would otherwise print the same warning hundreds of
 * times and bury unrelated errors. Each distinct message is logged once.
 */
const warnedMessages = new Set();

function warnOnce(message) {
    if (!warnedMessages.has(message)) {
        warnedMessages.add(message);
        console.warn(message);
    }
}

/**
 * Returns an allow-listed href, or null when the value must not reach the DOM.
 *
 * Why a manual allow-list: `new URL()` alone accepts javascript: and data:
 * URLs because they are syntactically valid. The protocol check is what stops
 * an imported record from creating an executable link. Exported because
 * card.js validates image sources and card links with the same rules — one
 * owner prevents the two components from drifting apart.
 *
 * @param {unknown} value Candidate URL from trusted markup or imported data.
 * @returns {string|null} Safe href, or null when rejected.
 */
export function toSafeHref(value) {
    if (typeof value !== "string") {
        return null;
    }

    const href = value.trim();

    if (!href) {
        return null;
    }

    // Protocol-relative //example.com would resolve against the current origin
    // with its current scheme; pin it to https, which is the only scheme this
    // project is served over.
    if (href.startsWith("//")) {
        return `https:${href}`;
    }

    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) {
        try {
            const url = new URL(href);
            return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null;
        } catch {
            // A scheme-like prefix that URL cannot parse ("foo:bar") is not a
            // usable destination either.
            return null;
        }
    }

    // No scheme: a site-relative path, hash or query. Cannot leave the origin.
    return href;
}

/**
 * True when href points at another origin and therefore needs
 * target=_blank rel="noopener noreferrer" (.build/CONTRACT.md security rule).
 * Exported so the Card component applies the identical rule to its links
 * instead of re-deriving it.
 */
export function isExternalHref(href) {
    if (!/^https?:/i.test(href)) {
        return false;
    }

    const currentOrigin = globalThis.location?.origin ?? "";

    try {
        return new URL(href).origin !== currentOrigin;
    } catch {
        // Unparseable absolute URL: treat as external so it still gets
        // noopener, which is the safe direction to fail.
        return true;
    }
}

function normalizeVariant(variant) {
    if (BUTTON_VARIANTS.includes(variant)) {
        return variant;
    }

    if (variant !== undefined && variant !== null) {
        warnOnce(`Button: unknown variant "${String(variant)}"; using "${DEFAULT_VARIANT}".`);
    }

    return DEFAULT_VARIANT;
}

function normalizeSize(size) {
    if (BUTTON_SIZES.includes(size)) {
        return size;
    }

    if (size !== undefined && size !== null) {
        warnOnce(`Button: unknown size "${String(size)}"; using "${DEFAULT_SIZE}".`);
    }

    return DEFAULT_SIZE;
}

/**
 * Appends consumer-supplied classes one token at a time.
 *
 * Section code legitimately needs a layout hook (e.g. "contact__submit") but a
 * copied or imported string must not be able to inject arbitrary selectors or
 * attribute-like fragments, so only plain class tokens survive.
 */
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

function buildButtonClasses({ variant, size, fullWidth, iconOnly, className }) {
    const classNames = [
        "btn",
        `btn--${normalizeVariant(variant)}`,
        `btn--${normalizeSize(size)}`
    ];

    if (fullWidth) {
        classNames.push("btn--full");
    }

    if (iconOnly) {
        classNames.push("btn--icon");
    }

    return appendExtraClasses(classNames, className).join(" ");
}

/**
 * Resolves the accessible name requirement before any element is built.
 * Throws on a control that would be unlabelled in both markup and AT.
 */
function resolveLabel(options) {
    const label = typeof options.label === "string" ? options.label.trim() : "";
    const ariaLabel =
        typeof options.ariaLabel === "string" ? options.ariaLabel.trim() : "";

    if (!label && !ariaLabel) {
        throw new TypeError(
            "Button: a visible label or an ariaLabel is required; refusing to render an unlabelled control."
        );
    }

    return { label, ariaLabel };
}

/**
 * Builds the decorative icon slot.
 *
 * A string is inserted as text (a glyph such as "×" or "✓"); a DOM node is
 * appended as-is so a section can pass its own trusted inline SVG. Raw HTML
 * strings are never parsed — that is the injection path this blocks.
 * Returns null instead of an empty span when there is no usable icon.
 */
function createIconSlot(icon, position) {
    if (!icon) {
        return null;
    }

    const slot = document.createElement("span");
    slot.className = `btn__icon btn__icon--${position}`;
    slot.setAttribute("aria-hidden", "true");

    if (typeof icon === "string") {
        slot.textContent = icon;
    } else if (icon instanceof Node) {
        slot.append(icon);
    } else {
        warnOnce("Button: icon must be a string glyph or a DOM node; icon ignored.");
        return null;
    }

    return slot;
}

function createSpinner() {
    const spinner = document.createElement("span");
    spinner.className = "btn__spinner";
    spinner.setAttribute("aria-hidden", "true");
    return spinner;
}

/** Shared structure for both constructors: label, icons, tooltip, id. */
function applyCommonOptions(element, options, { label, ariaLabel }) {
    if (ariaLabel) {
        element.setAttribute("aria-label", ariaLabel);
    }

    if (options.title) {
        // `title` is a plain string attribute, not markup.
        element.title = String(options.title);
    }

    if (options.id) {
        element.id = String(options.id);
    }

    const leadingIcon = createIconSlot(options.icon, "leading");

    if (leadingIcon) {
        element.append(leadingIcon);
    }

    if (label) {
        const labelNode = document.createElement("span");
        labelNode.className = "btn__label";
        labelNode.textContent = label;
        element.append(labelNode);
    }

    const trailingIcon = createIconSlot(options.trailingIcon, "trailing");

    if (trailingIcon) {
        element.append(trailingIcon);
    }

    if (options.disabled) {
        setButtonDisabled(element, true);
    }
}

/**
 * Creates a native button for an action.
 *
 * @param {Object} options
 * @param {string} [options.label] Visible label. Required unless ariaLabel is set.
 * @param {string} [options.ariaLabel] Accessible name for icon-only controls.
 * @param {"primary"|"secondary"|"outline"|"ghost"|"destructive"|"link"} [options.variant]
 * @param {"small"|"medium"|"large"} [options.size]
 * @param {string|Node} [options.icon] Leading icon (glyph text or trusted node).
 * @param {string|Node} [options.trailingIcon]
 * @param {boolean} [options.fullWidth] Adds .btn--full.
 * @param {"button"|"submit"|"reset"} [options.type] Defaults to "button".
 * @param {boolean} [options.disabled]
 * @param {boolean} [options.loading]
 * @param {string} [options.title] Native tooltip text.
 * @param {string} [options.id]
 * @param {string} [options.name] Form field name (submit buttons only).
 * @param {string} [options.value] Form field value (submit buttons only).
 * @param {string} [options.className] Extra layout classes for the consumer.
 * @param {(event: MouseEvent) => void} [options.onClick] Trusted handler only.
 * @returns {HTMLButtonElement}
 * @throws {TypeError} When no label and no ariaLabel are supplied.
 */
export function createButton(options = {}) {
    if (!options || typeof options !== "object") {
        throw new TypeError("createButton(options): options must be an object.");
    }

    const { label, ariaLabel } = resolveLabel(options);
    const button = document.createElement("button");

    // Always write the type: an omitted type submits the surrounding form,
    // which is the classic cause of "my Cancel button saved the record".
    if (options.type !== undefined && !BUTTON_TYPES.has(options.type)) {
        warnOnce(`Button: unknown type "${String(options.type)}"; using "button".`);
    }

    button.type = BUTTON_TYPES.has(options.type) ? options.type : "button";
    button.className = buildButtonClasses({ ...options, iconOnly: !label });

    applyCommonOptions(button, options, { label, ariaLabel });

    if (typeof options.onClick === "function") {
        button.addEventListener("click", options.onClick);
    }

    if (options.name) {
        button.name = String(options.name);
    }

    if (options.value !== undefined && options.value !== null) {
        button.value = String(options.value);
    }

    if (options.loading) {
        setButtonLoading(button, true);
    }

    return button;
}

/**
 * Creates an anchor that looks like a button, for navigation only.
 *
 * The spec separates semantics from appearance: navigation must stay an <a>
 * so middle-click, "open in new tab" and screen-reader link lists keep working.
 * An unsafe or missing href throws instead of producing a dead control.
 *
 * @param {Object} options Same options as createButton, plus:
 * @param {string} options.href Target URL; validated against the scheme allow-list.
 * @returns {HTMLAnchorElement}
 * @throws {TypeError} When the href is missing or not on the allow-list.
 */
export function createButtonLink(options = {}) {
    if (!options || typeof options !== "object") {
        throw new TypeError("createButtonLink(options): options must be an object.");
    }

    const { label, ariaLabel } = resolveLabel(options);
    const href = toSafeHref(options.href);

    if (!href) {
        throw new TypeError(
            "Button: a safe href (http, https, mailto, tel or site-relative) is required for a link button."
        );
    }

    const link = document.createElement("a");

    // Links read as navigation, so the default is the lighter "outline" fill
    // rather than a filled primary button.
    link.className = buildButtonClasses({
        ...options,
        variant: options.variant ?? "outline",
        iconOnly: !label
    });
    link.href = href;

    if (isExternalHref(href)) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
    }

    applyCommonOptions(link, options, { label, ariaLabel });

    if (typeof options.onClick === "function") {
        link.addEventListener("click", options.onClick);
    }

    return link;
}

function isButtonElement(value) {
    return typeof HTMLButtonElement !== "undefined" && value instanceof HTMLButtonElement;
}

/**
 * Per-button loading bookkeeping.
 *
 * Keyed by element rather than stored as an attribute so nothing leaks into
 * the DOM and a removed button is collected. `disabledBeforeLoading` is what
 * lets setButtonLoading(false) restore the previous state instead of
 * unconditionally enabling a control the feature had deliberately disabled.
 */
const loadingStates = new WeakMap();

/**
 * Applies or clears the loading state of a native button.
 *
 * - Adds/removes .btn--loading, which shows the spinner and blocks the pointer.
 * - Sets aria-busy so assistive technology announces the busy state.
 * - Disables the button while busy, which is what prevents a double submit.
 * - Restores the *previous* disabled state afterwards, per
 *   BUTTON_COMPONENT.md § 12 ("restore the enabled state only when the
 *   underlying operation permits it").
 *
 * The label node is never touched, so the visible text survives a failed
 * request. Feature code remains responsible for the user-facing error message.
 *
 * @param {HTMLButtonElement} button
 * @param {boolean} loading
 * @returns {void}
 * @throws {TypeError} When the argument is not a native button element.
 */
export function setButtonLoading(button, loading) {
    if (!isButtonElement(button)) {
        throw new TypeError("setButtonLoading expects an HTML button element.");
    }

    const isLoading = Boolean(loading);
    const state = loadingStates.get(button) ?? {};

    if (isLoading) {
        if (!state.spinner) {
            state.spinner = createSpinner();
            button.append(state.spinner);
        }

        if (!("disabledBeforeLoading" in state)) {
            state.disabledBeforeLoading = button.disabled;
        }

        loadingStates.set(button, state);

        button.classList.add("btn--loading");
        button.setAttribute("aria-busy", "true");
        button.disabled = true;
        return;
    }

    button.classList.remove("btn--loading");
    button.removeAttribute("aria-busy");
    button.disabled = Boolean(state.disabledBeforeLoading);

    // The spinner is removed rather than hidden so the DOM returns to exactly
    // the structure createButton produced; a later load recreates it.
    state.spinner?.remove();
    state.spinner = null;
    delete state.disabledBeforeLoading;
}

/**
 * Disables or enables a button, or a button-styled anchor.
 *
 * Native buttons use the `disabled` attribute, which already removes them from
 * the tab order and announces "unavailable" — adding aria-disabled on top
 * would double the announcement, so it is not set here.
 *
 * Anchors have no disabled attribute. Their href is parked in a data attribute
 * while disabled so neither pointer nor keyboard activation can navigate, then
 * restored on enable. The section that disabled the link is expected not to
 * trigger its action while it is disabled.
 *
 * @param {HTMLElement} control Button or button-styled anchor.
 * @param {boolean} disabled
 * @returns {void}
 * @throws {TypeError} When the argument is not an element.
 */
export function setButtonDisabled(control, disabled) {
    if (!control || typeof control.setAttribute !== "function") {
        throw new TypeError("setButtonDisabled expects a DOM element.");
    }

    const isDisabled = Boolean(disabled);

    if (typeof control.disabled === "boolean") {
        control.disabled = isDisabled;
        return;
    }

    control.classList.toggle("is-disabled", isDisabled);

    if (isDisabled) {
        control.setAttribute("aria-disabled", "true");

        if (control.tagName === "A") {
            const href = control.getAttribute("href");

            if (href !== null) {
                control.dataset.disabledHref = href;
                control.removeAttribute("href");
            }
        }

        return;
    }

    control.removeAttribute("aria-disabled");

    if (control.tagName === "A" && control.dataset?.disabledHref) {
        control.setAttribute("href", control.dataset.disabledHref);
        delete control.dataset.disabledHref;
    }
}

/**
 * Reads a button's visible label, falling back to its accessible name.
 *
 * Used by features that need to report what happened ("Changes saved") or to
 * key analytics-like local state without duplicating the label markup
 * knowledge. Returns "" for anything that is not an element.
 *
 * @param {Element} button
 * @returns {string}
 */
export function getButtonLabel(button) {
    if (!button || typeof button.querySelector !== "function") {
        return "";
    }

    const labelNode = button.querySelector(".btn__label");
    const visibleText = (labelNode?.textContent ?? button.textContent ?? "").trim();

    if (visibleText) {
        return visibleText;
    }

    return (button.getAttribute("aria-label") ?? "").trim();
}

/**
 * Runs an async operation behind a button's loading state.
 *
 * The try/finally is the point: a rejected promise, a thrown error or an early
 * return must all clear the spinner, otherwise the button stays disabled for
 * the rest of the session. Errors are re-thrown so the calling feature can show
 * its own message through the Toast component — this module never invents one.
 *
 * @param {HTMLButtonElement} button
 * @param {() => Promise<unknown>|unknown} operation Trusted callback.
 * @returns {Promise<unknown>} Whatever the operation resolves to.
 */
export async function runButtonAction(button, operation) {
    if (typeof operation !== "function") {
        throw new TypeError("runButtonAction expects a function as its operation.");
    }

    setButtonLoading(button, true);

    try {
        return await operation();
    } finally {
        setButtonLoading(button, false);
    }
}
