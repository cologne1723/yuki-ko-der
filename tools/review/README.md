# Translation review

Owner: `translation-review`. Run `pnpm review` from the repository, or
`pnpm --dir /path/to/repository review` from elsewhere. It builds editor assets,
then serves problem review at `/` and UI dictionaries at `/ui` on
`http://127.0.0.1:4173`. `YUKICODER_REVIEW_PORT` overrides the port.

Open **Tools and settings** at `/tools` to download problem originals, UI previews,
or both. Select numbers/ranges or all problems; enable refresh to check already
saved originals. The problem editor also provides **Refresh original** beside
missing/stale-source notices. Both editors have contextual audit menus.

The tools page runs saved/live problem audits, validation, lint, UI coverage and
context checks. For an HTML translation audit, choose a saved page or upload HTML,
then select dictionaries or upload fixtures. Fixtures remain read-only. Legacy
problem conversion first produces a validated preview; explicitly save to replace
that repository HTML with MDX. External uploads only produce downloadable MDX.
Conversion preserves review status and exact sample data and refuses stale saves.
Interrupted conversions resume only when both source hashes still match; conflicting
files are preserved and reported for inspection.

One worker task runs at a time. Progress, per-item failures and results persist
under `<data-dir>/reports/review-tasks/`. Cancel stops remaining work; retry keeps
completed downloads. The shared navigation reconnects to an active task after
reloading. SQLite ownership prevents a second server from launching another worker
or changing its live status. Abandoned work is marked interrupted. Corrupt history
entries are preserved and reported for inspection without preventing new tasks.
Results become stale when their translation or saved-source inputs change. Tasks use saved files and preserve unsaved editor text; results for
another selected problem cannot replace the current preview.

Settings show the active data folder and the saved next-start folder. Changes apply
when the server restarts and never move/delete existing data. CLI `--data-dir`
overrides the saved repository-local preference, then the default repository `data/`.
Relative paths resolve from the repository. Startup can recover interrupted explicit
saves and conversions; new downloads and conversions require an explicit action.
Saving removes machine labels without approval. Approval is explicit; changing
problem source or UI wording returns it to unreviewed.

CLI equivalents are documented in [the audit package](../audit/README.md).
Builds, tests, packaging, server startup/port selection, formatting and Git hooks
remain terminal commands.

`pnpm --filter translation-review build`, `test`, `typecheck`, and `review:smoke`
are supported package checks. Writes require loopback/same-origin requests and
revisions; ordinary request bodies are capped at 8 MiB. Frontend saves track their originating
problem/revision. The interface uses React, Mantine components, React Router navigation guards,
and TanStack Query for requests and task polling. CodeMirror uses its React adapter.
CodeMirror and KaTeX remain browser dependencies. Zod schemas run without dynamic
code generation, so the strict CSP needs no unsafe eval or validator build plugin.

## Collector ZIP imports

Use **ZIP 가져오기** in the navigation to upload one or more collector ZIPs.
The imported review view opens a translation task beside the collection list. Save a draft, explicitly approve and advance, defer, exclude,
or restore a task in the same screen. Filters expose unresolved and excluded
observations without deleting evidence. `/collections` redirects to this view.

Imports and progress persist under `<data-dir>/collections/`. Identical archives
reuse their evidence and progress; different exports remain separate evidence.
Repeated observations of a confirmed definition share a task. Current source,
variables and selector context determine links; recorded message IDs never grant
approval. Unresolved scopes remain marked for inspection. Ordinary verified items
need no CSS or dictionary-file input. Importing does not write translations.

Deleting a collection leaves translations and other collections intact. The original
ZIP is never moved or edited. No archive is imported automatically at startup.
The original glossary links and problem editor remain available.

Version-1 archives must include the manifest, report, JSONL records, captures and
referenced HTML snapshots. Imports verify record relationships, counts, CRCs and
snapshot SHA-256 hashes before publishing atomically. Uploads are limited to
128 MiB, expanded contents to 256 MiB, entries to 100,000 and each snapshot to
5 MiB. ZIP64, multipart/encrypted archives and unsupported schemas are rejected.
The larger request limit applies only to `POST /api/collections` with
`Content-Type: application/zip`. Existing loopback and same-origin checks apply.

Stored raw snapshots are never exposed as HTML routes. The preview route sanitizes
them and sends a restrictive CSP; the imported snapshot carries a restrictive embedded CSP and the editor iframe has no script permission. Scripts,
forms, navigation and network loads are disabled. Styling may differ from the
captured live page. Hash verification checks archive integrity, not authenticity
or the accuracy of its classifications. No arbitrary ZIP files are served.

`GET /api/collections` lists imports; `GET /api/collections/:id` provides records;
`GET /api/collections/:id/snapshots/:hash` serves isolated previews; and
`DELETE /api/collections/:id` removes the imported copy. Invalid archives return
400, unsupported upload content types 415, oversized uploads 413, and missing
imports/snapshots 404. Import returns 201 for a new archive or 200 for a duplicate.

### Imported review state

`GET /api/ui/imports` lists current tasks and the saved selection;
`GET /api/ui/imports/:id` reads a task. `PUT /api/ui/imports/:id` accepts an expected
revision, target and explicit `save-draft | approve | defer | exclude | restore`
action. `PUT /api/ui/imports/selection` saves the selected task and collection.
The task snapshot endpoint derives and highlights the observation's exact locator;
an unresolved locator never highlights a guessed element.

Catalog reads and writes coordinate through SQLite across review servers. A durable
journal recovers interrupted file replacements, preserving conflicting external
edits for inspection. Revision checks protect stale editors. Progress is written
only after the catalog succeeds;
if progress writing fails, reloading derives translation status from the catalog.
Saving edited wording makes it unreviewed; unchanged approved wording keeps its
approval when only usages are added. UI approval metadata is separate from text.

Upload results identify each success, duplicate or failure. Failed saves preserve
input; conflicting navigation is locked while saving, and discarding unsaved edits
requires confirmation. Late snapshots cannot replace another task's context.
Matching is cached independently of wording and approval edits; initial indexing
of a large import can take longer than subsequent reads.

## Tag review

Open **태그 번역** at `/tags` to search original/Korean names or solved.ac keys,
filter by approval status, and edit translations alongside problem counts and
source links. Changes are saved only to `translations/tags/ko.json`.
Saving changed wording resets approval; unchanged saves preserve it. Approval and
withdrawal are explicit actions. Unsaved edits block navigation, and stale or
concurrent saves are rejected without overwriting the draft or the file.
