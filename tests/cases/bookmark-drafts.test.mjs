import test from "node:test";
import assert from "node:assert/strict";

import {
  emptyDrafts,
  findDuplicateUrl,
  isEmptyDrafts,
  mergeBookmarks,
  normalizeBookmarkUrl,
  normalizeDrafts,
  parseTags,
  toExportDataset,
  validateBookmark
} from "../../js/core/bookmark-drafts.js";

const published = [
  { id: "b1", name: "One", url: "https://example.com/", order: 1, enabled: true },
  { id: "b2", name: "Two", url: "./Blog/page.html", order: 2, enabled: true }
];

test("empty drafts are recognised and survive garbage input", () => {
  assert.equal(isEmptyDrafts(emptyDrafts()), true);
  assert.deepEqual(normalizeDrafts("nope"), emptyDrafts());
  assert.deepEqual(normalizeDrafts({ created: [null, { name: "" }], deleted: ["", "b1", "b1"] }), {
    created: [],
    updated: {},
    deleted: ["b1"]
  });
});

test("URLs are normalised without losing the path or query", () => {
  assert.deepEqual(normalizeBookmarkUrl("https://Example.COM/Path/?a=1"), {
    href: "https://example.com/Path/?a=1",
    key: "https://example.com/Path?a=1",
    external: true
  });
  assert.deepEqual(normalizeBookmarkUrl("https://example.com/"), {
    href: "https://example.com/",
    key: "https://example.com",
    external: true
  });
  assert.equal(normalizeBookmarkUrl("./Blog/page.html").external, false);
  assert.equal(normalizeBookmarkUrl("javascript:alert(1)"), null);
  assert.equal(normalizeBookmarkUrl("data:text/html,x"), null);
  assert.equal(normalizeBookmarkUrl("ftp://example.com"), null);
  assert.equal(normalizeBookmarkUrl("   "), null);
});

test("duplicate detection compares normalised URLs and can ignore the edited record", () => {
  assert.equal(findDuplicateUrl("https://EXAMPLE.com", published)?.id, "b1");
  assert.equal(findDuplicateUrl("https://example.com", published, "b1"), null);
  assert.equal(findDuplicateUrl("https://example.com/other", published), null);
  assert.equal(findDuplicateUrl("./Blog/page.html", published)?.id, "b2");
});

test("the overlay applies create, edit and delete in that order", () => {
  const drafts = {
    created: [{ id: "n1", name: "New", url: "https://new.example" }],
    updated: { b2: { name: "Two edited" } },
    deleted: ["b1"]
  };
  const merged = mergeBookmarks(published, drafts);

  assert.deepEqual(merged.map((r) => r.id), ["n1", "b2"]);
  assert.equal(merged[1].name, "Two edited");
  assert.equal(merged[1].url, "./Blog/page.html");
  assert.equal(published.length, 2, "the published array must not be mutated");
});

test("a deleted created record stays deleted", () => {
  const drafts = { created: [{ id: "n1", name: "New", url: "https://new.example" }], deleted: ["n1"] };
  assert.deepEqual(mergeBookmarks(published, drafts).map((r) => r.id), ["b1", "b2"]);
});

test("tags accept a comma list or an array", () => {
  assert.deepEqual(parseTags("css, html\ncss"), ["css", "html"]);
  assert.deepEqual(parseTags(["a", " a ", "", "b"]), ["a", "b"]);
});

test("validation rejects an empty name, an unsafe URL and a duplicate", () => {
  const missing = validateBookmark({ name: "", url: "" }, { records: published });
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.name);
  assert.ok(missing.errors.url);

  const unsafe = validateBookmark({ name: "X", url: "javascript:alert(1)" }, { records: published });
  assert.equal(unsafe.ok, false);
  assert.ok(unsafe.errors.url);

  const duplicate = validateBookmark({ name: "Copy", url: "HTTPS://example.com" }, { records: published });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors.url, /already saved/);
});

test("a valid submission keeps the edited id and normalises its fields", () => {
  const result = validateBookmark(
    {
      name: "  Edited  ",
      url: " https://example.com/new-path ",
      description: " Text ",
      categoryId: "web",
      tags: "a, b",
      featured: true
    },
    {
      records: published,
      editingId: "b1",
      order: 4
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.record.id, "b1");
  assert.equal(result.record.name, "Edited");
  assert.equal(result.record.url, "https://example.com/new-path");
  assert.deepEqual(result.record.tags, ["a", "b"]);
  assert.equal(result.record.order, 4);
  assert.equal(result.record.enabled, true);
});

test("export replaces bookmarks and drops the draft-only marker", () => {
  const dataset = { schemaVersion: 1, categories: [{ id: "web" }], bookmarks: published };
  const exported = toExportDataset(dataset, [{ ...published[0], isDraft: true }]);

  assert.equal(exported.bookmarks.length, 1);
  assert.equal("isDraft" in exported.bookmarks[0], false);
  assert.equal(exported.categories.length, 1);
  assert.equal(dataset.bookmarks.length, 2, "export must not mutate the loaded dataset");
});
