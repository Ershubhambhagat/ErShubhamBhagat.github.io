# Shared component audit

> **File:** `docs/audit/SHARED_COMPONENT_AUDIT.md`  
> **Created:** 2026-11-27 01:25  
> **Updated:** 2026-11-27 01:25  
> **Purpose:** Audit of the nine shared component specifications.

Audit date: 2026-11-27.

Nine component specifications were read and compared with the shared source in
`js/components/`, `js/core/`, `css/components/`, `css/layout/` and the consuming
sections. "Tests" means behaviour exercised in the Chrome run on this date, not a
file existing.

Summary: **0 fully meet their spec, 9 are partial, 0 are broken/missing.**

None of the nine is a stub: all have real implementations and are exercised at
least indirectly by the page. The partial statuses are specific missing behaviours
listed per component.

## Button - PARTIAL

- Source: `js/components/button.js`, `css/components/buttons.css`
- Variants in code: primary, secondary, outline, ghost, destructive, link.
- Sizes: small, medium, large; icon-only; full width.
- States: default, hover, active, focus-visible, disabled, loading (spinner +
  `aria-busy`), safe hrefs with `noopener`.
- Tested: primary ("View projects"), outline ("Get in touch"), ghost (Open),
  icon-only (modal close), links, disabled not triggered.
- Not verified: secondary, destructive, link-style, large/medium visual sizing,
  loading state.
- Consumers: profile, projects, certificates, bookmarks, contact, GitHub importer,
  modal.
- Final: PARTIAL - the implementation is real and reused; half the visual
  variants and the loading state were never exercised.

## Card - PARTIAL

- Source: `js/components/card.js`, `css/components/cards.css`
- Variants: standard, elevated, featured, compact, horizontal.
- Anatomy: media (ratio/contain/fallback), category, title link, subtitle,
  description, badges, meta list, footer actions, skeleton.
- Tested: standard interactive card in Projects (whole-title click opens the
  dialog), badges, meta, footer actions.
- Not verified: elevated/featured/compact/horizontal variants, image fallback,
  skeleton, multiple actions in one card.
- Consumers: projects, certificates, bookmarks.
- Final: PARTIAL - the most-used variant works; the other variants are CSS/code
  only.

## Badge - PARTIAL

- Source: `js/components/badge.js`, `css/components/badges.css`
- Variants: neutral, primary, success, warning, danger, info, outline.
- Sizes: small, medium, large; icon; interactive pressed state; count badges.
- Tested: outline tags rendered across cards and tag lists; labels via
  `textContent`.
- Not verified: other variants, interactive filter badges, count badges, large
  size.
- Consumers: cards, section tag lists, timeline badges.
- Final: PARTIAL.

## Modal - PARTIAL

- Source: `js/core/modal-manager.js`, `js/components/modal.js`,
  `css/components/modals.css`
- Native `<dialog>`, focus trap, focus restore, Escape, backdrop, scroll lock,
  sizes sm/md/lg/full, details/confirm/preview helpers.
- Tested: theme dialog opens with focus inside, close button restores the
  trigger; Escape closes and restores; project details dialog opens with content;
  mobile viewport no overflow.
- Not verified: backdrop click, scroll-lock behaviour, confirm/preview helpers,
  sm/full sizes, form modal.
- Final: PARTIAL.

## Search - PARTIAL

- Source: `js/components/search.js`, `css/components/search.css`
- Field with label, clear button, status line, loading state, sizes/variants.
- Suggestions/autocomplete are explicitly out of scope in the module header.
- Tested: none in the page; Global Search uses a raw input, not this component.
- Not verified: the component itself was not instantiated in the audit.
- Consumers: **none** in the current sections or features.
- Final: PARTIAL - implemented but not reused, and its suggestion behaviour is
  absent. This is the weakest of the nine in terms of the "shared component"
  requirement.

## Filter - PARTIAL

- Source: `js/components/filter.js`, `css/components/filters.css`
- Types: single, select, multiple, checkbox. No range type.
- Active chips, clear-all, collapsible panel, result count, layouts.
- Tested: category select in Projects (6 -> 3 -> 6 on clear), skills groups
  (4 -> 1 -> 4), timeline type filter (9 -> 3 -> 9).
- Not verified: multiple/checkbox groups, active chips display, result count
  output, apply-mode panels.
- Final: PARTIAL.

## Navbar - PARTIAL

- Source: `js/core/navigation.js`, `css/layout/header.css`,
  `css/layout/navigation.css`
- Brand, 11 desktop links, mobile disclosure, active-section indicator,
  aria-current, sticky/elevated state, footer, back-to-top.
- Tested: 375px menu opens (`aria-expanded=true`, display block) and closes;
  Projects active after click; Skills active after scroll; anchor lands 168px
  below the top with a 68px header; back-to-top appears and returns to 0.
- Not implemented: header Global Search button, header theme button, résumé
  action. Search and theme exist only in the bottom-right tools dock.
- Not verified: full keyboard operation of the mobile panel.
- Final: PARTIAL.

## Timeline - PARTIAL

- Source: `js/components/timeline-item.js`, `css/components/timeline.css`
- Layouts in code: vertical, horizontal, compact, grouped.
- Markers, rail, dates, type/featured states, details disclosure, optional image,
  action buttons.
- Tested: vertical timeline in Experience (2 events) and Career Timeline (9
  events, type filter 9 -> 3 projects -> 9); "Show details" present.
- Not verified: horizontal/compact/grouped layouts (no section uses them),
  event action buttons, event images.
- Final: PARTIAL.

## Toast - PARTIAL

- Source: `js/components/toast.js`, `css/components/toast.css`
- Four tones, auto-dismiss, hover pause, manual dismiss, max visible, action
  button, progress bar.
- Tested: success toast for copy ("Email address copied") and theme reset;
  `#toast-root` is `aria-live="polite" aria-atomic="true"`.
- Not verified: error/warning/info tones, multiple notifications, action button,
  hover pause, auto-dismiss timing.
- Design note: individual `.toast` elements deliberately have no `role` because
  the live region is the root; that is documented in the module, not a defect.
- Final: PARTIAL.

## Reuse matrix

| Component | profile | skills | experience | projects | certificates | education | learning | timeline | bookmarks | contact | features |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Button | yes | - | - | yes | yes | - | - | - | yes | yes | GitHub, JSON manager |
| Card | - | - | - | yes | yes | - | - | - | yes | - | - |
| Badge | - | yes | yes | yes | yes | yes | - | yes | yes | - | - |
| Modal | - | - | - | yes | - | - | - | - | - | - | search, theme, data |
| Search | - | - | - | - | - | - | - | - | - | - | not used |
| Filter | - | yes | - | yes | yes | - | yes | yes | - | - | - |
| Navbar | - | - | - | - | - | - | - | - | - | - | global |
| Timeline | - | - | yes | - | - | - | - | yes | - | - | - |
| Toast | - | - | - | - | - | - | - | - | yes | yes | theme, data |

## Conclusion

The component layer is functional and genuinely shared, except for the Search
component. No component fully satisfies every clause of its specification,
mostly because advanced states and variants exist but were never exercised, and
because the Navbar's header actions are absent. These are gaps to close, not
reason to rewrite the components.
