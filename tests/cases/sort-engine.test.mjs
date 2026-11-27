import test from "node:test";
import assert from "node:assert/strict";

import { applySort, parseSortableDate, SORT_MODES } from "../../js/core/sort-engine.js";

test("parseSortableDate handles mixed precision without timezone drift", () => {
  assert.equal(parseSortableDate("2024"), 20240101);
  assert.equal(parseSortableDate("2024-05"), 20240501);
  assert.equal(parseSortableDate("2024-05-31"), 20240531);
  assert.equal(parseSortableDate(""), null);
  assert.equal(parseSortableDate("not-a-date"), null);
});

test("newest and oldest put undated records last in both directions", () => {
  const records = [
    { id: "a", date: "2020-01" },
    { id: "b" },
    { id: "c", date: "2024-09" }
  ];

  assert.deepEqual(applySort(records, "newest").map((r) => r.id), ["c", "a", "b"]);
  assert.deepEqual(applySort(records, "oldest").map((r) => r.id), ["a", "c", "b"]);
});

test("equal dates keep the incoming order", () => {
  const records = [
    { id: "first", date: "2024-01-01" },
    { id: "second", date: "2024-01-01" }
  ];

  assert.deepEqual(applySort(records, "newest").map((r) => r.id), ["first", "second"]);
});

test("alphabetical sorting is numeric-aware and stable for empty labels", () => {
  const records = [
    { id: "s10", title: "Skill 10" },
    { id: "s2", title: "Skill 2" },
    { tags: ["no label"] }
  ];

  assert.deepEqual(applySort(records, "alphabetical").map((r) => r.id), ["s2", "s10", undefined]);
});

test("sorting never mutates the input array", () => {
  const records = [{ id: "a", date: "2020" }, { id: "b", date: "2024" }];
  const copy = records.slice();

  applySort(records, "newest");

  assert.deepEqual(records, copy);
});

test("an unknown mode leaves the order unchanged", () => {
  const records = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(applySort(records, "sideways").map((r) => r.id), ["a", "b"]);
  assert.deepEqual([...SORT_MODES], ["newest", "oldest", "alphabetical"]);
});

test("explicit getters override the default key search", () => {
  const records = [
    { id: "a", meta: { when: "2021" } },
    { id: "b", meta: { when: "2023" } }
  ];

  const sorted = applySort(records, "newest", {
    getDateValue: (record) => record.meta.when
  });

  assert.deepEqual(sorted.map((r) => r.id), ["b", "a"]);
});
