import test from "node:test";
import assert from "node:assert/strict";

import { allocateId, isIdTaken, nextId } from "../../../tools/json-editor/js/ids.js";

const projectsDataset = { key: "projects", prefix: "project-" };
const themesDataset = { key: "themePresets", prefix: "" };

test("nextId starts a collection at 001", () => {
  assert.equal(nextId(projectsDataset, []), "project-001");
  assert.equal(nextId(projectsDataset, null), "project-001");
});

test("nextId takes the highest suffix plus one", () => {
  const records = [{ id: "project-001" }, { id: "project-007" }, { id: "project-003" }];
  assert.equal(nextId(projectsDataset, records), "project-008");
});

test("nextId keeps a gap after a deletion instead of reusing the id", () => {
  // Deleting project-002 must not make the next record project-002 again: any
  // reference still holding the old id would silently repoint.
  const afterDelete = [{ id: "project-001" }, { id: "project-003" }];
  assert.equal(nextId(projectsDataset, afterDelete), "project-004");
  assert.equal(isIdTaken("project-002", afterDelete), false);
});

test("nextId ignores ids of another prefix or a non-numeric suffix", () => {
  const records = [{ id: "exp-099" }, { id: "project-frontend" }, { id: "project-002" }, { id: "note" }];
  assert.equal(nextId(projectsDataset, records), "project-003");
});

test("nextId pads to three digits but keeps counting past 999", () => {
  assert.equal(nextId({ prefix: "x-" }, [{ id: "x-009" }]), "x-010");
  assert.equal(nextId({ prefix: "x-" }, [{ id: "x-999" }]), "x-1000");
});

test("a dataset without a prefix has no generated id", () => {
  assert.equal(nextId(themesDataset, [{ id: "daylight" }]), "");
  assert.equal(nextId(null, []), "");
});

test("allocateId returns the free candidate when there is no collision", () => {
  assert.equal(allocateId(projectsDataset, [{ id: "project-001" }]), "project-002");
});

test("allocateId advances past an id that is already taken", () => {
  // A manual import can already occupy the id nextId would hand out.
  const records = [{ id: "project-001" }, { id: "project-002" }];
  assert.equal(allocateId(projectsDataset, records), "project-003");
});

test("allocateId never returns an id that exists", () => {
  const records = [{ id: "skill-001" }, { id: "skill-002" }, { id: "skill-003" }];
  const id = allocateId({ prefix: "skill-" }, records);
  assert.equal(isIdTaken(id, records), false);
});

test("isIdTaken only matches on exact id", () => {
  const records = [{ id: "project-001" }];
  assert.equal(isIdTaken("project-001", records), true);
  assert.equal(isIdTaken("project-01", records), false);
  assert.equal(isIdTaken("project-001", null), false);
});

test("isIdTaken tolerates records without an id", () => {
  assert.equal(isIdTaken("project-001", [{ title: "no id" }]), false);
  assert.equal(isIdTaken("project-001", [null, "x"]), false);
});
