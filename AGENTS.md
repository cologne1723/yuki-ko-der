# Repository instructions

## Git commits

- Do not create Git commits unless the user explicitly asks for a commit.
- Leave completed changes uncommitted and report them to the user.
- Do not amend, revert, squash, or otherwise rewrite commits without explicit
  user approval.

## Translation review

- All Korean translations require human review.
- Prefix every unreviewed translated message with `📝 ` in the translation
  dictionary. Example: `"target": "📝 검토되지 않은 번역"`.
- Do not remove the `📝 ` prefix unless the user explicitly confirms that the
  translation has been reviewed or the user supplies the reviewed wording.
- Treat existing translations without `📝 ` as human-reviewed; do not alter
  their wording without the user's approval.
- Keep translations selector-scoped and exact-text-matched. Do not translate
  problem descriptions until the user explicitly starts that phase.
- Use named placeholders for dynamic text, with a regex for each variable.
  Never use positional placeholders such as `%d`; named placeholders must allow
  translated text to reorder values safely.

## Problem translations

- Follow `problem-translations/TRANSLATION_GUIDELINE.md` for every Korean problem
  translation. Its Korean style, terminology, TeX, number-formatting, typo, and
  constraint-placement rules take precedence over the source text's style.
- Problem statements live in `problem-translations/ko/problems/`, one source
  file per problem. Prefer editable `{problem-number}.mdx` sources; legacy HTML
  remains supported during migration. Never keep both formats for the same
  problem or introduce per-message JSON files.
- MDX sources use the constrained, non-executable format compiled by
  `src/problem-markdown.ts`. Prefer native Markdown headings and fenced code
  blocks. Samples start with `### Title {file="…"}` and end at the next sample
  heading or section boundary; no closing tag is used. Imports, exports,
  expressions, JSX/components, literal structural HTML, and `<br>` are not
  allowed. Consecutive non-empty Markdown lines belong to one paragraph; only
  an empty line starts a new paragraph.
- Do not check in an HTML counterpart for an MDX problem. The extension and
  GitHub Pages consume HTML compiled transiently by `pnpm build:problems` into
  the ignored `.problem-translations-dist/` directory.
- Preserve the source HTML structure and protected technical content (formulas,
  sample input/output, code, links, images, and attributes), but never copy the
  Japanese statement prose into a draft. Delete Japanese prose before writing a
  complete Korean translation directly from the source meaning; do not use
  word-by-word replacement or phrase-substitution scripts.
- Concise writing must never delete a source sentence or semantic assertion.
  Preserve every condition, exception, possibility, causal relation, and
  explanatory detail. Sentences may be merged and repetition may be reduced
  only when no information is lost.
- Inspect the entire description once, including notes, constraints, output
  explanations, and sample explanations, so no visible sentence is omitted.
- Japanese text may remain only when the problem explicitly requires it as data,
  quoted text, an identifier, or an example; accidental Japanese prose mixed
  into Korean is not acceptable and requires manual review.
- Problem translations never use `📝 `. Generated HTML uses `[기계 번역]` in
  `<title>` and `<h3>`; MDX stores only `reviewStatus`, using `machine`,
  `unreviewed`, or `approved`.
- The first human Save removes `[기계 번역]` but does not approve the file.
  Approval is explicit, and later saves preserve an approved status.
- Do not prefix sections or description lines, and never translate sample
  input/output or code.
- The validator checks review status, public number, internal problem ID, source
  title, and exact canonical HTML SHA-256. Formula, sample, code, attribute, and
  statement-structure differences must be reported as detailed non-blocking
  warnings that name the differing values; never replace them with a generic
  structural-error message. Use `pnpm verify:problems` to compare against the
  live source.
- The Japanese download corpus is stored in `tmp/problems-source/` (ignored by
  Git), with one source HTML file per problem and metadata in `index.json`.
- Problem translations are published through GitHub Pages only after the owner
  and Pages URL are configured. Set `problemTranslationBaseUrl` in
  `src/config.ts` and add that exact origin to `manifest.json` permissions; do
  not use a wildcard origin.

## Checks and formatting

- Run `pnpm test`, `pnpm validate:problems`, and `pnpm verify:problems` as
  appropriate before handing off changes.
- Run `pnpm lint:problems` to catch malformed translated HTML.
- Use Prettier for code and JSON formatting. Run `pnpm format` to fix formatting
  and `pnpm format:check` to check it.
