# Translation audit

Owner: `translation-audit`. Root commands are thin delegates; see
the package commands in `package.json` for every supported entry point.
Run from any directory with `pnpm --dir /path/to/repository <command>`.

For ordinary review, start `pnpm review` and open **Tools and settings**. It provides
downloads, saved/live problem checks, validation, UI coverage/context checks, HTML
fixture audits and conversion previews. The editors also expose relevant actions.
The server and CLI call the same importable operations; HTML actions do not run
shell commands. See [review workflows](../review/README.md).

| HTML action                              | CLI equivalent                                                      |
| ---------------------------------------- | ------------------------------------------------------------------- |
| Download both/problem originals/UI pages | `pnpm run setup`, `--problems-only`, `--pages-only`                 |
| Refresh selected originals               | `pnpm run setup --problems 1,3-8 --refresh`                         |
| Saved/live problem comparison            | `pnpm audit:problems`, `pnpm verify:problems`                       |
| Problem validation/lint                  | `pnpm validate:problems`, `pnpm lint:problems`                      |
| UI validation/coverage/context           | `pnpm validate:ui`, `pnpm audit:ui-pages`, `pnpm audit:ui-contexts` |
| Saved/uploaded HTML and dictionaries     | `pnpm audit:translations PAGE.html DICTIONARY.json…`                |
| Legacy HTML conversion                   | `pnpm convert:problem FILE.html`                                    |

Problem checks accept `--problems 1,3-8`; omit it for all retained translations.
The older `download:problems` and `download:ui-pages` commands remain aliases.
Downloads compare identity, title and exact HTML hash before skipping cached data,
retry requests up to three times, and use a 20-second request/body timeout. Original
activation is serialized across processes with automatic lock release after a crash
and a rollback journal for interrupted HTML/index replacement. Previous and
incompatible revisions remain under `problems-source/revisions/`. An incompatible
upstream revision requires review and never replaces the active expected original.
Downloads never change Korean content, recorded source hashes or approval status.

Failures preserve usable previous data; rerun to retry. Required original failures
produce a nonzero CLI exit. Optional authenticated/unavailable previews remain
non-blocking. UI results link to affected glossary entries. Sample differences are
detailed review warnings; identity/title/hash failures block live verification.

`pnpm run setup --data-dir /path` overrides the saved preference, then repository
`data/`, independently of caller cwd. Use `run setup` when passing flags to avoid
pnpm's built-in setup command parsing them. Relative overrides resolve from the
repository root. Originals live in `problems-source/<public-number>.html`, their
metadata in `index.json`, previews in `pages/`, and reports in `reports/`.
The review settings page saves a next-start preference in ignored
`.review-settings.json`; existing folders are never moved or deleted.
Offline validators do not require downloaded data.

`convert:problem /absolute/path/to/problem.html` is an explicit legacy converter.
It retains exact sample values, TeX, links, raster images, superscripts/subscripts,
lists and ordinary tables. Unsupported markup (including merged table cells and
style-dependent content) fails before the original is replaced. It never approves
translations. Publication HTML is transient output and uses the README notice.
