# Problem translation instructions

- Follow `problem-translations/TRANSLATION_GUIDELINE.md` for every Korean problem
  translation. Its Korean style, terminology, TeX, number-formatting, typo, and
  constraint-organization rules take precedence over the source text's style,
  never over its meaning.
- `problemNo` is the public number (`No` in the source index), used in filenames and `/problems/no/{problemNo}`. `problemId` is the internal ID (`ProblemId`), used in `/api/v1/problems/{problemId}` and `/problems/{problemId}`. Look up metadata by exact `No`, never by a text search that can match `ProblemId`, and copy the ID and source title from that same record. Never substitute one identifier for the other.
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
- Problem translations never use `📝 `. New review writes store independent
  decisions in separate frontmatter fields: `humanReview: null` and
  `machineReview: unreviewed`. `humanReview` is `null` (no decision), `approved`, or `unreviewed` (explicitly not approved);
  `machineReview` is `approved` or `unreviewed`. A human decision always overrides the
  machine decision, including an explicit human cancellation of machine approval.
- Legacy scalar statuses remain readable: `approved` means human approval,
  `unreviewed` and `machine` mean no recorded human decision.
  None of these implies machine approval. Review saves migrate to the independent format.
- Only human approval removes the public machine-translation notice. Machine
  approval remains visibly distinct from human approval. Saving edited translation
  content resets both reviews; saving unchanged content preserves both decisions.
- Machine review is a semantic review, not compilation or lint success. Record an
  actual review with `pnpm review:machine --problem NUMBER --revision SHA256 --status approved`.
  The revision is the SHA-256 of the exact MDX source that was reviewed. Use
  `--status unreviewed` to clear machine approval. This command preserves human
  decisions and rejects stale revisions; it does not perform a review itself.
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
