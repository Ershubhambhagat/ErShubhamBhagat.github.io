import test from "node:test";
import assert from "node:assert/strict";

import { allSaved, saveAllDocuments } from "../../../tools/json-editor/js/save-all.js";

const file = (key, text = "{}") => ({ key, dataset: { key, file: `${key}.json` }, text });

test("every writable file is reported as written", async () => {
  const written = [];
  const results = await saveAllDocuments([file("projects"), file("skills")], {
    write: async (entry) => {
      written.push(entry.key);
      return { backupPath: `${entry.key}.bak` };
    }
  });

  assert.deepEqual(written, ["projects", "skills"]);
  assert.deepEqual(results.map((result) => result.ok), [true, true]);
  assert.equal(results[0].mode, "write");
  assert.equal(results[0].backupPath, "projects.bak");
});

test("a validation error skips that file and the rest still run", async () => {
  const written = [];
  const results = await saveAllDocuments([file("projects"), file("skills")], {
    validate: (entry) => (entry.key === "projects" ? ["missing id on record 2", "duplicate id"] : []),
    write: async (entry) => {
      written.push(entry.key);
      return {};
    }
  });

  assert.deepEqual(written, ["skills"]);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].code, "invalid");
  assert.match(results[0].message, /2 validation error\(s\): missing id on record 2/);
  assert.equal(results[1].ok, true);
});

test("a writer failure is reported with its own message and does not stop the loop", async () => {
  const results = await saveAllDocuments([file("projects"), file("skills"), file("bookmarks")], {
    write: async (entry) => {
      if (entry.key === "skills") {
        const error = new Error("permission denied");
        error.code = "EACCES";
        throw error;
      }
      return {};
    }
  });

  assert.deepEqual(
    results.map((result) => result.ok),
    [true, false, true]
  );
  assert.equal(results[1].code, "EACCES");
  assert.equal(results[1].message, "permission denied");
});

test("a non-Error rejection is still turned into a message", async () => {
  const results = await saveAllDocuments([file("projects")], {
    write: async () => {
      throw "plain string";
    }
  });
  assert.equal(results[0].ok, false);
  assert.equal(results[0].message, "plain string");
});

test("without a writer the download fallback reports download mode", async () => {
  const downloaded = [];
  const results = await saveAllDocuments([file("projects")], {
    download: (entry) => downloaded.push(entry.key)
  });

  assert.deepEqual(downloaded, ["projects"]);
  assert.equal(results[0].ok, true);
  assert.equal(results[0].mode, "download");
  assert.equal(results[0].backupPath, undefined);
});

test("a failing download is reported, not swallowed", async () => {
  const results = await saveAllDocuments([file("projects")], {
    download: () => {
      throw new Error("blocked by the browser");
    }
  });
  assert.equal(results[0].ok, false);
  assert.equal(results[0].code, "download");
});

test("neither a writer nor a download handler is an error, not a silent success", async () => {
  const results = await saveAllDocuments([file("projects")], {});
  assert.equal(results[0].ok, false);
  assert.match(results[0].message, /no writer and no download handler/);
});

test("an unloaded document is refused before validation runs", async () => {
  let validated = 0;
  const results = await saveAllDocuments([{ key: "projects", dataset: { file: "projects.json" }, text: "" }], {
    validate: () => {
      validated += 1;
      return [];
    },
    write: async () => ({})
  });

  assert.equal(validated, 0);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].code, "missing");
});

test("an entry without a dataset is reported with a placeholder name", async () => {
  const results = await saveAllDocuments([{ key: "x", text: "{}" }], { write: async () => ({}) });
  assert.equal(results[0].ok, false);
  assert.equal(results[0].file, "(unknown)");
});

test("allSaved is true only when every file succeeded", () => {
  assert.equal(allSaved([{ ok: true }, { ok: true }]), true);
  assert.equal(allSaved([{ ok: true }, { ok: false }]), false);
  assert.equal(allSaved([]), false);
  assert.equal(allSaved(null), false);
});

test("an empty selection saves nothing and claims nothing", async () => {
  const results = await saveAllDocuments([], { write: async () => ({}) });
  assert.deepEqual(results, []);
  assert.equal(allSaved(results), false);
});

test("a partial save keeps every outcome in file order", async () => {
  // The editor shows this list verbatim, so order and count must match the input.
  const results = await saveAllDocuments([file("a"), file("b"), file("c")], {
    validate: (entry) => (entry.key === "b" ? ["bad"] : []),
    write: async () => {
      throw new Error("disk full");
    }
  });

  assert.deepEqual(results.map((result) => result.key), ["a", "b", "c"]);
  assert.deepEqual(results.map((result) => result.code), ["write", "invalid", "write"]);
});
