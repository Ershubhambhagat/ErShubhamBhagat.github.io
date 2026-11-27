# Browser probes

Five scripts that drive the site and the component lab through the Chrome DevTools
Protocol and assert what the browser actually renders. They exist because several
requirements cannot be proven from source: a roving tabindex, a computed contrast
ratio, a backdrop click, or whether a variant is visually distinct all depend on the
DOM the page ends up with.

They are development tools. They ship with the repository so the evidence in
`docs/ARCHIVE/PROJECT_HISTORY.md` can be reproduced, and they are not part of the published site.

## Requirements

1. A static server on port **8123** serving the repository root:

   ```bash
   python scripts/start-local.py
   ```

2. Chrome with a DevTools endpoint on port **9222**:

   ```bash
   chrome --headless=new --remote-debugging-port=9222 --user-data-dir=.build/chrome http://127.0.0.1:8123/index.html
   ```

## Running

```bash
node tools/probes/probe-components.mjs   # 20 checks at 1280px + MODAL-006 at 375px
node tools/probes/probe-navbar.mjs       # NAVB-003 at 1280px, NAVB-004 at 390px
node tools/probes/probe-theme.mjs        # Theme Studio controls, tokens, undo/redo
node tools/probes/probe-editor.mjs       # JSON editor tabs pattern, names, contrast
node tools/probes/probe-projects.mjs     # featured cards and status meta
```

Each script prints a JSON report and exits 0 even when a check fails, because it is a
report rather than a gate; read the `failures` array (or `ok: false` entries). The
gate that runs in CI is `scripts/check-budget.mjs`, which needs no browser.

## What each one covers

| Script | Requirements |
|---|---|
| `probe-components.mjs` | BTN-001…003, CARD-002/003/005, BADGE-001…004, MODAL-002…006, FILT-001/004/005, TLC-002/005, TOAST-002 |
| `probe-navbar.mjs` | NAVB-003, NAVB-004 |
| `probe-theme.mjs` | THEME-003, THEME-004 |
| `probe-editor.mjs` | EDITOR-024 (accessibility), plus the editor's tab pattern |
| `probe-projects.mjs` | PROJ-006 |

The row-level results are recorded in `docs/ARCHIVE/PROJECT_HISTORY.md`.

## Fixtures

`probe-components.mjs` and the theme probe drive `tools/component-lab/index.html`,
which mounts the real modules from `js/components/` in every documented state. The
lab is a fixture page: it loads no content data and is not linked from the site.
