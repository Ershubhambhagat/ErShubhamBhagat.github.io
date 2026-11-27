import test from "node:test";
import assert from "node:assert/strict";

import { createHistory } from "../../../tools/json-editor/js/history.js";

const step = (label) => ({ key: "projects", label, before: { n: 0 }, after: { n: 1 } });

test("a fresh history can do nothing", () => {
  const history = createHistory();
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), false);
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), null);
  assert.equal(history.depth(), 0);
  assert.equal(history.nextUndoLabel(), "");
});

test("undo walks backwards and redo walks forwards", () => {
  const history = createHistory();
  history.push(step("added record"));
  history.push(step("renamed field"));

  assert.equal(history.canUndo(), true);
  assert.equal(history.nextUndoLabel(), "renamed field");

  assert.equal(history.undo().label, "renamed field");
  assert.equal(history.nextUndoLabel(), "added record");
  assert.equal(history.undo().label, "added record");
  assert.equal(history.canUndo(), false);
  assert.equal(history.undo(), null);
});

test("redo replays in the original order", () => {
  const history = createHistory();
  history.push(step("one"));
  history.push(step("two"));
  history.undo();
  history.undo();

  assert.equal(history.nextRedoLabel(), "one");
  assert.equal(history.redo().label, "one");
  assert.equal(history.redo().label, "two");
  assert.equal(history.canRedo(), false);
  assert.equal(history.redo(), null);
});

test("a new edit after undo discards the redo branch", () => {
  const history = createHistory();
  history.push(step("one"));
  history.push(step("two"));
  history.undo();

  history.push(step("three"));

  assert.equal(history.canRedo(), false);
  assert.equal(history.depth(), 2);
  assert.equal(history.size(), 2);
  assert.equal(history.nextUndoLabel(), "three");
});

test("depth counts applied steps while size counts stored ones", () => {
  const history = createHistory();
  history.push(step("one"));
  history.push(step("two"));
  history.undo();

  assert.equal(history.size(), 2);
  assert.equal(history.depth(), 1);
});

test("the stack is capped and drops the oldest entry", () => {
  const history = createHistory({ limit: 3 });
  for (const label of ["one", "two", "three", "four"]) history.push(step(label));

  assert.equal(history.size(), 3);
  // "one" was dropped by the cap, so the oldest reachable entry is "two" and
  // undo runs out after it instead of reaching the evicted step.
  assert.equal(history.undo().label, "four");
  assert.equal(history.undo().label, "three");
  assert.equal(history.undo().label, "two");
  assert.equal(history.canUndo(), false);
  assert.equal(history.undo(), null);
});

test("the cap never leaves a redo branch pointing past the dropped entry", () => {
  const history = createHistory({ limit: 2 });
  history.push(step("one"));
  history.push(step("two"));
  history.push(step("three"));

  assert.equal(history.depth(), 2);
  history.undo();
  history.undo();
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), true);
});

test("push ignores an empty entry and clear resets everything", () => {
  const history = createHistory();
  history.push(null);
  assert.equal(history.size(), 0);

  history.push(step("one"));
  history.clear();

  assert.equal(history.size(), 0);
  assert.equal(history.depth(), 0);
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), false);
});

test("labels follow whichever step sits under the cursor", () => {
  const history = createHistory();
  history.push(step("only"));

  assert.equal(history.nextRedoLabel(), "");
  history.undo();
  assert.equal(history.nextRedoLabel(), "only");
  assert.equal(history.nextUndoLabel(), "");
});
