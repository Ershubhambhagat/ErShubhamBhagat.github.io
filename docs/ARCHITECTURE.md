# Architecture

> **File:** `docs/ARCHITECTURE.md`  
> **Created:** 2026-11-27 00:18  
> **Updated:** 2026-11-27 00:18  
> **Purpose:** How the page is built: boot order, modules, CSS layers, security, accessibility, verification.

## Shape of the site

A static, dependency-free single page. No framework, no bundler, no package
manager and no server code: `index.html` loads one module (`js/app.js`), which
loads JSON and renders eleven sections plus four cross-section features. Deploying
is a `git push` to the GitHub Pages branch.

```
index.html -> js/app.js -> data/*.json
                      \-> js/core/*      (loader, bus, storage, search, sort, filter, modal, errors, navigation, section-kit)
                      \-> js/components/* (button, card, badge, modal, search, filter, timeline-item, toast)
                      \-> js/sections/*   (one initializer per section)
                      \-> js/features/*   (global search, theme studio, JSON manager, SEO)
css/
  variables.css   design tokens, dark default, light overrides
  reset.css       normalisation
  main.css        type scale, container, section rhythm, shared primitives
  responsive.css  breakpoint adjustments
  animations.css  motion, reduced-motion
  layout/         header, navigation, footer
  components/     buttons, cards, badges, modals, search, filters, timeline, tooltips, toast
  sections/       one file per section + three feature panels
```

## Boot order

`js/app.js` owns the order and nothing else:

1. `config.js` (frozen constants, data paths, feature switches);
2. `loadPortfolioData()`: every dataset in parallel, failures collected not thrown;
3. storage probe, modal manager, error handler;
4. toast service, then the immutable `appContext = { data, config, bus, storage, toast }`;
5. navigation (header, mobile panel, footer, active section, back-to-top);
6. sections in contract order;
7. features;
8. `data:loaded` event and the "ready" state.

A dataset that fails disables only the section that needed it. A module that
throws is replaced by that section's error panel, and the loop continues. If every
dataset fails, one page-level panel is shown instead of eleven identical ones.

Modules are imported with `await import()` inside `try/catch` on purpose: a static
import graph fails as a unit, which would make "one section can fail alone"
impossible.

## Module contract

Each section and feature exports exactly one function:

```js
export function initializeProjects(sectionData, appContext) { /* returns nothing */ }
```

`appContext` is shared and frozen: `data`, `config`, `bus`, `storage`, `toast`.
A section may read other datasets through `appContext.data` (the career timeline
does, to resolve ids). Modules must import cleanly with no DOM — a section whose
mount is missing returns quietly instead of throwing.

`js/core/section-kit.js` is the shared renderer vocabulary added by this
implementation: section scaffolding (`.container` + heading + body), safe links,
date parsing/formatting, tag lists, meta lists, progress bars, empty states, the
example-data notice, the tools dock and clipboard copy. It exists so eleven
sections cannot drift apart on dates, URL validation or empty-state wording. It
has no top-level DOM access.

## Sections

| Section | Data | Rendering |
|---|---|---|
| profile | `profile.json` | Custom hero: `<h1>`, role, tagline, availability, actions, social links, fact panel with monogram. |
| skills | `skills.json` | Category groups; progress bar when `proficiency` exists, tag when it does not. Select filter. |
| experience | `experience.json` | Shared timeline item per role; expandable details. |
| projects | `projects.json` | Card grid, text search (`search-engine.matchesQuery`), category select, details modal. |
| certificates | `certificates.json` | Card grid, issuance date, skills, verification link only when a URL exists. |
| education | `education.json` | Cards, not a timeline: the only record has no dates. Optional fields omitted. |
| learning-journey | `learning-journey.json` | Cards with `role="progressbar"` and goal lists, category select. |
| career-timeline | `career-timeline.json` + all datasets | Resolves `referenceId` to the referenced record, type filter, year-ordered timeline. |
| github-importer | GitHub REST API | On-demand fetch, cache in `localStorage`, no token, rate-limit message. |
| bookmarks | `bookmarks.json` | Category groups, local links same tab, favourite toggle persisted. |
| contact | `profile.json` | Contact cards, copy-to-clipboard, social links, mailto form with local validation. |

## Features and the tools dock

`#global-search-root`, `#theme-studio-root` and `#json-manager-root` are siblings
of `<main>` with no shared chrome. Three independent fixed buttons would overlap,
so `section-kit.ensureToolsDock()` creates one fixed column and each feature adds
its own launcher to it. A feature switched off in `APP_CONFIG.features` adds no
button; an empty dock removes itself.

- **Global search** indexes `appContext.data`, not the DOM, so a section that
  failed still contributes searchable records. `Ctrl`/`Cmd`+`K` opens the dialog;
  results scroll to the section and move focus to its heading.
- **Theme Studio** applies a preset's colour tokens onto `:root` and writes the
  chosen id and token map to `portfolio.theme` / `portfolio.themeSettings`. Token
  names and values are allow-listed, so an imported preset cannot set arbitrary
  CSS. Themes restore after boot, which costs one frame of the default palette;
  the alternative (an inline script before CSS) is forbidden by the contract.
- **JSON manager** cannot write to the repository. It validates a chosen file,
  reports structural problems with record indexes, and downloads a clean copy for
  the owner to commit. Validation mirrors `scripts/validate-data.mjs`.
- **SEO** updates title, description, canonical, Open Graph, Twitter card and one
  Person JSON-LD block from `profile.json`. Tags are updated in place, never
  duplicated. `og:image` is only claimed when a profile image exists.

## CSS

Load order is fixed in `index.html`: tokens, reset, main, responsive, animations,
layout, components, sections. Later layers refine earlier ones; section files
never hardcode a colour or a font family.

This implementation appended a clearly separated block to `css/main.css` for
primitives that have no other home in the contract's path list:

- section scaffolding (`.section__header`, `.section__title`, `.section__intro`);
- the form field primitive (`.field`, `.field__input`) shared by contact, project
  search, global search and the JSON manager;
- tag list, meta list and progress bar;
- empty state and example-data notice;
- card grid, tools dock, link-with-icon, detail panel.

Component files use the class names the existing component modules emit
(`.btn--primary`, `.badge--outline`, `.card__link`, `.timeline__marker`, …), so
the JavaScript and CSS stay independently replaceable.

Breakpoints: 600px (mobile dock, horizontal cards), 768px (timeline indent,
contact form columns), 900px (profile two-column), 1120px (desktop navigation).
The 1120px value appears in `js/core/navigation.js` (`DESKTOP_QUERY`),
`css/layout/header.css` and `css/layout/navigation.css` and must change together.

## Security

- All dataset text is written with `textContent`; no module sets `innerHTML`.
- Links pass `toSafeHref` (button component) or `createLink`; `javascript:` and
  `data:` URLs are dropped. External links get `target="_blank"` and
  `rel="noopener noreferrer"`.
- JSON is parsed with `JSON.parse`, never evaluated. The JSON manager reads files
  with `FileReader.text()`.
- No token or secret is embedded. The GitHub call is unauthenticated by design
  (a client-side token is public the moment it deploys).
- The theme engine allow-lists token names and colour-shaped values.
- The contact form has no backend and says so; it cannot silently discard a
  message.

## Accessibility

- One `<h1>` (the name); every other section starts at `<h2>`.
- Semantics: real `<button>`/`<a>`, `<ol>` for the timeline, `<dl>` for fact
  lists, `<fieldset>`/`<legend>` for filters, `<dialog>` for modals.
- Focus: one visible ring defined in `main.css`, skip link to `#main-content`,
  modal focus trap and restore handled by the modal manager, results and filters
  announce through `role="status"` live regions.
- Progress bars expose `role="progressbar"` with `aria-valuenow` and an
  accessible name; the visible percentage is a separate caption.
- Reduced motion is honoured by the timeline, cards, dock and spinner rules.
- All interactive controls have accessible names; no duplicate ids (checked in
  the browser).

## Verification

```powershell
node scripts/validate-data.mjs   # JSON shape, ids, dates, references, links
node scripts/check-modules.mjs   # imports without DOM, single export, no innerHTML
```

Manual/browser checks used during this implementation: page loads with zero error
panels, all eleven sections render, project search and category filters narrow the
grid, global search returns results and scrolls to them, theme switch repaints and
persists, bookmark favourites persist, the mobile menu opens and closes with
`aria-expanded`, the contact form reports empty fields, the GitHub section loads
public repositories, and the JSON manager lists all eleven datasets.

## Limits

- The GitHub section depends on a public API with a shared hourly quota; it
  fetches only when asked and shows the cached result otherwise.
- The theme restore happens after boot, so a visitor who chose light sees one
  default-palette frame.
- No service worker and no offline mode: the site is a static page with JSON
  requests.
- Several datasets still contain example records (see `DATA-GUIDE.md`); the page
  labels them rather than hiding the fact.
