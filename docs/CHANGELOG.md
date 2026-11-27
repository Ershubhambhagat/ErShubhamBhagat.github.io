# Changelog

## 2026-11-27 - one-click local server and JSON editor

- Added `START_LOCAL_TEST.bat` and `scripts/start-local.py`: project-root
  detection, Python detection, free-port selection (5500+), a real HTTP
  readiness check, reuse of an already-running project server, and automatic
  browser launch for the site and the editor.
- Added `tools/json-editor/`: an 11-dataset editor with generated forms, record
  create/edit/duplicate/delete/reorder, category editing, validation, JSON
  preview, direct File System Access saving, timestamped backups, conflict
  detection and a download fallback.
- Added `.local-json-backups/` to `.gitignore`; backups never enter the published
  tree.
- Verified with automated browser runs: form rendering, add/duplicate, invalid
  title blocking save, categories, `_guide` preservation, no console errors, no
  horizontal overflow. Save/backup/conflict/invalid-JSON logic verified with mock
  file handles; the real folder picker is a manual test.

> **File:** `docs/CHANGELOG.md`  
> **Created:** 2026-11-27 00:18  
> **Updated:** 2026-11-27 01:29  
> **Purpose:** Chronological record of implementation changes and known gaps.

## 2026-11-27 - implementation verification audit

- Added `docs/audit/` with the evidence-based audit: summary, a 225-row
  traceability matrix, JSON Editor Studio audit, shared component audit,
  cross-section integration audit, developer-comments audit, test execution
  report and remediation plan.
- Result: 105 PASS, 35 PARTIAL, 77 NOT IMPLEMENTED, 8 NOT VERIFIED, 0 FAIL.
  JSON Editor Studio is not implemented (0/34 acceptance criteria).
- Critical finding: a plaintext third-party credential remains in
  `Blog/Json/BlogPost.json`; it must be redacted and treated as compromised.
- No application code was modified during the audit.

## 2026-11-27 - spec coverage audit and JSON editor prompt

- Added `docs/COVERAGE.md`: every `Prompt/` architecture, section and component
  spec marked Implemented, Partial or Missing, with the specific gaps.
  Headline: 1 of 19 architecture/section specs fully implemented, 17 partial,
  1 missing at the workflow level (GitHub importer).
- Added `docs/JSON-EDITOR-PROMPT.md`: a ready-to-paste prompt for a local-only
  Node data editor that reads/writes `data/*.json`, validates against the site's
  rules, backs up, and commits/pushes through git on explicit confirmation.
- Documented why a GitHub Pages page cannot write to its own repository and why
  the local editor is the recommended model.

## 2026-11-27 - self-documenting datasets and complete examples

- Every `data/*.json` now starts with a `_guide` array: one comment-style line per
  field, marking it required or optional and giving its format. `_guide` is valid
  JSON and is ignored by the page, the section modules and the JSON Manager.
- All datasets are fully populated. Six projects received sample descriptions,
  technologies, roles, contributions and dates; the certificates show credential
  fields; the learning records have goals and takeaways; the career timeline has
  nine events covering experience, projects, a certificate, a learning activity
  and education; education gained a second, complete example record.
- Records whose details are not real keep `isSample: true`; six sections now show
  the example-data notice, including Education.
- `scripts/validate-data.mjs` still passes; `_guide` does not affect validation.
- Documentation explains why JSON cannot carry `//` comments and how to use
  `_guide` instead.
- Comment pass: JSDoc added to the render/fetch/cache functions that lacked it
  (projects, skills, certificates, learning journey, bookmarks, education,
  career timeline, GitHub importer, search, theme studio, JSON manager, contact),
  plus CSS rationales for stretched links, timeline marker maths, `:has()`,
  scroll containers and forced-colours/reduced-motion branches. `docs/COMMENTS.md`
  records the convention and an editing checklist.

## 2026-11-26 - sections, features and styles implemented

The repository previously held a finished shell (HTML, tokens, core modules,
eight shared components) and placeholder stubs for every section, feature, section
stylesheet and dataset. This pass filled them in.

### Added

- `js/core/section-kit.js`: shared section scaffolding, safe links, date
  formatting, tag/meta/progress helpers, empty states, example-data notice,
  timeline factory, tools dock, clipboard helper.
- Eleven section modules: profile, skills, experience, projects, certificates,
  education, learning journey, career timeline, GitHub importer, bookmarks,
  contact.
- Four feature modules: global search (`Ctrl`/`Cmd`+`K`), theme studio, JSON
  manager, SEO metadata.
- Shared CSS: buttons, cards, badges, search field, timeline, navigation, footer.
- Section CSS for all fourteen section/feature stylesheets.
- Shared primitives in `css/main.css`: section header, form field, tag list, meta
  list, progress bar, empty state, sample notice, card grid, tools dock, detail
  panel.
- `scripts/validate-data.mjs` and `scripts/check-modules.mjs`.
- `docs/` (this changelog, the data guide and the architecture notes).
- Content: `data/profile.json` (verified identity, seven social links, six stated
  skill levels plus name-only tools), `data/projects.json` (the six project names
  from `Project/MyProject.html`), `data/bookmarks.json` (seven real pages in this
  repository), `data/navigation.json` schema normalised to `1`, and
  `data/theme-presets.json` with four palettes.

### Changed

- `data/bookmarks.json`, `data/projects.json` and the other datasets are no longer
  empty arrays; schemas follow `Prompt/sections/*.md` with the contract's id
  prefixes.
- `data/navigation.json` `schemaVersion` changed from `"1.0.0"` to `1` so every
  dataset validates the same way.

### Known gaps

- `experience.json`, `certificates.json` and `learning-journey.json` contain
  clearly marked example records (`isSample: true`); the page shows a dismissible
  notice on those sections. Replace them with real records or delete them.
- `career-timeline.json` references those example records, so it shows the same
  notice.
- Education carries only the degree level; institution, field and years are
  unknown and therefore not rendered.
- No portrait and no résumé file; both are opt-in in `profile.json`.
- The old blog data (`Blog/Json/BlogPost.json`) still contains a plaintext
  third-party credential. It is not read by the new page, but it is still
  published from this repository and should be redacted.
- GitHub data depends on the public API quota; no token is used by design.
