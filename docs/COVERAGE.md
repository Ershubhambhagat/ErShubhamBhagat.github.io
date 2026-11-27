# Spec coverage report

> **File:** `docs/COVERAGE.md`  
> **Created:** 2026-11-27 01:05  
> **Updated:** 2026-11-27 01:05  
> **Purpose:** Document-level coverage of every Prompt/ specification.

Date: 2026-11-27. Scope: every document in `Prompt/` (architecture, 18 numbered
section specs, 9 component specs, comments and changelog rules), checked against
the code in this repository and against a browser run.

Status legend:

- **Implemented** - the spec's core behaviour exists and was exercised.
- **Partial** - the section works, but named features in the spec are absent or
  simplified.
- **Missing** - the core workflow of the spec is not built.

The short answer: **not everything in `Prompt/` is implemented.** The page,
components and data layer are complete enough to run and publish; the ambitious
per-section features (advanced filters, galleries, owner editors, custom theme
controls) are not. The tables below say exactly which.

## Section and architecture specs

| Spec | Status | Implemented | Not implemented |
|---|---|---|---|
| `PORTFOLIO_ARCHITECTURE.md` | Partial | Static JSON-driven app, modular vanilla JS, components, no build step, data rules and stable ids | Later phases (owner tooling, advanced section features); some component docs' optional behaviours |
| `01_FOUNDATION.md` | Implemented | HTML shell, token system, CSS layers, data loader with per-dataset failure isolation, boot order, 404 page, GitHub Pages paths | Nothing material |
| `02_PROFILE_SECTION.md` | Partial | Name, title, tagline, intro, biography, location, availability, actions, seven social links, highlights, monogram, responsive, accessible | Photo (deliberately not reused), résumé (no file configured), decorative animation beyond hover states |
| `03_SKILLS_SECTION.md` | Partial | Categories, cards, six stated levels with progress bars, tag-only tools, category filter, empty state | Text search, sort control, skill icons, featured emphasis, "currently learning" group, experience duration |
| `04_EXPERIENCE_SECTION.md` | Partial | Timeline, current/previous, company, type, arrangement, location, dates, description, responsibilities, achievements, skills, expandable details | Search, filters, sort control, company logo and website, computed duration |
| `05_PROJECTS_SECTION.md` | Partial | Cards, title, description, category, technologies, status in details, featured flag, live/source buttons, detail dialog, search, category filter | Cover image, gallery, technology filter, sort control, pagination, related skills/experience, challenges/features blocks, direct `#project-001` links |
| `06_CERTIFICATES_SECTION.md` | Partial | Cards, issuer, dates, skills, category filter, newest-first order, verify button, credential id switch, empty state | Search, sort control, load more/pagination, detail preview, PDF/image viewer, expiry emphasis |
| `07_Education_Section.md` | Partial | Cards, institution, qualification, field, dates, grade, coursework, optional-field hiding | Search, filters, sort, pagination, detail preview |
| `08_LEARNING_JOURNEY.md` | Partial | Cards, category filter, progress bar with self-assessment note, goals, source link, status chip | Search, sort, load more, current-learning highlights, detail preview |
| `09_CAREER_TIMELINE.md` | Partial | Cross-dataset reference resolution, missing-reference handling, type filter, date ordering, shared timeline, featured marker | Search, year grouping, featured-only filter, load more, layout switch, click-through to the source record |
| `10_GITHUB_IMPORTER.md` | **Missing** core workflow | One-click fetch of public repositories, listing, show more, cache, rate-limit message, safe links | Username/profile/repo URL inputs, search/filter/sort, repository selection, detail review, duplicate detection against projects, conversion to project schema, JSON preview/export |
| `11_WEBSITE_BOOKMARKS.md` | Partial | Category groups, cards, tags, favourite toggle persisted, local pages, empty state | Add/edit/delete in the UI, search/filter/sort, favicon/image slots, embed preview with fallback, import/export UI, duplicate detection |
| `12_GLOBAL_SEARCH.md` | Partial | Overlay, Ctrl/Cmd+K, cross-dataset index, result navigation with focus move, status line, no-result state, last-query restore | Suggestions, recent searches, match highlighting, section filters, result grouping, ranking options, popular searches |
| `13_THEME_STUDIO.md` | Partial | Four presets, light/dark, token overrides, live apply, reset, localStorage persistence, token-value validation | Custom colour pickers, typography/layout/component controls, preview modes, undo/redo, import/export, contrast checks |
| `14_JSON_MANAGER.md` | Partial | Dataset registry, record counts, syntax/schema/id/date validation, download of loaded or validated file, draft marker | In-browser editing, import preview, merge/replace strategies, cross-reference and URL validation in the UI, applying an import to the session |
| `15_CONTACT_AND_SOCIAL.md` | Partial | Email/location/availability cards, social links, copy-to-clipboard, mailto form with validation and status, honest "no backend" copy | Phone/WhatsApp (deliberately absent), external form provider mode, spam protection |
| `16_NAVIGATION_AND_LAYOUT.md` | Partial | Header, brand, desktop/mobile navigation, active section, sticky state, footer, back-to-top, anchors, reduced motion, config | Header Global Search and Theme buttons (features live in the bottom-right dock instead), résumé action |
| `17_SEO_AND_PERFORMANCE.md` | Partial | Title, description, canonical, Open Graph, Twitter card, Person JSON-LD, semantic headings, favicon | `robots.txt`, `sitemap.xml`, web manifest, image lazy-loading config, Core Web Vitals measurement |
| `18_TESTING_AND_RELEASE.md` | Partial | Data validation script, module-contract script, manual browser checks, docs changelog | Automated component/section/integration tests, responsive and accessibility test suite, CI workflow, formal release/rollback checklist |

Result across the 19 architecture/section specs: 1 implemented, 17 partial, 1 missing at the workflow level.

## Component specs

| Spec | Status | Notes |
|---|---|---|
| `BUTTON_COMPONENT.md` | Implemented | Six variants, three sizes, icons, loading, disabled, full width, safe hrefs |
| `CARD_COMPONENT.md` | Partial | Variants, media, badges, meta, actions, skeleton; no gallery inside the card |
| `BADGE_COMPONENT.md` | Implemented | Variants, sizes, icons, interactive pressed state, counts |
| `MODAL_COMPONENT.md` | Implemented | Native dialog, focus trap/restore, escape/backdrop, sizes, details/confirm/preview helpers |
| `SEARCH_COMPONENT.md` | Partial | Field, clear, status, loading, sizes; no suggestion/autocomplete list |
| `FILTER_COMPONENT.md` | Partial | Single/multi/select/checkbox, chips, clear-all, counts, collapsible; no range filter |
| `TIMELINE_COMPONENT.md` | Implemented | Vertical/horizontal/compact/grouped, markers, details, images, ordering; sections currently use vertical only |
| `TOAST_COMPONENT.md` | Implemented | Four tones, duration, hover pause, dismiss, max visible, action button |
| `NAVBAR_COMPONENT.md` | Partial | Brand, desktop/mobile, active indicator, sticky; header action slots are not rendered |

## Cross-cutting docs

| Spec | Status | Notes |
|---|---|---|
| `DEVELOPER_FRIENDLY_CODE_COMMENTS.md` | Implemented | File headers, JSDoc, CSS markers; see `docs/COMMENTS.md` |
| `CHANGELOG.md` | Partial | `docs/CHANGELOG.md` exists but does not follow the spec's `[Unreleased]`/version layout |

## What is missing, grouped

1. **Owner editing** - bookmarks, JSON manager and GitHub importer cannot create or
   edit records from the browser. This is the gap the planned JSON editor closes.
2. **Advanced selection** - search/sort controls and pagination in skills,
   experience, projects, certificates, education, learning and the timeline.
3. **Media** - project covers/galleries, certificate images/PDFs, bookmark
   favicons/screenshots, company logos.
4. **Theme depth** - custom colours, type, layout and component controls,
   undo/redo, import/export.
5. **Search depth** - suggestions, recent searches, highlighting, ranking.
6. **SEO infrastructure** - `robots.txt`, sitemap, manifest, performance budgets.
7. **Test automation** - no component/section/e2e suite and no CI.

## Why this is not "everything implemented"

The specs describe more than a static portfolio: several of them assume owner
editors, media pipelines and large filter surfaces. The build prioritised a
correct, honest, publishable page: real data where it exists, clearly marked
examples where it does not, safe rendering, and a working build with zero console
errors. Features that would have required inventing data or a backend were left
out rather than faked.

The next planned piece of work - the JSON editor app - directly addresses gaps 1
and part of 2, and gives the owner a way to fill the remaining data.
