/**
 * Component lab fixtures - tools/component-lab/js/lab.js
 *
 * OWNS
 *   - Rendering every shared component exactly once, in every state the
 *     component documents, into the mount points declared by index.html.
 *   - A small set of window.__LAB__ handles so a headless probe can open
 *     dialogs, emit toasts and change filter/timeline state without guessing at
 *     DOM structure.
 *
 * MUST NOT OWN
 *   - Component appearance or behaviour. Every element below is built by the
 *     same module the portfolio uses; if a fixture looks wrong, the component is
 *     wrong, which is the point of the page.
 *   - Data loading. Fixtures are literal objects, so a broken data file cannot
 *     make this page fail for the wrong reason.
 *
 * Run: python -m http.server 8123 --bind 127.0.0.1, then open
 *      http://127.0.0.1:8123/tools/component-lab/index.html
 */

import {
    BADGE_SIZES,
    BADGE_VARIANTS,
    createBadge,
    setBadgeCount
} from "../../../js/components/badge.js";
import {
    BUTTON_SIZES,
    BUTTON_VARIANTS,
    createButton,
    createButtonLink,
    setButtonDisabled,
    setButtonLoading
} from "../../../js/components/button.js";
import { CARD_VARIANTS, createCard, createCardSkeleton } from "../../../js/components/card.js";
import { initializeFilter } from "../../../js/components/filter.js";
import {
    confirmModal,
    createModalButton,
    initializeModal,
    openDetailsModal,
    openPreviewModal
} from "../../../js/components/modal.js";
import { initializeSearch } from "../../../js/components/search.js";
import { initializeTimelineItem } from "../../../js/components/timeline-item.js";
import { initializeToast } from "../../../js/components/toast.js";
import { createImage } from "../../../js/core/section-kit.js";

/** One tracked asset, so the image fixtures never depend on an untracked file. */
const SAMPLE_IMAGE = "../../../favicon.svg";
/** A path that is guaranteed to 404, for the broken-image fallback. */
const MISSING_IMAGE = "./does-not-exist.png";

const mount = (id) => document.getElementById(id);

/**
 * Wraps one fixture with a caption.
 *
 * The caption is a <p> rather than a heading on purpose: the lab's heading
 * outline is the nine component sections, and a heading per state would make the
 * outline useless for the heading-order check it is meant to support.
 */
function fixture(label, node, { stretch = false } = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = stretch ? "lab__fixture lab__stretch" : "lab__fixture";
    wrapper.dataset.labFixture = label;

    const caption = document.createElement("p");
    caption.className = "lab__label";
    caption.textContent = label;

    wrapper.append(caption);

    if (node) {
        wrapper.append(node);
    }

    return wrapper;
}

function row(children) {
    const element = document.createElement("div");
    element.className = "lab__row";
    element.append(...children);
    return element;
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

function renderButtons() {
    const variants = mount("lab-buttons-variants");
    const sizes = mount("lab-buttons-sizes");
    const states = mount("lab-buttons-states");

    if (variants) {
        variants.append(
            fixture(
                "six variants",
                row(
                    BUTTON_VARIANTS.map((variant) =>
                        createButton({
                            label: variant,
                            variant,
                            onClick: () => console.info(`button variant ${variant}`)
                        })
                    )
                )
            )
        );
    }

    if (sizes) {
        sizes.append(
            fixture(
                "three sizes",
                row(
                    BUTTON_SIZES.map((size) =>
                        createButton({ label: `${size} button`, size, variant: "outline" })
                    )
                )
            )
        );
    }

    if (states) {
        const loading = createButton({ label: "Saving", variant: "primary" });
        setButtonLoading(loading, true);

        const disabled = createButton({ label: "Disabled", variant: "secondary" });
        setButtonDisabled(disabled, true);

        const pressed = createButton({
            label: "Toggle loading",
            variant: "ghost",
            onClick: () => {
                const busy = loading.getAttribute("aria-busy") === "true";
                setButtonLoading(loading, !busy);
            }
        });

        const link = createButtonLink({
            label: "Same-origin link",
            href: "../../index.html",
            variant: "link"
        });

        states.append(
            fixture("loading (aria-busy, label kept)", loading),
            fixture("disabled", disabled),
            fixture("icon only", createButton({ ariaLabel: "Dismiss", icon: "×", variant: "ghost" })),
            fixture("destructive", createButton({ label: "Delete", variant: "destructive" })),
            fixture("link variant", link),
            fixture("toggle for the probe", pressed)
        );
    }
}

/* -------------------------------------------------------------------------- */
/* Cards                                                                       */
/* -------------------------------------------------------------------------- */

function sampleCard(variant, extra = {}) {
    return createCard({
        title: `Card — ${variant}`,
        subtitle: "Shared card component",
        description:
            "Every optional area is populated once here so an empty-area regression is visible.",
        category: "Fixture",
        variant,
        headingLevel: 3,
        badges: [
            { label: "Badge", variant: "primary" },
            { label: "Outline", variant: "outline", size: "small" }
        ],
        meta: [{ label: "Updated", value: "2026-11-27" }],
        actions: [{ label: "Open", variant: "secondary", size: "small" }],
        ...extra
    });
}

function renderCards() {
    const variants = mount("lab-cards-variants");
    const media = mount("lab-cards-media");
    const skeletons = mount("lab-cards-skeletons");

    if (variants) {
        variants.append(...CARD_VARIANTS.map((variant) => sampleCard(variant)));
    }

    if (media) {
        media.append(
            fixture(
                "image + reserved size",
                sampleCard("standard", {
                    title: "Card with image",
                    image: { src: SAMPLE_IMAGE, alt: "Site mark", ratio: "wide", width: 512, height: 512 }
                })
            ),
            fixture(
                "broken image removes itself",
                sampleCard("standard", {
                    title: "Card with missing image",
                    image: { src: MISSING_IMAGE, alt: "Missing", ratio: "wide" }
                })
            ),
            fixture("no image leaves no frame", sampleCard("compact", { title: "Card without media" }))
        );
    }

    if (skeletons) {
        skeletons.append(
            createCardSkeleton({ lines: 3, withMedia: true }),
            createCardSkeleton({ lines: 2, withMedia: false })
        );
    }
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                      */
/* -------------------------------------------------------------------------- */

function renderBadges() {
    const variants = mount("lab-badges-variants");
    const sizes = mount("lab-badges-sizes");
    const interactive = mount("lab-badges-interactive");
    const counts = mount("lab-badges-counts");

    if (variants) {
        variants.append(
            fixture(
                "seven variants",
                row(BADGE_VARIANTS.map((variant) => createBadge({ label: variant, variant })))
            )
        );
    }

    if (sizes) {
        sizes.append(
            fixture(
                "three sizes",
                row(BADGE_SIZES.map((size) => createBadge({ label: size, size, variant: "outline" })))
            )
        );
    }

    if (interactive) {
        let pressed = false;
        const toggle = createBadge({
            label: "Filter: React",
            variant: "primary",
            interactive: true,
            pressed,
            onClick: () => {
                pressed = !pressed;
                toggle.setAttribute("aria-pressed", String(pressed));
            }
        });

        const degrades = createBadge({ label: "Interactive without action", variant: "neutral", interactive: true });

        interactive.append(
            fixture("interactive badge (aria-pressed)", toggle),
            fixture("interactive request without handler degrades to span", degrades)
        );
    }

    if (counts) {
        const three = createBadge({ label: "Projects", count: 3, countLabel: "projects" });
        const invalid = createBadge({ label: "Invalid", count: -2, countLabel: "results" });
        const removable = createBadge({ label: "Removable", count: 7, countLabel: "results" });

        counts.append(
            fixture("count badge", three),
            fixture("invalid count is hidden", invalid),
            fixture("setBadgeCount(null) removes the count", removable)
        );

        window.__LAB__.removeCount = () => {
            setBadgeCount(removable, null);
            return removable.querySelector(".badge__count") === null;
        };
    }
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                     */
/* -------------------------------------------------------------------------- */

const FILTER_RECORDS = [
    { id: "r1", name: "React dashboard", category: "frontend", level: 90, tags: ["React", "CSS"], verified: true },
    { id: "r2", name: "SQL reporter", category: "backend", level: 65, tags: ["SQL"], verified: false },
    { id: "r3", name: "Node API", category: "backend", level: 78, tags: ["Node", "SQL"], verified: true },
    { id: "r4", name: "Design tokens", category: "frontend", level: 55, tags: ["CSS"], verified: false },
    { id: "r5", name: "Build scripts", category: "tools", level: 82, tags: ["Node"], verified: true }
];

function filterGroups() {
    return [
        {
            id: "category",
            label: "Category",
            type: "single",
            includeAllOption: true,
            allLabel: "All categories",
            options: [
                { value: "frontend", label: "Frontend" },
                { value: "backend", label: "Backend" },
                { value: "tools", label: "Tools" }
            ]
        },
        {
            id: "tag",
            label: "Technology",
            type: "multiple",
            options: [
                { value: "React", label: "React" },
                { value: "CSS", label: "CSS" },
                { value: "SQL", label: "SQL" },
                { value: "Node", label: "Node" }
            ]
        },
        {
            id: "verified",
            label: "Verification",
            type: "checkbox",
            options: [{ value: "yes", label: "Verified only" }]
        },
        {
            id: "band",
            label: "Level band",
            type: "select",
            includeAllOption: true,
            allLabel: "Any band",
            options: [
                { value: "low", label: "Below 70" },
                { value: "high", label: "70 and above" }
            ]
        },
        {
            id: "level",
            label: "Level between",
            type: "range",
            min: 0,
            max: 100,
            step: 5,
            unit: "%"
        }
    ];
}

/** Counts the fixture records that match the filter state, so the count is real. */
function countFilterMatches(state) {
    return FILTER_RECORDS.filter((record) => {
        const category = state.category;
        const tag = state.tag;
        const verified = state.verified;
        const band = state.band;
        const level = state.level;

        if (category && category !== "all" && record.category !== category) {
            return false;
        }

        if (Array.isArray(tag) && tag.length > 0 && !tag.some((value) => record.tags.includes(value))) {
            return false;
        }

        if (Array.isArray(verified) && verified.length > 0 && record.verified !== true) {
            return false;
        }

        if (band === "low" && record.level >= 70) {
            return false;
        }

        if (band === "high" && record.level < 70) {
            return false;
        }

        if (level && typeof level === "object") {
            if (Number.isFinite(level.min) && record.level < level.min) {
                return false;
            }

            if (Number.isFinite(level.max) && record.level > level.max) {
                return false;
            }
        }

        return true;
    }).length;
}

function renderFilters() {
    const panel = mount("lab-filter-panel");
    const output = mount("lab-filter-state");
    // Declared before the component is created: the component calls onChange
    // during startup when an initial state is supplied, and a const here would
    // be in its temporal dead zone at that moment.
    let filters = null;

    const report = (label) => (state) => {
        const count = countFilterMatches(state);
        filters?.setResultCount(count, count === 1 ? "record" : "records");

        if (output) {
            output.textContent = `${label}: ${JSON.stringify(state)} → ${count} matching records`;
        }
    };

    filters = initializeFilter(panel, {
        config: { groups: filterGroups() },
        collapsible: true,
        startExpanded: true,
        layout: "vertical",
        heading: "All five group types",
        countNoun: "records",
        onChange: report("immediate")
    });

    const applyPanel = mount("lab-filter-apply");

    if (applyPanel) {
        window.__LAB__.applyFilter = initializeFilter(applyPanel, {
            config: { groups: filterGroups().slice(0, 2) },
            applyMode: "apply",
            layout: "compact",
            heading: "Apply mode",
            onApply: (state) => {
                if (output) {
                    output.textContent = `applied: ${JSON.stringify(state)}`;
                }
            }
        });
    }

    window.__LAB__.filter = filters;

    if (filters) {
        const initial = countFilterMatches(filters.getState());
        filters.setResultCount(initial, "records");

        if (output) {
            output.textContent = `initial: ${JSON.stringify(filters.getState())} → ${initial} matching records`;
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

const SEARCH_SUGGESTIONS = ["React", "Redux", "REST API", "SQL", "Node", "CSS", "Design tokens"];

function renderSearch() {
    const field = mount("lab-search-field");
    const output = mount("lab-search-state");

    const search = initializeSearch(field, {
        label: "Search the fixture list",
        placeholder: "Type re…",
        getSuggestions: (query) => {
            const value = query.trim().toLowerCase();

            if (!value) {
                return [];
            }

            return SEARCH_SUGGESTIONS.filter((item) => item.toLowerCase().includes(value));
        },
        onSuggestionSelect: (suggestion) => {
            if (output) {
                output.textContent = `selected: ${suggestion.value}`;
            }
        },
        onInput: (query) => {
            if (output && query === "") {
                output.textContent = "cleared";
            }
        }
    });

    window.__LAB__.search = search;

    // Size and variant fixtures. They exist because the two vocabularies had
    // drifted apart (the module wrote `search--sm`, the stylesheet styled
    // `search--small`), so every size and four of five variants were inert.
    const sizes = mount("lab-search-sizes");

    if (sizes) {
        for (const size of ["sm", "md", "lg"]) {
            const cell = document.createElement("div");
            cell.className = "lab__fixture";

            const caption = document.createElement("p");
            caption.className = "lab__label";
            caption.textContent = `size ${size}`;

            const host = document.createElement("div");
            host.className = "lab__search-cell";
            host.dataset.labSearchSize = size;

            cell.append(caption, host);
            sizes.append(cell);
            initializeSearch(host, { size, placeholder: `Size ${size}` });
        }
    }

    const variants = mount("lab-search-variants");

    if (variants) {
        for (const variant of ["standard", "outlined", "filled", "compact", "expanded"]) {
            const cell = document.createElement("div");
            cell.className = "lab__fixture";

            const caption = document.createElement("p");
            caption.className = "lab__label";
            caption.textContent = `variant ${variant}`;

            const host = document.createElement("div");
            host.className = "lab__search-cell";
            host.dataset.labSearchVariant = variant;

            cell.append(caption, host);
            variants.append(cell);
            initializeSearch(host, { variant, placeholder: variant });
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Timeline                                                                    */
/* -------------------------------------------------------------------------- */

const TIMELINE_EVENTS = [
    {
        id: "evt-1",
        title: "Started the portfolio rebuild",
        eventType: "project",
        startDate: "2026-02",
        dateLabel: "Feb 2026",
        description: "Rebuilt the site as a static, data-driven page.",
        details: ["No framework", "No build step"],
        badges: ["Featured", "Static"],
        actions: [{ id: "open", label: "View record" }]
    },
    {
        id: "evt-2",
        title: "Completed a SQL course",
        eventType: "certificate",
        dateLabel: "Aug 2025",
        startDate: "2025-08",
        description: "Query design and indexing.",
        badges: ["Verified"],
        image: { src: SAMPLE_IMAGE, alt: "Course mark" }
    },
    {
        id: "evt-3",
        title: "Joined as a frontend intern",
        eventType: "experience",
        startDate: "2024-06",
        endDate: "2024-12",
        dateLabel: "Jun – Dec 2024",
        description: ["Component library work", "Accessibility review"]
    },
    {
        id: "evt-4",
        title: "Learned TypeScript",
        eventType: "learning",
        dateLabel: "2024",
        description: "Types, generics, narrowing."
    }
];

function renderTimelines() {
    const output = mount("lab-timeline-state");

    const onEventAction = (action, event) => {
        if (output) {
            output.textContent = `action "${action.label}" on "${event.title}"`;
        }
    };

    const mounts = [
        ["lab-timeline-vertical", "vertical"],
        ["lab-timeline-horizontal", "horizontal"],
        ["lab-timeline-compact", "compact"]
    ];

    for (const [id, layout] of mounts) {
        const target = mount(id);

        if (target) {
            const heading = document.createElement("p");
            heading.className = "lab__label";
            heading.textContent = `${layout} layout`;
            target.append(heading);

            const controller = initializeTimelineItem(target, {
                events: TIMELINE_EVENTS,
                layout,
                headingLevel: 3,
                onEventAction
            });

            window.__LAB__.timelines = { ...(window.__LAB__.timelines ?? {}), [layout]: controller };
        }
    }

    const grouped = mount("lab-timeline-grouped");

    if (grouped) {
        const heading = document.createElement("p");
        heading.className = "lab__label";
        heading.textContent = "grouped layout";
        grouped.append(heading);

        window.__LAB__.timelines.grouped = initializeTimelineItem(grouped, {
            layout: "grouped",
            headingLevel: 3,
            onEventAction,
            groups: [
                { label: "2026", events: [TIMELINE_EVENTS[0]] },
                { label: "2025", events: [TIMELINE_EVENTS[1]] },
                { label: "2024", events: [TIMELINE_EVENTS[2], TIMELINE_EVENTS[3]] }
            ]
        });
    }
}

/* -------------------------------------------------------------------------- */
/* Modals                                                                      */
/* -------------------------------------------------------------------------- */

function modalContent() {
    const content = document.createElement("div");
    content.className = "lab__stack";

    for (let index = 0; index < 12; index += 1) {
        const paragraph = document.createElement("p");
        paragraph.textContent = `Paragraph ${index + 1}: long enough that the dialog body scrolls, which is what the scroll-lock fixture proves.`;
        content.append(paragraph);
    }

    return content;
}

function renderModals() {
    const controls = mount("lab-modals-controls");
    const output = mount("lab-modal-state");

    const note = (message) => {
        if (output) {
            output.textContent = message;
        }
    };

    const openSize = (size) => {
        const dialog = openDetailsModal({
            title: `Dialog — ${size}`,
            description: "Opened from the component lab.",
            content: modalContent(),
            size,
            footer: [
                createModalButton({
                    label: "Close",
                    variant: "secondary",
                    onClick: () => dialog?.close("cancel")
                })
            ],
            onClose: (reason) => note(`closed ${size}: ${reason}`)
        });

        note(`opened ${size}`);
    };

    if (controls) {
        for (const size of ["sm", "md", "lg", "full"]) {
            controls.append(createButton({ label: `Open ${size}`, variant: "outline", onClick: () => openSize(size) }));
        }

        // Direct createModalButton fixture: the destructive variant emitted
        // "btn--danger", a class with no rule, and rendered as a neutral button.
        const destructive = createModalButton({ label: "Delete record", destructive: true });
        destructive.dataset.labDestructive = "true";
        controls.append(destructive);

        controls.append(
            createButton({
                label: "Confirm",
                variant: "secondary",                onClick: async () => {
                    const answer = await confirmModal({
                        title: "Delete fixture",
                        message: "This removes the sample record.",
                        confirmLabel: "Delete",
                        destructive: true
                    });
                    note(`confirm resolved: ${answer}`);
                }
            }),
            createButton({
                label: "Preview",
                variant: "ghost",
                onClick: () => {
                    openPreviewModal({
                        src: SAMPLE_IMAGE,
                        title: "Preview fixture",
                        alt: "The site mark, shown in the preview dialog",
                        caption: "openPreviewModal fixture"
                    });
                    note("preview opened");
                }
            }),
            createButton({
                label: "Blocking (closable:false)",
                variant: "destructive",
                onClick: () => {
                    const dialog = openDetailsModal({
                        title: "Blocking dialog",
                        description: "Escape and the backdrop must not close this one.",
                        content: modalContent(),
                        closable: false,
                        footer: [
                            createModalButton({
                                label: "Finish",
                                variant: "primary",
                                onClick: () => dialog?.close("done")
                            })
                        ],
                        onClose: (reason) => note(`blocking closed: ${reason}`)
                    });
                    note("blocking opened");
                }
            })
        );
    }

    window.__LAB__.openDialog = openSize;
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                      */
/* -------------------------------------------------------------------------- */

function renderToasts() {
    const controls = mount("lab-toast-controls");
    const output = mount("lab-toast-state");
    const toast = initializeToast();

    const note = (message) => {
        if (output) {
            output.textContent = message;
        }
    };

    if (controls) {
        for (const tone of ["success", "error", "warning", "info"]) {
            controls.append(
                createButton({
                    label: tone,
                    variant: "outline",
                    onClick: () => toast[tone](`${tone} fixture`, { duration: 6000 })
                })
            );
        }

        controls.append(
            createButton({
                label: "Fill the stack",
                variant: "secondary",
                onClick: () => {
                    for (let index = 1; index <= 5; index += 1) {
                        toast.info(`Stack message ${index}`, { duration: 8000 });
                    }
                    note("5 toasts requested; maxVisible should cap the stack at 3");
                }
            }),
            createButton({
                label: "Auto-dismiss (1.5s)",
                variant: "ghost",
                onClick: () => {
                    toast.info("Disappears shortly", { duration: 1500 });
                    note("timer-driven dismissal requested");
                }
            }),
            createButton({
                label: "Clear",
                variant: "ghost",
                onClick: () => {
                    toast.dismissAll();
                    note("stack cleared");
                }
            })
        );
    }

    window.__LAB__.toast = toast;
}

/* -------------------------------------------------------------------------- */
/* Images                                                                      */
/* -------------------------------------------------------------------------- */

function renderImages() {
    const slot = mount("lab-images-slot");

    if (!slot) {
        return;
    }

    const lazy = createImage({
        src: SAMPLE_IMAGE,
        alt: "Lazy fixture",
        width: 64,
        height: 64
    });

    const eager = createImage({
        src: SAMPLE_IMAGE,
        alt: "Eager fixture",
        width: 64,
        height: 64,
        loading: "eager"
    });

    const broken = createImage({ src: MISSING_IMAGE, alt: "Broken fixture", width: 64, height: 64 });

    slot.append(
        fixture("lazy (loading=lazy, width/height)", lazy),
        fixture("eager (loading=eager)", eager),
        fixture("broken source removed on error", broken)
    );
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

window.__LAB__ = {};

initializeModal();
renderButtons();
renderCards();
renderBadges();
renderFilters();
renderSearch();
renderTimelines();
renderModals();
renderToasts();
renderImages();

// A single readiness flag: the probe waits for this instead of a timeout.
document.documentElement.dataset.labReady = "true";
