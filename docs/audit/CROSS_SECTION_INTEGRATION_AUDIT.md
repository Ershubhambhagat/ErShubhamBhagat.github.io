# Cross-section integration audit

> **File:** `docs/audit/CROSS_SECTION_INTEGRATION_AUDIT.md`  
> **Created:** 2026-11-27 01:26  
> **Updated:** 2026-11-27 01:26  
> **Purpose:** Cross-dataset and cross-section integration results.

Audit date: 2026-11-27.

The integration checks combine the data validator (`scripts/validate-data.mjs`),
a read-only reference check over all datasets, and browser interaction tests.

## Results

| Integration | Expected | Evidence | Status |
|---|---|---|---|
| Profile -> Contact | "Get in touch" reaches Contact | `href="#contact"`; `section#contact` exists; anchor navigation tested with Projects | PASS |
| Profile -> Projects | "View projects" reaches Projects | `href="#projects"`; target exists | PASS |
| Navigation -> Sections | 11 hash targets resolve to `<section id>` | Validator: 11/11 targets present | PASS |
| Experience -> Skills | Related skill references resolve | `relatedSkillIds` present and valid; badges render labels, but ids are not used to link anywhere | PARTIAL |
| Projects -> Skills | Related skill references resolve | `relatedSkillIds` valid; not rendered or linked | PARTIAL |
| Projects -> Experience | Related experience references resolve | No `relatedExperienceIds` in records and no renderer use | NOT IMPLEMENTED |
| Career Timeline -> Experience | Event shows the source role | 9/9 events resolve; Experience renders | PASS |
| Career Timeline -> Projects | Event shows the source project | 9/9 events resolve; project events render | PASS |
| Career Timeline -> Certificates | Event shows the source certificate | 9/9 events resolve | PASS |
| Career Timeline -> Education | Event shows the source qualification | 9/9 events resolve | PASS |
| Career Timeline -> Learning | Event shows the source activity | 9/9 events resolve | PASS |
| GitHub Importer -> Projects | Review/convert/export into project schema | No conversion or export code | NOT IMPLEMENTED |
| Bookmarks -> Categories | Every categoryId resolves | 7/7 records; categories "site"/"tools"; custom check found 0 issues | PASS |
| Certificates -> Categories | Every categoryId resolves | 2/2 records; categories resolve | PASS |
| Learning Journey -> Categories | Every categoryId resolves | 3/3 records; categories resolve | PASS |
| Skills -> Projects/Experience | No skill points at a missing record | No reverse references are used | PASS |
| Global Search -> Sections | Records indexed and navigable | "sql" produced 11 results; clicking closes the dialog and focuses the section heading | PASS |
| Theme Studio -> Components | Tokens repaint the whole page | Light preset applied `data-theme="light"` and body background `rgb(250, 250, 251)`; reset removed it | PASS |
| JSON Manager -> Datasets | All registered datasets listed/validated | 11 rows, 11 options, file input, download present | PARTIAL |
| JSON Editor -> JSON Manager | Both systems compatible | JSON Editor Studio does not exist | NOT IMPLEMENTED |
| Navbar -> Navigation state | One authoritative active state | One `is-active` link and `aria-current="location"` at a time; Projects then Skills | PASS |
| Toast -> Sections | Feedback matches the operation | Copy -> "Email address copied"; theme reset -> "Back to the default theme" | PASS |
| Footer -> Profile | Footer email/socials come from profile | Footer rendered 7 socials and the profile email | PASS |
| 404 -> Home | 404 page returns to the portfolio | `/404.html` renders with a home link | PASS |

## Reference integrity check

A read-only script checked every `categoryId`, `relatedSkillIds`,
`relatedProjectIds` and URL protocol across all datasets. Result: **0 issues**.

- projects: 6 records, 3 categories, all valid.
- certificates: 2 records, 2 categories, all valid.
- learning journey: 3 records, 3 categories, all valid.
- bookmarks: 7 records, 2 categories, all valid.
- career timeline: 9 events, 9 resolve to the stated dataset.
- navigation: 11 targets, 11 exist in `index.html`.

## What the integrations reveal

1. The data side is consistent; the failures are feature-level, not corruption.
2. The Career Timeline is the strongest integration: it resolves five record
   types and drops broken references with a console warning instead of rendering
   a broken card.
3. The weakest integration is GitHub Importer -> Projects: the importer is a
   read-only repository preview, not the review/convert/export workflow in the
   spec.
4. JSON Editor Studio cannot integrate with anything because it does not exist.
5. Header Search/Theme integration is absent by design (features live in the
   tools dock), which is a spec deviation recorded in the Navbar audit.
