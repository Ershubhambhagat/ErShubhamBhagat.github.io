import test from "node:test";
import assert from "node:assert/strict";

import {
  applyFilters,
  matchesRange,
  normalizeRange
} from "../../js/core/filter-engine.js";
import { deriveRangeBounds } from "../../js/components/filter.js";

const records = [
  { id: "a", year: 2022, score: 90, rated: true },
  { id: "b", year: 2023, score: null, rated: false },
  { id: "c", year: 2025, score: 75, rated: true },
  { id: "d", year: null, score: 80, rated: true }
];

test("a range filter keeps the records inside the interval", () => {
  assert.deepEqual(
    applyFilters(records, { year: { min: 2023, max: 2025 } }).map((r) => r.id),
    ["b", "c"]
  );
});

test("either end of a range can be open", () => {
  assert.deepEqual(
    applyFilters(records, { year: { min: 2024 } }).map((r) => r.id),
    ["c"]
  );
  assert.deepEqual(
    applyFilters(records, { year: { max: 2022 } }).map((r) => r.id),
    ["a"]
  );
});

test("a cleared range is no filter at all", () => {
  assert.equal(applyFilters(records, { year: { min: null, max: null } }).length, 4);
  assert.equal(applyFilters(records, { year: { min: "", max: "" } }).length, 4);
});

test("records without a numeric value never match an active range", () => {
  assert.deepEqual(
    applyFilters(records, { score: { min: 0, max: 100 } }).map((r) => r.id),
    ["a", "c", "d"]
  );
});

test("range bounds accept numeric strings and are inclusive", () => {
  assert.deepEqual(
    applyFilters(records, { year: { min: "2022", max: "2023" } }).map((r) => r.id),
    ["a", "b"]
  );
  assert.equal(matchesRange(2023, { min: 2023, max: 2023 }), true);
  assert.equal(matchesRange(2022.9, { min: 2023 }), false);
});

test("a range rule is recognised and normalised, other objects are not", () => {
  assert.equal(normalizeRange({ min: "2024", max: "" }).min, 2024);
  assert.equal(normalizeRange({ min: "2024", max: "" }).max, null);
  assert.deepEqual(normalizeRange({ company: { name: "Acme" } }), { min: null, max: null });
  assert.equal(matchesRange("abc", { min: 1 }), false);
});

test("a range rule combines with an equality rule", () => {
  assert.deepEqual(
    applyFilters(records, { rated: "true", score: { min: 80 } }).map((r) => r.id),
    ["a", "d"]
  );
});

test("deriveRangeBounds reads real numbers and rounds outward", () => {
  assert.deepEqual(deriveRangeBounds(records, "year"), { min: 2022, max: 2025, step: 1 });
  assert.deepEqual(deriveRangeBounds(records, (r) => r.score, { step: 5, round: true }), {
    min: 75,
    max: 90,
    step: 5
  });
});

test("deriveRangeBounds refuses a dataset without an interval", () => {
  assert.equal(deriveRangeBounds([{ score: null }, { score: 80 }], "score"), null);
  assert.equal(deriveRangeBounds([], "score"), null);
  assert.equal(deriveRangeBounds(records, "missing"), null);
});
