import test from "node:test";
import assert from "node:assert/strict";

import { matchesQuery, normalizeText } from "../../js/core/search-engine.js";

test("normalizeText folds case, accents and whitespace", () => {
  assert.equal(normalizeText("  São   Paulo "), "sao paulo");
  assert.equal(normalizeText(null), "");
  assert.equal(normalizeText(42), "42");
});

test("an empty query matches every record", () => {
  assert.equal(matchesQuery({ title: "Anything" }, ""), true);
  assert.equal(matchesQuery({ title: "Anything" }, "   "), true);
});

test("matchesQuery uses AND semantics across words", () => {
  const record = { title: "Node.js API", description: "REST service with SQL" };

  assert.equal(matchesQuery(record, "node sql"), true);
  assert.equal(matchesQuery(record, "node graphql"), false);
});

test("matchesQuery searches nested values and honours the field allow-list", () => {
  const record = {
    title: "Importer",
    company: { name: "Acme" },
    secret: "internal-token"
  };

  assert.equal(matchesQuery(record, "acme"), true);
  assert.equal(matchesQuery(record, "acme", { fields: ["title"] }), false);
  assert.equal(matchesQuery(record, "internal-token", { fields: ["title"] }), false);
});

test("punctuation stays searchable and is not treated as a pattern", () => {
  const record = { title: "C++ and Node.js" };

  assert.equal(matchesQuery(record, "c++"), true);
  assert.equal(matchesQuery(record, "node.js"), true);
  // A regex-looking query is literal text, so it cannot match everything.
  assert.equal(matchesQuery(record, ".*"), false);
});

test("a cyclic record cannot stall the search", () => {
  const record = { title: "Cycle" };
  record.self = record;

  assert.equal(matchesQuery(record, "cycle"), true);
  assert.equal(matchesQuery(record, "missing"), false);
});
