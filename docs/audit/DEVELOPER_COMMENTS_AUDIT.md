# Developer comments audit

> **File:** `docs/audit/DEVELOPER_COMMENTS_AUDIT.md`  
> **Created:** 2026-11-27 01:26  
> **Updated:** 2026-11-27 01:26  
> **Purpose:** Comment coverage, accuracy and stale-comment findings.

Audit date: 2026-11-27. Standard: `Prompt/DEVELOPER_FRIENDLY_CODE_COMMENTS.md`.
Method: file-header check, JSDoc count, comment-line ratio, search for placeholders
and stale markers, and spot-reading the modules changed for the section/feature
implementation.

## Coverage

| Measure | Actual |
|---|---|
| Authored implementation files with a header block | 18 / 18 JS (11 sections, 4 features, section-kit, 2 scripts) |
| JSDoc blocks in those files | 120 |
| Comment lines in those files | 949 of 5,164 (~18%) |
| Whole `js/` tree comment lines | 3,910 of 14,872 (~26%) |
| CSS files with a header | 31 / 31 |
| Named CSS block markers | 80 |
| TODO / FIXME / HACK markers | 0 |

## What is genuinely documented

- File headers state ownership, dependencies, data or DOM contracts, and the
  limitation an editor must respect. Examples: `js/sections/projects.js`,
  `js/features/github-importer.js` (quota and no-token rationale),
  `css/components/cards.css` (stretched link stacking).
- JSDoc covers every initializer and every non-obvious helper: section-kit
  helpers, project detail builder, GitHub cache, theme token validation,
  JSON validation, search index builder, timeline resolver.
- Event listener lifecycle is explained (Global Search global keydown and its
  teardown; modal document-level listeners).
- Storage, network, URL validation, serialization and theme-token safety have
  security/limit comments.
- CSS comments explain the non-obvious rules: timeline marker maths, `:has()`
  fallback, forced-colours branches, scroll containers, `[hidden]` override,
  grid minimums.
- JSON carries no `//` comments (invalid); `_guide` is valid data and is
  documented in `docs/DATA-GUIDE.md`.

## Incorrect or stale comments (real findings)

These comments describe a build state that no longer exists and would mislead a
maintainer. They are documentation defects, not runtime defects.

| File | Line | Comment says | Reality |
|---|---:|---|---|
| `js/app.js` | 170-171 | The toast component "is a placeholder in this build: its factory exists and returns nothing." | `js/components/toast.js` now implements the full service; app.js uses it |
| `js/app.js` | 184-187 | A placeholder module exports `initializeToast()` and returns undefined. | Both `initializeToastManager` and `initializeToast` exist and return a service |
| `js/components/modal.js` | 22 | "that module is still a placeholder in this build" (toast dependency) | Toast is implemented |
| `js/core/error-handler.js` | 23 | `.error-panel` styling is a "placeholder until the global ..." | Styles exist in `css/main.css` |
| `css/main.css` | 21 | layout/component/section files "are placeholders at this phase and carry no rules yet." | All layers now carry rules |

Severity: MEDIUM for the app.js/modal.js pair (a maintainer could skip the toast
service thinking it is inert), LOW for the others.

## Other gaps

- `css/components/tooltips.css` is still a placeholder with no rules. No tooltip
  component is in the audited nine, and nothing in the page uses tooltips, so
  this is a LOW documentation/CSS gap rather than a broken feature.
- No automated check keeps comments fresh. The accuracy issues above would have
  been caught by a simple grep in CI.
- Comments in generated JSON are replaced by `_guide`; this matches the standard's
  rule against comments inside JSON, but the `_guide` property itself is not
  described by the comment spec, only by `docs/DATA-GUIDE.md`.

## Positive findings

- The hard problems are documented where they are implemented: partial-ISO dates,
  data immutability, reference resolution, safe links, theme token allow-list,
  quota-limited fetch, no fake save/publish.
- Comments are specific and name the failure they prevent; there is little
  restating of syntax.
- CSS uses markers rather than narrating every declaration, which matches the
  "avoid excessive comments" rule.

## Verdict

**PARTIAL.** The comment system is substantially implemented and useful, but the
stale comments listed above violate the standard's rule that comments must remain
accurate. They should be corrected in the remediation pass; the audit did not
modify them.
