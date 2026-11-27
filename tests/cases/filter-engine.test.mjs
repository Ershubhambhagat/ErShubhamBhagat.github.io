import test from "node:test";
import assert from "node:assert/strict";

import { applyFilters, collectFilterValues, readPath } from "../../js/core/filter-engine.js";

const records = [
  { id: "a", categoryId: "web", technologies: ["HTML", "CSS"], company: { name: "Acme" } },
  { id: "b", categoryId: "iot", technologies: ["C++", ".NET Core"], company: { name: "Beta" } },
  { id: "c", categoryId: "web", technologies: ["JavaScript"], company: null }
];

test("readPath follows dotted paths and stops at null", () => {
  assert.equal(readPath(records[0], "company.name"), "Acme");
  assert.equal(readPath(records[2], "company.name"), undefined);
  assert.equal(readPath(records[0], ""), undefined);
});

test("a scalar filter keeps one category", () => {
  assert.deepEqual(applyFilters(records, { categoryId: "web" }).map((r) => r.id), ["a", "c"]);
});

test("an array filter matches when any entry matches, case-insensitively", () => {
  assert.deepEqual(
    applyFilters(records, { technologies: "html" }).map((r) => r.id),
    ["a"]
  );
  assert.deepEqual(
    applyFilters(records, { technologies: [".net core", "javascript"] }).map((r) => r.id),
    ["b", "c"]
  );
});

test("an ignored value means no restriction", () => {
  assert.equal(applyFilters(records, { categoryId: "all" }).length, 3);
  assert.equal(applyFilters(records, { categoryId: "" }).length, 3);
});

test("a predicate filter is supported", () => {
  const result = applyFilters(records, {
    id: (value) => value !== "b"
  });

  assert.deepEqual(result.map((r) => r.id), ["a", "c"]);
});

test("collectFilterValues de-duplicates and sorts values", () => {
  assert.deepEqual(collectFilterValues(records, "categoryId"), ["iot", "web"]);
  assert.deepEqual(collectFilterValues(records, "technologies"), [
    ".NET Core",
    "C++",
    "CSS",
    "HTML",
    "JavaScript"
  ]);
});

test("filtering never mutates the source records", () => {
  const before = JSON.stringify(records);
  applyFilters(records, { categoryId: "web" });
  assert.equal(JSON.stringify(records), before);
});
