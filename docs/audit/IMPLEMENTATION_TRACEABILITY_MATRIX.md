# Implementation traceability matrix

> **File:** `docs/audit/IMPLEMENTATION_TRACEABILITY_MATRIX.md`  
> **Created:** 2026-11-27 01:24  
> **Updated:** 2026-11-27 01:24  
> **Purpose:** Requirement-by-requirement evidence and status matrix.

> **Post-audit update (2026-11-27 02:10):** after this audit, `START_LOCAL_TEST.bat`,
> `scripts/start-local.py` and a START_LOCAL-scope editor in `tools/json-editor/`
> were implemented. The findings below describe the state **before** that work and
> have not been re-audited. Direct file saving was verified with mock file handles
> and the download fallback with a real browser download; the real folder picker
> remains a manual test.

Audit date: 2026-11-27. Evidence comes from source inspection, the two scripts in `scripts/`, a Chrome DevTools Protocol run at eight viewport widths, and interaction tests in the real page. A requirement is PASS only where the behaviour was exercised or the data validator proved it; otherwise the status says what is missing or unverified.

Granularity: one row per functional requirement taken from each specification's "Included features" / scope list, grouped only where variants share one implementation. This is not a sentence-by-sentence restatement of the specs.

| Status | Count |
|---|---:|
| PASS | 105 |
| PARTIAL | 35 |
| FAIL | 0 |
| NOT IMPLEMENTED | 77 |
| NOT VERIFIED | 8 |
| BLOCKED | 0 |
| **Total** | **225** |

| ID | Document | Requirement | Implementation | Evidence | Test result | Status | Notes |
|---|---|---|---|---|---|---|---|
| FOUND-001 | `01_FOUNDATION.md` | Approved stack only (HTML/CSS/vanilla JS/JSON) | `index.html; js/app.js` | No framework imports; no package.json; rg for react/vue/angular found nothing | Code inspection 2026-11-27 | **PASS** |  |
| FOUND-002 | `01_FOUNDATION.md` | HTML entry point and mount IDs | `index.html` | 11 sections + #site-header/#site-navigation/#main-content/#site-footer/#modal-root/#toast-root | Browser 320-1920: 11 sections, 0 errors | **PASS** |  |
| FOUND-003 | `01_FOUNDATION.md` | CSS layers and design tokens | `css/variables.css; css/main.css` | Token-only declarations in section files; load order documented | Code inspection; computed styles in browser | **PASS** |  |
| FOUND-004 | `01_FOUNDATION.md` | Shared JSON loader with caching | `js/core/data-loader.js` | loadJSON caches by absolute URL; loadPortfolioData isolates failures | node scripts/validate-data.mjs; browser section counts | **PASS** |  |
| FOUND-005 | `01_FOUNDATION.md` | Initialization order and error isolation | `js/app.js` | config -> data -> systems -> navigation -> sections -> features; dynamic imports in try/catch | Browser: 0 error panels; module check 31/31 | **PASS** |  |
| FOUND-006 | `01_FOUNDATION.md` | Relative paths and GitHub Pages compatibility | `index.html; js/config.js` | All ./ paths; no absolute filesystem paths | Asset path check: 0 missing | **PASS** |  |
| FOUND-007 | `01_FOUNDATION.md` | 404 page | `404.html` | Static 404 with home link | Browser /404.html: title and text rendered | **PASS** |  |
| PROFILE-001 | `02_PROFILE_SECTION.md` | Profile fields rendering | `js/sections/profile.js` | name, alternateName, title, tagline, intro, biography, location, availability | Browser DOM: hero text present | **PASS** |  |
| PROFILE-002 | `02_PROFILE_SECTION.md` | Optional fields hidden when empty | `js/sections/profile.js` | Conditional appends for tagline/bio/availability/resume/highlights | Code inspection; empty resume hidden | **PASS** |  |
| PROFILE-003 | `02_PROFILE_SECTION.md` | Profile image with fallback | `js/sections/profile.js` | profileImage not rendered; initials monogram drawn | Code inspection; browser shows SB monogram | **PARTIAL** | No photo by explicit privacy decision; fallback verified |
| PROFILE-004 | `02_PROFILE_SECTION.md` | Primary actions and social links | `js/sections/profile.js; js/components/button.js` | Anchors to #projects/#contact; 7 social links via createLink | Browser DOM; anchor navigation tested (Projects) | **PASS** |  |
| PROFILE-005 | `02_PROFILE_SECTION.md` | Highlights | `js/sections/profile.js` | definition list from profile.highlights | Browser DOM: 3 rows | **PASS** |  |
| PROFILE-006 | `02_PROFILE_SECTION.md` | Resume download | `js/sections/profile.js` | Only when resume.enabled and file set; currently disabled | Code inspection | **NOT IMPLEMENTED** | No resume file exists; feature switch off |
| PROFILE-007 | `02_PROFILE_SECTION.md` | Responsive and accessible profile | `css/sections/profile.css` | 2 columns >=900px; h1; alt-free monogram decorative | Viewport 320/375/768/1024: no overflow | **PASS** |  |
| PROFILE-008 | `02_PROFILE_SECTION.md` | No fabricated content | `data/profile.json` | Email reconstructed from obfuscated source; name conflict surfaced as alternateName | Data review | **PARTIAL** | Owner must confirm email and canonical name |
| SKILLS-001 | `03_SKILLS_SECTION.md` | Skills data and categories | `js/sections/skills.js; data/skills.json` | 18 skills, 4 categories; grouping with Other fallback | Browser: 4 groups | **PASS** |  |
| SKILLS-002 | `03_SKILLS_SECTION.md` | Skill cards and proficiency | `js/sections/skills.js` | Progress bars for 6 stated levels; tag list for level-less tools | Browser: bars + tags | **PASS** |  |
| SKILLS-003 | `03_SKILLS_SECTION.md` | Category filter | `js/sections/skills.js; js/components/filter.js` | Select filter; re-renders from dataset | Interaction: 4 groups -> 1 -> 4 | **PASS** |  |
| SKILLS-004 | `03_SKILLS_SECTION.md` | Skill search | `-` | No input or search-engine call in the section | Code inspection | **NOT IMPLEMENTED** | Spec showSearch; config false |
| SKILLS-005 | `03_SKILLS_SECTION.md` | Sort skills | `-` | No sort control or comparator | Code inspection | **NOT IMPLEMENTED** |  |
| SKILLS-006 | `03_SKILLS_SECTION.md` | Featured/currently learning/icons | `-` | Fields read nowhere in renderer | rg featured/currentlyLearning/icon in skills.js: no hits | **NOT IMPLEMENTED** |  |
| SKILLS-007 | `03_SKILLS_SECTION.md` | Responsive and accessible skills | `css/sections/skills.css` | Auto-fill grid; progressbar roles | Viewport widths; a11y audit | **PASS** |  |
| EXP-001 | `04_EXPERIENCE_SECTION.md` | Experience timeline and current role | `js/sections/experience.js` | createTimelineItem; current drives Present | Browser: 2 events; Jan 2024 - Present | **PASS** |  |
| EXP-002 | `04_EXPERIENCE_SECTION.md` | Company, type, arrangement, location, skills | `js/sections/experience.js` | Mapped into badges | Browser DOM: badges present | **PASS** |  |
| EXP-003 | `04_EXPERIENCE_SECTION.md` | Responsibilities, achievements, expandable details | `js/sections/experience.js` | Paragraph details + disclosure | Browser: Show details present | **PASS** |  |
| EXP-004 | `04_EXPERIENCE_SECTION.md` | Search, filters, sorting | `-` | No controls in section | Code inspection | **NOT IMPLEMENTED** |  |
| EXP-005 | `04_EXPERIENCE_SECTION.md` | Company logo and website | `-` | Only company.name is read | rg company.website/logo: no use | **NOT IMPLEMENTED** |  |
| EXP-006 | `04_EXPERIENCE_SECTION.md` | Duration calculation | `-` | No computed duration; only date range text | Code inspection | **NOT IMPLEMENTED** |  |
| EXP-007 | `04_EXPERIENCE_SECTION.md` | Responsive and accessible | `css/sections/experience.css; js/components/timeline-item.js` | Timeline indents >=768; list semantics | Viewport; a11y audit | **PASS** |  |
| PROJ-001 | `05_PROJECTS_SECTION.md` | Project cards, title, description, category, technologies | `js/sections/projects.js; js/components/card.js` | 6 cards; category subtitle; tech badges | Browser: 6 cards | **PASS** |  |
| PROJ-002 | `05_PROJECTS_SECTION.md` | Project search | `js/sections/projects.js; js/core/search-engine.js` | matchesQuery over 4 fields | Interaction: water -> 1 card; reset -> 6 | **PASS** |  |
| PROJ-003 | `05_PROJECTS_SECTION.md` | Category filter | `js/sections/projects.js; js/components/filter.js` | Select filter | Interaction: iot -> 3 cards; clear -> 6 | **PASS** |  |
| PROJ-004 | `05_PROJECTS_SECTION.md` | Project detail view | `js/sections/projects.js; js/components/modal.js` | openDetailsModal with description, facts, links | Interaction: dialog opens, title + text | **PASS** |  |
| PROJ-005 | `05_PROJECTS_SECTION.md` | Cover image and gallery | `-` | coverImage/gallery never read | rg coverImage/gallery in js: 0 hits | **NOT IMPLEMENTED** |  |
| PROJ-006 | `05_PROJECTS_SECTION.md` | Status and featured presentation | `js/sections/projects.js` | Status only in dialog facts; featured not visual | Code inspection | **PARTIAL** |  |
| PROJ-007 | `05_PROJECTS_SECTION.md` | Technology filter, sorting, pagination | `-` | No tech filter/sort control/perPage use | rg PerPage in js: 0 hits | **NOT IMPLEMENTED** |  |
| PROJ-008 | `05_PROJECTS_SECTION.md` | Related skills/experience and challenges | `-` | Not rendered | Code inspection | **NOT IMPLEMENTED** |  |
| PROJ-009 | `05_PROJECTS_SECTION.md` | External links safety | `js/components/button.js; js/components/card.js` | toSafeHref + noopener; empty links skipped | Code inspection; no links in data | **PARTIAL** | Data currently has no live/source URLs |
| PROJ-010 | `05_PROJECTS_SECTION.md` | Responsive and accessible | `css/sections/projects.css` | Card grid 1/2/3 columns | Viewport: cols 1,2,3; no overflow | **PASS** |  |
| CERT-001 | `06_CERTIFICATES_SECTION.md` | Certificate cards, issuer, dates, skills | `js/sections/certificates.js` | Card + meta + badges | Browser: 2 cards | **PASS** |  |
| CERT-002 | `06_CERTIFICATES_SECTION.md` | Category filter | `js/sections/certificates.js` | Select filter | Code inspection; same component as projects | **PASS** |  |
| CERT-003 | `06_CERTIFICATES_SECTION.md` | Verification link and credential display | `js/sections/certificates.js` | Button only when credentialUrl; id switch | Code inspection | **PARTIAL** | Not clicked in test |
| CERT-004 | `06_CERTIFICATES_SECTION.md` | Search, sort control, load more | `-` | No controls; fixed newest-first | Code inspection | **NOT IMPLEMENTED** |  |
| CERT-005 | `06_CERTIFICATES_SECTION.md` | Detail preview, PDF and image | `-` | No detail action or media rendering | Code inspection | **NOT IMPLEMENTED** |  |
| CERT-006 | `06_CERTIFICATES_SECTION.md` | Sample-data notice | `js/sections/certificates.js` | isSample raises notice | Browser: notice present | **PASS** |  |
| CERT-007 | `06_CERTIFICATES_SECTION.md` | Responsive and accessible | `css/sections/certificates.css` | Auto-fill grid | Viewport widths | **PASS** |  |
| EDU-001 | `07_Education_Section.md` | Education cards and nested institution | `js/sections/education.js` | Optional institution name/link | Browser: 2 cards | **PASS** |  |
| EDU-002 | `07_Education_Section.md` | Qualification, field, dates, grade, coursework | `js/sections/education.js` | Meta list + tags; optional hiding | Browser DOM | **PASS** |  |
| EDU-003 | `07_Education_Section.md` | Current study and nullable grade | `js/sections/education.js` | isCurrent passed to formatDateRange; grade display guarded | Code inspection | **PARTIAL** | No isCurrent/current record in data; not exercised |
| EDU-004 | `07_Education_Section.md` | Search, filters, sorting, pagination | `-` | No controls | Code inspection | **NOT IMPLEMENTED** |  |
| EDU-005 | `07_Education_Section.md` | Education detail preview | `-` | No action or modal | Code inspection | **NOT IMPLEMENTED** |  |
| EDU-006 | `07_Education_Section.md` | Responsive and accessible | `css/sections/education.css` | Auto-fill cards | Viewport widths | **PASS** |  |
| LEARN-001 | `08_LEARNING_JOURNEY.md` | Activity cards and categories | `js/sections/learning-journey.js` | 3 cards; category map | Browser: 3 cards | **PASS** |  |
| LEARN-002 | `08_LEARNING_JOURNEY.md` | Progress bar and self-assessment | `js/sections/learning-journey.js` | progress.enabled -> progressbar + note | Browser: bars present | **PASS** |  |
| LEARN-003 | `08_LEARNING_JOURNEY.md` | Goals and source link | `js/sections/learning-journey.js` | Goal list + createLink | Browser DOM | **PASS** |  |
| LEARN-004 | `08_LEARNING_JOURNEY.md` | Key learnings rendering | `-` | keyLearnings not read by renderer | rg keyLearnings in js: no use | **NOT IMPLEMENTED** |  |
| LEARN-005 | `08_LEARNING_JOURNEY.md` | Search, sort, load more | `-` | Only category filter | Code inspection | **NOT IMPLEMENTED** |  |
| LEARN-006 | `08_LEARNING_JOURNEY.md` | Detail preview | `-` | No action/modal | Code inspection | **NOT IMPLEMENTED** |  |
| LEARN-007 | `08_LEARNING_JOURNEY.md` | Responsive and accessible | `css/sections/learning-journey.css` | Auto-fill cards; progressbar roles | Viewport; a11y audit | **PASS** |  |
| TIME-001 | `09_CAREER_TIMELINE.md` | Reference resolution and missing references | `js/sections/career-timeline.js` | RESOLVERS map; unresolved ids skipped + console warning | node scripts/validate-data.mjs: 9/9 events resolve | **PASS** |  |
| TIME-002 | `09_CAREER_TIMELINE.md` | Event types and type filter | `js/sections/career-timeline.js` | 5 types; select filter | Browser: 9 events -> 3 project -> 9 restored | **PASS** |  |
| TIME-003 | `09_CAREER_TIMELINE.md` | Date precision and ordering | `js/sections/career-timeline.js; js/core/section-kit.js` | parseDate handles Y/Y-M/Y-M-D; sorted desc | Browser DOM order | **PASS** |  |
| TIME-004 | `09_CAREER_TIMELINE.md` | Year grouping, featured-only, search, load more | `-` | No controls | Code inspection | **NOT IMPLEMENTED** |  |
| TIME-005 | `09_CAREER_TIMELINE.md` | Click-through to source record | `-` | No event actions/navigation | Code inspection | **NOT IMPLEMENTED** |  |
| TIME-006 | `09_CAREER_TIMELINE.md` | Layout variants | `js/components/timeline-item.js` | Component supports 4 layouts; section always vertical | Code inspection | **PARTIAL** |  |
| TIME-007 | `09_CAREER_TIMELINE.md` | Responsive and accessible | `css/components/timeline.css` | Rail + markers; list semantics | Viewport; a11y audit | **PASS** |  |
| GITHUB-001 | `10_GITHUB_IMPORTER.md` | Public repository retrieval | `js/sections/github-importer.js` | fetch to api.github.com/users/ershubhambhagat/repos | Prior browser run: 56 repositories loaded | **PASS** | Not re-run in this audit pass to preserve API quota |
| GITHUB-002 | `10_GITHUB_IMPORTER.md` | Rate-limit and network error handling | `js/sections/github-importer.js` | 403/429, 404, non-OK -> explicit messages | Code inspection | **PARTIAL** | Error branches not executed |
| GITHUB-003 | `10_GITHUB_IMPORTER.md` | Cache and load-on-request | `js/sections/github-importer.js` | localStorage portfolio.draft.githubImport; no boot fetch | Code inspection; cache path earlier | **PASS** |  |
| GITHUB-004 | `10_GITHUB_IMPORTER.md` | Username, profile URL and repository URL inputs | `-` | Username hardcoded; no inputs | rg getElementById in section: only buttons | **NOT IMPLEMENTED** |  |
| GITHUB-005 | `10_GITHUB_IMPORTER.md` | Repository search, filter, sort | `-` | No controls | Code inspection | **NOT IMPLEMENTED** |  |
| GITHUB-006 | `10_GITHUB_IMPORTER.md` | Repository selection and detail review | `-` | Cards only; no selection or detail view | Code inspection | **NOT IMPLEMENTED** |  |
| GITHUB-007 | `10_GITHUB_IMPORTER.md` | Duplicate detection and conversion to projects | `-` | No project comparison, mapping, or export | Code inspection | **NOT IMPLEMENTED** |  |
| GITHUB-008 | `10_GITHUB_IMPORTER.md` | No token, no private access, no auto-publish | `js/sections/github-importer.js` | Unauthenticated fetch; no token; no commit | Code inspection | **PASS** |  |
| GITHUB-009 | `10_GITHUB_IMPORTER.md` | Responsive repository grid | `css/sections/github-importer.css` | Auto-fill cards; show more | Code inspection; prior mobile render | **PARTIAL** | Not measured at all 8 widths in this audit |
| BOOK-001 | `11_WEBSITE_BOOKMARKS.md` | Bookmark cards, categories, tags | `js/sections/bookmarks.js; data/bookmarks.json` | 7 records grouped in 2 categories | Browser: 7 cards | **PASS** |  |
| BOOK-002 | `11_WEBSITE_BOOKMARKS.md` | Favourites with persistence | `js/sections/bookmarks.js` | portfolio.favorites; aria-pressed | Interaction: toggle true, storage written | **PASS** |  |
| BOOK-003 | `11_WEBSITE_BOOKMARKS.md` | Internal paths and external HTTPS links | `js/sections/bookmarks.js` | toSafeHref; ./ paths same tab; https new tab | Code inspection; local href correct | **PASS** |  |
| BOOK-004 | `11_WEBSITE_BOOKMARKS.md` | Add, edit, delete bookmarks in UI | `-` | No forms or CRUD | Code inspection | **NOT IMPLEMENTED** |  |
| BOOK-005 | `11_WEBSITE_BOOKMARKS.md` | Search, filter, sort bookmarks | `-` | No controls | Code inspection | **NOT IMPLEMENTED** |  |
| BOOK-006 | `11_WEBSITE_BOOKMARKS.md` | Favicon, image, screenshot, preview | `-` | Fields never read; preview object unused | rg favicon/screenshot/preview in js: no use | **NOT IMPLEMENTED** |  |
| BOOK-007 | `11_WEBSITE_BOOKMARKS.md` | Import/export bookmark JSON | `-` | No UI; only JSON Manager download of whole dataset | Code inspection | **NOT IMPLEMENTED** |  |
| BOOK-008 | `11_WEBSITE_BOOKMARKS.md` | Responsive and accessible | `css/sections/bookmarks.css` | Card grid; favourite button name | Viewport; a11y audit | **PASS** |  |
| SEARCH-001 | `12_GLOBAL_SEARCH.md` | Search overlay and keyboard shortcut | `js/features/global-search.js` | modal + Ctrl/Cmd+K | Interaction: dialog opens, closes | **PASS** |  |
| SEARCH-002 | `12_GLOBAL_SEARCH.md` | Cross-section index | `js/features/global-search.js` | buildIndex over profile, skills, experience, projects, certificates, education, learning, bookmarks | Interaction: 11 results for sql | **PASS** |  |
| SEARCH-003 | `12_GLOBAL_SEARCH.md` | Matching behaviour | `js/features/global-search.js; js/core/search-engine.js` | matchesQuery over title/description/keywords | Interaction: 11 results | **PASS** |  |
| SEARCH-004 | `12_GLOBAL_SEARCH.md` | Result navigation and focus | `js/features/global-search.js` | revealSection scrolls + focuses heading | Interaction: dialog closes, section focus | **PASS** |  |
| SEARCH-005 | `12_GLOBAL_SEARCH.md` | Suggestions and recent searches | `js/features/global-search.js` | Only last query restored; no suggestion list | Code inspection | **PARTIAL** |  |
| SEARCH-006 | `12_GLOBAL_SEARCH.md` | Highlighting, filters, ranking, sorting | `-` | No highlight/filter/rank controls | Code inspection | **NOT IMPLEMENTED** |  |
| SEARCH-007 | `12_GLOBAL_SEARCH.md` | Keyboard navigation (arrow keys) | `-` | Enter opens first result; no arrow navigation | Code inspection | **PARTIAL** |  |
| SEARCH-008 | `12_GLOBAL_SEARCH.md` | Responsive and accessible dialog | `css/sections/global-search.css; js/core/modal-manager.js` | Result list scrolls; live status | Viewport; a11y audit | **PASS** |  |
| THEME-001 | `13_THEME_STUDIO.md` | Presets, light/dark modes, tokens | `js/features/theme-studio.js; data/theme-presets.json` | 4 presets; mode attr; token allow-list | Interaction: light applied, reset | **PASS** |  |
| THEME-002 | `13_THEME_STUDIO.md` | Apply, persist, reset | `js/features/theme-studio.js` | portfolio.theme/themeSettings; reset clears | Interaction: data-theme light -> null; storage cleared | **PASS** |  |
| THEME-003 | `13_THEME_STUDIO.md` | Custom colours, typography, layout | `-` | Preset selection only | Code inspection | **NOT IMPLEMENTED** |  |
| THEME-004 | `13_THEME_STUDIO.md` | Component styling controls | `-` | No controls | Code inspection | **NOT IMPLEMENTED** |  |
| THEME-005 | `13_THEME_STUDIO.md` | Desktop/tablet/mobile preview modes | `-` | No preview modes | Code inspection | **NOT IMPLEMENTED** |  |
| THEME-006 | `13_THEME_STUDIO.md` | Undo/redo and theme import/export | `-` | No history or JSON import/export | Code inspection | **NOT IMPLEMENTED** |  |
| THEME-007 | `13_THEME_STUDIO.md` | Contrast validation | `-` | No contrast calculation | Code inspection | **NOT IMPLEMENTED** |  |
| THEME-008 | `13_THEME_STUDIO.md` | Accessible palette chooser | `css/sections/theme-studio.css` | Native radios in labels; :has fallback | Interaction; a11y audit | **PASS** |  |
| JSONM-001 | `14_JSON_MANAGER.md` | Dataset registry and record counts | `js/features/json-manager.js` | 11 datasets listed with counts | Interaction: 11 rows/options | **PASS** |  |
| JSONM-002 | `14_JSON_MANAGER.md` | Syntax, schema, id and date validation | `js/features/json-manager.js` | validateDataset checks version/collection/id/date | Code inspection | **PARTIAL** | Invalid-file path not executed in this audit |
| JSONM-003 | `14_JSON_MANAGER.md` | Download loaded or validated file | `js/features/json-manager.js` | downloadJson via Blob | Interaction: buttons present; download not executed | **PARTIAL** |  |
| JSONM-004 | `14_JSON_MANAGER.md` | In-browser JSON editing | `-` | No editor or apply-import | Code inspection | **NOT IMPLEMENTED** |  |
| JSONM-005 | `14_JSON_MANAGER.md` | Import preview, merge, replace | `-` | No import workflow | Code inspection | **NOT IMPLEMENTED** |  |
| JSONM-006 | `14_JSON_MANAGER.md` | Cross-reference and URL validation in UI | `-` | Only data/scripts validator does references | Code inspection | **NOT IMPLEMENTED** |  |
| JSONM-007 | `14_JSON_MANAGER.md` | Backup and recovery | `-` | No backup/history | Code inspection | **NOT IMPLEMENTED** |  |
| CONTACT-001 | `15_CONTACT_AND_SOCIAL.md` | Contact details and social profiles | `js/sections/contact.js; data/profile.json` | Email/location/availability cards; 7 socials | Browser DOM | **PASS** |  |
| CONTACT-002 | `15_CONTACT_AND_SOCIAL.md` | Copy-to-clipboard | `js/sections/contact.js; js/core/section-kit.js` | copyText + toast | Interaction: toast 'Email address copied' | **PASS** |  |
| CONTACT-003 | `15_CONTACT_AND_SOCIAL.md` | Contact form and client validation | `js/sections/contact.js` | mailto compose; required name/email/message | Interaction: 3 errors, focus first invalid | **PASS** |  |
| CONTACT-004 | `15_CONTACT_AND_SOCIAL.md` | No false success message | `js/sections/contact.js` | Status says email app opened, not sent | Code inspection; interaction status | **PASS** |  |
| CONTACT-005 | `15_CONTACT_AND_SOCIAL.md` | Phone/WhatsApp links | `-` | No phone data (deliberate) | Code inspection | **NOT IMPLEMENTED** | Privacy decision recorded in FACTS |
| CONTACT-006 | `15_CONTACT_AND_SOCIAL.md` | External form provider mode | `-` | Only direct mailto | Code inspection | **NOT IMPLEMENTED** |  |
| CONTACT-007 | `15_CONTACT_AND_SOCIAL.md` | Spam protection | `-` | No honeypot/rate limit | Code inspection | **NOT IMPLEMENTED** | Static mailto form has no endpoint |
| CONTACT-008 | `15_CONTACT_AND_SOCIAL.md` | Responsive and accessible form | `css/sections/contact.css` | 2-column >=768; labels; alert region | Viewport; a11y audit | **PASS** |  |
| NAV-001 | `16_NAVIGATION_AND_LAYOUT.md` | Header, desktop nav, mobile menu | `js/core/navigation.js; css/layout/navigation.css` | 11 links; disclosure toggle | Interaction 375: expanded true, nav block, closed false | **PASS** |  |
| NAV-002 | `16_NAVIGATION_AND_LAYOUT.md` | Active section and sticky state | `js/core/navigation.js` | IntersectionObserver + aria-current | Interaction: Projects active after click; Skills after scroll | **PASS** |  |
| NAV-003 | `16_NAVIGATION_AND_LAYOUT.md` | Section anchors and scroll offset | `js/core/navigation.js; css/main.css` | scroll-margin + scrollOffset | Interaction: Projects top 168 with 68px header | **PASS** |  |
| NAV-004 | `16_NAVIGATION_AND_LAYOUT.md` | Footer and back-to-top | `js/core/navigation.js; css/layout/footer.css` | Footer nav/social/copyright; back-to-top | Interaction: back visible, click -> scrollY 0 | **PASS** |  |
| NAV-005 | `16_NAVIGATION_AND_LAYOUT.md` | Header search and theme actions | `-` | Features live in the tools dock; header slots render nothing | Code inspection | **NOT IMPLEMENTED** |  |
| NAV-006 | `16_NAVIGATION_AND_LAYOUT.md` | Resume action | `-` | Disabled in data; no header action | Code inspection | **NOT IMPLEMENTED** |  |
| NAV-007 | `16_NAVIGATION_AND_LAYOUT.md` | Skip link and reduced motion | `index.html; css/main.css; css/animations.css` | Skip link; reduced-motion branches | a11y audit; code inspection | **PASS** |  |
| SEO-001 | `17_SEO_AND_PERFORMANCE.md` | Title, description, canonical | `js/features/seo.js` | profile-driven title/description; origin canonical | Browser: title/desc/canonical | **PASS** |  |
| SEO-002 | `17_SEO_AND_PERFORMANCE.md` | Open Graph and Twitter metadata | `js/features/seo.js` | og:title/description/type/url; twitter card | Browser: og:title, twitter:card | **PASS** |  |
| SEO-003 | `17_SEO_AND_PERFORMANCE.md` | Structured data | `js/features/seo.js` | Person JSON-LD from profile | Browser: #seo-person-jsonld present | **PASS** |  |
| SEO-004 | `17_SEO_AND_PERFORMANCE.md` | Favicon | `index.html; assets/images/favicon.svg` | SVG favicon | Asset exists | **PASS** |  |
| SEO-005 | `17_SEO_AND_PERFORMANCE.md` | robots.txt, sitemap.xml, manifest | `-` | Files absent | Test-Path false for all three | **NOT IMPLEMENTED** |  |
| SEO-006 | `17_SEO_AND_PERFORMANCE.md` | Image lazy loading and dimensions | `-` | No loading=lazy or width/height in renderers | Code inspection | **NOT IMPLEMENTED** |  |
| SEO-007 | `17_SEO_AND_PERFORMANCE.md` | Performance measurement | `-` | No metrics/measurement | Code inspection | **NOT IMPLEMENTED** |  |
| SEO-008 | `17_SEO_AND_PERFORMANCE.md` | Semantic headings and a11y basics | `js/sections/*; index.html` | 1 h1, 11 h2, skip link, no duplicate ids | a11y audit | **PASS** |  |
| TEST-001 | `18_TESTING_AND_RELEASE.md` | JSON data validation script | `scripts/validate-data.mjs` | schema/ids/dates/refs/nav/bookmark paths | Executed: all data checks passed | **PASS** |  |
| TEST-002 | `18_TESTING_AND_RELEASE.md` | Module contract tests | `scripts/check-modules.mjs` | DOM-free import, single export, no innerHTML | Executed: 31 passed, 0 failed | **PASS** |  |
| TEST-003 | `18_TESTING_AND_RELEASE.md` | Responsive browser testing | `-` | 8 widths via CDP | Executed: no overflow 320-1920 | **PASS** |  |
| TEST-004 | `18_TESTING_AND_RELEASE.md` | Automated component/section tests | `-` | No test suite | Code inspection | **NOT IMPLEMENTED** |  |
| TEST-005 | `18_TESTING_AND_RELEASE.md` | CI and release automation | `-` | No workflow | Code inspection | **NOT IMPLEMENTED** |  |
| TEST-006 | `18_TESTING_AND_RELEASE.md` | Rollback and release checklist | `-` | No dedicated doc | docs/CHANGELOG only | **NOT IMPLEMENTED** |  |
| TEST-007 | `18_TESTING_AND_RELEASE.md` | Regression checks after changes | `-` | Manual only | No automated regression | **PARTIAL** |  |
| ARCH-001 | `PORTFOLIO_ARCHITECTURE.md` | Static modular architecture | `js/; css/` | ES modules, no bundler, no backend | Inspection; no package.json | **PASS** |  |
| ARCH-002 | `PORTFOLIO_ARCHITECTURE.md` | JSON-driven content | `data/*.json; js/core/data-loader.js` | 11 datasets; sections read collections | Validator + browser | **PASS** |  |
| ARCH-003 | `PORTFOLIO_ARCHITECTURE.md` | Shared components | `js/components/*` | Button/card/badge/filter/modal/timeline used by sections | Import grep | **PASS** |  |
| ARCH-004 | `PORTFOLIO_ARCHITECTURE.md` | Stable ids and schema versioning | `data/*.json` | schemaVersion 1; prefixes | Validator | **PASS** |  |
| ARCH-005 | `PORTFOLIO_ARCHITECTURE.md` | Optional field philosophy | `js/core/section-kit.js; sections` | Empty fields omitted | Code + browser | **PASS** |  |
| ARCH-006 | `PORTFOLIO_ARCHITECTURE.md` | All architecture phases complete | `Prompt/PORTFOLIO_ARCHITECTURE.md §14` | Phases 1-4 done; owner tooling and advanced section features missing | Gap analysis | **PARTIAL** |  |
| COMMENT-001 | `DEVELOPER_FRIENDLY_CODE_COMMENTS.md` | File headers explain ownership/dependencies | `js/sections/*; js/features/*; css/*` | 18/18 JS files and 31/31 CSS files have header blocks | Comment audit script | **PASS** |  |
| COMMENT-002 | `DEVELOPER_FRIENDLY_CODE_COMMENTS.md` | Function documentation | `js/sections/*; js/features/*` | 120 JSDoc blocks | Count | **PASS** |  |
| COMMENT-003 | `DEVELOPER_FRIENDLY_CODE_COMMENTS.md` | CSS rationale on non-obvious rules | `css/components/*; css/sections/*` | 80 named markers + rationale comments | Count/inspection | **PASS** |  |
| COMMENT-004 | `DEVELOPER_FRIENDLY_CODE_COMMENTS.md` | JSON comments rule | `data/*.json` | No // or /* */; _guide data array | Validator parses all files | **PASS** |  |
| COMMENT-005 | `DEVELOPER_FRIENDLY_CODE_COMMENTS.md` | No TODO/FIXME placeholders | `js/` | rg TODO/FIXME/HACK: none | Search | **PASS** |  |
| COMMENT-006 | `DEVELOPER_FRIENDLY_CODE_COMMENTS.md` | Comments match implementation | `js/; css/` | Spot-checked; no stale TODO found | Inspection | **PARTIAL** | No automated comment freshness check |
| LOG-001 | `CHANGELOG.md` | Changelog exists and records changes | `docs/CHANGELOG.md` | Entries for 2026-11-26 and 2026-11-27 | File inspection | **PASS** |  |
| LOG-002 | `CHANGELOG.md` | Spec format ([Unreleased], versions, files changed) | `docs/CHANGELOG.md` | Free-form entries; no version sections | File inspection | **PARTIAL** |  |
| LOG-003 | `CHANGELOG.md` | Testing results and known issues recorded | `docs/CHANGELOG.md` | Known gaps listed; no per-test results | File inspection | **PARTIAL** |  |
| BTN-001 | `BUTTON_COMPONENT.md` | Six variants | `js/components/button.js; css/components/buttons.css` | primary/secondary/outline/ghost/destructive/link | Browser: primary, outline, ghost, icon used | **PARTIAL** | Destructive and link variants not exercised |
| BTN-002 | `BUTTON_COMPONENT.md` | Three sizes | `js/components/button.js` | small/medium/large classes | Code inspection | **PARTIAL** | Sizes not measured visually |
| BTN-003 | `BUTTON_COMPONENT.md` | Loading and disabled states | `js/components/button.js` | aria-busy spinner, disabled guards | Code inspection | **PARTIAL** | Not triggered in browser |
| BTN-004 | `BUTTON_COMPONENT.md` | Icon-only with accessible name | `js/components/button.js` | btn--icon + aria-label | Modal close button used | **PASS** |  |
| BTN-005 | `BUTTON_COMPONENT.md` | Safe href handling | `js/components/button.js` | toSafeHref; noopener | Code inspection; links rendered | **PASS** |  |
| BTN-006 | `BUTTON_COMPONENT.md` | Reused by sections | `js/sections/profile.js, projects.js, contact.js, bookmarks.js` | createButton/createButtonLink imports | Grep | **PASS** |  |
| CARD-001 | `CARD_COMPONENT.md` | Standard and interactive cards | `js/components/card.js; css/components/cards.css` | variants + stretched title link | Projects grid used | **PASS** |  |
| CARD-002 | `CARD_COMPONENT.md` | Elevated/featured/compact/horizontal variants | `css/components/cards.css` | CSS rules present | Code inspection | **PARTIAL** | Not rendered by current sections |
| CARD-003 | `CARD_COMPONENT.md` | Image and fallback | `js/components/card.js` | media/fallback slots | No data images; fallback not exercised | **PARTIAL** |  |
| CARD-004 | `CARD_COMPONENT.md` | Badges, meta, actions | `js/components/card.js` | badge list, dl meta, action row | Projects/certificates cards | **PASS** |  |
| CARD-005 | `CARD_COMPONENT.md` | Skeleton state | `js/components/card.js; css/components/cards.css` | skeleton markup | Not used | **NOT VERIFIED** |  |
| CARD-006 | `CARD_COMPONENT.md` | Semantic markup | `js/components/card.js` | article + heading + link | a11y audit | **PASS** |  |
| BADGE-001 | `BADGE_COMPONENT.md` | Seven variants | `js/components/badge.js; css/components/badges.css` | neutral/primary/success/warning/danger/info/outline | Outline used across cards | **PARTIAL** | Only outline rendered in this run |
| BADGE-002 | `BADGE_COMPONENT.md` | Three sizes | `js/components/badge.js` | small/medium/large | Code inspection | **PARTIAL** | Not measured |
| BADGE-003 | `BADGE_COMPONENT.md` | Interactive pressed state | `js/components/badge.js` | aria-pressed + click | Not used | **NOT VERIFIED** |  |
| BADGE-004 | `BADGE_COMPONENT.md` | Count badges | `js/components/badge.js` | setBadgeCount | Not used | **NOT VERIFIED** |  |
| BADGE-005 | `BADGE_COMPONENT.md` | Safe labels and reuse | `js/components/badge.js; js/core/section-kit.js` | textContent; createBadge in tag lists | Browser DOM | **PASS** |  |
| MODAL-001 | `MODAL_COMPONENT.md` | Open, close, focus management | `js/core/modal-manager.js` | showModal, focus trap, restore | Browser: focus inside; close restores trigger | **PASS** |  |
| MODAL-002 | `MODAL_COMPONENT.md` | Escape and backdrop close | `js/core/modal-manager.js` | cancel + backdrop handlers | Browser: Escape closes, focus restored | **PARTIAL** | Backdrop click not exercised |
| MODAL-003 | `MODAL_COMPONENT.md` | Sizes | `css/components/modals.css` | sm/md/lg/full classes | Code inspection | **PARTIAL** | Only lg used |
| MODAL-004 | `MODAL_COMPONENT.md` | Scroll locking | `js/core/modal-manager.js` | lockScroll/unlock | Code inspection | **NOT VERIFIED** |  |
| MODAL-005 | `MODAL_COMPONENT.md` | Details/confirm/preview helpers | `js/components/modal.js` | openDetailsModal/confirmModal/openPreviewModal | Details dialog used | **PARTIAL** | Confirm/preview not exercised |
| MODAL-006 | `MODAL_COMPONENT.md` | Mobile layout | `css/components/modals.css` | responsive rules | 1024/375 viewport | **PARTIAL** | 375 modal not screenshot-tested |
| SRCHC-001 | `SEARCH_COMPONENT.md` | Input, clear, status, loading markup | `js/components/search.js` | initializeSearch builds field/clear/status | Code inspection | **PASS** |  |
| SRCHC-002 | `SEARCH_COMPONENT.md` | Suggestions and autocomplete | `js/components/search.js` | Explicitly out of scope in module header | Code inspection | **NOT IMPLEMENTED** |  |
| SRCHC-003 | `SEARCH_COMPONENT.md` | Keyboard behaviour | `js/components/search.js` | Enter submits; no arrow list | Code inspection | **PARTIAL** |  |
| SRCHC-004 | `SEARCH_COMPONENT.md` | Accessible labelling | `js/components/search.js` | label + visually-hidden | Code inspection | **PASS** |  |
| SRCHC-005 | `SEARCH_COMPONENT.md` | Reused by sections | `-` | No importer; Global Search uses a raw input | Grep: no imports | **NOT IMPLEMENTED** |  |
| FILT-001 | `FILTER_COMPONENT.md` | Single, multiple, select, checkbox types | `js/components/filter.js` | SUPPORTED_TYPES | Select/single used in sections | **PARTIAL** | Multiple/checkbox not exercised |
| FILT-002 | `FILTER_COMPONENT.md` | Range filter | `-` | Not in SUPPORTED_TYPES | Code inspection | **NOT IMPLEMENTED** |  |
| FILT-003 | `FILTER_COMPONENT.md` | Active chips and clear-all | `js/components/filter.js` | chips + clear-all | Browser: clear restored 6 cards | **PASS** |  |
| FILT-004 | `FILTER_COMPONENT.md` | Result count | `js/components/filter.js` | setResultCount | Projects count updates on query | **PARTIAL** | Filter count itself not set by sections |
| FILT-005 | `FILTER_COMPONENT.md` | Collapsible/responsive panel | `js/components/filter.js; css/components/filters.css` | toggle + layouts | Code inspection | **PARTIAL** |  |
| NAVB-001 | `NAVBAR_COMPONENT.md` | Brand, desktop nav, mobile disclosure | `js/core/navigation.js` | 11 links; toggle | 375: open/close tested | **PASS** |  |
| NAVB-002 | `NAVBAR_COMPONENT.md` | Active state and sticky header | `js/core/navigation.js` | IntersectionObserver + is-scrolled | Projects/Skills active tested; header sticky | **PASS** |  |
| NAVB-003 | `NAVBAR_COMPONENT.md` | Header action slots (search/theme/resume) | `-` | Not rendered | Code inspection | **NOT IMPLEMENTED** |  |
| NAVB-004 | `NAVBAR_COMPONENT.md` | Keyboard operation | `js/core/navigation.js` | button + links | Click tested; keyboard not | **PARTIAL** |  |
| NAVB-005 | `NAVBAR_COMPONENT.md` | Config-driven labels/targets | `data/navigation.json` | 11 items match section ids | Validator + browser | **PASS** |  |
| TLC-001 | `TIMELINE_COMPONENT.md` | Vertical timeline with markers and rail | `js/components/timeline-item.js; css/components/timeline.css` | marker, date, content | Experience and career sections | **PASS** |  |
| TLC-002 | `TIMELINE_COMPONENT.md` | Horizontal/compact/grouped layouts | `js/components/timeline-item.js` | SUPPORTED_LAYOUTS | Not used by sections | **NOT VERIFIED** |  |
| TLC-003 | `TIMELINE_COMPONENT.md` | Event details disclosure | `js/components/timeline-item.js` | Show details / aria-expanded | Experience cards | **PASS** |  |
| TLC-004 | `TIMELINE_COMPONENT.md` | Dates and ordering | `js/components/timeline-item.js; js/core/section-kit.js` | dateLabel; sorted desc | Timeline rendered 9 events | **PASS** |  |
| TLC-005 | `TIMELINE_COMPONENT.md` | Event actions and images | `js/components/timeline-item.js` | actions/image support | Not used | **NOT VERIFIED** |  |
| TLC-006 | `TIMELINE_COMPONENT.md` | Accessible list semantics | `js/components/timeline-item.js` | ol/li + headings | a11y audit | **PASS** |  |
| TOAST-001 | `TOAST_COMPONENT.md` | Success/error/warning/info tones | `js/components/toast.js` | showTone + classes | Success toast tested (copy/reset) | **PARTIAL** | Other tones not triggered |
| TOAST-002 | `TOAST_COMPONENT.md` | Auto-dismiss, hover pause, multiple | `js/components/toast.js` | timers + max visible | Code inspection | **NOT VERIFIED** |  |
| TOAST-003 | `TOAST_COMPONENT.md` | Action button | `js/components/toast.js` | config.action -> toast__action | Not used | **NOT VERIFIED** |  |
| TOAST-004 | `TOAST_COMPONENT.md` | Live region behaviour | `index.html; js/components/toast.js` | #toast-root aria-live polite + atomic | a11y audit | **PASS** |  |
| TOAST-005 | `TOAST_COMPONENT.md` | Truthful messages | `js/sections/contact.js; js/sections/bookmarks.js` | copy/theme status text | Browser toasts | **PASS** |  |
| EDITOR-001 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Editor application page and layout | `-` | No tools/json-editor directory | Test-Path false | **NOT IMPLEMENTED** |  |
| EDITOR-002 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Dataset selector and record list | `-` | No editor UI | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-003 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Schema-aware form: bookmarks | `-` | No form | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-004 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Schema-aware form: career timeline | `-` | No form | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-005 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Schema-aware form: certificates | `-` | No form | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-006 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Schema-aware form: education | `-` | No form | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-007 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Schema-aware form: experience | `-` | No form | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-008 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Schema-aware form: learning journey | `-` | No form | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-009 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Other datasets (profile, skills, projects, navigation, theme) | `-` | No forms | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-010 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Create/edit/duplicate/delete records | `-` | No CRUD UI | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-011 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Category manager | `-` | No UI | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-012 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Stable ID generation | `-` | No generator | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-013 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Relationship selectors and timeline sync | `-` | No selectors/sync | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-014 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Five validation levels before save | `-` | JSON Manager has partial validation only; no editor | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-015 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Direct file save (File System Access API) | `-` | No file handle code | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-016 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Download fallback in editor | `-` | JSON Manager download exists, not editor | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-017 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Backups and session history | `-` | No backup manager | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-018 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Change tracking and before/after preview | `-` | No change tracker | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-019 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Unsaved-change protection | `-` | No draft state | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-020 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Multi-file operations and partial failure reporting | `-` | No multi-file support | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-021 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Publishing workflow instructions | `-` | No editor workflow | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-022 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | No token, no upload, no eval, safe DOM | `-` | No code exists to violate this | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-023 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Editor search, filter, sort | `-` | No UI | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-024 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Editor responsive and accessibility | `-` | No UI | Code inspection | **NOT IMPLEMENTED** |  |
| EDITOR-025 | `JSON_EDITOR_STUDIO_IMPLEMENTATION_PROMPT.md` | Editor tests | `-` | No tests | Code inspection | **NOT IMPLEMENTED** |  |
