import test from "node:test";
import assert from "node:assert/strict";

import {
  changedPaths,
  diffDocuments,
  isEmptyDiff,
  summarizeChanges
} from "../../../tools/json-editor/js/diff.js";

const projectsDataset = { key: "projects", collection: "projects", labelField: "title", categories: "categories" };
const profileDataset = { key: "profile", collection: "profile", labelField: "name", kind: "record", categories: null };

const doc = (projects, categories = []) => ({ projects, categories });

test("changedPaths walks nested objects and lists dotted paths", () => {
  const before = { company: { name: "Acme", location: "Pune" } };
  const after = { company: { name: "Acme", location: "Mumbai" } };
  assert.deepEqual(changedPaths(before, after), ["company.location"]);
});

test("changedPaths reports an added and a removed key", () => {
  assert.deepEqual(changedPaths({ a: 1 }, { a: 1, b: 2 }), ["b"]);
  assert.deepEqual(changedPaths({ a: 1, b: 2 }, { a: 1 }), ["b"]);
});

test("changedPaths treats an array as one path so a tag edit is one change", () => {
  assert.deepEqual(changedPaths({ tags: ["a", "b"] }, { tags: ["a", "b", "c"] }), ["tags"]);
});

test("changedPaths distinguishes null from missing", () => {
  assert.deepEqual(changedPaths({ a: null }, { a: "x" }), ["a"]);
  assert.deepEqual(changedPaths({ a: "x" }, { a: null }), ["a"]);
});

test("changedPaths returns nothing for identical deep values", () => {
  const value = { a: [1, 2], b: { c: "x" } };
  assert.deepEqual(changedPaths(value, JSON.parse(JSON.stringify(value))), []);
});

test("an added record is grouped under added", () => {
  const before = doc([{ id: "project-001", title: "One" }]);
  const after = doc([{ id: "project-001", title: "One" }, { id: "project-002", title: "Two" }]);
  const diff = diffDocuments(before, after, projectsDataset);

  assert.deepEqual(diff.added, [{ id: "project-002", label: "Two" }]);
  assert.deepEqual(diff.updated, []);
  assert.deepEqual(diff.removed, []);
});

test("a removed record is grouped under removed", () => {
  const before = doc([{ id: "project-001", title: "One" }, { id: "project-002", title: "Two" }]);
  const after = doc([{ id: "project-001", title: "One" }]);
  const diff = diffDocuments(before, after, projectsDataset);

  assert.deepEqual(diff.removed, [{ id: "project-002", label: "Two" }]);
});

test("an updated record carries each changed field with its before and after value", () => {
  const before = doc([{ id: "project-001", title: "One", company: { name: "Acme" } }]);
  const after = doc([{ id: "project-001", title: "One renamed", company: { name: "Acme" } }]);
  const diff = diffDocuments(before, after, projectsDataset);

  assert.equal(diff.updated.length, 1);
  assert.equal(diff.updated[0].label, "One renamed");
  assert.deepEqual(diff.updated[0].fields, [{ path: "title", from: "One", to: "One renamed" }]);
});

test("a reordering is not a content change", () => {
  const before = doc([{ id: "project-001", title: "One" }, { id: "project-002", title: "Two" }]);
  const after = doc([{ id: "project-002", title: "Two" }, { id: "project-001", title: "One" }]);

  assert.equal(isEmptyDiff(diffDocuments(before, after, projectsDataset)), true);
});

test("records without an id are keyed by position, not merged together", () => {
  const before = { projects: [{ title: "One" }] };
  const after = { projects: [{ title: "One" }, { title: "Two" }] };
  const diff = diffDocuments(before, after, projectsDataset);

  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].id, "(index 1)");
});

test("a category-only change is reported under categories", () => {
  const before = doc([], [{ id: "data", name: "Data" }]);
  const after = doc([], [{ id: "data", name: "Data" }, { id: "tools", name: "Tools" }]);
  const diff = diffDocuments(before, after, projectsDataset);

  assert.deepEqual(diff.categories.added, [{ id: "tools", label: "Tools" }]);
  assert.equal(summarizeChanges(diff).categoryChanges, 1);
  assert.equal(isEmptyDiff(diff), false);
});

test("no category change leaves categories null instead of an empty object", () => {
  const diff = diffDocuments(doc([]), doc([]), projectsDataset);
  assert.equal(diff.categories, null);
  assert.equal(summarizeChanges(diff).categoryChanges, 0);
});

test("a single-object dataset diffs as a field list", () => {
  const before = { profile: { name: "A", headline: "Engineer" } };
  const after = { profile: { name: "A", headline: "Developer" } };
  const diff = diffDocuments(before, after, profileDataset);

  assert.deepEqual(diff.updated[0].fields, [{ path: "headline", from: "Engineer", to: "Developer" }]);
});

test("a missing document counts as empty, not as a crash", () => {
  const diff = diffDocuments(null, doc([{ id: "project-001", title: "One" }]), projectsDataset);
  assert.equal(diff.added.length, 1);

  const reverse = diffDocuments(doc([{ id: "project-001", title: "One" }]), null, projectsDataset);
  assert.equal(reverse.removed.length, 1);
  assert.equal(reverse.added.length, 0);
});

test("an unknown dataset returns an empty diff", () => {
  const diff = diffDocuments(doc([{ id: "a" }]), doc([{ id: "b" }]), null);
  assert.equal(isEmptyDiff(diff), true);
  assert.deepEqual(summarizeChanges(diff), { added: 0, updated: 0, removed: 0, categoryChanges: 0 });
});

test("summarizeChanges tolerates a null diff", () => {
  assert.deepEqual(summarizeChanges(null), { added: 0, updated: 0, removed: 0, categoryChanges: 0 });
  assert.equal(isEmptyDiff(null), true);
});

test("an untitled record still gets a readable label", () => {
  const before = doc([]);
  const after = doc([{ id: "project-009" }]);
  const diff = diffDocuments(before, after, projectsDataset);
  assert.equal(diff.added[0].label, "project-009");
});
