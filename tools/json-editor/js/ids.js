/**
 * tools/json-editor/js/ids.js - stable id allocation for record collections.
 *
 * Why this is its own module: id policy is a data rule, not an interface rule.
 * Keeping it out of app.js lets `node tests/run.mjs` prove it without a DOM, and
 * keeping it out of schema.js stops the registry from depending on id policy.
 *
 * The invariant that matters: an existing id is never reused and never rewritten.
 * A new record takes the highest numeric suffix of its own prefix plus one, so a
 * deleted record leaves a permanent gap (gaps are correct; reuse would silently
 * repoint every reference that still holds the old id).
 */

/** True when `id` already exists in the collection. */
export function isIdTaken(id, records) {
  return (Array.isArray(records) ? records : []).some((record) => record?.id === id);
}

/**
 * Returns the next free id for a dataset, e.g. "exp-003".
 *
 * Ids with a different prefix, a non-numeric suffix or no id at all are ignored:
 * a hand-written id such as "frontend" must not disturb the numeric sequence.
 * A dataset without a prefix (theme presets) has no generated id; its records use
 * a name-derived id chosen by the owner, so "" is returned and the form shows it.
 */
export function nextId(dataset, records) {
  const prefix = dataset?.prefix;
  if (!prefix) return "";

  let highest = 0;

  for (const record of Array.isArray(records) ? records : []) {
    const id = typeof record?.id === "string" ? record.id : "";
    if (!id.startsWith(prefix)) continue;

    const suffix = id.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;

    highest = Math.max(highest, Number(suffix));
  }

  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

/**
 * Allocates an id that is guaranteed unused, advancing past any collision.
 *
 * Duplicate imports or a manually inserted record can already occupy the id
 * nextId() would return; adding a second record with the same id would be caught
 * by validation but only after the owner filled in the whole form.
 */
export function allocateId(dataset, records) {
  const candidate = nextId(dataset, records);
  if (!candidate || !isIdTaken(candidate, records)) return candidate;

  let attempt = candidate;
  let guard = 0;

  while (isIdTaken(attempt, records) && guard < 10000) {
    guard += 1;
    const match = /^(.*?)(\d+)$/.exec(attempt);
    if (!match) return "";
    attempt = `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, "0")}`;
  }

  return attempt;
}
