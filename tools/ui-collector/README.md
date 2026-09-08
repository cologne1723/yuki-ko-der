# Independent yukicoder UI collector

This is a private, standalone Chrome/Firefox extension for collecting structural
evidence of Japanese text that remains visible on `https://yukicoder.me/*`.
It has its own manifest, permissions, IndexedDB database, popup, report page, and
export worker. It does not import or modify the Korean translator.

Recording starts disabled. Open the extension popup on the selected yukicoder tab,
choose **Start recording**, and use **Capture now** when a short-lived state needs
to be saved. The collector follows that tab across navigation while it remains on
the allowed origin. Pause ends observation; **Open report** shows committed data.

The collector stores only Japanese text candidates, structural locators, rendered
HTML snapshots, control state, and event metadata. It never records keystrokes,
typed values, passwords, or form contents. Snapshot previews run in a sandboxed
iframe and external loads, scripts, executable attributes, embedded documents, and
editable field contents are removed. Canvas text, cross-origin frames, and states
that disappear before a capture are outside v1 coverage.

Build and test from this directory:

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

`build` reads `translations/ko.messages.json` and every page dictionary only to
derive selector/message-ID scopes. It writes a deterministic hash into the built
extension and every session manifest. The generated package is private and has no
publish command.

When a rebuilt dictionary changes its hash, resuming recording finishes pending
captures and atomically completes the old session and starts a linked successor.
Matching dictionaries continue the same session. Predecessor/successor links keep
retries and background restarts on the same successor, and navigation uses that
session's tab ownership. A failed rotation leaves recording paused and retryable;
historical captures keep their original dictionary metadata. The recorded collector
version comes from the build manifest.

The export is one ZIP per session. Its root contains `manifest.json`, `report.md`,
`findings.jsonl`, `occurrences.jsonl`, `events.jsonl`, `captures/*.json`, and
deduplicated `html/<sha256>.html` snapshots.

Install Chrome from repository `dist/collector/chrome/` using Load unpacked. In Firefox,
use about:debugging → This Firefox → Load Temporary Add-on and select
repository `dist/collector/firefox/manifest.json`. Archives are in repository
`dist/archives/collector/`. The ordinary translator and collector install independently.

All durable writes occur in the collector background context. Content scripts and
the report use the validated message gateway. Complete pending captures, committed
records, retry keys and counters live in IndexedDB. Export selects a committed
cutoff and retains stored data. Report/export bundles travel over an authenticated
extension port in bounded chunks, including collections larger than Chrome's
64 MiB message limit. Disconnects fail the transfer instead of exporting partial
data. Explicit deletion stops the associated tab, waits for in-flight captures,
and clears its session so recording can start again.
Legacy records remain stored; incomplete records are not verified captures.

The 100 MiB logical limit counts all stored record types across sessions,
including complete pending captures. Each session reserves 1 KiB within that
limit for failure reporting, so reaching capacity can persist the failure and
pause without deleting captured evidence. Snapshots are limited to 5 MiB.

Snapshots are structural evidence. External assets are not bundled, so offline
rendering is not pixel-perfect. Event proximity is temporal context, not causation.
Observations cannot establish whether the translator is enabled or finished.
Nearby context uses at most 160 characters of visible Japanese heading text from
the same section before the observation. It excludes editable contents, hidden
headings, other sections and later headings; it is absent when none qualifies.
Navigation before saving is acknowledged can lose unsaved observations.

Capture scheduling coalesces activity for 250 ms, with a one-second maximum wait.
Mutations and interactions scan their affected subtrees; visibility probes for
known candidate elements also detect CSS-driven reveals elsewhere. Initial,
manual and navigation captures inspect the complete document. Every saved capture
still includes a complete redacted snapshot. Failed subtrees remain pending for
retry, and visibility tracking advances only after successful capture handling.
