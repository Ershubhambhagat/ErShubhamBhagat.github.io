# How the code is commented

> **File:** `docs/COMMENTS.md`  
> **Created:** 2026-11-27 00:48  
> **Updated:** 2026-11-27 00:48  
> **Purpose:** Comment standard, file-header convention and editing checklist.

This project follows `Prompt/DEVELOPER_FRIENDLY_CODE_COMMENTS.md`: comments
explain **why** a thing is done, what it depends on, and what a future editor must
not break. They do not narrate obvious syntax.

## What every file starts with

Every JavaScript and CSS file created for this implementation starts with a header
block that answers four questions:

1. what this file owns, and what it explicitly does not own;
2. which files it depends on, and which files depend on it;
3. the data or DOM contract it relies on (ids, class names, function signatures);
4. the limitation or trade-off a future editor should know.

Examples:

- `js/sections/projects.js` - why cards come from the shared component, why
  filtering starts from the immutable dataset, why absent links are skipped
  before calling the button factory.
- `js/features/github-importer.js` - why nothing is fetched at boot (60 req/hour
  shared quota), why no token is used, why only normalized fields are cached.
- `css/components/cards.css` - the stretched-link stacking rule and why the footer
  needs its own stacking context.
- `css/layout/navigation.css` - the 1120px breakpoint that must match
  `DESKTOP_QUERY` in `js/core/navigation.js` and the `min-width` in `header.css`.

## JavaScript

- Public initializers and every non-obvious helper have a JSDoc block with
  `@param` / `@returns` where it helps.
- Event listener registration and cleanup are commented, especially the global
  `keydown` in Global Search and the modal manager's document-level listeners.
- Storage reads/writes say which key is used and what happens when storage is
  unavailable (bookmarks, theme studio, GitHub cache).
- Network calls explain the status handling (403/429 quota, 404 unknown user).
- Security-sensitive code says what it is defending against: `textContent` only,
  `toSafeHref` allow-list, theme token allow-list, `JSON.parse` never `eval`.
- Formatting and date code explains why partial ISO dates and UTC are used.
- Cross-file references (career timeline ids, search index fields) are documented
  where they are resolved.

## CSS

- Each file has a header (ownership, dependencies, tokens-only rule).
- Major blocks are separated with `/* ---- Name ---- */` markers; section files
  have 2-4 of them (Toolbar, Grid, Card, Form, Results, ...).
- Comments are attached to rules where the value is not self-evident: stretched
  links and z-index, marker math on the timeline rail, `:has()` fallback,
  `[hidden]` overrides, forced-colours and reduced-motion branches, scroll
  containers, and grid minimums that were chosen for a reason.
- Plain declarations such as `display: flex` are not commented.

## JSON

JSON has no comment syntax, so `data/*.json` starts with a `_guide` array of
comment-style lines (one per field) and full example records. The page ignores
`_guide`; it is there for the person editing the file. Schema explanations also
live in `docs/DATA-GUIDE.md`.

## Scripts

`scripts/check-modules.mjs` and `scripts/validate-data.mjs` explain what they
prove, why they copy `js/` to a temporary folder (Node needs `"type":"module"`),
and what each validation block defends against.

## Editing checklist

When adding a section or feature:

1. header block: purpose, dependencies, limit;
2. one initializer, JSDoc on it and on helpers that are not self-evident;
3. comments on listeners, storage, fetch, URL handling and sorting;
4. empty, error and example states explained where they are produced;
5. CSS header plus block markers; a why-comment on any magic number or override;
6. a `_guide` line in the dataset for every new field.
