/**
 * tests/cases/theme-studio.test.mjs - the Theme Studio control tables.
 *
 * The panel itself needs a browser (see .build/test-theme-depth.mjs); what is
 * testable here is the pair of pure functions the controls are built on. They
 * carry the safety property the whole feature rests on: a layout or component
 * token only ever receives one of the literals in these tables.
 *
 * The helpers are reached through initializeThemeStudio.controls because the
 * module contract allows exactly one export per feature module.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { initializeThemeStudio } from "../../js/features/theme-studio.js";

const { layout, components, defaults, isAllowedTokenValue, resolveOptionId } =
  initializeThemeStudio.controls;

const allControls = [...layout, ...components];

/** A token map holding one option's values, as the panel would apply it. */
const tokensOf = (option) => ({ ...option.values });

test("no two controls write the same token", () => {
  const seen = new Map();

  for (const control of allControls) {
    for (const token of control.tokens) {
      assert.equal(
        seen.has(token),
        false,
        `${token} is owned by both "${seen.get(token)}" and "${control.id}"`
      );
      seen.set(token, control.id);
    }
  }

  assert.equal(seen.size, allControls.flatMap((control) => control.tokens).length);
});

test("every option value is accepted for the token it declares", () => {
  for (const control of allControls) {
    for (const option of control.options) {
      for (const [token, value] of Object.entries(option.values)) {
        assert.equal(
          isAllowedTokenValue(token, value),
          true,
          `${control.id}/${option.id}: ${token}: ${value} was rejected`
        );
      }
    }
  }
});

test("each option resolves back to itself, and the default resolves to the first option", () => {
  assert.equal(resolveOptionId(layout[0], {}), layout[0].options[0].id);

  for (const control of allControls) {
    for (const option of control.options) {
      assert.equal(
        resolveOptionId(control, tokensOf(option)),
        option.id,
        `${control.id} did not resolve ${option.id}`
      );
    }
  }
});

test("an explicit value equal to the stylesheet default still reads as the default option", () => {
  // A restored draft or an imported file may spell the default out; the select
  // must not claim a custom shape is applied when the page looks untouched.
  assert.equal(resolveOptionId(layout[1], { "--radius-lg": defaults["--radius-lg"] }), "default");
  assert.equal(resolveOptionId(layout[0], { "--spacing-md": defaults["--spacing-md"] }), "default");
  assert.equal(
    resolveOptionId(layout[2], { "--animation-intensity": defaults["--animation-intensity"] }),
    "full"
  );
});

test("a value outside the table is rejected for that token", () => {
  // The unit is valid CSS but not an option, which is the point: the table is the
  // contract, not the CSS grammar.
  assert.equal(isAllowedTokenValue("--radius-lg", "1rem"), false);
  assert.equal(isAllowedTokenValue("--spacing-md", "37rem"), false);
  assert.equal(isAllowedTokenValue("--radius-md", "4px"), false);
  assert.equal(isAllowedTokenValue("--animation-intensity", "2"), false);
  assert.equal(isAllowedTokenValue("--shadow-md", "0 0 0 red"), false);
});

test("injection attempts are rejected, including a value that is valid for another token", () => {
  assert.equal(isAllowedTokenValue("--radius-lg", "url(https://evil.test/x.png)"), false);
  assert.equal(isAllowedTokenValue("--radius-lg", "0.25rem; background: red"), false);
  assert.equal(isAllowedTokenValue("--shadow-md", "var(--color-primary)"), false);
  assert.equal(isAllowedTokenValue("--spacing-md", "calc(1rem + 100vh)"), false);

  // Colour tokens are not layout tokens, and vice versa.
  assert.equal(isAllowedTokenValue("--color-primary", "#123456"), false);
  assert.equal(isAllowedTokenValue("--radius-lg", "#123456"), false);
  assert.equal(isAllowedTokenValue("--not-a-token", "0.25rem"), false);
});

test("the table only holds lengths, a shadow or a bounded multiplier", () => {
  const length = /^(0|\d*\.?\d+(rem|px|em))$/;
  const shadow = /^(0|\d+px) \d+px \d+px -?\d+px rgba\(0, 0, 0, 0?\.\d+\)$/;

  for (const control of allControls) {
    for (const option of control.options) {
      for (const [token, value] of Object.entries(option.values)) {
        if (token === "--shadow-md") {
          assert.ok(
            value === "none" || shadow.test(value),
            `${control.id}: ${value} is not a plain shadow or none`
          );
        } else if (token === "--animation-intensity") {
          const number = Number(value);

          assert.ok(number >= 0 && number <= 1, `${control.id}: ${value} is outside 0-1`);
        } else {
          assert.match(value, length, `${control.id}: ${token}: ${value}`);
        }
      }
    }
  }
});

test("every token a control writes has a documented default, except the themed shadow", () => {
  for (const control of allControls) {
    for (const token of control.tokens) {
      if (token === "--shadow-md") {
        assert.equal(defaults[token], undefined);
      } else {
        assert.equal(typeof defaults[token], "string", `${token} has no default`);
        assert.equal(isAllowedTokenValue(token, defaults[token]), true);
      }
    }
  }
});

test("the motion range has one option per step and stays inside 0-1", () => {
  const motion = layout.find((control) => control.id === "motion");

  assert.equal(motion.kind, "range");
  assert.deepEqual(
    motion.options.map((option) => Number(option.values["--animation-intensity"])),
    [0, 0.25, 0.5, 0.75, 1]
  );
  assert.equal(motion.options.length, 5);
});

test("a theme map with an unlisted value falls back to a usable option", () => {
  // Cannot happen through the panel or a validated import, but a hand-edited
  // preset could: the select must show something selectable rather than blank.
  assert.equal(resolveOptionId(layout[0], { "--spacing-md": "3rem" }), "default");
  assert.equal(resolveOptionId(components[0], { "--shadow-md": "0 0 1px #000" }), "default");
});
