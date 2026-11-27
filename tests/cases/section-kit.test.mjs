import test from "node:test";
import assert from "node:assert/strict";

import {
  asArray,
  asText,
  formatDate,
  formatDateRange,
  parseDate,
  readCollection,
  readSectionConfig
} from "../../js/core/section-kit.js";

test("parseDate accepts year, year-month and full dates only", () => {
  assert.deepEqual(parseDate("2025"), { year: 2025, month: null, day: null, time: Date.UTC(2025, 0, 1) });
  assert.equal(parseDate("2025-03").month, 3);
  assert.equal(parseDate("2025-03-14").day, 14);
  assert.equal(parseDate("2025-13"), null);
  assert.equal(parseDate("14/03/2025"), null);
  assert.equal(parseDate(""), null);
});

test("formatDate respects precision", () => {
  assert.equal(formatDate("2025"), "2025");
  assert.equal(formatDate("2025-03"), "Mar 2025");
  assert.equal(formatDate("2025-03-14", "long"), "14 Mar 2025");
  assert.equal(formatDate("nonsense"), "");
});

test("formatDateRange collapses a missing end date honestly", () => {
  assert.equal(formatDateRange("2024-01", "2025-03"), "Jan 2024 – Mar 2025");
  assert.equal(formatDateRange("2024-01", "", true), "Jan 2024 – Present");
  // A missing end date with current=false must not claim "Present": the spell is
  // over, the end is simply unknown.
  assert.equal(formatDateRange("2024-01", "", false), "Jan 2024");
  assert.equal(formatDateRange("2024-01", null, false), "Jan 2024");
  assert.equal(formatDateRange("2024-01", null, true), "Jan 2024 – Present");
  assert.equal(formatDateRange("", "2025"), "2025");
  assert.equal(formatDateRange("", ""), "");
});

test("readCollection accepts a named array or a bare array", () => {
  assert.equal(readCollection({ projects: [{ id: "a" }] }, "projects").length, 1);
  assert.equal(readCollection([{ id: "a" }], "projects").length, 1);
  assert.deepEqual(readCollection({ projects: "nope" }, "projects"), []);
  assert.deepEqual(readCollection(null, "projects"), []);
});

test("readSectionConfig tolerates a missing section block", () => {
  assert.deepEqual(readSectionConfig({ section: { title: "X" } }), { title: "X" });
  assert.deepEqual(readSectionConfig({}), {});
  assert.deepEqual(readSectionConfig(null), {});
});

test("asText and asArray never leak non-values into the DOM", () => {
  assert.equal(asText("  ok  "), "ok");
  assert.equal(asText(42), "");
  assert.equal(asText(null), "");
  assert.deepEqual(asArray(undefined), []);
  assert.deepEqual(asArray("x"), []);
});
