import test from "node:test";
import assert from "node:assert/strict";

import {
  isUnknownReference,
  referenceKind,
  referenceLabel,
  referenceOptions
} from "../../../tools/json-editor/js/references.js";

const projectsDataset = { key: "projects", collection: "projects", labelField: "title", categories: "categories" };
const timelineDataset = { key: "careerTimeline", collection: "events", labelField: "", categories: null };
const skillsDataset = { key: "skills", collection: "skills", labelField: "name", categories: "categories" };

const documents = {
  projects: {
    projects: [
      { id: "project-001", title: "Zeta Dashboard" },
      { id: "project-002", title: "Alpha Parser" }
    ],
    categories: [
      { id: "data", name: "Data" },
      { id: "tools", name: "Tooling" }
    ]
  },
  skills: { skills: [{ id: "skill-001", name: "JavaScript" }, { id: "skill-002", name: "Python" }] },
  experience: { experiences: [{ id: "exp-001", role: "Frontend Engineer" }] },
  certificates: { certificates: [{ id: "cert-001", title: "Cloud Practitioner" }] },
  education: { education: [{ id: "edu-001", qualification: "BSc Computer Science" }] },
  learningJourney: { learningActivities: [{ id: "journey-001", title: "Rust basics" }] }
};

test("referenceKind recognises each reference field and nothing else", () => {
  assert.equal(referenceKind("categoryId", projectsDataset), "category");
  assert.equal(referenceKind("referenceId", timelineDataset), "timeline");
  assert.equal(referenceKind("relatedSkillIds", projectsDataset), "skills");
  assert.equal(referenceKind("relatedProjectIds", projectsDataset), "projects");
  assert.equal(referenceKind("title", projectsDataset), null);
  assert.equal(referenceKind("categoryId", { key: "experience", categories: null }), null);
  assert.equal(referenceKind("", projectsDataset), null);
  assert.equal(referenceKind("categoryId", null), null);
});

test("a category field offers the document's categories by name", () => {
  assert.deepEqual(referenceOptions({ key: "categoryId", dataset: projectsDataset, documents }), [
    { value: "data", label: "Data" },
    { value: "tools", label: "Tooling" }
  ]);
});

test("a plain value field offers no options", () => {
  assert.deepEqual(referenceOptions({ key: "title", dataset: projectsDataset, documents }), []);
});

test("relatedSkillIds and relatedProjectIds read their own document", () => {
  assert.deepEqual(
    referenceOptions({ key: "relatedSkillIds", dataset: projectsDataset, documents }).map((option) => option.value),
    ["skill-001", "skill-002"]
  );
  assert.deepEqual(
    referenceOptions({ key: "relatedProjectIds", dataset: projectsDataset, documents }).map((option) => option.label),
    ["Zeta Dashboard", "Alpha Parser"]
  );
});

test("a timeline reference resolves against the dataset its event type points at", () => {
  const experience = referenceOptions({
    key: "referenceId",
    dataset: timelineDataset,
    draft: { type: "experience" },
    documents
  });
  assert.deepEqual(experience, [{ value: "exp-001", label: "Frontend Engineer" }]);

  const certificate = referenceOptions({
    key: "referenceId",
    dataset: timelineDataset,
    draft: { type: "certificate" },
    documents
  });
  assert.deepEqual(certificate, [{ value: "cert-001", label: "Cloud Practitioner" }]);
});

test("retyping an event changes the offered ids, so a stale id cannot survive", () => {
  const draft = { type: "experience" };
  const asExperience = referenceOptions({ key: "referenceId", dataset: timelineDataset, draft, documents });
  const asProject = referenceOptions({
    key: "referenceId",
    dataset: timelineDataset,
    draft: { type: "project" },
    documents
  });

  assert.equal(asExperience.some((option) => option.value === "project-001"), false);
  assert.equal(asProject.some((option) => option.value === "exp-001"), false);
});

test("an unknown or missing event type offers nothing instead of guessing", () => {
  assert.deepEqual(
    referenceOptions({ key: "referenceId", dataset: timelineDataset, draft: { type: "nonsense" }, documents }),
    []
  );
  assert.deepEqual(referenceOptions({ key: "referenceId", dataset: timelineDataset, documents }), []);
});

test("a document that was never loaded yields no options and no throw", () => {
  assert.deepEqual(referenceOptions({ key: "categoryId", dataset: projectsDataset, documents: {} }), []);
  assert.deepEqual(referenceOptions({ key: "relatedSkillIds", dataset: projectsDataset }), []);
});

test("options skip records without a usable id and drop duplicates", () => {
  const local = {
    projects: {
      projects: [
        { id: "project-001", title: "One" },
        { title: "no id" },
        { id: "", title: "empty id" },
        { id: "project-001", title: "One again" }
      ],
      categories: []
    }
  };
  assert.deepEqual(referenceOptions({ key: "relatedProjectIds", dataset: projectsDataset, documents: local }), [
    { value: "project-001", label: "One" }
  ]);
});

test("referenceLabel shows the readable label and falls back to the raw id", () => {
  const options = [{ value: "data", label: "Data" }];
  assert.equal(referenceLabel(options, "data"), "Data");
  // A staged reference to a record that does not exist yet keeps the typed id.
  assert.equal(referenceLabel(options, "pending-01"), "pending-01");
  assert.equal(referenceLabel(options, null), "");
  assert.equal(referenceLabel(null, "data"), "data");
});

test("isUnknownReference flags only a dangling non-empty id", () => {
  const options = [{ value: "data", label: "Data" }];
  assert.equal(isUnknownReference(options, "data"), false);
  assert.equal(isUnknownReference(options, "gone"), true);
  assert.equal(isUnknownReference(options, ""), false);
  assert.equal(isUnknownReference(options, null), false);
});
