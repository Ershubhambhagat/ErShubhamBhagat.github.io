# JSON Editor Studio audit

> **File:** `docs/audit/JSON_EDITOR_STUDIO_AUDIT.md`  
> **Created:** 2026-11-27 01:25  
> **Updated:** 2026-11-27 01:25  
> **Purpose:** Dedicated audit of the JSON Editor Studio specification.

> **Post-audit update (2026-11-27 02:10):** after this audit, `START_LOCAL_TEST.bat`,
> `scripts/start-local.py` and a START_LOCAL-scope editor in `tools/json-editor/`
> were implemented. The findings below describe the state **before** that work and
> have not been re-audited. Direct file saving was verified with mock file handles
> and the download fallback with a real browser download; the real folder picker
> remains a manual test.

Audit date: 2026-11-27.

## Verdict

**NOT IMPLEMENTED.**

There is no JSON Editor Studio in this repository. `tools/json-editor/` does not
exist, there is no editor page, no schema registry, no record forms, no CRUD
operations, no save/backup layer and no tests. The only related feature is the
JSON Manager dialog (`js/features/json-manager.js`), which validates a chosen
file and downloads a copy. The JSON Editor prompt explicitly says that is **not**
the same feature, and it is not treated as a substitute here.

Evidence:

| Check | Result |
|---|---|
| `Test-Path tools/json-editor` | `False` |
| Files matching `*editor*` outside `.build`/`.git` | Only `docs/JSON-EDITOR-PROMPT.md` (a prompt, not an app) |
| `js/app.js` modules | 11 sections + 4 features; no editor |
| `data/*.json` edited from a UI | No write path exists in the browser |
| Tests for the editor | None |

## Application foundation

| Requirement | Evidence | Status |
|---|---|---|
| Dedicated editor page exists | No HTML under `tools/`; no editor route | NOT IMPLEMENTED |
| Dashboard layout (sidebar, records, validation) | No UI | NOT IMPLEMENTED |
| Dataset selector | No UI | NOT IMPLEMENTED |
| Record list | No UI | NOT IMPLEMENTED |
| Record forms | No UI | NOT IMPLEMENTED |
| JSON preview | No UI | NOT IMPLEMENTED |
| Validation panel | No UI | NOT IMPLEMENTED |
| Runs through a local HTTP server | Nothing to run | NOT IMPLEMENTED |
| No unnecessary backend | Nothing exists | NOT IMPLEMENTED |

## Dataset coverage

No dataset is editable in an editor, because no editor exists. The table records
the actual state rather than treating the presence of a JSON file as support.

| Dataset | File | Supported operations | Status |
|---|---|---|---|
| Bookmarks | `data/bookmarks.json` | None | NOT SUPPORTED |
| Career Timeline | `data/career-timeline.json` | None | NOT SUPPORTED |
| Certificates | `data/certificates.json` | None | NOT SUPPORTED |
| Education | `data/education.json` | None | NOT SUPPORTED |
| Experience | `data/experience.json` | None | NOT SUPPORTED |
| Learning Journey | `data/learning-journey.json` | None | NOT SUPPORTED |
| Profile | `data/profile.json` | None | NOT SUPPORTED |
| Skills | `data/skills.json` | None | NOT SUPPORTED |
| Projects | `data/projects.json` | None | NOT SUPPORTED |
| Navigation | `data/navigation.json` | None | NOT SUPPORTED |
| Theme presets | `data/theme-presets.json` | None | NOT SUPPORTED |

The portfolio itself reads all eleven files correctly; the gap is the editing
workspace, not the data contract.

## Schema-aware forms

| Requirement | Evidence | Status |
|---|---|---|
| Correct fields per dataset | No forms | NOT IMPLEMENTED |
| Nested object editing (company, institution, grade, source, progress, preview) | No forms | NOT IMPLEMENTED |
| Required and optional fields | No registry or form metadata | NOT IMPLEMENTED |
| Boolean, enum, date, number controls | No forms | NOT IMPLEMENTED |
| Repeatable arrays (tags, responsibilities, goals, coursework, achievements) | No forms | NOT IMPLEMENTED |
| Category and related-record selectors | No selectors | NOT IMPLEMENTED |
| Null vs empty vs false handling | No serializer/editor | NOT IMPLEMENTED |
| Every supported field saved correctly | No save path | NOT IMPLEMENTED |

## Record operations

| Operation | Expected | Actual | Status |
|---|---|---|---|
| Create | Form + generated id | No UI | NOT IMPLEMENTED |
| Edit | Load, preserve id | No UI | NOT IMPLEMENTED |
| Duplicate | Copy with new id | No UI | NOT IMPLEMENTED |
| Delete | Confirm + dependency check | No UI | NOT IMPLEMENTED |
| Search | Filter records | No UI | NOT IMPLEMENTED |
| Sort | Alphabetical/date/manual | No UI | NOT IMPLEMENTED |
| Reorder | Move up/down | No UI | NOT IMPLEMENTED |
| Categories | CRUD + reference safety | No UI | NOT IMPLEMENTED |

Stable ID generation, ID preservation, uniqueness checks and dependency checking
therefore do not exist either.

## Career Timeline integration

| Requirement | Actual | Status |
|---|---|---|
| Reference selector uses real records | Not implemented | NOT IMPLEMENTED |
| Reference IDs and event types valid | Data is valid; no editor UI | NOT IMPLEMENTED |
| Date precision preserved | No editor | NOT IMPLEMENTED |
| Optional "also add to timeline" | No workflow | NOT IMPLEMENTED |
| Both files in change preview | No change tracker | NOT IMPLEMENTED |
| Deletion warnings | No UI | NOT IMPLEMENTED |
| Orphan prevention | The runtime skips unresolved events; there is no editing safeguard | NOT IMPLEMENTED |

## Validation

| Level | Expected | Actual | Status |
|---|---|---|---|
| 1. JSON syntax | Parse before save | JSON Manager parses uploads; no editor save | NOT IMPLEMENTED |
| 2. Schema | Version, collection, types, enums | `validateDataset` covers part of this in JSON Manager | NOT IMPLEMENTED |
| 3. Record | Required fields, unique ids, dates, URLs, ranges | Script and JSON Manager cover ids/dates only | NOT IMPLEMENTED |
| 4. Relationship | References, categories, duplicates | `scripts/validate-data.mjs` checks timeline/nav/bookmarks; no editor | NOT IMPLEMENTED |
| 5. Repository | Run the repo validator | Script exists and passes; not invoked by an editor | NOT IMPLEMENTED |

Even where a rule exists in `scripts/validate-data.mjs`, it does not satisfy the
editor requirement because there is no editor operation that blocks a save with
it.

## Saving, backups and change tracking

| Requirement | Actual | Status |
|---|---|---|
| Load original JSON into a draft | No editor | NOT IMPLEMENTED |
| Direct save with File System Access API | No code | NOT IMPLEMENTED |
| Download fallback | JSON Manager download exists; not editor save | NOT IMPLEMENTED |
| Backup before overwrite | No backup manager | NOT IMPLEMENTED |
| Multi-file preview and confirmation | No multi-file support | NOT IMPLEMENTED |
| Partial-save reporting | No save layer | NOT IMPLEMENTED |
| Unsaved-change detection and protection | No draft state | NOT IMPLEMENTED |
| New/updated/deleted change summary | No change tracker | NOT IMPLEMENTED |
| Before/after preview | No UI | NOT IMPLEMENTED |

## Security

| Requirement | Actual | Status |
|---|---|---|
| No GitHub token required | No editor, so no token | NOT IMPLEMENTED |
| No credential exposure | Nothing to expose | NOT IMPLEMENTED |
| No upload of JSON to a server | Nothing uploads | NOT IMPLEMENTED |
| No `eval` / `Function` | Nothing exists | NOT IMPLEMENTED |
| No fake GitHub push | No push button exists | NOT IMPLEMENTED |
| Manual Git publishing instructions | Not part of the app | NOT IMPLEMENTED |

The absence of a fake push button is a positive finding for the portfolio, but it
does not make the editor requirements pass.

## Interface, usability and tests

| Requirement | Actual | Status |
|---|---|---|
| All buttons work | No buttons | NOT IMPLEMENTED |
| Search inside the editor | None | NOT IMPLEMENTED |
| Understandable forms | None | NOT IMPLEMENTED |
| Field-level validation messages | None | NOT IMPLEMENTED |
| Live JSON preview | None | NOT IMPLEMENTED |
| Mobile layout | None | NOT IMPLEMENTED |
| Keyboard navigation | None | NOT IMPLEMENTED |
| Error states and notifications | None | NOT IMPLEMENTED |
| Functional tests per dataset | None | NOT IMPLEMENTED |
| Relationship and file-handling tests | None | NOT IMPLEMENTED |
| Responsive and accessibility tests | None | NOT IMPLEMENTED |

## Acceptance criteria

The prompt lists 34 acceptance criteria. **0 of 34 are satisfied**: the editor
does not exist. The criteria that concern "no backend", "no token" and "no false
publishing" are vacuously true, but they are not implemented features.

## What exists that is often mistaken for this feature

`js/features/json-manager.js`:

- lists the eleven datasets with record counts;
- validates syntax, schema version, collection type, ids, duplicate ids and date
  format for a chosen file;
- downloads the loaded or validated dataset.

It has no record forms, no create/edit/delete, no relationships, no backups, no
direct save and no change preview. The JSON Editor prompt explicitly states that
the JSON Manager is the validation/import/export foundation and the editor is a
separate workspace. This audit keeps them separate.
