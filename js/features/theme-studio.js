/**
 * js/features/theme-studio.js - live theme selection.
 *
 * Data: data/theme-presets.json. A preset is a named set of design-token
 * overrides; applying one writes those custom properties onto :root, which is the
 * only mechanism .build/CONTRACT.md allows for changing the appearance. No rule
 * in css/sections/*.css is rewritten, so a theme cannot break a layout.
 *
 * Persistence: the chosen preset id goes to portfolio.theme and the applied token
 * map to portfolio.themeSettings, so a reload can repaint without the data file.
 *
 * Known limit, stated rather than hidden: themes are applied when this feature
 * initializes, which app.js runs after the sections. A visitor who picked "light"
 * therefore sees one dark frame before the repaint. Moving the restore earlier
 * would mean a blocking inline script in index.html, which the contract forbids
 * (no inline script, strict CSP later), so the flash is the accepted trade-off.
 *
 * Security: preset token names are filtered against the token allow-list before
 * they are written, so an imported preset cannot set an arbitrary CSS property
 * such as `background-image` with a url().
 */

import { closeModal, openModal } from "../components/modal.js";
import { STORAGE_KEYS } from "../core/storage-manager.js";
import {
  addToolButton,
  asArray,
  asText,
  el,
  isRecord
} from "../core/section-kit.js";

/**
 * Tokens a theme may override.
 *
 * Mirrors the colour tokens in css/variables.css. Layout tokens (spacing, radius,
 * container width) are deliberately excluded: a theme that changes spacing would
 * produce layouts the CSS was never tested against.
 */
const ALLOWED_TOKENS = Object.freeze([
  "--color-primary",
  "--color-primary-contrast",
  "--color-secondary",
  "--color-accent",
  "--color-background",
  "--color-surface",
  "--color-surface-raised",
  "--color-overlay",
  "--color-text-primary",
  "--color-text-secondary",
  "--color-text-muted",
  "--color-border",
  "--color-focus-ring",
  "--color-success",
  "--color-warning",
  "--color-danger"
]);

/** Teardown for a previous initialization. */
let teardownPrevious = null;

/**
 * Rejects anything that is not a plain colour value.
 *
 * `url(...)`, `var(--x)` chains to arbitrary properties and CSS escapes that
 * could smuggle a declaration are all refused. A preset comes from a JSON file
 * the owner can edit, but the same file can be imported by a visitor through the
 * JSON Manager, so this is an input validation boundary, not a formatting nicety.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isSafeTokenValue(value) {
  const text = asText(value);

  if (!text || text.length > 96) {
    return false;
  }

  return (
    /^#[0-9a-f]{3,8}$/i.test(text) ||
    /^rgba?\(\s*[\d.%\s,/]+\)$/i.test(text) ||
    /^hsla?\(\s*[\d.%\s,/deg]+\)$/i.test(text) ||
    /^[a-z]+$/i.test(text)
  );
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isKnownToken(id) {
  return ALLOWED_TOKENS.includes(id);
}

/**
 * Applies a token map, replacing whatever the previous theme set.
 *
 * @param {Object} tokens
 */
function applyTokens(tokens) {
  const rootStyle = document.documentElement.style;

  for (const token of ALLOWED_TOKENS) {
    rootStyle.removeProperty(token);
  }

  for (const [token, value] of Object.entries(tokens)) {
    if (isKnownToken(token) && isSafeTokenValue(value)) {
      rootStyle.setProperty(token, asText(value));
    }
  }
}

/**
 * Switches the browser-level colour scheme and the document's theme attribute.
 *
 * @param {"dark"|"light"} mode
 */
function applyMode(mode) {
  if (mode === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

/**
 * @param {Object|undefined} sectionData - data/theme-presets.json.
 * @param {{storage?: Object, bus?: Object, toast?: Object, config?: Object}} [appContext]
 * @returns {void}
 */
export function initializeThemeStudio(sectionData, appContext) {
  // Node-safe: the module contract check imports this file without a document.
  if (typeof document === "undefined") {
    return;
  }

  if (typeof teardownPrevious === "function") {
    teardownPrevious();
    teardownPrevious = null;
  }

  const root = document.getElementById("theme-studio-root");

  if (!root) {
    return;
  }

  const presets = asArray(sectionData?.themes).filter(
    (preset) => isRecord(preset) && asText(preset.id) && asText(preset.name)
  );

  if (presets.length === 0) {
    return;
  }

  const storage = appContext?.storage;
  const bus = appContext?.bus;
  const toast = appContext?.toast;

  let activeId = "";

  /** Applies a preset by id and records it as the active theme. */
  function activate(id, persist = true) {
    if (!id) {
      return;
    }

    const preset = presets.find((candidate) => asText(candidate.id) === id);

    if (!preset) {
      return;
    }

    const tokens = isRecord(preset.tokens) ? preset.tokens : {};
    applyTokens(tokens);
    applyMode(asText(preset.mode) === "light" ? "light" : "dark");
    activeId = id;

    if (persist) {
      storage?.saveLocalData?.(STORAGE_KEYS.theme, id);
      storage?.saveLocalData?.(STORAGE_KEYS.themeSettings, tokens);
    }

    bus?.emit?.("theme:changed", { id, mode: asText(preset.mode), tokens });
  }

  /** Removes every override, returning the page to css/variables.css defaults. */
  function reset() {
    applyTokens({});
    applyMode("dark");
    activeId = "";
    storage?.removeLocalData?.(STORAGE_KEYS.theme);
    storage?.removeLocalData?.(STORAGE_KEYS.themeSettings);
    bus?.emit?.("theme:changed", { id: "", mode: "dark", tokens: {} });
    toast?.info?.("Back to the default theme.");
  }

  // Restore before first paint of the panel so the panel's own selected state is
  // truthful when it opens.
  if (storage?.getLocalData) {
    const storedId = asText(storage.getLocalData(STORAGE_KEYS.theme, ""));

    if (storedId && presets.some((preset) => asText(preset.id) === storedId)) {
      activate(storedId, false);
    } else {
      activate(asText(presets[0].id), false);
    }
  } else {
    activate(asText(presets[0].id), false);
  }

  /**
   * Builds the palette chooser.
   *
   * Each option is a native radio inside a label, so arrow-key group navigation
   * and the announced role come from the platform. Selecting applies immediately,
   * which makes the page behind the dialog the live preview.
   */
  function openPanel() {
    const panel = el("div", { className: "theme-studio" });
    panel.append(
      el("p", {
        className: "theme-studio__note",
        text: "Themes change the colour tokens only. Your choice is stored in this browser."
      })
    );

    const fieldset = el("fieldset", { className: "theme-studio__fieldset" });
    fieldset.append(el("legend", { className: "theme-studio__legend", text: "Palette" }));

    const groupName = "theme-preset";

    for (const preset of presets) {
      const id = asText(preset.id);
      const optionId = `theme-preset-${id}`;
      const option = el("label", { className: "theme-option", attrs: { for: optionId } });

      const radio = el("input", {
        className: "theme-option__radio",
        attrs: { type: "radio", name: groupName, id: optionId, value: id }
      });
      radio.checked = id === activeId;

      const body = el("span", { className: "theme-option__body" });
      body.append(el("span", { className: "theme-option__name", text: asText(preset.name) }));

      const description = asText(preset.description);
      if (description) {
        body.append(el("span", { className: "theme-option__text", text: description }));
      }

      // Swatches show the preset's own colours, read through the same validation
      // as the applied values. They are decorative, so no accessible name.
      const swatches = el("span", { className: "theme-option__swatches", attrs: { "aria-hidden": "true" } });
      const tokens = isRecord(preset.tokens) ? preset.tokens : {};
      // A preset with no token overrides inherits the stylesheet defaults, so it
      // names its preview colours explicitly; otherwise the swatch row would be
      // empty for the default theme only, which looks like a rendering bug.
      const declared = asArray(preset.swatches).map(asText).filter(isSafeTokenValue);
      const preview = declared.length > 0
        ? declared
        : ["--color-background", "--color-primary", "--color-accent"]
            .map((token) => asText(tokens[token]))
            .filter(isSafeTokenValue);

      for (const value of preview) {
        const dot = el("span", { className: "theme-option__swatch" });
        dot.style.backgroundColor = value;
        swatches.append(dot);
      }

      body.append(swatches);
      option.append(radio, body);
      fieldset.append(option);

      radio.addEventListener("change", () => {
        if (radio.checked) {
          activate(id);
        }
      });
    }

    panel.append(fieldset);

    const actions = el("div", { className: "theme-studio__actions" });
    const resetButton = el("button", {
      className: "btn btn--outline btn--small",
      text: "Reset to default",
      attrs: { type: "button" }
    });
    resetButton.addEventListener("click", () => {
      reset();
      closeModal(undefined, "theme-reset");
    });
    actions.append(resetButton);
    panel.append(actions);

    openModal({
      title: "Theme",
      content: panel,
      size: "md",
      initialFocus: panel.querySelector(`input[name="${groupName}"]:checked`) ?? undefined
    });
  }

  const tool = addToolButton({
    id: "theme-studio-trigger",
    label: "Theme",
    icon: "palette",
    onClick: openPanel
  });

  teardownPrevious = () => {
    tool.remove();
  };
}
