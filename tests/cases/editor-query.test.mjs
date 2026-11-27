import test from "node:test";
import assert from "node:assert/strict";

import {
  facetValues,
  filterAndSort,
  filterFieldsFor,
  searchFieldsFor
} from "../../../tools/json-editor/js/query.js";

const projects = [
  { id: "project-001", title: "Zeta Dashboard", categoryId: "data", order: 2, status: "live" },
  { id: "project-002", title: "alpha parser", categoryId: "tooling", order: 1, status: "draft" },
  { id: "project-003", title: "Beta Engine", status: "live", updatedAt: "2025-04-02" },
  { id: "project-004", title: "gamma engine", status: "draft", updatedAt: "2024-11-30" }
];

const ids = (result) => result.map((entry) => entry.record.id);
const dataset = { key: "projects", labelField: "title" };

test("an empty query keeps every record", () => {
  assert.equal(filterAndSort(projects, { query: "   " }).length, 4);
});

test("search is case-insensitive and matches a substring", () => {
  assert.deepEqual(ids(filterAndSort(projects, { query: "ENGINE" })), ["project-003", "project-004"]);
});

test("search only reads the declared fields", () => {
  // "tooling" is a categoryId, not in the project search fields, so it must not
  // be found: a field list is a promise about what a search looks at.
  const fields = searchFieldsFor(dataset);
  assert.equal(filterAndSort(projects, { query: "tooling", fields }).length, 0);
  assert.equal(filterAndSort(projects, { query: "dashboard", fields }).length, 1);
});

test("a dotted search field reaches into a nested object", () => {
  const records = [{ id: "exp-001", role: "Engineer", company: { name: "Acme" } }];
  const found = filterAndSort(records, { query: "acme", fields: ["company.name"] });
  assert.equal(found.length, 1);
});

test("an exact-value filter drops the rest", () => {
  assert.deepEqual(ids(filterAndSort(projects, { filter: { field: "status", value: "draft" } })), [
    "project-002",
    "project-004"
  ]);
});

test("an empty filter value is the same as no filter", () => {
  assert.equal(filterAndSort(projects, { filter: { field: "status", value: "" } }).length, 4);
});

test("a filter matches inside an array of tags", () => {
  const records = [
    { id: "a", technologies: ["Python", "Django"] },
    { id: "b", technologies: ["Go"] }
  ];
  const found = filterAndSort(records, { filter: { field: "technologies", value: "Django" } });
  assert.deepEqual(ids(found), ["a"]);
});

test("a boolean filter compares its string form", () => {
  const records = [{ id: "a", featured: true }, { id: "b", featured: false }];
  assert.deepEqual(ids(filterAndSort(records, { filter: { field: "featured", value: "true" } })), ["a"]);
});

test("sort by order follows the manual order field", () => {
  assert.deepEqual(ids(filterAndSort(projects, { sort: "order" })), [
    "project-002",
    "project-001",
    "project-003",
    "project-004"
  ]);
});

test("records without an order keep the file order at the end", () => {
  // project-002 has order 1 and sorts first; the two order-less records keep
  // their relative positions instead of being dropped or pushed to the top.
  assert.deepEqual(ids(filterAndSort(projects, { sort: "order" })).slice(2), ["project-003", "project-004"]);
});

test("sort by id is numeric-aware", () => {
  const records = [{ id: "skill-10" }, { id: "skill-2" }, { id: "skill-1" }];
  assert.deepEqual(ids(filterAndSort(records, { sort: "id" })), ["skill-1", "skill-2", "skill-10"]);
});

test("sort by label is case-insensitive", () => {
  assert.deepEqual(ids(filterAndSort(projects, { sort: "label" })), [
    "project-002",
    "project-003",
    "project-004",
    "project-001"
  ]);
});

test("sort by updated is newest first with undated records last", () => {
  assert.deepEqual(ids(filterAndSort(projects, { sort: "updated" })), [
    "project-003",
    "project-004",
    "project-001",
    "project-002"
  ]);
});

test("an unknown sort mode falls back to manual order", () => {
  // The schema default is "order", so an unrecognised mode must not reorder by
  // accident in a way the owner cannot predict; it uses the same rule as "order".
  assert.deepEqual(ids(filterAndSort(projects, { sort: "nonsense" })), ids(filterAndSort(projects, { sort: "order" })));
});

test("the original array is never mutated", () => {
  const before = ids(projects.map((record) => ({ record })));
  filterAndSort(projects, { sort: "label", query: "engine" });
  assert.deepEqual(ids(projects.map((record) => ({ record }))), before);
});

test("every entry keeps the index of its record in the file", () => {
  // The table's move/delete buttons write by file index, so a sorted view must
  // still carry the original position of each row.
  const found = filterAndSort(projects, { sort: "label" });
  assert.deepEqual(
    found.map((entry) => entry.index),
    [1, 2, 3, 0]
  );
});

test("a non-array input yields an empty result instead of throwing", () => {
  assert.deepEqual(filterAndSort(null), []);
  assert.deepEqual(filterAndSort(undefined, { query: "x" }), []);
});

test("filterFieldsFor offers only fields the records actually have", () => {
  // categoryId and status both exist on the sample record; a field the first
  // record does not carry is not offered, because its select would be empty.
  assert.deepEqual(filterFieldsFor(projects), ["categoryId", "status"]);
  assert.deepEqual(filterFieldsFor([{ id: "a", title: "x" }]), []);
  assert.deepEqual(filterFieldsFor([]), []);
});

test("facetValues lists distinct values once, sorted naturally", () => {
  assert.deepEqual(facetValues(projects, "status"), [
    { value: "draft", label: "draft" },
    { value: "live", label: "live" }
  ]);
});

test("facetValues flattens arrays and skips blanks", () => {
  const records = [
    { technologies: ["Go", "Python"] },
    { technologies: ["Python"] },
    { technologies: [] },
    { }
  ];
  assert.deepEqual(facetValues(records, "technologies").map((option) => option.value), ["Go", "Python"]);
  assert.deepEqual(facetValues(records, ""), []);
});

test("searchFieldsFor falls back to id and label for an unknown dataset", () => {
  assert.deepEqual(searchFieldsFor({ key: "unknown", labelField: "title" }), ["id", "title"]);
  assert.deepEqual(searchFieldsFor(null), []);
});
