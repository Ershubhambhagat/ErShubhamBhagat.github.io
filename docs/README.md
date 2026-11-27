# Documentation

> **File:** `docs/README.md`  
> **Created:** 2026-11-27 00:48  
> **Updated:** 2026-11-27 01:28  
> **Purpose:** Index of the documentation set and how to verify the site.

Everything the owner needs to run and maintain the portfolio without reading the
source code first.

| Document | What it answers |
|---|---|
| [DATA-GUIDE.md](DATA-GUIDE.md) | How to edit `data/*.json`: schemas, ids, dates, which records are examples, what is deliberately not published. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the page is assembled: boot order, modules, shared renderer, features, CSS layers, security and accessibility rules, how to verify a change. |
| [COMMENTS.md](COMMENTS.md) | How the code is commented: file headers, function docs, CSS block markers, and the `_guide` convention for JSON. |
| [COVERAGE.md](COVERAGE.md) | Which `Prompt/` specs are implemented, partial or missing, with the concrete gaps. |
| [JSON-EDITOR-PROMPT.md](JSON-EDITOR-PROMPT.md) | A ready-to-paste prompt for the local JSON editor app (add/edit records, validate, write, commit). |
| [audit/](audit/README.md) | The 2026-11-27 implementation audit: summary, traceability matrix, component/editor/integration/report findings. |
| [CHANGELOG.md](CHANGELOG.md) | What this implementation changed, and what is still open. |

Verification scripts (Node 18+, no dependencies):

```powershell
node scripts/validate-data.mjs    # data schemas, ids, dates, references, links
node scripts/check-modules.mjs    # module contract, DOM-free imports, no innerHTML
```

Preview locally from the repository root:

```powershell
python -m http.server 8000
# then open http://127.0.0.1:8000/
```

The site must be served over HTTP, not opened as `file://`, because the sections
are loaded as ES modules and the data as `fetch()` requests.


## Local development

| File | Purpose |
|---|---|
| [`START_LOCAL_TEST.bat`](../START_LOCAL_TEST.bat) | Double-click launcher: finds Python, serves the project on 127.0.0.1, opens the site and the editor. |
| [`tools/json-editor/README.md`](../tools/json-editor/README.md) | How to connect the project folder, edit through forms, validate, save directly or download. |
| [`scripts/start-local.py`](../scripts/start-local.py) | The launcher's real logic: root detection, port selection, readiness check, browser launch. |

## Document register

Every document starts with a File / Created / Updated / Purpose block. Fixed-name audit reports keep their required filenames; new standalone notes should be named `topic_YYYY-MM-DD_HHMM_purpose.md` unless a specification pins the name.

| Document | Created | Updated | Purpose |
|---|---|---|---|
| [`docs/README.md`](README.md) | 2026-11-27 00:48 | 2026-11-27 01:28 | Index of the documentation set and how to verify the site. |
| [`docs/DATA-GUIDE.md`](DATA-GUIDE.md) | 2026-11-27 00:39 | 2026-11-27 00:39 | How to edit data/*.json: schemas, ids, dates, example records, privacy rules. |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | 2026-11-27 00:18 | 2026-11-27 00:18 | How the page is built: boot order, modules, CSS layers, security, accessibility, verification. |
| [`docs/COMMENTS.md`](COMMENTS.md) | 2026-11-27 00:48 | 2026-11-27 00:48 | Comment standard, file-header convention and editing checklist. |
| [`docs/COVERAGE.md`](COVERAGE.md) | 2026-11-27 01:05 | 2026-11-27 01:05 | Document-level coverage of every Prompt/ specification. |
| [`docs/JSON-EDITOR-PROMPT.md`](JSON-EDITOR-PROMPT.md) | 2026-11-27 01:05 | 2026-11-27 01:05 | Ready-to-paste prompt for the local JSON data editor. |
| [`docs/CHANGELOG.md`](CHANGELOG.md) | 2026-11-27 00:18 | 2026-11-27 01:29 | Chronological record of implementation changes and known gaps. |
| [`docs/audit/CROSS_SECTION_INTEGRATION_AUDIT.md`](audit/CROSS_SECTION_INTEGRATION_AUDIT.md) | 2026-11-27 01:26 | 2026-11-27 01:26 | Cross-dataset and cross-section integration results. |
| [`docs/audit/DEVELOPER_COMMENTS_AUDIT.md`](audit/DEVELOPER_COMMENTS_AUDIT.md) | 2026-11-27 01:26 | 2026-11-27 01:26 | Comment coverage, accuracy and stale-comment findings. |
| [`docs/audit/IMPLEMENTATION_AUDIT_SUMMARY.md`](audit/IMPLEMENTATION_AUDIT_SUMMARY.md) | 2026-11-27 01:28 | 2026-11-27 01:29 | Executive audit result, counts, critical and high findings. |
| [`docs/audit/IMPLEMENTATION_REMEDIATION_PLAN.md`](audit/IMPLEMENTATION_REMEDIATION_PLAN.md) | 2026-11-27 01:27 | 2026-11-27 01:27 | Priority-ordered corrections with tests and risks. |
| [`docs/audit/IMPLEMENTATION_TRACEABILITY_MATRIX.md`](audit/IMPLEMENTATION_TRACEABILITY_MATRIX.md) | 2026-11-27 01:24 | 2026-11-27 01:24 | Requirement-by-requirement evidence and status matrix. |
| [`docs/audit/JSON_EDITOR_STUDIO_AUDIT.md`](audit/JSON_EDITOR_STUDIO_AUDIT.md) | 2026-11-27 01:25 | 2026-11-27 01:25 | Dedicated audit of the JSON Editor Studio specification. |
| [`docs/audit/README.md`](audit/README.md) | 2026-11-27 01:28 | 2026-11-27 01:28 | Index of the 2026-11-27 implementation audit reports. |
| [`docs/audit/SHARED_COMPONENT_AUDIT.md`](audit/SHARED_COMPONENT_AUDIT.md) | 2026-11-27 01:25 | 2026-11-27 01:25 | Audit of the nine shared component specifications. |
| [`docs/audit/TEST_EXECUTION_REPORT.md`](audit/TEST_EXECUTION_REPORT.md) | 2026-11-27 01:27 | 2026-11-27 01:27 | Commands, viewport results, interactions and testing limits. |
