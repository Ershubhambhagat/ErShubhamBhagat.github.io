# JSON Editor Studio

> **File:** `tools/json-editor/README.md`  
> **Created:** 2026-11-27 01:55  
> **Updated:** 2026-11-27 02:10  
> **Purpose:** How to run the local portfolio, connect the project folder, edit JSON through forms and save safely.

## Start everything

Double-click **`START_LOCAL_TEST.bat`** in the repository root.

It finds the project root from its own location, locates Python (`py` or
`python`), picks a free port starting at 5500, starts the static server on
`127.0.0.1` only, waits until the page actually answers, then opens:

- the portfolio: `http://127.0.0.1:<port>/`
- this editor: `http://127.0.0.1:<port>/tools/json-editor/`

The server runs in its own console window. Close that window or press Ctrl+C to
stop it. The launcher never installs anything and never asks for administrator
rights.

If port 5500 is already serving this portfolio, the launcher reuses it instead of
starting a second server. A port used by another program is skipped, not killed.

## The two modes

### Preview (default)

The editor loads the eleven datasets from `data/` over the local server. You can
browse, edit in memory, validate and use **Download**, but nothing is written to
disk. The status bar says so.

### Connected project folder

Press **Connect project folder** and choose the repository root (the folder that
contains `data/`, `index.html` and `assets/`). The browser asks for read/write
permission. Chrome or Edge is required; this uses the File System Access API.

Once connected:

- the dataset list is loaded from the real files;
- **Save** validates the current dataset and writes it back to `data/<file>.json`;
- before writing, the editor re-reads the file and compares hashes. If the file
  changed on disk, it asks before overwriting;
- a timestamped copy of the original is written to
  `.local-json-backups/<timestamp>/data/<file>.json`;
- after writing, the file is read again and parsed, and the result is reported
  honestly.

`.local-json-backups/` is in `.gitignore` and is never published.

## Editing

- Select a record to open its form; **Apply** writes the change into the in-memory
  document, **Save** writes the file.
- **+ Add record** creates a record from the existing shape with a new id.
- Row buttons: move up/down, duplicate (new id), delete (with reference warning).
- **Categories** edits the `categories` array for datasets that have one and
  blocks deleting a category still used by records.
- **JSON** tab shows the complete file, including `_guide`; it is a preview, not a
  free-form editor.

Forms are generated from the record shape and field names:

| Field kind | Control |
|---|---|
| Text, description | input / textarea |
| Date | text input with `YYYY`, `YYYY-MM` or `YYYY-MM-DD` validation |
| URL, image, document | text input validated as `http(s)://` or `./` |
| Boolean | checkbox |
| Number | number input; empty becomes `null` |
| Enum-like (`status`, `type`, `categoryId`, …) | select of values already used |
| String list (`technologies`, `goals`, …) | one value per line |
| Nested object (`company`, `institution`, `progress`) | fieldset |
| Array of objects (`gallery`, `achievements`, `items`) | repeatable group |

`_guide` is never edited by a form; it is preserved on save.

## Publishing

The editor writes files; it never publishes them.

1. Save (or Download and copy the file into `data/`).
2. Review the change: `git diff data/`.
3. Validate: `node scripts/validate-data.mjs` - it must print
   "All data checks passed."
4. Commit the file and push to the branch GitHub Pages serves for this repository
   (Settings -> Pages shows which one).
5. Reload the site after the Pages build finishes.

The editor never asks for a GitHub token, never calls the GitHub API and never
pushes: there is no upload path in the code.

## Validation

Saving is blocked while the current dataset has errors:

- root object and `schemaVersion: 1`;
- the collection exists with the expected type;
- unique ids with the documented prefix;
- required label (`title`, `name`, `role`, `qualification`);
- partial-ISO dates;
- `categoryId` exists in `categories`;
- `relatedSkillIds` / `relatedProjectIds` exist;
- career-timeline `referenceId` exists in the stated dataset;
- progress 0–100;
- URL protocols;
- navigation items have id, label, target and numeric order.

Warnings (such as a duplicate timeline reference) do not block saving.

## What is not implemented

- **Direct save could not be exercised through a real folder picker in automated
  testing.** The write/backup/conflict/validation logic was tested with in-memory
  file handles; the picker itself needs a human click. Treat the first real save
  as a manual test.
- The JSON tab is read-only; there is no raw text editor.
- Reference fields (`categoryId`, `referenceId`, `relatedSkillIds`) are text or
  select controls validated against loaded ids, not searchable record pickers.
- Empty arrays that should hold objects are shown as a line editor until they
  contain one item.
- Career Timeline synchronization ("also add this record to the timeline") is not
  implemented.
- Multi-file operations and change history are not implemented.
- Safari and Firefox do not support the directory picker; use Download there.

## Verification on this machine (2026-11-27)

| Check | Result |
|---|---|
| `START_LOCAL_TEST.bat` from the repository root | PASS - server on 127.0.0.1:5500 |
| `START_LOCAL_TEST.bat` from `C:\` | PASS - project root detected correctly |
| Port 5500 occupied by another folder | PASS - launcher chose 5501 |
| Existing project server on 5500 | PASS - reused, no second server |
| Homepage served | PASS - HTTP 200 |
| Editor served | PASS - HTTP 200 at `/tools/json-editor/` |
| Editor at 320/375/425/768/1024/1366/1920 | PASS - 11 datasets, 6 project rows, no horizontal overflow |
| Add + Apply | PASS - 6 -> 7 rows, validation still clean |
| Duplicate | PASS - 7 -> 8 rows, new id |
| Invalid title | PASS - save blocked, error names the field |
| Categories tab | PASS - 3 project categories listed |
| JSON preview | PASS - `_guide` present, form hidden |
| Download fallback | PASS - real download produced `projects.json` with 7 records and `_guide` |
| Search with no match | PASS - shows "No records match ..." instead of an empty table (fixed 2026-11-27, round 2) |
| Save / backup / conflict | PASS with mock file handles - write, original backup, hash, conflict, invalid JSON refused |
| Real folder picker + permission | BLOCKED - requires a human click; not automated |
| Browser auto-open | NOT VERIFIED in automation (suppressed with `PORTFOLIO_NO_BROWSER=1`) |
| Server console persistence | NOT VERIFIED in automation; the launcher uses a detached console |

## Troubleshooting

| Problem | Check |
|---|---|
| Launcher closes immediately | It pauses on errors; read the message. Python 3 must be installed and on PATH. |
| `No free port` | Stop the program using 5500–5599, or change `PORT_RANGE`. |
| Editor says "Preview mode" | You have not connected the folder; direct saving needs Connect. |
| Connect button does nothing | Use Chrome/Edge over `http://127.0.0.1`, not `file://`. |
| Save says the file changed | Another program or editor wrote it. Review the diff, then confirm overwrite. |
| Backup failed | The original is not overwritten; check folder permissions. |
| Server did not answer | Read the server console window; the launcher already waited up to 12 seconds. |

## Related documentation

- `../../docs/DEVELOPMENT/DATA_GUIDE.md` - dataset field meanings.
- `../../docs/ARCHITECTURE.md` - how the public site loads data.
- `../../Prompt/sections/JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` - the full
  editor specification; this implementation covers the START_LOCAL workflow, not
  every clause of that larger prompt.
