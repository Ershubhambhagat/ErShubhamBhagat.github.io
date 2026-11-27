# Prompt: JSON data editor for this portfolio

> **File:** `docs/JSON-EDITOR-PROMPT.md`  
> **Created:** 2026-11-27 01:05  
> **Updated:** 2026-11-27 01:05  
> **Purpose:** Ready-to-paste prompt for the local JSON data editor.

## Why this has to run locally

GitHub Pages serves static files. A page hosted there **cannot write
`data/*.json`** in the repository: there is no server, and the browser has no
filesystem access. Any "edit and save" page therefore needs one of two things:

1. **A local editor** (recommended): a small Node server on your computer that
   reads and writes `data/*.json` directly, then commits and pushes with git.
   No token, nothing exposed to the internet, works offline.
2. **A hosted editor with a GitHub token**: the page calls the GitHub Contents API
   with a fine-grained personal access token. It can edit the repo from anywhere,
   but the token lives in the browser and the page must never be public. This is
   riskier and is deliberately **not** the default.

The prompt below builds option 1. It matches how you already work: edit locally,
preview, then push.

---

## Copy this prompt

```text
You are implementing a local-only data editor for the portfolio repository at the
current working directory. Read the repository before writing code. Follow the
project's coding rules and comment standard (Prompt/DEVELOPER_FRIENDLY_CODE_COMMENTS.md).

GOAL
Build a small web application that lets the owner view, create, edit, duplicate,
disable, reorder and delete records in data/*.json through a browser form, validate
them against the site's real rules, write the JSON back safely, and optionally
commit and push the change with git. The public site already renders whatever is
in those files; the editor must not need changes to index.html, js/app.js or
js/config.js.

HARD CONSTRAINTS
- Static site, no framework, no build step. Node 18+ (this machine has Node 24).
  Use Node built-in modules only; no npm dependencies. Vanilla HTML/CSS/JS in the UI.
- The server binds 127.0.0.1 only, on a fixed port (4173). It must not be reachable
  from the LAN. Refuse requests whose Host is not localhost/127.0.0.1.
- Never embed or store a GitHub token. No secrets in the repository.
- The editor writes only data/*.json. If image upload is implemented, it may write
  only under assets/images/editor/. No other path is writable.
- Do not reformat or reorder unrelated parts of a file. 2-space indent, UTF-8,
  one trailing newline, key order preserved, the top-level _guide array preserved
  byte-for-byte in meaning (it may move only if the file is rebuilt; never drop it).
- Never write invalid JSON. Validate the whole document before writing; a failed
  validation writes nothing.
- No database, no OAuth, no public deployment of the editor.

ARCHITECTURE
Create tools/data-editor/ with:
  server.mjs            HTTP server, API, static file serving, startup token
  lib/registry.mjs      dataset registry: key, file, collection, kind, idPrefix,
                        field descriptors (name, label, type, required, nullable,
                        enum, itemType, help), nested arrays
  lib/validate.mjs      validation shared by API and tests; mirror
                        scripts/validate-data.mjs plus URL and reference rules
  lib/store.mjs         read, atomic write, backups, hash/mtime conflict detection
  lib/git.mjs           status/diff/commit/push through spawn("git", args)
  public/index.html     app shell
  public/app.js         UI logic (ES module)
  public/styles.css     UI styles using the site's design tokens
  test/*.test.mjs       node:test tests for registry, validation, store, id generation
  README.md             how to run, what it writes, recovery steps

DATASETS (must all be editable)
profile (object, not array), skills, experience, projects, certificates, education,
learningJourney (learningActivities), careerTimeline (events), bookmarks,
navigation, themePresets (themes). Read data/*.json and docs/DATA-GUIDE.md for the
exact shapes. The registry must describe nested arrays too: socialLinks,
primaryActions, highlights, categories, skills, experiences, projects, gallery,
contributions, links, certificates, education, learningActivities, goals, events,
bookmarks, navigation.items, themes.tokens/swatches.

UI REQUIREMENTS
1. Home: one card per dataset with record count, last modified time, validation
   status and a link to edit. A top bar shows the repository path, git branch and
   whether the working tree is dirty.
2. Dataset view:
   - table of records with the important columns (id, primary label, status/date,
     isSample), search box, category/status filter where relevant, and row actions:
     edit, duplicate, enable/disable, move up/down (order field), delete.
   - "Add record" creates an object with the next free id (prefix + zero-padded
     number) and required fields only, then opens it in the form.
   - deletion asks for confirmation and names the record. Prefer setting
     enabled=false when other records reference the id; warn when references exist.
   - a "Raw JSON" tab shows the whole file with syntax validation, format and diff
     against the last saved version. Advanced users may edit there; saving still
     runs full validation.
3. Record form (drawer or side panel):
   - typed inputs: text, textarea, number, partial date (YYYY / YYYY-MM /
     YYYY-MM-DD), URL, boolean, select, tag list (array of strings), object group,
     array of objects with add/remove/reorder.
   - required fields marked, help text under each field from the registry, empty
     optional values shown as "not set" and removable.
   - inline errors next to fields, a summary at the top, and focus moved to the
     first invalid field. Saving is disabled while the document is invalid.
   - _guide is shown read-only at the top of the raw view; it is never part of a
     record form.
4. Save flow: validate -> show a diff summary (records added/changed/removed) ->
   confirm -> backup -> atomic write -> success toast with the file path. A failed
   write must leave the old file intact.
5. History: keep the last 20 saved versions per dataset under .backups/data-editor/
   (gitignored). List them with timestamp and size; restore asks for confirmation.
6. Git panel: show `git status --porcelain`, a diff stat for data/ and the current
   branch. "Commit" asks for a message (default "data: update <datasets>"),
   commits only data/*.json (and uploaded images if any), then offers "Push".
   Push requires a second explicit confirmation, never uses --force, and reports
   the real error if there is no upstream or no credentials.
7. Every destructive action (delete record, restore backup, discard unsaved edits,
   commit, push) is confirmed by name, never by a generic "OK".

VALIDATION (must match the site)
- JSON parses; root is an object; schemaVersion is the number 1.
- The dataset's collection exists with the right type (object for profile and
  navigation, array for the rest).
- Record ids: non-empty, unique within the file, correct prefix
  (skill-, exp-, project-, cert-, edu-, journey-, event-, bookmark-). themePresets
  may use its own ids.
- Required fields per dataset (for example: project id + title; certificate id +
  title; profile name; navigation item id/label/target/order).
- Dates use YYYY, YYYY-MM or YYYY-MM-DD; null is allowed where documented.
- careerTimeline.events[].referenceId resolves to an existing record of the stated
  type; deleting a referenced record is blocked until the event is changed.
- navigation items target a real <section id> in index.html; there are 11 items.
- Bookmark URLs starting with ./ point at an existing file; http(s) URLs parse;
  javascript:/data: URLs are rejected.
- URLs in socialLinks, links.*, credentialUrl, source.url, company.website and
  institution.website must be http(s) (mailto: only for email).
- isSample must be a boolean when present.
- No // or /* */ comments in the JSON; the file must remain standard JSON.

API (suggested)
  GET  /api/datasets                 registry + counts + validation summary
  GET  /api/datasets/:key            { raw, document, hash, validation }
  PUT  /api/datasets/:key            { document, expectedHash, message }
                                     -> validate, backup, write, return hash + diff
  POST /api/validate                 { key, document } -> { ok, errors, warnings }
  GET  /api/history/:key             saved versions
  POST /api/history/:key/restore     { version } -> restore after confirmation
  GET  /api/git/status               branch, dirty, changed files, diff stat
  POST /api/git/commit               { message } -> commit data files only
  POST /api/git/push                 -> push current branch, no force
All mutating endpoints require the header X-Editor-Token with the random token
printed at startup (and injected into the served page). Reject requests without
it with 403. This is CSRF protection for a local server, not user auth.

STORE RULES
- Read with fs.readFile, write to <file>.tmp in the same directory, fsync, then
  rename over the original. Keep a backup copy before the rename.
- Before writing, compare the file's current sha256 with the hash the UI loaded.
  On mismatch return 409 with "the file changed on disk" and do not write.
- Rebuild the JSON with JSON.stringify(document, null, 2) + "\n".
- Keep .backups/ out of git (add it to .gitignore if needed).

SECURITY
- No path joins from user input: the dataset key is looked up in the registry.
- Escape all dataset strings in the UI with textContent; never innerHTML.
- The server never executes shell strings; spawn("git", [args...]) only.
- No directory listing, no static serving outside public/.
- Log the bound address and token at startup; stop with Ctrl+C.

ACCESSIBILITY AND UX
- Keyboard: all controls reachable, visible focus, Escape closes drawers/dialogs,
  focus returns to the trigger, forms have real labels, errors are announced.
- Use the site's design tokens (css/variables.css) so the editor matches the
  portfolio; respect prefers-reduced-motion.
- Show "unsaved changes" before navigating away.

TESTS (node --test)
- registry covers all 11 datasets and their collections;
- next-id generation skips existing ids and pads correctly;
- validation accepts the current data/*.json and rejects: wrong schemaVersion,
  duplicate id, bad prefix, invalid date, dangling timeline reference, bad URL,
  missing required field, wrong collection type;
- store writes atomically, creates a backup, refuses on hash mismatch, and keeps
  _guide and trailing newline;
- git module builds the expected argument arrays (mock spawn) and never uses shell.
Then run the existing scripts/validate-data.mjs against the edited tree.

ACCEPTANCE CRITERIA (demonstrate each)
1. Add a project through the form: project-007 appears in data/projects.json,
   scripts/validate-data.mjs passes, the site shows it after reload.
2. Edit profile.name: hero and document title change after reload.
3. Add a timeline event referencing a new certificate; the event renders.
4. Try to save a duplicate id and an invalid date: both are blocked with a field
   error and the file on disk is unchanged.
5. Delete a certificate that an event references: blocked with an explanation.
6. Save a change: a backup exists, the diff shows only that record, _guide is
   still the first key.
7. Commit from the Git panel with a message; verify with git log that only data
   files were committed. Push can be tested against a throwaway branch.
8. Confirm the server is unreachable from another device (bound to 127.0.0.1).
9. Keyboard-only run of add -> edit -> save.

DELIVERABLES
- The application, tests and README.
- A short report: files created, how to start it, what was tested and the actual
  output, and any limitation you hit. Do not claim a test passed unless it ran.

OUT OF SCOPE
- Deploying the editor to GitHub Pages or any public host.
- GitHub OAuth, GitHub API commits, databases, user accounts.
- Editing code, CSS, HTML or docs from the editor.
- Automatic commits or pushes without an explicit confirmation.
- Schema migrations without showing a diff and asking first.
```

---

## After the editor exists

```powershell
node tools/data-editor/server.mjs
# open the printed http://127.0.0.1:4173 address
node scripts/validate-data.mjs        # final check before pushing
git status                            # review
git add data docs && git commit -m "data: update portfolio"
git push
```

The editor is a local tool: keep `tools/data-editor/` out of the published site
if you prefer, or leave it in the repo (GitHub Pages will serve the files but the
server will not run there, so the page cannot edit anything remotely).

## If you really want to edit from a hosted page

That variant needs a fine-grained GitHub token with `Contents: Read and write`
for this repository only, kept in memory (not localStorage), a page excluded from
search engines, and a clear warning that anyone with the token can rewrite the
repository. It is a different security model from the prompt above; ask for a
separate prompt before building it.
