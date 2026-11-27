/**
 * tools/json-editor/js/history.js - bounded undo/redo of document snapshots.
 *
 * Why whole documents instead of inverse operations: every editor action here
 * rewrites a collection (insert, delete, reorder, category edit), and an inverse
 * per action is a second implementation that can disagree with the first. A
 * snapshot of the parsed document is small (the largest file is a few hundred
 * kilobytes of JSON) and undo becomes an assignment.
 *
 * The stack is deliberately in memory only: a reload must not resurrect edits the
 * owner believed were discarded, and JSON never goes to LocalStorage.
 *
 * Bounded: `limit` entries (default 50); the oldest is dropped, so a long session
 * cannot grow without limit. Pushing after an undo discards the redo branch, which
 * is what every editor does and what keeps "undo" from replaying a stale future.
 *
 * Pure: no DOM, no editor imports. `node tests/run.mjs` covers ordering and the cap.
 */

export function createHistory({ limit = 50 } = {}) {
  const entries = [];
  let cursor = 0;

  const size = () => entries.length;

  return {
    /**
     * Records one applied change.
     * @param {{key: string, label: string, before: Object, after: Object}} entry
     */
    push(entry) {
      if (!entry) return;

      // A new edit after undo makes the undone branch unreachable: keep the past,
      // drop the future, then append.
      if (cursor < entries.length) entries.length = cursor;

      entries.push(entry);
      if (entries.length > limit) entries.shift();

      cursor = entries.length;
    },

    /** The change that would be reverted, or null. */
    undo() {
      if (cursor === 0) return null;
      cursor -= 1;
      return entries[cursor];
    },

    /** The change that would be reapplied, or null. */
    redo() {
      if (cursor >= entries.length) return null;
      const entry = entries[cursor];
      cursor += 1;
      return entry;
    },

    canUndo() {
      return cursor > 0;
    },

    canRedo() {
      return cursor < entries.length;
    },

    /** Label of the next undo, so a button can say what it will revert. */
    nextUndoLabel() {
      return cursor > 0 ? entries[cursor - 1].label : "";
    },

    nextRedoLabel() {
      return cursor < entries.length ? entries[cursor].label : "";
    },

    /** Number of applied steps (not the number of stored entries). */
    depth() {
      return cursor;
    },

    /** Number of stored entries, including a redo branch. */
    size,

    clear() {
      entries.length = 0;
      cursor = 0;
    }
  };
}
