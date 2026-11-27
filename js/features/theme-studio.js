/**
 * js/features/theme-studio.js - live theme selection and customisation.
 *
 * Data: data/theme-presets.json. A preset is a named set of design-token
 * overrides; applying one writes those custom properties onto :root, which is the
 * only mechanism .build/CONTRACT.md allows for changing the appearance. No rule
 * in css/sections/*.css is rewritten, so a theme cannot break a layout.
 *
 * What the panel offers:
 *   - palette presets (radio group, applied immediately);
 *   - per-token custom colours, restricted to the colour allow-list;
 *   - typography stacks from a fixed list (an arbitrary font-family would be an
 *     unvalidated CSS value and could point at a remote font);
 *   - layout controls (density, corner radius, motion intensity) and component
 *     controls (card elevation, button shape, badge shape). Every option is a
 *     literal from a table, so those tokens are validated by set membership and
 *     no free-form CSS length can reach setProperty();
 *   - a contrast readout for the two text-on-surface pairs that matter;
 *   - a width preview of real components, desktop/tablet/mobile;
 *   - undo/redo with a bounded history, plus JSON import/export.
 *
 * Persistence: the chosen preset id goes to portfolio.theme and the applied token
 * map to portfolio.themeSettings, so a reload can repaint without the data file.
 * Custom edits are part of that map, which is why a reload keeps them.
 *
 * Known limit, stated rather than hidden: themes are applied when this feature
 * initializes, which app.js runs after the sections. A visitor who picked "light"
 * therefore sees one dark frame before the repaint. Moving the restore earlier
 * would mean a blocking inline script in index.html, which the contract forbids,
 * so the flash is the accepted trade-off.
 *
 * Security: token names are filtered against an allow-list before they are
 * written, values are validated as plain colours, and font stacks are compared
 * against a fixed list. An imported theme therefore cannot set an arbitrary CSS
 * property such as `background-image` with a url().
 */

import { openModal } from "../components/modal.js";
import { STORAGE_KEYS } from "../core/storage-manager.js";
import {
  addToolButton,
  asArray,
  asText,
  el,
  isRecord
} from "../core/section-kit.js";

/**
 * Colour tokens a theme may override.
 *
 * Mirrors the colour tokens in css/variables.css. Layout and component tokens are
 * not listed here: they hold lengths, shadows and a unitless multiplier rather
 * than colours, so they live in LAYOUT_CONTROLS / COMPONENT_CONTROLS with the
 * exact strings each token accepts.
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

/**
 * The tokens exposed as colour pickers, with the labels a visitor understands.
 *
 * Not every allowed token gets a picker: --color-overlay and the focus ring are
 * derived from the palette and are easy to break by hand. They stay themeable
 * through a preset or an imported file.
 */
const EDITABLE_COLORS = Object.freeze([
  { token: "--color-primary", label: "Primary" },
  { token: "--color-secondary", label: "Secondary" },
  { token: "--color-accent", label: "Accent" },
  { token: "--color-background", label: "Background" },
  { token: "--color-surface", label: "Surface" },
  { token: "--color-surface-raised", label: "Raised surface" },
  { token: "--color-text-primary", label: "Text" },
  { token: "--color-text-secondary", label: "Secondary text" },
  { token: "--color-border", label: "Border" }
]);

/**
 * Font stacks a theme may apply.
 *
 * Only local/generic families: a remote @font-face would add a network request
 * and a privacy question, and a typo in a free-form value would silently fall
 * back to the browser default. The value written is the exact string below.
 */
const FONT_OPTIONS = Object.freeze([
  {
    id: "system",
    label: "System UI",
    stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  },
  {
    id: "serif",
    label: "Serif",
    stack: "Georgia, 'Times New Roman', serif"
  },
  {
    id: "mono",
    label: "Monospace",
    stack: "'Courier New', Courier, monospace"
  },
  {
    id: "humanist",
    label: "Humanist",
    stack: "'Trebuchet MS', 'Segoe UI', sans-serif"
  }
]);

/** Font tokens a theme may apply, and the option list each accepts. */
const FONT_TOKENS = Object.freeze({
  "--font-heading": FONT_OPTIONS,
  "--font-body": FONT_OPTIONS
});

/**
 * The values css/variables.css ships for the tokens the controls write.
 *
 * "Theme default" has to recognise a value that already equals the default: a
 * restored draft may carry it explicitly, and an imported file that repeats the
 * default is still valid. --shadow-md is absent on purpose - its default differs
 * between the dark and light themes, so only an explicit option may set it.
 */
const TOKEN_DEFAULTS = Object.freeze({
  "--spacing-sm": "0.5rem",
  "--spacing-md": "1rem",
  "--spacing-lg": "1.5rem",
  "--radius-sm": "0.5rem",
  "--radius-md": "0.875rem",
  "--radius-lg": "1.375rem",
  "--radius-full": "999px",
  "--container-max": "1200px",
  "--spacing-2xl": "4rem",
  "--animation-intensity": "1"
});

/**
 * Layout controls: spacing density, corner radius, motion intensity, content
 * width and section spacing.
 *
 * Two rules shape this table. A control owns a disjoint set of tokens, so every
 * value has exactly one control that shows it and one that writes it - two owners
 * for one property produces a panel that lies about what is applied. And every
 * option carries literal values, which turns "is this a safe CSS value" into a
 * membership check instead of a parser for arbitrary user input.
 *
 * An option with no values is "theme default": it removes the override instead of
 * writing a literal, so a value supplied by a preset can be restored as well as
 * replaced.
 */
const LAYOUT_CONTROLS = Object.freeze([
  {
    id: "density",
    label: "Content density",
    hint: "Spacing inside cards and between stacked items.",
    tokens: Object.freeze(["--spacing-sm", "--spacing-md", "--spacing-lg"]),
    options: Object.freeze([
      { id: "default", label: "Theme default", values: {} },
      {
        id: "compact",
        label: "Compact",
        values: { "--spacing-sm": "0.375rem", "--spacing-md": "0.75rem", "--spacing-lg": "1.125rem" }
      },
      {
        id: "spacious",
        label: "Spacious",
        values: { "--spacing-sm": "0.625rem", "--spacing-md": "1.25rem", "--spacing-lg": "1.875rem" }
      }
    ])
  },
  {
    id: "corners",
    label: "Corner radius",
    hint: "Cards and small controls. Buttons are shaped separately below.",
    tokens: Object.freeze(["--radius-sm", "--radius-lg"]),
    options: Object.freeze([
      { id: "default", label: "Theme default", values: {} },
      { id: "square", label: "Square", values: { "--radius-sm": "0.125rem", "--radius-lg": "0.25rem" } },
      { id: "soft", label: "Soft", values: { "--radius-sm": "0.375rem", "--radius-lg": "0.75rem" } },
      { id: "round", label: "Round", values: { "--radius-sm": "0.75rem", "--radius-lg": "2rem" } }
    ])
  },
  {
    id: "motion",
    label: "Motion intensity",
    hint: "Scales entrance animations; the lowest step keeps the page still.",
    kind: "range",
    tokens: Object.freeze(["--animation-intensity"]),
    options: Object.freeze([
      { id: "off", label: "Off (0%)", values: { "--animation-intensity": "0" } },
      { id: "low", label: "25%", values: { "--animation-intensity": "0.25" } },
      { id: "medium", label: "50%", values: { "--animation-intensity": "0.5" } },
      { id: "high", label: "75%", values: { "--animation-intensity": "0.75" } },
      { id: "full", label: "Full (100%)", values: { "--animation-intensity": "1" } }
    ])
  },
  /*
   * The two global measurements from the layout group of the specification that
   * are not covered by density: how wide the reading column is and how much air
   * sits between sections. Both write a single token the sections already use, so
   * a change is visible everywhere without touching a component rule.
   */
  {
    id: "content-width",
    label: "Content width",
    hint: "Width of the reading column on wide screens.",
    tokens: Object.freeze(["--container-max"]),
    options: Object.freeze([
      { id: "default", label: "Theme default", values: {} },
      { id: "narrow", label: "Narrow (1040px)", values: { "--container-max": "1040px" } },
      { id: "wide", label: "Wide (1320px)", values: { "--container-max": "1320px" } },
      { id: "full", label: "Full (1440px)", values: { "--container-max": "1440px" } }
    ])
  },
  {
    id: "section-spacing",
    label: "Section spacing",
    hint: "Vertical gap between one section and the next.",
    tokens: Object.freeze(["--spacing-2xl"]),
    options: Object.freeze([
      { id: "default", label: "Theme default", values: {} },
      { id: "tight", label: "Tight (2.5rem)", values: { "--spacing-2xl": "2.5rem" } },
      { id: "roomy", label: "Roomy (5.5rem)", values: { "--spacing-2xl": "5.5rem" } }
    ])
  }
]);

/**
 * Component controls: the shape and elevation of the shared components.
 *
 * --radius-md is the button (and input) corner, --radius-full the badge and
 * timeline-dot shape, --shadow-md the elevated-card shadow. The large card corner
 * stays in the radius scale above, which is what lets a pill button coexist with
 * a large card instead of forcing one shape on both.
 */
const COMPONENT_CONTROLS = Object.freeze([
  {
    id: "card-elevation",
    label: "Card elevation",
    hint: "Shadow under elevated cards and on their hover lift.",
    tokens: Object.freeze(["--shadow-md"]),
    options: Object.freeze([
      { id: "default", label: "Theme default", values: {} },
      { id: "flat", label: "Flat", values: { "--shadow-md": "none" } },
      { id: "soft", label: "Soft", values: { "--shadow-md": "0 4px 14px -8px rgba(0, 0, 0, 0.6)" } },
      { id: "high", label: "High", values: { "--shadow-md": "0 24px 54px -20px rgba(0, 0, 0, 0.9)" } }
    ])
  },
  {
    id: "button-shape",
    label: "Button shape",
    hint: "Buttons and inputs. Cards keep the radius scale.",
    tokens: Object.freeze(["--radius-md"]),
    options: Object.freeze([
      { id: "default", label: "Theme default", values: {} },
      { id: "soft", label: "Soft corners", values: { "--radius-md": "0.375rem" } },
      { id: "pill", label: "Pill", values: { "--radius-md": "999px" } }
    ])
  },
  {
    id: "badge-shape",
    label: "Badge and dot shape",
    hint: "Status chips, tags and timeline dots.",
    tokens: Object.freeze(["--radius-full"]),
    options: Object.freeze([
      { id: "default", label: "Theme default", values: {} },
      { id: "rounded", label: "Rounded", values: { "--radius-full": "0.5rem" } },
      { id: "square", label: "Square", values: { "--radius-full": "0.125rem" } }
    ])
  }
]);

/** Every token a layout or component control may write. */
const CONTROL_TOKENS = Object.freeze(
  [...LAYOUT_CONTROLS, ...COMPONENT_CONTROLS].flatMap((control) => control.tokens)
);

/**
 * Builds token -> the exact strings that token may hold.
 *
 * The defaults are added to each set so a file that repeats a default is accepted;
 * an option's literal otherwise is the only way in. Keeping this derived from the
 * tables (rather than a second hand-written list) means a new option cannot be
 * displayed without also being accepted on import.
 *
 * @param {Array<Object>} controls
 * @returns {Map<string, Set<string>>}
 */
function buildTokenRules(controls) {
  const rules = new Map();

  for (const control of controls) {
    for (const token of control.tokens) {
      const allowed = rules.get(token) ?? new Set();

      if (TOKEN_DEFAULTS[token]) {
        allowed.add(TOKEN_DEFAULTS[token]);
      }

      for (const option of control.options) {
        if (typeof option.values[token] === "string") {
          allowed.add(option.values[token]);
        }
      }

      rules.set(token, allowed);
    }
  }

  return rules;
}

/** token -> accepted values, for the layout and component controls. */
const TOKEN_RULES = buildTokenRules([...LAYOUT_CONTROLS, ...COMPONENT_CONTROLS]);

/**
 * Rejects a layout/component token value that no control offers.
 *
 * Same reason as isSafeTokenValue for colours: an imported theme is visitor
 * input, and a value that is not in the table is either a typo or an attempt to
 * smuggle a declaration into a custom property.
 *
 * @param {string} token
 * @param {string} value
 * @returns {boolean}
 */
function isAllowedTokenValue(token, value) {
  const allowed = TOKEN_RULES.get(token);
  return Boolean(allowed) && allowed.has(asText(value));
}

/**
 * Which option of a control the applied token map represents.
 *
 * Matching on exact values (not computed style) is what keeps the select, an undo
 * step and an imported file in agreement: computed style resolves a rem to px, so
 * it cannot say whether the applied value was the default or an explicit option.
 *
 * @param {Object} control
 * @param {Object} tokens - The applied map (preset tokens plus overrides).
 * @returns {string} An option id; the first option when nothing matches.
 */
function resolveOptionId(control, tokens) {
  const applied = isRecord(tokens) ? tokens : {};

  const match = control.options.find((option) =>
    control.tokens.every((token) => {
      const current = typeof applied[token] === "string" ? applied[token] : null;
      const wanted = typeof option.values[token] === "string" ? option.values[token] : null;

      if (wanted === null) {
        return current === null || current === TOKEN_DEFAULTS[token];
      }

      return current === wanted;
    })
  );

  return match ? match.id : control.options[0].id;
}

/** Bounded history: enough to undo an experiment, not a document editor. */
const HISTORY_LIMIT = 20;

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
 * Converts a computed colour ("rgb(8, 9, 12)" or "#08090c") into #rrggbb.
 *
 * `<input type="color">` only accepts #rrggbb, so a theme restored from a preset
 * that used rgb() needs this conversion before it can populate the picker.
 *
 * @param {string} value
 * @returns {string}
 */
function toHexColor(value) {
  const text = asText(value);

  if (/^#[0-9a-f]{6}$/i.test(text)) {
    return text.toLowerCase();
  }

  if (/^#[0-9a-f]{3}$/i.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`.toLowerCase();
  }

  const match = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(text);

  if (!match) {
    return "#000000";
  }

  const hex = (part) => Number(part).toString(16).padStart(2, "0");

  return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`;
}

/**
 * Relative luminance from WCAG 2.1.
 *
 * @param {string} hex - #rgb or #rrggbb.
 * @returns {number}
 */
function relativeLuminance(hex) {
  const value = toHexColor(hex).slice(1);
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );

  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * WCAG contrast ratio between two colours.
 *
 * @param {string} foreground
 * @param {string} background
 * @returns {number} 1 to 21; NaN when a value is not a colour.
 */
function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);

  if (Number.isNaN(a) || Number.isNaN(b)) {
    return Number.NaN;
  }

  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Applies a token map, replacing whatever the previous theme set.
 *
 * @param {Object} tokens
 */
function applyTokens(tokens) {
  const rootStyle = document.documentElement.style;

  for (const token of [...ALLOWED_TOKENS, ...Object.keys(FONT_TOKENS), ...CONTROL_TOKENS]) {
    rootStyle.removeProperty(token);
  }

  for (const [token, value] of Object.entries(tokens)) {
    const text = asText(value);

    if (isKnownToken(token) && isSafeTokenValue(text)) {
      rootStyle.setProperty(token, text);
    } else if (Object.prototype.hasOwnProperty.call(FONT_TOKENS, token)) {
      const allowed = FONT_TOKENS[token].some((option) => option.stack === text);

      if (allowed) {
        rootStyle.setProperty(token, text);
      }
    } else if (isAllowedTokenValue(token, text)) {
      rootStyle.setProperty(token, text);
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
 * Reads the effective value of a token from the document.
 *
 * @param {string} token
 * @returns {string}
 */
function readComputedToken(token) {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
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
  let customTokens = {};
  let history = [];
  let historyIndex = -1;

  /** @returns {Object} The active preset's token map (never the source object). */
  function presetTokens() {
    const preset = presets.find((candidate) => asText(candidate.id) === activeId);
    return preset && isRecord(preset.tokens) ? { ...preset.tokens } : {};
  }

  /** @returns {Object} Preset tokens with the visitor's edits on top. */
  function currentTokens() {
    return { ...presetTokens(), ...customTokens };
  }

  /** Writes the current map and records it as one undoable step. */
  function commit({ record = true } = {}) {
    const tokens = currentTokens();
    applyTokens(tokens);
    applyMode(asText(presets.find((p) => asText(p.id) === activeId)?.mode) === "light" ? "light" : "dark");

    storage?.saveLocalData?.(STORAGE_KEYS.theme, activeId);
    storage?.saveLocalData?.(STORAGE_KEYS.themeSettings, tokens);
    bus?.emit?.("theme:changed", {
      id: activeId,
      mode: asText(presets.find((p) => asText(p.id) === activeId)?.mode),
      tokens
    });

    if (record) {
      const snapshot = JSON.stringify({ activeId, customTokens });

      if (history[historyIndex] !== snapshot) {
        history = history.slice(0, historyIndex + 1);
        history.push(snapshot);

        if (history.length > HISTORY_LIMIT) {
          history.shift();
        }

        historyIndex = history.length - 1;
      }
    }
  }

  /** Applies a preset and clears custom edits, because they belong to the old one. */
  function activate(id, persist = true) {
    const preset = presets.find((candidate) => asText(candidate.id) === id);

    if (!preset) {
      return;
    }

    activeId = id;
    customTokens = {};
    commit({ record: persist });
  }

  /** Removes every override, returning the page to css/variables.css defaults. */
  function reset() {
    activeId = asText(presets[0]?.id) ?? "";
    customTokens = {};
    applyTokens({});
    applyMode("dark");
    storage?.removeLocalData?.(STORAGE_KEYS.theme);
    storage?.removeLocalData?.(STORAGE_KEYS.themeSettings);
    bus?.emit?.("theme:changed", { id: "", mode: "dark", tokens: {} });
    history = [];
    historyIndex = -1;
    toast?.show?.({ message: "Back to the default theme.", type: "info" });
  }

  /** Restores the stored preset and any custom tokens. */
  function restore() {
    const storedId = asText(storage?.getLocalData?.(STORAGE_KEYS.theme, ""));
    const storedTokens = storage?.getLocalData?.(STORAGE_KEYS.themeSettings, null);

    activeId = presets.some((preset) => asText(preset.id) === storedId)
      ? storedId
      : asText(presets[0].id);

    if (isRecord(storedTokens)) {
      const base = presetTokens();

      customTokens = Object.fromEntries(
        Object.entries(storedTokens).filter(([token, value]) => {
          if (isKnownToken(token) && isSafeTokenValue(value)) {
            return base[token] !== value;
          }

          if (Object.prototype.hasOwnProperty.call(FONT_TOKENS, token)) {
            return FONT_TOKENS[token].some((option) => option.stack === asText(value));
          }

          if (isAllowedTokenValue(token, value)) {
            // An override that repeats the default is not worth storing: it would
            // survive a Reset of its own control for no visible reason.
            return base[token] !== value && TOKEN_DEFAULTS[token] !== value;
          }

          return false;
        })
      );
    }

    commit({ record: false });
    history = [JSON.stringify({ activeId, customTokens })];
    historyIndex = 0;
  }

  /** Moves one step in the history, if possible. */
  function travel(direction) {
    const next = historyIndex + direction;

    if (next < 0 || next >= history.length) {
      return;
    }

    const snapshot = JSON.parse(history[next]);

    activeId = asText(snapshot.activeId) || activeId;
    customTokens = isRecord(snapshot.customTokens) ? snapshot.customTokens : {};
    historyIndex = next;
    commit({ record: false });
  }

  /**
   * Builds the contrast readout.
   *
   * Two pairs matter on this page: body text on the page background and body text
   * on a card surface. The ratio is shown with the WCAG threshold it passes, so a
   * low-contrast experiment is visible rather than merely ugly.
   *
   * @returns {HTMLElement}
   */
  function buildContrast() {
    const block = el("div", { className: "theme-contrast" });
    const pairs = [
      { label: "Text on background", fg: "--color-text-primary", bg: "--color-background" },
      { label: "Text on surface", fg: "--color-text-primary", bg: "--color-surface" }
    ];

    for (const pair of pairs) {
      const ratio = contrastRatio(readComputedToken(pair.fg), readComputedToken(pair.bg));
      const rounded = Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : 0;
      const verdict =
        rounded >= 7 ? "AAA" : rounded >= 4.5 ? "AA" : rounded >= 3 ? "AA large only" : "Fails AA";

      const row = el("p", { className: "theme-contrast__row" });
      row.append(el("span", { className: "theme-contrast__label", text: pair.label }));
      row.append(
        el("span", {
          className: `theme-contrast__value${rounded < 4.5 ? " theme-contrast__value--fail" : ""}`,
          text: `${rounded}:1 \u00b7 ${verdict}`
        })
      );
      block.append(row);
    }

    return block;
  }

  /** Builds a small sample of real components at the chosen preview width. */
  function buildPreview() {
    const wrapper = el("div", { className: "theme-preview", attrs: { "data-width": "desktop" } });

    const toolbar = el("div", { className: "theme-preview__toolbar", attrs: { role: "group", "aria-label": "Preview width" } });

    for (const option of [
      { id: "desktop", label: "Desktop" },
      { id: "tablet", label: "Tablet" },
      { id: "mobile", label: "Mobile" }
    ]) {
      const button = el("button", {
        className: "btn btn--ghost btn--small",
        text: option.label,
        attrs: { type: "button", "aria-pressed": option.id === "desktop" ? "true" : "false" }
      });

      button.addEventListener("click", () => {
        wrapper.setAttribute("data-width", option.id);

        for (const sibling of toolbar.querySelectorAll("button")) {
          sibling.setAttribute("aria-pressed", String(sibling === button));
        }
      });

      toolbar.append(button);
    }

    const frame = el("div", { className: "theme-preview__frame" });
    // card--elevated on purpose: it is the variant that reads --shadow-md, so the
    // card-elevation control has something real to change in the preview.
    const card = el("article", { className: "card card--elevated theme-preview__card" });
    const body = el("div", { className: "card__body" });
    body.append(el("h3", { className: "card__title", text: "Preview card" }));
    body.append(
      el("p", {
        className: "card__text",
        text: "This card uses the same tokens as the page, so a contrast problem shows up here first."
      })
    );

    const chips = el("ul", { className: "tag-list" });
    ["Primary", "Surface", "Border"].forEach((label) => {
      chips.append(el("li", { className: "tag", text: label }));
    });
    body.append(chips);

    const actions = el("div", { className: "card__footer" });
    actions.append(
      el("button", { className: "btn btn--primary btn--small", text: "Primary", attrs: { type: "button" } }),
      el("button", { className: "btn btn--outline btn--small", text: "Outline", attrs: { type: "button" } })
    );
    card.append(body, actions);
    frame.append(card);
    wrapper.append(toolbar, frame);
    return wrapper;
  }

  /**
   * Opens the panel.
   *
   * The dialog is rebuilt on every open rather than kept in memory: a rebuild is
   * cheap, and it guarantees the controls show the tokens that are actually
   * applied after an undo or an import.
   */
  function openPanel() {
    const panel = el("div", { className: "theme-studio" });
    panel.append(
      el("p", {
        className: "theme-studio__note",
        text: "Themes change colour, type, spacing and shape tokens only. Your choice is stored in this browser."
      })
    );

    // ---- Palette ---------------------------------------------------------
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

      const swatches = el("span", { className: "theme-option__swatches", attrs: { "aria-hidden": "true" } });
      const tokens = isRecord(preset.tokens) ? preset.tokens : {};
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
          syncPanel();
        }
      });
    }

    panel.append(fieldset);

    // ---- Custom colours --------------------------------------------------
    const colorFieldset = el("fieldset", { className: "theme-studio__fieldset" });
    colorFieldset.append(el("legend", { className: "theme-studio__legend", text: "Custom colours" }));

    const colorGrid = el("div", { className: "theme-colors" });

    /** token -> colour input, so a preset change or an undo can refresh them. */
    const colorInputs = new Map();

    for (const entry of EDITABLE_COLORS) {
      const id = `theme-color-${entry.token.replace(/^--/, "")}`;
      const field = el("div", { className: "theme-colors__field" });
      field.append(el("label", { className: "field__label", text: entry.label, attrs: { for: id } }));

      const input = el("input", {
        className: "theme-colors__input",
        attrs: { id, type: "color", value: toHexColor(readComputedToken(entry.token)) }
      });

      // Live preview on input, one history step on change. Recording every
      // intermediate colour of a drag would fill the undo stack with noise.
      input.addEventListener("input", () => {
        customTokens[entry.token] = input.value;
        commit({ record: false });
        refreshContrast();
      });

      input.addEventListener("change", () => {
        customTokens[entry.token] = input.value;
        commit();
        // The undo/redo buttons are rebuilt by syncPanel, not by commit(): a
        // colour edit has to enable Undo the moment it becomes undoable.
        syncPanel();
      });

      colorInputs.set(entry.token, input);
      field.append(input);
      colorGrid.append(field);
    }

    colorFieldset.append(colorGrid);
    panel.append(colorFieldset);

    // ---- Typography ------------------------------------------------------
    const fontFieldset = el("fieldset", { className: "theme-studio__fieldset" });
    fontFieldset.append(el("legend", { className: "theme-studio__legend", text: "Typography" }));

    /** token -> font select, refreshed the same way as the colour inputs. */
    const fontSelects = new Map();

    for (const [token, options] of Object.entries(FONT_TOKENS)) {
      const id = `theme-font-${token.replace(/^--/, "")}`;
      const field = el("div", { className: "field" });
      field.append(
        el("label", {
          className: "field__label",
          text: token === "--font-heading" ? "Heading font" : "Body font",
          attrs: { for: id }
        })
      );

      const select = el("select", { className: "field__input field__input--select", attrs: { id } });
      const current = readComputedToken(token);

      for (const option of options) {
        const node = el("option", { text: option.label, attrs: { value: option.stack } });
        // Computed styles resolve the stack to its used family, so an exact match
        // is impossible; the first family name is a good enough signal.
        node.selected = current.startsWith(option.stack.split(",")[0].replace(/['"]/g, "").trim());
        select.append(node);
      }

      select.addEventListener("change", () => {
        customTokens[token] = select.value;
        commit();
        syncPanel();
      });

      fontSelects.set(token, select);
      field.append(select);
      fontFieldset.append(field);
    }

    panel.append(fontFieldset);

    // ---- Layout and components -------------------------------------------
    /**
     * Renders one control as a label, a hint and a select or range.
     *
     * Both kinds share applyControlValues() and push a sync function, so the
     * layout group, the component group and syncPanel() never each need to know
     * how a particular control is drawn. Two inputs instead of one: a select for
     * enumerated scales, a range for the motion multiplier, which reads better as
     * a percentage than as five radio buttons.
     */
    const controlSyncs = [];

    const optionById = (control, id) =>
      control.options.find((option) => option.id === id) ?? control.options[0];

    /** Writes (or, for "theme default", removes) the option's tokens. */
    const applyControlValues = (control, option) => {
      for (const token of control.tokens) {
        const value = option.values[token];

        if (typeof value === "string") {
          customTokens[token] = value;
        } else {
          delete customTokens[token];
        }
      }
    };

    function buildControlField(control) {
      const id = `theme-control-${control.id}`;
      const field = el("div", { className: "theme-control" });
      const hintId = `${id}-hint`;

      field.append(el("label", { className: "field__label", text: control.label, attrs: { for: id } }));
      field.append(el("p", { className: "theme-control__hint", text: control.hint, attrs: { id: hintId } }));

      if (control.kind === "range") {
        const row = el("div", { className: "theme-control__range" });
        const input = el("input", {
          className: "theme-control__slider",
          attrs: {
            id,
            type: "range",
            min: "0",
            max: String(control.options.length - 1),
            step: "1",
            "data-control": control.id,
            "aria-describedby": hintId
          }
        });
        const readout = el("output", { className: "theme-control__readout", attrs: { for: id } });

        const chosen = () => control.options[Number(input.value)] ?? control.options[0];

        const describe = () => {
          readout.textContent = chosen().label;
          // aria-valuetext is what a screen reader announces for a range; the
          // raw 0-4 index would mean nothing.
          input.setAttribute("aria-valuetext", chosen().label);
        };

        // Same split as the colour pickers: live on input, one history step on
        // change, so dragging through the steps does not fill the undo stack.
        input.addEventListener("input", () => {
          applyControlValues(control, chosen());
          describe();
          commit({ record: false });
        });

        input.addEventListener("change", () => {
          applyControlValues(control, chosen());
          commit();
          syncPanel();
        });

        row.append(input, readout);
        field.append(row);

        controlSyncs.push(() => {
          const active = resolveOptionId(control, currentTokens());
          const index = control.options.findIndex((option) => option.id === active);
          input.value = String(Math.max(0, index));
          describe();
        });

        return field;
      }

      const select = el("select", {
        className: "field__input field__input--select",
        attrs: { id, "data-control": control.id, "aria-describedby": hintId }
      });

      for (const option of control.options) {
        select.append(el("option", { text: option.label, attrs: { value: option.id } }));
      }

      select.addEventListener("change", () => {
        applyControlValues(control, optionById(control, select.value));
        commit();
        syncPanel();
      });

      field.append(select);
      controlSyncs.push(() => {
        select.value = resolveOptionId(control, currentTokens());
      });

      return field;
    }

    for (const [legend, controls] of [
      ["Layout", LAYOUT_CONTROLS],
      ["Components", COMPONENT_CONTROLS]
    ]) {
      const fieldset = el("fieldset", { className: "theme-studio__fieldset" });
      fieldset.append(el("legend", { className: "theme-studio__legend", text: legend }));

      const grid = el("div", { className: "theme-controls" });

      for (const control of controls) {
        grid.append(buildControlField(control));
      }

      fieldset.append(grid);
      panel.append(fieldset);
    }

    // ---- Contrast --------------------------------------------------------
    const contrastHost = el("div", { className: "theme-studio__contrast" });
    contrastHost.append(el("h3", { className: "theme-studio__subheading", text: "Contrast" }));

    function refreshContrast() {
      const existing = contrastHost.querySelector(".theme-contrast");
      if (existing) {
        existing.replaceWith(buildContrast());
      } else {
        contrastHost.append(buildContrast());
      }
    }

    panel.append(contrastHost);
    refreshContrast();

    /**
     * Refreshes every control from the applied state.
     *
     * Used after a preset change, an undo/redo, a reset and an import. Rebuilding
     * the dialog instead would drop focus and scroll position, and closing then
     * reopening a dialog inside its own event handler is a race the modal manager
     * should not have to absorb.
     */
    function syncPanel() {
      for (const [token, input] of colorInputs) {
        input.value = toHexColor(readComputedToken(token));
      }

      for (const [token, select] of fontSelects) {
        const current = readComputedToken(token);
        const match = FONT_TOKENS[token].find((option) =>
          current.startsWith(option.stack.split(",")[0].replace(/['"]/g, "").trim())
        );

        if (match) {
          select.value = match.stack;
        }
      }

      for (const input of panel.querySelectorAll(`input[name="${groupName}"]`)) {
        input.checked = input.value === activeId;
      }

      refreshContrast();

      for (const sync of controlSyncs) {
        sync();
      }

      // Declared later in this scope; a sync only runs after the panel is built.
      undo.disabled = historyIndex <= 0;
      redo.disabled = historyIndex >= history.length - 1;
    }

    // ---- Preview ---------------------------------------------------------
    panel.append(el("h3", { className: "theme-studio__subheading", text: "Preview" }));
    panel.append(buildPreview());

    // ---- Actions ---------------------------------------------------------
    const actions = el("div", { className: "theme-studio__actions" });

    const undo = el("button", {
      className: "btn btn--ghost btn--small",
      text: "Undo",
      attrs: { type: "button" }
    });
    undo.disabled = historyIndex <= 0;
    undo.addEventListener("click", () => {
      travel(-1);
      syncPanel();
    });

    const redo = el("button", {
      className: "btn btn--ghost btn--small",
      text: "Redo",
      attrs: { type: "button" }
    });
    redo.disabled = historyIndex >= history.length - 1;
    redo.addEventListener("click", () => {
      travel(1);
      syncPanel();
    });

    const exportButton = el("button", {
      className: "btn btn--outline btn--small",
      text: "Export theme",
      attrs: { type: "button" }
    });
    exportButton.addEventListener("click", () => {
      const payload = JSON.stringify({ id: activeId, tokens: currentTokens() }, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "theme.json";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    });

    const importLabel = el("label", {
      className: "btn btn--outline btn--small",
      text: "Import theme",
      attrs: { for: "theme-import-input" }
    });
    const importInput = el("input", {
      className: "visually-hidden",
      attrs: { id: "theme-import-input", type: "file", accept: "application/json,.json" }
    });

    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];

      if (!file) {
        return;
      }

      importInput.value = "";

      let parsed;

      try {
        parsed = JSON.parse(await file.text());
      } catch {
        toast?.show?.({ message: "That theme file is not valid JSON.", type: "error" });
        return;
      }

      const tokens = isRecord(parsed?.tokens) ? parsed.tokens : null;

      if (!tokens) {
        toast?.show?.({ message: "That file has no tokens object.", type: "error" });
        return;
      }

      const accepted = {};
      let rejected = 0;

      for (const [token, value] of Object.entries(tokens)) {
        if ((isKnownToken(token) && isSafeTokenValue(value)) ||
            (Object.prototype.hasOwnProperty.call(FONT_TOKENS, token) &&
              FONT_TOKENS[token].some((option) => option.stack === asText(value))) ||
            isAllowedTokenValue(token, value)) {
          accepted[token] = asText(value);
        } else {
          rejected += 1;
        }
      }

      customTokens = accepted;
      commit();
      syncPanel();

      toast?.show?.({
        message: rejected > 0
          ? `Theme applied; ${rejected} unsupported value(s) were ignored.`
          : "Theme applied.",
        type: rejected > 0 ? "warning" : "success"
      });
    });

    const resetButton = el("button", {
      className: "btn btn--outline btn--small",
      text: "Reset to default",
      attrs: { type: "button" }
    });
    resetButton.addEventListener("click", () => {
      reset();
      syncPanel();
    });

    actions.append(undo, redo, exportButton, importLabel, importInput, resetButton);
    panel.append(actions);

    // Undo/redo shortcuts exist only while the dialog is open: a global Ctrl+Z
    // would fight the browser's own undo in a text field.
    const onKeydown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") {
        return;
      }

      const target = event.target;

      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) &&
          !(target instanceof HTMLInputElement && target.type === "color")) {
        return;
      }

      event.preventDefault();

      if (event.shiftKey) {
        travel(1);
      } else {
        travel(-1);
      }

      syncPanel();
    };

    document.addEventListener("keydown", onKeydown);

    openModal({
      title: "Theme",
      content: panel,
      size: "lg",
      initialFocus: panel.querySelector(`input[name="${groupName}"]:checked`) ?? undefined,
      onClose: () => document.removeEventListener("keydown", onKeydown)
    });
  }

  restore();

  const tool = addToolButton({
    id: "theme-studio-trigger",
    label: "Theme",
    icon: "palette",
    onClick: openPanel
  });

  // Opened from the header button as well as from the dock. The bus keeps the
  // feature's dialog ownership intact and lets navigation stay DOM-only.
  const offOpenRequest = bus?.on?.("ui:open-theme", () => openPanel());

  teardownPrevious = () => {
    offOpenRequest?.();
    tool.remove();
  };
}

/**
 * Pure helpers and the control tables, attached to the initializer for the
 * DOM-free tests in tests/cases/theme-studio.test.mjs.
 *
 * They are properties rather than a second export because
 * scripts/check-modules.mjs requires exactly one export per section/feature
 * module; a named export would fail the contract check. Nothing in the panel
 * reads them through this object.
 */
initializeThemeStudio.controls = Object.freeze({
  layout: LAYOUT_CONTROLS,
  components: COMPONENT_CONTROLS,
  defaults: TOKEN_DEFAULTS,
  isAllowedTokenValue,
  resolveOptionId
});
