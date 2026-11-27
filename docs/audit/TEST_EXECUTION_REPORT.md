# Test execution report

> **File:** `docs/audit/TEST_EXECUTION_REPORT.md`  
> **Created:** 2026-11-27 01:27  
> **Updated:** 2026-11-27 01:27  
> **Purpose:** Commands, viewport results, interactions and testing limits.

Audit date: 2026-11-27.
Environment: Windows, Node v24.20.0, Google Chrome 158.0.8127.88, Python
`http.server` on `127.0.0.1:8140` (static site served over HTTP, not `file://`).

Nothing in the application was modified during this audit. The only writes were
under `docs/audit/` and the git-ignored `.build/audit/` evidence folder.

## 1. Data validation

Command:

```powershell
node scripts/validate-data.mjs
```

Result: **passed.**

```text
ok profile.json: 1 record
ok skills.json: 18 records, 18 unique ids
ok experience.json: 2 records, 2 unique ids
ok projects.json: 6 records, 6 unique ids
ok certificates.json: 2 records, 2 unique ids
ok education.json: 2 records, 2 unique ids
ok learning-journey.json: 3 records, 3 unique ids
ok career-timeline.json: 9 records, 9 unique ids
ok bookmarks.json: 7 records, 7 unique ids
ok navigation.json: 1 record
ok theme-presets.json: 4 records, 4 unique ids
ok career-timeline.json: 9 events checked
ok navigation.json: 11 targets present in index.html
ok bookmarks.json: local URLs checked
Example records still in the datasets: experience: 2, projects: 6, certificates: 2, education: 1, learningJourney: 3
All data checks passed.
```

## 2. Module contract

Command:

```powershell
node scripts/check-modules.mjs
```

Result: **31 passed, 0 failed.** Each of the 15 section/feature modules imports
without a DOM, exports exactly one initializer, does not throw with empty data,
and contains no `innerHTML`/`outerHTML` assignment. `section-kit` exposes its
helpers and date formatting returns the expected strings.

## 3. Reference integrity (read-only)

A separate script checked every `categoryId`, `relatedSkillIds`,
`relatedProjectIds`, bookmark path and URL protocol.

Result: **0 issues** across projects, certificates, learning journey, bookmarks,
experience and career timeline.

## 4. Viewport run

Eight widths were set with `Emulation.setDeviceMetricsOverride` through the
Chrome DevTools Protocol, so these are real layout viewports, not cropped
screenshots. A full page load and render was allowed before measuring.

| Width | Horizontal overflow | Error panels | Empty sections | Cards | Project columns |
|---:|---|---:|---:|---:|---:|
| 320 | no | 0 | 0 | 26 | 1 |
| 375 | no | 0 | 0 | 26 | 1 |
| 425 | no | 0 | 0 | 26 | 1 |
| 768 | no | 0 | 0 | 26 | 2 |
| 1024 | no | 0 | 0 | 26 | 3 |
| 1366 | no | 0 | 0 | 26 | 3 |
| 1600 | no | 0 | 0 | 26 | 3 |
| 1920 | no | 0 | 0 | 26 | 3 |

No console errors or exceptions were captured at any width. The 320px pass was
re-run with a longer wait and confirmed 3 tools-dock buttons, 11 sections,
26 cards and no overflow; the first snapshot caught the page before features
finished initializing, which is why the dock was absent there.

Screenshots: `.build/audit/shot-320.png` ... `shot-1920.png` (git-ignored).

## 5. Interaction run (1024px)

| Test | Expected | Actual |
|---|---|---|
| Global search opens | Dialog visible | `searchOpened: true` |
| Query "sql" | Results > 0 | 11 results |
| Close search | Dialog gone | `searchClosed: true` |
| Project text search "water" | 1 card | 1 |
| Project category "iot" | 3 cards | 3 |
| Open project detail | Dialog with text | title "Student Management System", description present |
| Theme presets | 4 options | 4 |
| Apply light | `data-theme=light` | light |
| Reset theme | attribute removed | `null` |
| Contact empty submit | 3 field errors, focus first | 3 errors, focus `contact-name` |
| Bookmark favourite | `aria-pressed=true` | true |
| Mobile menu at 375 | opens and closes | expanded true, nav block, closed false |
| Timeline type filter | projects only | 9 -> 3 -> 9 restored |
| Filter clear-all | restores 6 projects | 6 restored, select "all" |
| Navigation anchor (Projects) | section below header | top = 168px with 68px header |
| Back-to-top | scroll to 0 | 0 |
| Copy email | toast confirms | "Email address copied." |
| Theme reset toast | toast confirms | "Back to the default theme." |
| 404 page | renders | title "Page not found", body text present |

## 6. Accessibility checks

Measured at 1024px:

| Check | Result |
|---|---|
| `<h1>` count | 1 |
| `<h2>` count | 11 |
| `lang` | en |
| Duplicate ids | none |
| Links/buttons without an accessible name | 0 |
| Images without `alt` | 0 |
| `target="_blank"` without `rel=noopener` | 0 |
| Broken `aria-labelledby` | 0 |
| Skip link | present |
| Modal focus inside on open | yes |
| Focus restored on close | yes |
| Escape closes modal | yes |
| `#toast-root` live region | `polite`, atomic |
| Duplicate navigation state | one `is-active`, one `aria-current="location"` |

Not tested: screen-reader output, automated axe/WAVE scan, contrast calculation
for every token pair, forced-colours mode, keyboard-only end-to-end run.

## 7. Component behaviour

| Component | Tested | Result |
|---|---|---|
| Modal | open, close button, Escape, focus | pass |
| Filter | select, change, clear | pass |
| Toast | success rendering, live region | pass |
| Timeline | vertical, details, type filter | pass |
| Navbar | mobile toggle, active, anchor, back-to-top | pass |
| Button | primary/outline/ghost/icon | pass (others not exercised) |
| Card | standard interactive | pass |
| Badge | outline tags | pass |
| Search | not instantiated | not run |

## 8. Tests not run and why

| Test | Reason |
|---|---|
| GitHub API fetch | The unauthenticated API quota is shared; the feature was fetched successfully in an earlier session (56 repositories) and deliberately not re-run here |
| File download from JSON Manager | Headless download destination not configured; code path inspected only |
| JSON Editor Studio tests | No implementation exists |
| Screen reader / axe | No tooling installed; not required to change stack, so recorded as not verified |
| Lighthouse / Core Web Vitals | No Lighthouse installed; no performance claim is made |
| Firefox / Safari | Only Chrome available in this environment |
| Multi-file save / backups | No implementation exists |

## 9. Failures

No executed test failed. Findings in this audit are missing or partial features
and stale comments, not test failures. The most serious non-test finding is the
plaintext credential still present in `Blog/Json/BlogPost.json` (outside the new
application), documented in the summary and remediation plan.
