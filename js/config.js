/**
 * js/config.js - application configuration.
 *
 * This module is the single source of truth for the values a developer may
 * need to change without reading any other file: the brand strings, the JSON
 * data locations, the render order of the sections and the feature switches.
 *
 * Why a frozen object and not CSS-like settings scattered around:
 * .build/CONTRACT.md forbids duplicating data paths across modules. Everything
 * that needs a path imports it from here, so renaming a data file is one edit.
 *
 * Intended consumers (all through appContext.config unless noted):
 *   js/app.js (module)       - sectionOrder, features, dataPaths
 *   js/core/data-loader.js   - dataPaths, when loadPortfolioData() is called
 *                              without an explicit override
 *   js/features/seo.js       - name, description
 *   js/features/theme-studio.js - defaultTheme
 *
 * The object is frozen on purpose: a section that mutates configuration at
 * runtime makes the application state impossible to reason about. Customise by
 * editing this file, not by writing to APP_CONFIG from another module.
 */

export const APP_CONFIG = Object.freeze({
  /**
   * Brand name used wherever one canonical label is needed (document title in
   * the SEO feature, aria labels, structured data).
   *
   * Name conflict on record: the old page shows "Shubham Kumar" in the hero
   * (.build/FACTS.md section 1, "Name") while the title tag, the GitHub handle
   * and every social handle use "ErShubhamBhagat". index.html already ships the
   * title/handle form, so this value follows the shell. If the owner picks the
   * other form, change it here and in index.html - nowhere else.
   */
  name: "Er Shubham Bhagat",

  /**
   * Short form for places where the full name would be clipped (narrow nav,
   * toast prefix). Attested as "Shubham" by the old page's blog credit.
   */
  shortName: "Shubham",

  /**
   * Semantic version of the application itself, not of the data. The JSON
   * Manager exports it with every dataset so an imported file can be traced
   * back to the code that produced it.
   */
  version: "1.0.0",

  /**
   * One-sentence summary used by the SEO feature as the meta description
   * fallback when data/profile.json has no headline of its own. Mirrors the
   * description already written into index.html.
   */
  description:
    "Personal portfolio of Er Shubham Bhagat - designer and developer from Bihar, India. Profile, skills, projects, certificates, learning journey and contact.",

  /**
   * Theme applied when a visitor has no stored preference.
   *
   * Must stay "dark": css/variables.css defines the dark palette on :root and
   * index.html carries no data-theme attribute, so "light" here would paint the
   * page before the theme is applied. Theme Studio writes the visitor's choice
   * to localStorage under portfolio.theme and overrides this value.
   */
  defaultTheme: "dark",

  /**
   * Location of every JSON dataset, keyed by the name the rest of the code uses.
   *
   * The eleven keys are pinned by .build/CONTRACT.md. Do not add a twelfth: a
   * section that needs extra records belongs to one of these datasets, and a
   * feature that needs settings reads them from the section data it is given.
   * Paths are relative to index.html, which is the only page that boots the
   * application, so they work unchanged on GitHub Pages project and user sites.
   */
  dataPaths: Object.freeze({
    // Hero and identity block, plus the contact details the Contact section reads.
    profile: "./data/profile.json",

    // Skill groups and individual skills.
    skills: "./data/skills.json",

    // Employment and freelance history.
    experience: "./data/experience.json",

    // Portfolio projects; the GitHub importer compares against these records.
    projects: "./data/projects.json",

    // Certificates with optional image previews.
    certificates: "./data/certificates.json",

    // Degrees and institutions.
    education: "./data/education.json",

    // Dated learning milestones, rendered as a timeline.
    learningJourney: "./data/learning-journey.json",

    // Cross-section timeline events. Each event references a record in another
    // dataset by its stable id (project-001, cert-001, ...).
    careerTimeline: "./data/career-timeline.json",

    // Curated bookmark links shown in the Bookmarks section.
    bookmarks: "./data/bookmarks.json",

    // Navigation labels and hash targets; also used by the footer.
    navigation: "./data/navigation.json",

    // Theme Studio palettes and their token overrides.
    themePresets: "./data/theme-presets.json"
  }),

  /**
   * Order in which sections are initialized, and therefore the order their
   * content appears in.
   *
   * MUST match the <section> order inside main#main-content in index.html and
   * the list in .build/CONTRACT.md. Three other consumers depend on it:
   * navigation.json targets these ids, Global Search scrolls to them and
   * Career Timeline resolves references to them. Reordering this array alone
   * does not move the markup, so keep the two lists identical.
   */
  sectionOrder: Object.freeze([
    "profile",
    "skills",
    "experience",
    "projects",
    "certificates",
    "education",
    "learning-journey",
    "career-timeline",
    "github-importer",
    "bookmarks",
    "contact"
  ]),

  /**
   * Feature switches, read once by js/app.js during boot.
   *
   * Setting a value to false skips that module entirely, so the feature leaves
   * no orphan UI behind: its initializer never runs and its mount point stays
   * empty. All four cross-section features default to true; the two section
   * switches exist because those sections are self-contained add-ons that an
   * owner may want to hide without deleting data.
   */
  features: Object.freeze({
    // Search panel over every loaded dataset (mount #global-search-root).
    globalSearch: true,

    // Theme editor that overrides the design tokens on :root (#theme-studio-root).
    themeStudio: true,

    // Import/export/review of the JSON datasets (#json-manager-root).
    jsonManager: true,

    // Runtime document title, meta description and structured data.
    seo: true,

    // The GitHub importer section: fetches public repositories for preview.
    githubImporter: true,

    // The curated bookmarks section.
    bookmarks: true
  })
});
