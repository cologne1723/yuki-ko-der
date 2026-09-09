# Problem translation instructions

- Follow `problem-translations/TRANSLATION_GUIDELINE.md` for every Korean problem
  translation. Its Korean style, terminology, TeX, number-formatting, typo, and
  constraint-organization rules take precedence over the source text's style,
  never over its meaning.
- Problem statements live in `problem-translations/ko/problems/`, one source
  file per problem. Prefer editable `{problem-number}.mdx` sources; legacy HTML
  remains supported during migration. Never keep both formats for the same
  problem or introduce per-message JSON files.
- MDX sources use the constrained, non-executable format compiled by
  `packages/translation-core/src/problem-markdown.ts`. Prefer native Markdown headings and fenced code
  blocks. Samples start with `### Title {file="…"}` and end at the next sample
  heading or section boundary; no closing tag is used. Imports, exports,
  expressions, JSX/components, literal structural HTML, and `<br>` are not
  allowed. Consecutive non-empty Markdown lines belong to one paragraph; only
  an empty line starts a new paragraph.
- Do not check in an HTML counterpart for an MDX problem. The extension and
  GitHub Pages consume HTML compiled transiently by `pnpm build:problems` into
  the ignored `dist/problems/` directory.
- The Korean guideline is the single source of truth for meaning preservation,
  prose, terminology, structure, input/output descriptions, constraints, TeX,
  literal data, and review requirements. Apply its numbered rules to both new
  translations and revisions; do not infer requirements from example problems.
- Write Korean directly from the source meaning. Follow the guideline's rules
  for preserved source-language data and for avoiding phrase-substitution scripts.
- Problem translations never use `📝 `. Generated HTML uses `[기계 번역]` in
  `<title>` and `<h3>`; MDX stores only `reviewStatus`, using `machine`,
  `unreviewed`, or `approved`.
- The first human Save removes `[기계 번역]` but does not approve the file.
  Approval is explicit, and later saves preserve an approved status.
- The validator checks review status, public number, internal problem ID, source
  title, and exact canonical HTML SHA-256. Only sample input/output differences must be reported as detailed non-blocking
  warnings that name the differing values. Do not compare translated prose,
  formulas, headings, non-sample code, attributes, or statement structure.
  The extension must reject altered sample input/output, but allow changed
  formulas and headings and render translated formulas independently.
  Use `pnpm verify:problems` to compare against the live source.
- The Japanese download corpus is stored in `data/problems-source/` (ignored by
  Git), with one source HTML file per problem and metadata in `index.json`.
- Problem translations are published through GitHub Pages only after the owner
  and Pages URL are configured. Set `problemTranslationBaseUrl` in
  `src/config.ts` and add that exact origin to `manifest.json` permissions; do
  not use a wildcard origin.

