# Components: specification vs implementation gap report

**Date:** 2026-11-27
**Specs:** `Prompt/components/{BUTTON,CARD,BADGE,MODAL,SEARCH,FILTER,NAVBAR,TIMELINE,TOAST}_COMPONENT.md`
**Code audited:** `js/components/*.js`, `css/components/*.css`, `js/core/modal-manager.js`, plus every consumer in `js/sections/*`, `js/core/{navigation,collection-view,section-kit}.js`, `js/features/*`, `index.html`.

## How this was verified

| Tier | What it means here |
|---|---|
| Verified | Read the file; the cited line contains the behaviour (or the absence of it). |
| Inferred | Behaviour deduced from call sites (e.g. "no section calls `setButtonLoading`" = grep over `js/**/*.js`). |
| Not verified | Rendering in a browser, screen-reader output, contrast ratios, and 320–1920px behaviour. No fixture page exists and `tests/` holds engine tests only, so no component state is exercised by an automated check. |

Statuses:

- **PASS** — implemented and reachable through the component's public API.
- **PARTIAL** — implemented but no section (or test) exercises it; the "needed change" cell names the fixture state that must render for it to count as verified.
- **GAP** — the capability is missing, misnamed, unstyled, or contradicted by another file.

Requirements that need owner-supplied content (real names, dates, certificate issuers, resume file, social URLs) are excluded, as are the "may"/"where appropriate" clauses that do not name a concrete capability.

## Summary

| Component | Rows | PASS | PARTIAL | GAP |
|---|---:|---:|---:|---:|
| Button | 17 | 10 | 3 | 4 |
| Card | 13 | 7 | 4 | 2 |
| Badge | 11 | 4 | 2 | 5 |
| Modal (incl. manager) | 17 | 7 | 1 | 9 |
| Search | 14 | 5 | 2 | 7 |
| Filter | 13 | 4 | 7 | 2 |
| Timeline | 12 | 7 | 1 | 4 |
| Toast | 11 | 3 | 6 | 2 |
| Navbar | 11 | 7 | 1 | 3 |
| Cross-cutting | 2 | 0 | 0 | 2 |
| **Total** | **121** | **54** | **27** | **40** |

The behavioural layer is in better shape than the styling/option layer: every documented constructor, state helper and security guard exists, but several CSS contracts do not match the class names the JS emits (Search sizes/variants, `btn--danger`, `.card-grid`) and several spec options were collapsed into one boolean (Modal).

---

## 1. Button — `js/components/button.js`, `css/components/buttons.css`

| ID | Requirement (spec §) | Status | Evidence | Needed change |
|---|---|---|---|---|
| BTN-01 | Six variants: primary, secondary, outline, ghost, destructive, link (§5) | PASS | `js/components/button.js:40`, `css/components/buttons.css:51-121` | — |
| BTN-02 | Three sizes small/medium/large (§6) | PASS | `css/components/buttons.css:124,130` (base `.btn` is medium) | — |
| BTN-03 | Full-width modifier (§14) | PASS | `css/components/buttons.css:135`, `button.js:203` | — |
| BTN-04 | Icon-only control with accessible name and ~44px target (§13) | PASS | `js/components/button.js:284-300`, `css/components/buttons.css:141`; used at `js/sections/bookmarks.js:867` | — |
| BTN-05 | Native `<button>` for actions, `<a>` for navigation, href allow-list (§4, §23) | PASS | `button.js:337` (`createButton`), `button.js:380` (`createButtonLink`), `button.js:105` (`toSafeHref`) | — |
| BTN-06 | Disabled state without CSS-only disabling; anchor href parked (§11.5) | PASS | `js/components/button.js:508-556` | — |
| BTN-07 | Loading state: spinner, `aria-busy`, disable, restore previous state (§11.6, §12) | PARTIAL | `js/components/button.js:459`; no caller anywhere (`grep setButtonLoading` matches only the module) | Fixture: a primary button in `btn--loading` with `aria-busy="true"` and its label intact; a second button that starts disabled to prove the disabled state is restored. |
| BTN-08 | Async wrapper with `try…finally` (§12) | PARTIAL | `js/components/button.js:587`; unused | Fixture: button whose action rejects — spinner clears, button re-enables, page still usable. |
| BTN-09 | Destructive is distinguishable without relying only on colour (§10) | GAP | `css/components/buttons.css:94-106` differs from `.btn--outline` only in `border-color`/`color` | Add a non-colour cue under `.btn--destructive` in `css/components/buttons.css` (icon slot convention or heavier border weight). |
| BTN-10 | Destructive actions go through an explicit confirmation (§18) | PASS | `js/components/modal.js:215` (`confirmModal`), used at `js/sections/bookmarks.js:659,726` | — |
| BTN-11 | Visible focus indicator via `:focus-visible` (§21) | PASS | `css/main.css:287` | — |
| BTN-12 | Reduced motion: no transition, no transform (§21) | GAP | `css/components/buttons.css:18-25` (`transition`), `:active { transform }` at line 47; only `.btn__spinner` is guarded (line 183) | Add `@media (prefers-reduced-motion: reduce) { .btn { transition: none } .btn:active { transform: none } }` in `css/components/buttons.css`. |
| BTN-13 | Optional shortcut indicator in the anatomy (§7) | GAP | no option or class in `js/components/button.js`; no `.btn__shortcut` in CSS | Add an optional `shortcut` option + `.btn__shortcut` slot in `createButton()`, or delete the clause from the spec. |
| BTN-14 | Theme Studio can retune per-variant background/text/border and height/padding/radius/weight (§19) | GAP | `css/components/buttons.css` hardcodes padding, font-size, radius; `css/variables.css` has no `--button-*` family | Introduce a `--button-*` token layer and read it in `css/components/buttons.css`. |
| BTN-15 | No duplicate handlers; idempotent state (§17) | PASS | `button.js:436-457` (`WeakMap` loading bookkeeping), `button.js:597` | — |
| BTN-16 | Empty label / missing accessible name is rejected (§15, §24) | PASS | `js/components/button.js:232-245` | — |
| BTN-17 | The destructive control emitted by the Modal uses a variant the stylesheet defines (§5.5, §16) | GAP | `js/components/modal.js:125` emits `btn--danger`; `css/components/buttons.css` defines only `.btn--destructive` — a destructive confirm renders as a plain `.btn` | Change `modal.js:125` to `btn--destructive` (single-line fix; every destructive confirmation is currently unstyled). |

## 2. Card — `js/components/card.js`, `css/components/cards.css`

| ID | Requirement (spec §) | Status | Evidence | Needed change |
|---|---|---|---|---|
| CARD-01 | Five variants: standard, elevated, featured, compact, horizontal (§5) | PASS | `card.js:80-86` (`CARD_VARIANTS`), `css/components/cards.css:31-64` | — |
| CARD-02 | Elevated, compact and horizontal are actually rendered somewhere (§5.2, §5.5, §5.6) | PARTIAL | only `variant: featured ? "featured" : "standard"` at `js/sections/projects.js:477`; no other `variant` on `createCard` | Fixture: one card per variant, horizontal card also at ≤599px where it must stack (`css/components/cards.css:68`). |
| CARD-03 | Whole card clickable through one control, no nested interactive elements (§7, §14) | PASS | `js/components/card.js:453-478` (title is the only control), `css/components/cards.css:171-180` (`.card--stretched` overlay) | — |
| CARD-04 | Image: alt, lazy/eager, intrinsic dimensions, ratios, `object-fit`, one-shot fallback (§10) | PASS | `js/components/card.js:152-215`, `css/components/cards.css:96-155` | — |
| CARD-05 | Skeleton cards (§15) | PARTIAL | `js/components/card.js:645` (`createCardSkeleton`); never imported by a section or test | Fixture: a 3-card skeleton grid (with and without media, 1 and 3 lines) beside real cards to prove no layout shift; plus reduced-motion. |
| CARD-06 | Selected state with a semantic channel (§23) | PARTIAL | `js/components/card.js:610` (`setCardSelected`), `css/components/cards.css:267`; `js/sections/projects.js:494` toggles a class directly instead | Fixture: action card selected (`aria-pressed="true"`), navigation card selected (`aria-current`), non-interactive card selected (class only). |
| CARD-07 | `updateCardContent` for in-place text/image updates (§23) | PARTIAL | `js/components/card.js:519`; unused | Fixture: a card updated twice (including clearing description) without rebuilding the DOM. |
| CARD-08 | `.card-grid` layout utility (§17) | GAP | no `.card-grid` rule exists anywhere; `js/components/card.js:30` claims "the shared `.card-grid` class in css/components/cards.css" | Add `.card-grid` (`repeat(auto-fit, minmax(min(100%,280px),1fr))`, gap token) to `css/components/cards.css` and let sections opt in, or correct the comment and the spec. |
| CARD-09 | Badges rendered by the shared Badge component (§11) | PASS | `js/components/card.js:504` (`createBadge` with outline/small defaults) | — |
| CARD-10 | Footer actions rendered by the shared Button component (§12) | PASS | `js/components/card.js:351-395` (`createButton`/`createButtonLink`), `css/components/cards.css:225-240` | — |
| CARD-11 | Reduced motion for the hover lift (§13) | PASS | `css/components/cards.css:262-268` | — |
| CARD-12 | Absent optional areas leave no empty container (§6, §24) | PASS | `card.js:167` (header), `card.js:262` (meta), `card.js:322` (footer), `card.js:203` (media) all return `null` | — |
| CARD-13 | Theme Studio can retune padding, title size, radius, grid gap, hover shadow (§19) | GAP | `css/components/cards.css` hardcodes `1.125rem` title, padding, radius; no `--card-*` in `css/variables.css` | Add a `--card-*` token layer and consume it in `css/components/cards.css`. |

## 3. Badge — `js/components/badge.js`, `css/components/badges.css`

| ID | Requirement (spec §) | Status | Evidence | Needed change |
|---|---|---|---|---|
| BGD-01 | Seven variants: neutral, primary, success, warning, danger, info, outline (§5) | PASS | `js/components/badge.js:42-50`, `css/components/badges.css:49-90` | — |
| BGD-02 | Three sizes (§6) | PASS | `js/components/badge.js:53`, `css/components/badges.css:93,98` | — |
| BGD-03 | Optional icon slot, hidden from AT, no empty container (§7) | PASS | `js/components/badge.js:213-234` | — |
| BGD-04 | Count badge with an accessible noun and validation (§14) | PARTIAL | `js/components/badge.js:125-150,239-247`; no call site passes `count`/`countLabel` | Fixture: badge with `count: 3` + `countLabel: "results"`, badge with `count: 0`, badge with `count: 12345`, badge with an invalid count (hidden). |
| BGD-05 | Count is styled as a distinct element (§9 `.badge__count`) | GAP | `badges.css` has no `.badge__count` rule although `badge.js` creates the element | Add `.badge__count` (tabular numerals, muted colour, no wrap) to `css/components/badges.css`. |
| BGD-06 | Interactive filter badge as a real button with `aria-pressed` (§16, §18) | PARTIAL | `js/components/badge.js:200-211`; no section creates an interactive badge (skills uses static badges only) | Fixture: pressed and unpressed interactive badge, keyboard-activated, inside a badge group. |
| BGD-07 | Long labels wrap safely instead of clipping (§6, §17, §23) | GAP | `css/components/badges.css:25` sets `white-space: nowrap`; no `max-width`, no `overflow-wrap` | Remove `nowrap`, add `max-inline-size: 100%` + `overflow-wrap: anywhere` on `.badge__label`. |
| BGD-08 | Badge groups wrap and never overflow (§15) | PASS | `js/components/badge.js:274-320` (`badge-list`); group is flex/inline and wraps via its parent | — |
| BGD-09 | Optional status indicator dot in the anatomy (§7) | GAP | no `status`/dot option in `js/components/badge.js`; no CSS | Add an optional status dot slot (aria-hidden, plus the text label) or drop the clause. |
| BGD-10 | Reduced motion (§25 acceptance) | GAP | `css/components/badges.css:105-110` transitions colour with no reduced-motion guard | Add a `@media (prefers-reduced-motion: reduce)` block setting `transition: none` on `.badge--interactive`. |
| BGD-11 | Variant tokens for background/text/border/padding/radius (§10, §19) | GAP | every variant derives from global `--color-*`; `css/variables.css` has no `--badge-*` | Add a `--badge-*` token layer (or state in the spec that badges ride on global semantic colours only). |

## 4. Modal — `js/components/modal.js`, `js/core/modal-manager.js`, `css/components/modals.css`

| ID | Requirement (spec §) | Status | Evidence | Needed change |
|---|---|---|---|---|
| MDL-01 | Five sizes sm/md/lg/xl/full (§6) | PASS | `js/components/modal.js:38-44`, `css/components/modals.css:84-108` (xl and full are unused but reachable) | — |
| MDL-02 | Standard details modal (§5.1) | PASS | `js/components/modal.js:172`; used at `js/sections/certificates.js:329`, `projects.js:245`, `education.js:251`, `learning-journey.js:244` | — |
| MDL-03 | Confirmation modal with explicit labels, safe initial focus, resolves only on explicit confirm (§16) | PASS | `js/components/modal.js:215-286` (cancel focused first, `onClose` settles `false`) | — |
| MDL-04 | Preview modal with preserved ratio, alt, and a broken-image fallback (§18) | PARTIAL | `js/components/modal.js:291-345`; `openPreviewModal` has no caller | Fixture: portrait and landscape preview, a preview with caption, a 404 image (fallback text), Escape to close. |
| MDL-05 | Form modal shell (§5.3) | PASS | `js/sections/bookmarks.js:644-652` opens the add/edit form as the dialog body | — |
| MDL-06 | Unsaved-change protection for a form dialog (§17) | GAP | `js/sections/bookmarks.js:648`; the dialog closes on Escape/backdrop/cancel with no dirty check anywhere (`grep -i "unsaved\|dirty"` → none) | Add a `beforeClose`/`confirmDiscard` hook to `openModal()` and use it in the bookmarks form, routing through `confirmModal()`. |
| MDL-07 | Focus trap, initial focus, restore to opener (§12) | PASS | `js/core/modal-manager.js:94-160` (Tab cycle), `:472` (`resolveInitialFocus`), `:556-570` (restore) | — |
| MDL-08 | Fallback focus when the opener no longer exists (§12, §24) | GAP | `js/core/modal-manager.js:570` restores only `if (restoreTarget.isConnected)`; otherwise focus is left wherever the browser puts it | Fall back to `#main-content` (already a focus target) in `closeModal()`. |
| MDL-09 | Background scroll lock with scrollbar compensation and exact restore (§13) | PASS | `js/core/modal-manager.js:194-245` (locks `scrollingElement`, pads `<body>`) | — |
| MDL-10 | Independent `closeOnBackdrop`, `closeOnEscape`, `closeButton`, `restoreFocus`, `lockBackgroundScroll` options (§10, §22) | GAP | `js/core/modal-manager.js:424-430` accepts only `closable`; the five documented switches do not exist | Split `closable` into the documented options in `openModal()` and honour each in `handleDocumentKeydown`/`handleBackdropClick`/`buildDialog`. |
| MDL-11 | Escape can be restricted during a critical operation (§11) | GAP | `js/core/modal-manager.js:99-105` closes on Escape without consulting `activeOptions.closable` | Check `activeOptions.closable === false` (or `closeOnEscape === false`) before closing on Escape/`cancel`. |
| MDL-12 | Backdrop dismissal disabled for destructive confirmations (§10 table) | GAP | `js/components/modal.js:267` passes `closable: true` to `confirmModal`, so a backdrop click cancels a delete dialog | Pass a backdrop-off option (depends on MDL-10) for `destructive: true`. |
| MDL-13 | Documented `[data-modal-close]` attribute works in consumer content (§8) | GAP | only the manager's own header button gets a listener (`js/core/modal-manager.js:302`); no delegation on the dialog | Delegate `click` on `[data-modal-close]` inside `openModal()` so a footer built as the spec shows actually closes. |
| MDL-14 | Native `close` event handled (§8) | GAP | no `"close"` listener in either modal file | Listen for `close` and run the same teardown as `closeModal()` (scroll lock, listeners, focus) to survive an external `dialog.close()`. |
| MDL-15 | `aria-labelledby`/`aria-describedby`, `aria-modal`, reduced-motion entrance (§19, §25) | PASS | `js/core/modal-manager.js:294-345`, `css/components/modals.css:318-357` | — |
| MDL-16 | Modal theme tokens: backdrop, radius, width, padding, shadow (§21) | GAP | `css/components/modals.css` hardcodes `40rem`, spacing and `--color-overlay`; no `--modal-*` in `css/variables.css` | Add `--modal-*` tokens for panel, scrim, radius, width, padding. |
| MDL-17 | No stray live region wrapping the dialog (§25, TOAST §18) | GAP | `index.html:325` gives `#modal-root` `aria-live="polite"`, so every dialog's whole content is announced on insertion | Remove `aria-live` from `#modal-root`; keep `#toast-root` as the only polite region (`index.html:326`). |

## 5. Search — `js/components/search.js`, `css/components/search.css`

| ID | Requirement (spec §) | Status | Evidence | Needed change |
|---|---|---|---|---|
| SRCH-01 | Sizes small/medium/large (§10) | GAP | `js/components/search.js:40` accepts `sm|md|lg` and emits `search--sm` (`:304`), but `css/components/search.css:133,138` styles `.search--small`/`.search--large` — the option is a no-op | Rename one side (`SEARCH_SIZES = ["small","medium","large"]` or CSS `--sm/--md/--lg`) in `search.js:40,304` + `search.css:133,138`. |
| SRCH-02 | Variants standard/outlined/filled/compact/expanded (§10) | GAP | `search.js:43` lists them and emits `search--<variant>` (`:310`); `search.css` defines only `.search--minimal` (`:145,151`), which is not in the accepted list | Add the five documented modifiers (or rename `minimal` and trim the JS list). |
| SRCH-03 | Clear button appears with a value, clears, restores focus, notifies once (§9) | PASS | `js/components/search.js:389-420,660-700` | — |
| SRCH-04 | Real label association; placeholder is not the label (§7, §27) | PASS | `js/components/search.js:245-283` | — |
| SRCH-05 | `labelVisible` presentation hook (§10) | GAP | `search.js:275-281` adds `search--labelled` / `search__label--visible`; neither class has a rule in `css/components/search.css` | Add rules for `.search--labelled`/`.search__label--visible` (block label above the field) instead of relying on the section selector at `search.css:190`. |
| SRCH-06 | Suggestions: combobox ARIA, listbox, keyboard, pointer, empty state (§12, §14) | PASS | `js/components/search.js:352-560`; exercised at `js/core/collection-view.js:235` and `js/sections/skills.js:396` | — |
| SRCH-07 | Loading state (§11) | PARTIAL | `js/components/search.js:856`; `setLoading` never called by a consumer | Fixture: async search (loading spinner, `aria-busy`, query preserved, spinner removed on failure). |
| SRCH-08 | Status line with the consumer's real count and empty/error copy (§15, §17) | PARTIAL | `js/components/search.js:884`; `setStatus` never called; sections render their own `.collection-status` (`collection-view.js:392`) | Fixture: result count, no-results, empty-query and error statuses through `setStatus()`. |
| SRCH-09 | Error tone is visually distinct (§15) | GAP | `search.js:906` toggles `.search__status--error`; no such rule in `css/components/search.css` | Add `.search__status--error` (danger colour, optional icon). |
| SRCH-10 | Keyboard model: Enter submits, Escape closes list/clears, arrows move (§13) | PASS | `js/components/search.js:566-660` | — |
| SRCH-11 | Shortcut hint and helper-text slots (§6, §16) | GAP | no `search__shortcut`/`search__hint` element or option in `search.js` | Add optional `shortcut` and `hint` options rendered into those slots. |
| SRCH-12 | Global Search reuses this component, no second input implementation (§22) | GAP | `js/features/global-search.js:427-474` builds its own `.global-search__field` + `field__input` and wires its own keys | Refactor Global Search to `initializeSearch()` with `getSuggestions`/`onSubmit`, or document an approved exception in both specs. |
| SRCH-13 | Search theme tokens: height, padding, radius, focus ring, suggestion panel (§19) | GAP | `css/components/search.css` hardcodes `18px` icon, `32px` clear button, padding; no `--search-*` tokens | Add a `--search-*` token layer and consume it in `search.css`. |
| SRCH-14 | Idempotent init, full teardown, no query persistence (§20, §24) | PASS | `search.js:187-195` (WeakMap controller), `:920-960` (`destroy`) | — |

## 6. Filter — `js/components/filter.js`, `css/components/filters.css`

| ID | Requirement (spec §) | Status | Evidence | Needed change |
|---|---|---|---|---|
| FLT-01 | Single-select, multi-select, checkbox and dropdown groups (§5) | PARTIAL | `js/components/filter.js:1265` (`initializeFilter`) renders them; no module calls `initializeFilter` (`grep` matches only the module) | Fixture: one fieldset per type, plus a disabled option and a preselected value via `initialState`. |
| FLT-02 | Numeric range control, only where data supports it (§5.6) | PASS | `js/components/filter.js:177`; used at `js/core/collection-view.js:310` and `tests/range-filter.test.mjs` | — |
| FLT-03 | Active-filter chips with individual removal, clear-all, empty-state hiding (§12, §13) | PARTIAL | `js/components/filter.js:1289-1330` (chips), `:1440-1475` (clear); unreachable in the app | Fixture: 3 chips (single, multi, range), remove one, clear all, confirm the chips and the clear button disappear. |
| FLT-04 | Result count from the consumer in a polite live region (§14) | PARTIAL | `js/components/filter.js:1217,1560-1585`; `setResultCount` never called | Fixture: count set to 12, then 0, then an invalid value (slot hides). |
| FLT-05 | Collapsible panel with `aria-expanded`/`aria-controls` (§15) | PARTIAL | `js/components/filter.js:1135-1156,1425-1435`; no consumer passes `collapsible` | Fixture: collapsed on load, expanded, `startExpanded: false`, selections preserved across collapse. |
| FLT-06 | Explicit apply mode with draft state (§11) | PARTIAL | `js/components/filter.js:1182-1190,1390-1405`; no consumer passes `applyMode: "apply"` | Fixture: apply mode where changing a control does not filter until Apply, and Clear-all also notifies `onApply`. |
| FLT-07 | Layouts vertical/horizontal/compact (§16) | PARTIAL | `js/components/filter.js:62` (`SUPPORTED_LAYOUTS`), `css/components/filters.css:220-250`; unused | Fixture: the same panel in all three layouts at 768px and 375px. |
| FLT-08 | Sections use the shared control instead of a second filter UI (§16, §27) | GAP | `js/core/collection-view.js:111` defines its own `createSelectField` and every section toolbar renders `.field__*` selects (`collection-view.js:351`); the shared `filter__select`/`filter__group` markup is never used | Replace the toolbar selects with `initializeFilter({ layout: "compact", applyMode: "immediate" })` (or add a documented "toolbar" layout to `filter.js`) so chips/clear-all come from one owner. |
| FLT-09 | Chips reuse the shared Badge component (§5.5, §12) | PARTIAL | `js/components/filter.js:1300` builds a bespoke `filter__active-chip` button, styled at `css/components/filters.css:296` | Compose the chip from `createBadge({ interactive: true, pressed: true })` plus the remove affordance, or record the deviation in the spec. |
| FLT-10 | `fieldset`/`legend`, native radio/checkbox, associated labels (§8, §19) | PASS | `js/components/filter.js:1010-1050` (fieldset/legend), `:940-985` (label/for) | — |
| FLT-11 | Clear-all resets only its own groups (§13) | PASS | `js/components/filter.js:1455-1470` resets `createDefaultState(groups)`; search/sort live in `collection-view.js` state | — |
| FLT-12 | Reduced motion (§27) | PASS | `css/components/filters.css:370-380` | — |
| FLT-13 | Theme tokens and no undefined variables (§20) | GAP | `css/components/filters.css:408` uses `var(--color-text)`, which `css/variables.css` does not define; no `--filter-*` tokens | Change to `var(--color-text-primary)` and add the filter token layer (panel background, chip colours, gap). |

## 7. Timeline — `js/components/timeline-item.js`, `css/components/timeline.css`

| ID | Requirement (spec §) | Status | Evidence | Needed change |
|---|---|---|---|---|
| TL-01 | Vertical layout: rail, one marker per event, card content, no invented dates (§5.1, §8) | PASS | `js/components/timeline-item.js:495-620`; `css/components/timeline.css:22-63`; used by `js/sections/career-timeline.js:316` and `experience.js:279` | — |
| TL-02 | Horizontal layout (§5.2) | GAP | `timeline-item.js:39` accepts `"horizontal"` and `:672` emits `timeline--horizontal`; `css/components/timeline.css` has no such rule; the layout only exists inside `initializeTimelineItem`, which no section calls | Add `.timeline--horizontal` (grid columns, horizontal rail, scroll container) to `timeline.css` and render it from a real consumer or fixture. |
| TL-03 | Compact layout (§5.3) | GAP | same: `timeline--compact` emitted at `timeline-item.js:672`, no CSS rule | Add `.timeline--compact` spacing rules (reduced gap/padding, marker kept). |
| TL-04 | Grouped layout with supplied headings (§5.4, §13) | GAP | `timeline-item.js:704-760` groups by `event.group`, but `normalizeEvent()` (`:280-320`) never sets `group`, so data-driven grouping collapses into one unlabeled group; the working path needs `initializeTimelineItem`, which is unused | Add `group` to `normalizeEvent()` and wire `initializeTimelineItem` for the career timeline, or remove the grouped layout from the component. |
| TL-05 | Markers decorative/hidden from AT; featured marker (§10) | PASS | `timeline-item.js:395-400`, `timeline.css:66-83` | — |
| TL-06 | Date label preserved, `<time datetime>` only for ISO precision (§8) | PASS | `timeline-item.js:330-355` | — |
| TL-07 | Event type shown as text as well as colour (§9) | PASS | `timeline-item.js:420-430`, `timeline.css:150-180` | — |
| TL-08 | Expandable details with `aria-expanded`/`aria-controls` (§14) | PASS | `timeline-item.js:466-500`; exercised via `js/sections/career-timeline.js:325` | — |
| TL-09 | Optional event actions from trusted callbacks/hrefs only (§20, §24) | PASS | `timeline-item.js:505-545`, `:600-620` | — |
| TL-10 | Optional image with alt, lazy load, graceful failure (§15) | PASS | `timeline-item.js:447-460`, `:590-600` (capture-phase error handler) | — |
| TL-11 | Event card / badges / actions reuse the shared Card, Badge, Button components (§12) | PARTIAL | `timeline-item.js:404` hand-builds `card timeline__content`, `:433` `li.badge`, `:540` `btn btn--ghost` — classes only, not `createCard`/`createBadge`/`createButton` | Route the three slots through the shared constructors so a Card or Badge change cannot leave the timeline stale. |
| TL-12 | Timeline theme tokens: line colour, marker size, featured marker, spacing (§18) | GAP | `css/components/timeline.css` hardcodes `0.65rem`, `2px`, `0.55rem`; no `--timeline-*` in `css/variables.css` | Add `--timeline-*` tokens for rail colour/thickness, marker size, group spacing. |

## 8. Toast — `js/components/toast.js`, `css/components/toast.css`

| ID | Requirement (spec §) | Status | Evidence | Needed change |
|---|---|---|---|---|
| TST-01 | Four tones with per-tone default durations (§5, §10) | PASS | `js/components/toast.js:45-56`; exercised at `bookmarks.js:735`, `contact.js:52`, `github-importer.js:962`, `theme-studio.js:385` | — |
| TST-02 | Optional title, omitted when empty (§6) | PARTIAL | `js/components/toast.js:430-437`; no caller passes `title` (all use `{message,type}`) | Fixture: success with title+message, message-only, and an over-long unbroken message. |
| TST-03 | Persistent notification (`duration: 0`) (§10) | PARTIAL | `js/components/toast.js:140-160`; no caller passes `duration` | Fixture: `duration: 0` toast that survives 10s and only closes manually. |
| TST-04 | Pause on hover/focus, resume with remaining time, never remove a focused toast (§10, §18) | PARTIAL | `js/components/toast.js:455-535`, `:250-270`; mechanism never verified | Fixture: hover-pause (progress bar freezes), Tab into the close button, wait past the duration, toast survives; Tab out, toast resumes. |
| TST-05 | Manual dismissal with an accessible label, safe removal (§11) | PASS | `js/components/toast.js:487-505`, `css/components/toast.css:223-240` | — |
| TST-06 | Maximum visible + duplicate suppression (§12) | PARTIAL | `js/components/toast.js:315-345` (`enforceLimit`), `:585-605` (1s dedupe window) | Fixture: 5 toasts in a row (oldest dropped), the same message twice inside 1s (one toast), twice after 1s (two). |
| TST-07 | One-shot action button performing a real action (§13) | PARTIAL | `js/components/toast.js:445-485`; no caller passes `action` | Fixture: action toast with a working callback, a double activation (runs once), and a throwing callback (isolated). |
| TST-08 | Appropriate announcement urgency; errors may be assertive (§18) | GAP | single polite region (`index.html:326`); `toast.js` has no assertive path or per-tone region | Add an optional assertive region (or `role="alert"` container) for `error` and route `show({type:"error"})` there. |
| TST-09 | Configurable placement (§9) | PARTIAL | `js/components/toast.js:120-135` supports four positions, `css/components/toast.css:57-92`; only the default is used | Fixture: `top-center` and `bottom-center` stacks, plus the ≤600px layout. |
| TST-10 | Safe text, reduced motion, no persistence (§21, §26, §27) | PASS | `toast.js:110-125` (`textContent` only), `css/components/toast.css:283-300`, no storage call | — |
| TST-11 | Toast theme tokens: background, padding, max width, stack gap (§22) | GAP | `css/components/toast.css` hardcodes `min(24rem, …)` and spacing; only tone colours come from tokens | Add `--toast-*` tokens (width, padding, gap, radius) and consume them. |

## 9. Navbar — `js/core/navigation.js`, `css/layout/{header,navigation}.css`, `index.html`

| ID | Requirement (spec §) | Status | Evidence | Needed change |
|---|---|---|---|---|
| NAV-01 | Brand from configuration, validated link, image fallback, text when no image (§7) | PASS | `js/core/navigation.js:563-640` (config), `:735-775` (`applyBrand`), `:745` (error → remove image) | — |
| NAV-02 | Links come from `navigation.json`, validated, ordered, de-duplicated, disabled skipped (§6) | PASS | `js/core/navigation.js:760-860` (`normalizeItems`), `:880-905` (`renderLinkList`) | — |
| NAV-03 | Active item exposes `aria-current` and the styling follows it (§9) | GAP | JS sets `aria-current="location"` (`navigation.js:270`), but `css/layout/navigation.css:55-56` matches only `[aria-current="true"]`/`[aria-current="page"]` — the ARIA-driven rule is dead (the `.is-active` selector masks it) | Add `[aria-current="location"]` to the two active-state rules in `css/layout/navigation.css`. |
| NAV-04 | Mobile disclosure: `aria-expanded`, `aria-controls`, Escape, outside click, close on navigate, hidden links unfocusable (§11, §12) | PASS | `navigation.js:300-420` (state + handlers), `index.html:222-224`, `css/layout/navigation.css:64-90` (`display: none` when closed) | — |
| NAV-05 | Sticky behaviour follows configuration (§10) | GAP | `data/navigation.json:24` declares `"sticky": true`; `normalizeConfiguration()` (`navigation.js:563`) never reads it and `css/layout/header.css:37` is unconditionally `position: sticky` | Read `navigation.sticky` and toggle a `site-header--static` class in `initializeNavigation()`. |
| NAV-06 | Header actions rendered only when configured, open the existing features, never dead (§13) | PASS | `navigation.js:790-870` (`renderHeaderActions` + bus fallback), `index.html:196-230` | — |
| NAV-07 | Header actions use shared Button styling (§13) | PARTIAL | `navigation.js:800-830` builds bespoke `.site-header__action` controls styled at `css/layout/header.css:267`; no `.btn` classes, no `createButton` | Compose the actions with `createButton`/`createButtonLink` (icon-only + aria-label) or record the deliberate exception. |
| NAV-08 | Skip link before navigation, distinct landmarks (§18) | PASS | `index.html:173` (`.skip-link`), `index.html:230` (`aria-label="Main navigation"`), footer nav at `navigation.js:1000` | — |
| NAV-09 | Back-to-top control (§2 scope, §25 integration) | PASS | `navigation.js:1090-1130`, `index.html:283` | — |
| NAV-10 | Keyboard model, reduced motion for smooth scroll (§17) | PASS | `navigation.js:88` (`REDUCED_MOTION_QUERY`), `:470-480` | — |
| NAV-11 | Navbar theme tokens: height, active indicator, panel background, spacing (§19) | GAP | `css/layout/header.css` hardcodes header height and spacing; no `--navbar-*` in `css/variables.css` | Add `--navbar-*` tokens and consume them in `css/layout/{header,navigation}.css`. |

## 10. Cross-cutting

| ID | Requirement | Status | Evidence | Needed change |
|---|---|---|---|---|
| X-01 | Theme Studio live preview uses the actual shared components (each spec's Theme Studio §) | GAP | `js/features/theme-studio.js:473-522` hand-builds `article.card`, `h3.card__title`, `button.btn` markup instead of `createCard`/`createButton`/`createBadge` | Rebuild `buildPreview()` from the component constructors and extend it to show a badge, a toast and a search field. |
| X-02 | No fixture page exercises component states | GAP | `tests/` contains engine tests only (`filter-engine`, `range-filter`, `search-engine`, `section-kit`, `sort-engine`, `bookmark-drafts`, `contact-provider`); no `dev/*.html` fixture | Add `dev/components.html` (not linked from the site) rendering every PARTIAL state listed above; screenshots then become the evidence for those rows. |

---

## Fixture page contract (what `dev/components.html` must render)

- **Button:** primary/secondary/outline/ghost/destructive/link; small/medium/large; full-width; icon-only with label; disabled; loading (`aria-busy`); a loading button that starts disabled; an async action that rejects.
- **Card:** standard, elevated, featured, compact, horizontal (also at 320px); image card, text-only card, broken-image card; skeleton grid; selected action card; selected navigation card.
- **Badge:** all seven variants and three sizes; icon + text; long label (single word and a sentence); `count: 3` / `count: 0` / `count: 12345`; interactive pressed and unpressed; badge group at 320px.
- **Modal:** sm/md/lg/xl/full; confirm (normal and destructive); form with a dirty field then Escape; preview portrait/landscape/404; long body to scroll; non-closable dialog then Escape; open from a card, close, and confirm focus returns.
- **Search:** three sizes, five variants, visible label; clear button shown/hidden; loading; status (count, no results, empty query, error); suggestions open + arrow keys + Enter + Escape; long query at 320px.
- **Filter:** single / multiple / checkbox / select / range groups; chips with removal; clear-all; result count; collapsible; apply mode; three layouts.
- **Timeline:** vertical, horizontal, compact, grouped, single event, long description, missing/broken image, expanded details.
- **Toast:** four tones; title + message; `duration: 0`; hover-pause and focus-pause; five stacked; duplicate within 1s; action button (success, double-click, throwing).
- **Navbar:** active section switching while scrolling; mobile panel open/closed (Tab order); Escape; configured actions present/absent.

---

## Ten highest-value code changes

1. **`js/components/modal.js:125` — `btn--danger` → `btn--destructive`.** Every destructive confirmation currently renders as an unbranded default button; the class it emits does not exist in `css/components/buttons.css`. One line, site-wide effect.
2. **`js/components/search.js:304` + `css/components/search.css:133` — align size class names**, and add the four missing variant rules (`outlined`, `filled`, `compact`, `expanded`). Today `size` and `variant` are silently inert for every search field.
3. **`js/core/modal-manager.js:424` — split `closable` into the documented `closeOnBackdrop` / `closeOnEscape` / `restoreFocus` / `lockBackgroundScroll` options**, make Escape honour them (`:99`), and stop `confirmModal` (`js/components/modal.js:267`) dismissing a destructive dialog on a backdrop click.
4. **`css/components/cards.css` — add `.card-grid`.** `card.js:30` and CARD §17 both promise it; no rule exists, so every section re-invents its grid.
5. **`css/components/badges.css` — let long labels wrap** (drop `white-space: nowrap` at line 25, add `max-inline-size`/`overflow-wrap`) **and add `.badge__count` + reduced-motion.** The count element the JS creates is currently unstyled, and a long tag will push the badge out of its card.
6. **`css/components/timeline.css` — implement `.timeline--horizontal` and `.timeline--compact`,** and fix grouping by setting `group` in `normalizeEvent()` (`timeline-item.js:280`). `initializeTimelineItem` is dead code today, which is why three of the four documented layouts cannot be seen.
7. **`js/core/collection-view.js:111` — adopt `initializeFilter()` for the toolbar filters** (or delete the unused panel API). Right now the shared Filter's groups, chips, clear-all and result count have no caller, and the toolbar duplicates filter markup that the spec says must live in one place.
8. **`css/components/filters.css:408` — `var(--color-text)` → `var(--color-text-primary)`** and `css/layout/navigation.css:55` — add `[aria-current="location"]`. Two undefined/dead selectors where the JS and CSS disagree about a name.
9. **`index.html:325-326` — remove `aria-live` from `#modal-root`; add an assertive path for error toasts** in `toast.js`/`toast.css`. The modal container currently announces entire dialogs, and errors get the same polite priority as success.
10. **`js/features/theme-studio.js:473` — build the preview from `createButton`/`createCard`/`createBadge`, then add the component token layer** (`--button-*`, `--card-*`, `--badge-*`, `--modal-*`, `--search-*`, `--filter-*`, `--timeline-*`, `--toast-*`, `--navbar-*`). Nine specs list these as Theme Studio properties; none exist, so the preview and the tokens both currently drift from the components.

---

## Not verified / out of scope

- Browser rendering, screen-reader announcements, contrast ratios, and responsive behaviour at 320–1920px: no fixture page and no DOM tests exist, so no component state is machine-checked.
- Owner-supplied content (names, dates, issuers, resume file, social URLs) was not evaluated, per instruction.
- Spec clauses phrased as "may" without naming a capability (e.g. Card empty/error variants, Timeline loading state) were treated as optional and not counted as GAPs.
- `js/Projects/` is a separate static page with its own `script.js`/`styles.css`; it does not consume these components and was left out.
