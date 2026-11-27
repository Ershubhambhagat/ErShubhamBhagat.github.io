# Implementation remediation plan

> **File:** `docs/audit/IMPLEMENTATION_REMEDIATION_PLAN.md`  
> **Created:** 2026-11-27 01:27  
> **Updated:** 2026-11-27 01:27  
> **Purpose:** Priority-ordered corrections with tests and risks.

Audit date: 2026-11-27. No corrections were made during the audit. Items are
ordered by actual impact, not by effort.

Severity: **CRITICAL** (security/data loss), **HIGH** (core workflow or major
spec feature missing), **MEDIUM** (partial feature, accessibility, SEO),
**LOW** (visual/documentation).

## CRITICAL

### C-01 - Plaintext third-party credential is still published

- Related spec: security rules in `PORTFOLIO_ARCHITECTURE.md`,
  `DEVELOPER_FRIENDLY_CODE_COMMENTS.md`.
- Files: `Blog/Json/BlogPost.json` (around the post body that contains
  "You May use This Id or password"), and any hard-coded copy in
  `Blog/HTML/blog.html`.
- Current: a third-party email address and password sit in plain text in a file
  served by GitHub Pages. The new portfolio never reads it, but it is still
  published.
- Expected: no credential in the repository; the password treated as compromised
  and changed at the provider.
- Required change: redact the address and password in both files, keep the rest
  of the post readable, or remove the post; confirm with the owner before editing
  blog content.
- Dependency: owner confirmation; the blog page must still render.
- Test after: search the repository for the credential pattern and the domain;
  load `Blog/HTML/blog.html`; confirm the post body has no secret.
- Risk: editing published blog content; low technical risk.

## HIGH

### H-01 - JSON Editor Studio is absent

- Related: `Prompt/sections/JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md`.
- Files: new `tools/json-editor/`; no existing production file should be moved.
- Current: 0 of 34 acceptance criteria; no page, forms, CRUD, validation, save or
  backup. JSON Manager is not a substitute.
- Expected: the complete visual editor described in the prompt (schema forms for
  six datasets plus the other datasets, CRUD, relationships, five validation
  levels, save/download, backups, change preview, tests).
- Required change: implement the editor in phases: registry -> UI shell ->
  six forms -> CRUD/IDs -> relationships/categories -> save/backup -> tests.
- Dependency: none in the portfolio; must not change the site's runtime.
- Test after: full acceptance run in the prompt, including invalid JSON refusal,
  duplicate ids, relationship checks, backup creation, download fallback.
- Risk: high scope; isolate under `tools/` and do not touch `js/` unless a shared
  component genuinely needs extension.

### H-02 - GitHub Importer is a read-only preview, not the spec workflow

- Related: `10_GITHUB_IMPORTER.md`.
- Files: `js/sections/github-importer.js`.
- Current: hardcoded username, fetch/list/show more/cache; no URL input, search,
  filter, selection, detail, duplicate detection, conversion to project schema or
  export.
- Expected: the full import/review/convert workflow with rate-limit handling and
  no token.
- Required change: add inputs and repository selection, map fields to the project
  schema, detect duplicates against `projects.json`, preview/export JSON, keep
  the no-token rule.
- Dependency: none; JSON Editor Studio may later consume the same mapping.
- Test after: mock repository payload -> conversion preview -> duplicate detection
  -> exported project validates against `scripts/validate-data.mjs`.
- Risk: medium; keep the existing rate-limit and cache behaviour.

### H-03 - Header Search and Theme actions are missing

- Related: `16_NAVIGATION_AND_LAYOUT.md`, `NAVBAR_COMPONENT.md`.
- Files: `js/core/navigation.js`, `css/layout/header.css`,
  `data/navigation.json` (`header.showGlobalSearch`, `showThemeToggle`).
- Current: the config flags exist, but no header buttons are rendered; the
  features are reachable only from the bottom-right tools dock.
- Expected: header actions that open Global Search and Theme Studio, with
  accessible names and keyboard support.
- Required change: render the buttons in the header action slot and dispatch the
  existing open events / call the feature openers; do not duplicate the feature
  logic.
- Dependency: Global Search and Theme Studio must expose an open API (currently
  they create their own dock buttons).
- Test after: click both header buttons at 1440 and 375; keyboard activate;
  no duplicate launcher confusion; ARIA state correct.
- Risk: medium; header layout is tight at 1120px with 11 links.

### H-04 - Owner editing of bookmarks and datasets inside the portfolio

- Related: `11_WEBSITE_BOOKMARKS.md`, `14_JSON_MANAGER.md`.
- Files: `js/sections/bookmarks.js`, `js/features/json-manager.js`.
- Current: read-only cards and validate/download only.
- Expected: add/edit/delete bookmarks, category management, import/export with
  preview, merge/replace; or delegate this explicitly to JSON Editor Studio and
  remove the misleading "manager" expectation.
- Required change: decide the boundary: editor app owns CRUD, portfolio JSON
  Manager stays validation/export. Document the decision and adjust UI copy.
- Test after: whichever boundary is chosen, no button advertises an action it
  cannot perform.
- Risk: low if delegated; medium if CRUD is added to the public page.

## MEDIUM

### M-01 - Section search, sort, filter and pagination gaps

- Related: `03`, `04`, `05`, `06`, `07`, `08`, `09`.
- Current: only projects have text search; skills/projects/certificates/learning/
  timeline have a category/type filter; no sort controls; no pagination/load
  more; projects has no technology filter.
- Required: add the controls the specs declare, using the shared filter/search
  components, and keep filtering on the immutable dataset.
- Test: each control changes the visible count and restores; validator unaffected.
- Risk: medium; watch the filter component's unused multi/checkbox paths.

### M-02 - Media fields are not rendered

- Related: `05`, `06`, `11`, `04`.
- Current: `coverImage`, `gallery`, `certificateImage`, `certificateDocument`,
  `faviconUrl`, `screenshot`, `company.logo` are never read. No asset files exist.
- Required: render when present, collapse when absent, validate paths and failure
  fallback; add real files only when the owner supplies them.
- Test: card with a valid image, a missing image, and no image.
- Risk: low; layout must not jump.

### M-03 - Theme Studio is presets-only

- Related: `13_THEME_STUDIO.md`.
- Current: 4 presets, token apply, reset, persistence, validation.
- Missing: custom colour pickers, typography/layout/component controls, preview
  modes, undo/redo, import/export, contrast checks.
- Required: add controls in the order colour -> typography -> reset/undo;
  validate every token; keep the allow-list.
- Test: each control changes a token, reset restores, invalid values rejected.
- Risk: medium; scope creep and contrast regressions.

### M-04 - SEO infrastructure and performance work are absent

- Related: `17_SEO_AND_PERFORMANCE.md`.
- Current: title/description/canonical/OG/Twitter/JSON-LD/favicon work.
- Missing: `robots.txt`, `sitemap.xml`, web manifest, lazy-loading attributes,
  image dimensions, performance measurement.
- Required: add static files, configure image loading, measure LCP/CLS/INP with
  Lighthouse before claiming improvements.
- Test: files fetch, metadata valid, Lighthouse run recorded.
- Risk: low; sitemap must match the single-page URL.

### M-05 - Example records still shipped

- Related: data rules in `PORTFOLIO_ARCHITECTURE.md`, section specs.
- Current: experience 2, projects 6, certificates 2, education 1, learning 3 are
  `isSample: true`; six sections show the notice.
- Expected: real records or removal before the portfolio is treated as finished.
- Required: owner supplies real content; remove the flag and the notice.
- Test: validator passes; notices disappear for real sections.
- Risk: none technical; content accuracy is the owner's call.

### M-06 - Stale comments misdescribe the current build

- Related: `DEVELOPER_FRIENDLY_CODE_COMMENTS.md` (comments must stay accurate).
- Files/lines: `js/app.js` 170-187, `js/components/modal.js` 22,
  `js/core/error-handler.js` 23, `css/main.css` 21.
- Required: update or remove the placeholder-era comments; add a CI grep for
  "placeholder in this build" to prevent recurrence.
- Test: grep returns nothing misleading; no runtime change.
- Risk: none.

### M-07 - No automated component/section/regression suite or CI

- Related: `18_TESTING_AND_RELEASE.md`.
- Current: two Node scripts plus manual browser tests.
- Required: add `node:test` unit tests for pure functions, a browser smoke test
  for sections, and a GitHub Actions workflow running both scripts and the smoke
  test on push.
- Test: the workflow fails on a deliberately broken fixture.
- Risk: low; keep Node built-ins only.

## LOW

### L-01 - `css/components/tooltips.css` is still a placeholder

No tooltip component exists or is used. Either implement a tooltip primitive or
document that tooltips are not part of this build. No functional impact today.

### L-02 - Changelog format differs from the spec

`docs/CHANGELOG.md` is readable but lacks `[Unreleased]`, version sections and
the "files changed/testing" structure in `Prompt/CHANGELOG.md`. Align it when
the next feature lands.

### L-03 - Tablet width uses the mobile navigation until 1120px

At 1024px the header shows the hamburger. The 1120px breakpoint is deliberate
(11 labels do not fit comfortably at 1024), but it differs from a conventional
1024 tablet breakpoint. Document the decision or trim navigation labels if a
desktop row is wanted at 1024.

### L-04 - Floating controls overlap content at narrow widths

The tools dock (bottom-right) and back-to-top (bottom-left) overlay whatever is
under them, including filter controls while scrolling. The page remains usable
and scrollable, but a collapse-to-one-button treatment would reduce the overlap.

## Recommended order

1. C-01 (security) - immediate, owner-confirmed.
2. H-01 (JSON Editor Studio) - the largest missing workflow and the reason this
   audit was requested.
3. H-02/H-03/H-04 - complete the importer and navigation integration, and settle
   the editor boundary.
4. M-01/M-02 - section completeness and media.
5. M-03 - theme depth.
6. M-04/M-05/M-06 - SEO, real content, comment accuracy.
7. M-07 and LOW items - tests, CI, docs polish.
