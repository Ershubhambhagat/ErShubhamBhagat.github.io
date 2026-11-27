# Data guide

> **File:** `docs/DATA-GUIDE.md`  
> **Created:** 2026-11-27 00:39  
> **Updated:** 2026-11-27 00:39  
> **Purpose:** How to edit data/*.json: schemas, ids, dates, example records, privacy rules.

All page content lives in `data/*.json`. The HTML contains no copy, so changing a
sentence here changes the page. Every file has `"schemaVersion": 1` and one named
collection; the section module reads only that collection.

## How the files explain themselves

Every data file starts with a `_guide` array: one string per field, written like a
comment line, e.g.

```json
"_guide": [
  "// REQUIRED per project: id, title. Everything else is optional.",
  "// shortDescription: one sentence shown on the card."
]
```

Why not real `//` comments: JSON has no comment syntax. A literal comment makes
`JSON.parse` fail, and every section that reads the file would show an error panel
instead of content. `_guide` is valid JSON, survives editors and validators, and
is ignored by the page and by the JSON Manager's validation. Read it as the
comment block for the file.

Each file is also **fully populated**, so every field has a working example:

- real records (profile, skills, the first education record, bookmarks) contain
the published data;
- records whose details are not known are marked `"isSample": true` and the
  section shows a dismissible notice;
- a field that is not applicable is `""` or `null` and is not rendered.

## Rules that apply to every file

- **Ids are stable.** They are the link between datasets (the career timeline
  resolves them) and the key for search results. Keep the prefix:
  `project-001`, `cert-001`, `exp-001`, `edu-001`, `journey-001`, `event-001`,
  `bookmark-001`, `skill-001`.
- **Dates are partial ISO**: `2025`, `2025-03` or `2025-03-14`. Anything else fails
  `scripts/validate-data.mjs`.
- **Optional means absent, not empty.** A missing description, issuer, date or
  link is not rendered at all. Do not write `""` to "reserve space"; the renderer
  already omits it.
- **No `//` comments.** Use `_guide`, or the file stops parsing. Keep `_guide` as
  the first key; the page ignores it.
- **`isSample: true`** marks a record that is not real. The section then shows a
  dismissible notice saying how many example records it contains. Remove the flag
  only when the record describes something real.

## profile.json

`profile` is a single **object**, not an array: the page has one owner.
This is the documented exception to the "one named array" rule.

| Field | Used for |
|---|---|
| `name` | Hero `<h1>`, document title, structured data. Currently `Er Shubham Bhagat`. |
| `alternateName` | Shown as "Also known as …" under the name. Currently `Shubham Kumar`, the name the old page displayed. Remove it if only one name should appear. |
| `professionalTitle` | Role line and `<title>`. |
| `tagline` | Uppercase kicker above the name. |
| `shortIntroduction` | Hero summary and the meta description. |
| `biography` | The "About" block. Delete it to remove the block. |
| `location` | Fact panel, contact card, structured data. Region level only. |
| `email` | Fact panel, contact card, contact form, footer. |
| `availability` | `{ "enabled": true, "label": "Part time available" }` renders the status pill. |
| `resume` | `{ "enabled": false, "file": "", "label": "" }`; set `enabled: true` and a real file path to show the button. |
| `primaryActions` | Buttons that jump to a section (`target` must be a section id). |
| `socialLinks` | Platform name + URL. Any URL that is not http(s) is dropped. |
| `highlights` | Extra label/value rows in the fact panel. |
| `profileImage` | Optional. Empty renders the initials monogram instead; see the photo note below. |

### Before you publish: three content decisions

1. **Name.** The old page's hero said "Shubham Kumar" while its title, GitHub
   handle and social accounts use "ErShubhamBhagat". The rebuild uses the brand
   form and keeps the other as `alternateName`. Pick one and delete the other.
2. **Email.** The old page obfuscated it as `Er.shubhambhagat[at]gmail.com`; this
   build uses `er.shubhambhagat@gmail.com`. Confirm the address works before a
   visitor relies on it.
3. **Photo.** The previous site's portrait (`assets/img/profile-img.jpg`) was not
   carried over. A monogram is drawn instead. If you want the photo, add it to
   `assets/images/` and set `profileImage` — that is an explicit decision, which is
   why it was not made silently.

## skills.json

`categories[]` (id, name, description, order) and `skills[]` (id, name,
`categoryId`, optional `proficiency` 0-100, `proficiencyLabel`, `description`,
`tags`).

- Six skills carry the levels that were published on the old site: CSS 90,
  React 80, JavaScript 75, .Net Core 80, Python 80, SQL Server 90.
- The remaining tools are attested by name only in the repository README, so they
  have `"proficiency": null` and render as tags, not bars. Do not add a number
  that was never stated.
- The category filter appears automatically when more than one category has
  records.

## experience.json

`experiences[]`: `id`, `role`, `company { name, website, logo, location }`,
`employmentType`, `workArrangement`, `location`, `startDate`, `endDate`,
`current`, `shortDescription`, `description`, `responsibilities[]`,
`achievements[]`, `skills[]`, `featured`, `order`.

The two records shipped are **examples** (`isSample: true`) because no employer,
title or date was ever published. Replace or delete them.

## projects.json

`projects[]`: `id`, `title`, `shortDescription`, `description`, `categoryId`,
`coverImage`, `imageAlt`, `gallery[]`, `technologies[]`, `role`,
`contributions[]`, `links { liveDemo, sourceCode, documentation }`, `status`,
`featured`, `startDate`, `endDate`, `order`.

The six titles are the ones listed on `Project/MyProject.html` in this
repository. Their descriptions, technologies, roles, contributions and dates are
**sample text** (`isSample: true`) written to show every field on the card and in
the details dialog. Replace them with the real story, or delete the records.
No repository or demo URLs were invented: `links` is empty, so no button points
at a dead page.

## certificates.json

`certificates[]`: `id`, `title`, `issuer`, `categoryId`, `description`,
`issueDate`, `expiryDate`, `credentialId`, `credentialUrl`, `certificateImage`,
`certificateDocument`, `skills[]`, `status`, `featured`, `order`.

The two records are **examples**. `credentialUrl` must be a working verification
page, otherwise the "Verify certificate" button is not rendered. Credential IDs
are hidden unless `section.showCredentialId` is true.

## education.json

`education[]`: `id`, `institution { name, logo, website, location }`,
`qualification`, `fieldOfStudy`, `educationType`, `studyMode`, `startDate`,
`endDate`, `isCurrent`, `grade { value, scale, display }`, `description`,
`coursework[]`, `achievements[]`.

Only the degree level of the first record is attested (`Bachelor of Technology`).
Its institution, field of study and years are empty and therefore not rendered;
add them when you want them shown. The second record is a **complete example**
(school qualification, dates, grade, coursework, achievement) marked
`isSample: true`, so every optional field is visible on the page.

## learning-journey.json

`learningActivities[]`: `id`, `title`, `categoryId`, `topic`, `description`,
`learningType`, `source { name, url }`, `startDate`, `endDate`, `status`
(`in-progress` / `completed`), `progress { enabled, value, unit, description }`,
`goals[]`, `keyLearnings[]`, `relatedSkillIds[]`, `featured`, `order`.

The three records are **examples**. The progress bar is explicitly a self
assessment; `progress.description` is rendered under it so that stays clear.

## career-timeline.json

`events[]` reference a record in another dataset:

```json
{ "id": "event-001", "type": "learning", "referenceId": "journey-001", "date": "2026-02", "endDate": null, "featured": true, "order": 1, "enabled": true }
```

`type` is one of `experience`, `project`, `certificate`, `education`, `learning`.
The section resolves `referenceId` and renders the referenced record's own title
and description; a dangling reference is skipped and reported in the browser
console rather than shown as a broken entry. Events without a valid `date` are
skipped.

The five shipped events point at the example records, so the timeline shows the
example notice too. Add events for real records as they appear.

## bookmarks.json

`bookmarks[]`: `id`, `name`, `url`, `description`, `categoryId`, `tags`,
`featured`, `favorite`, `order`.

The seven records are real pages that already live in this repository (blog,
project page, bookmark page, Sangrampur, screenshot tool, CSS editor, code
snippet). A `./` URL must point at an existing file; the validator checks it.
Favourites are stored per visitor in `localStorage` under `portfolio.favorites`.

## navigation.json

Drives the header list, the brand link and the footer navigation. `items[]` must
contain all eleven section ids in page order; each `target` must match a
`<section id>` in `index.html`. `layout.scrollOffset` is the sticky-header offset
used by the active-section indicator.

## theme-presets.json

`themes[]`: `id`, `name`, `mode` (`dark` / `light`), `description`, `tokens`.

`tokens` may only override the colour tokens listed in
`js/features/theme-studio.js`. Values must be a hex, `rgb()`, `hsl()` or a CSS
colour keyword; `url()`, `var()` chains and anything else are rejected, so a
preset cannot inject a property the layout never expected. A token name outside
the allow-list is ignored.

## What is deliberately not published

The previous site contained material that does not belong on a public page and
was left out of the rebuild:

- date of birth and a derived age;
- a partially masked phone number;
- any address finer than "Bihar, India";
- the personal portrait, pending an explicit decision;
- a third-party visitor-tracking pixel;
- a third-party account credential that appears in plain text inside
  `Blog/Json/BlogPost.json` on the old blog. **That file is still in the
  repository** and should be redacted; the new sections never read it. Treat the
  password as compromised and change it wherever it is still valid.
