# yukicoder Korean Translator

A Manifest V3 browser extension for Firefox and Chrome that adds Korean
translations to [yukicoder](https://yukicoder.me/).

I do not own the original problem statements or other third-party content in
this project. Rights remain with their respective owners. Upon a request from
a content owner or their authorized representative, I will completely delete
the requested content from this project, its GitHub Pages site, and other
distributions under my control. This project is not affiliated with or endorsed
by yukicoder. See [the disclaimer and removal instructions](DISCLAIMER.md).

## Development

The extension translates yukicoder's Japanese interface using the selector-
scoped dictionaries under `translations/ko/`. Wiki translation is limited to
the Wiki home page, beginner guide, and text directly related to using
yukicoder or its Wiki.

Problem statements are edited as MDX (or legacy HTML) sources under
`problem-translations/ko/problems/` and compiled to standalone HTML. The extension validates each document
against the current yukicoder statement before applying it, leaving the
Japanese statement unchanged if validation fails. Problem translations are fetched from
`https://cologne1723.github.io/yuki-ko-der/ko/problems/{number}.html`.
Successful downloads are cached locally; missing or incompatible translations
leave the original statement visible.
HTTP 404 or 410 responses also delete the cached translation, so removed
content is not reused after the extension learns it is unavailable.

Install dependencies and run the checks with:

```sh
pnpm install
pnpm test
pnpm validate:problems
pnpm verify:problems
```

## Human review workbench

Run the local problem-translation reviewer with:

```sh
pnpm review
```

The **UI 용어집 검수** link opens `http://127.0.0.1:4173/ui`. Search UI entries by
Japanese, Korean, or selector and filter by dictionary or review status. Edit a
translation and compare the Japanese and Korean saved-page previews; matching
UI elements are highlighted and unsaved edits appear immediately. The Korean
review UI has a collapsible entry list that remembers its state. Draft entries
use orange dashed outlines, reviewed entries use green outlines, and the selected
entry uses a blue outline. Click a marked element to edit it, or use **수정 위치
보기** and previous/next location controls to find it. A before/after panel and
**수정됨** list labels retain changes made during the current review session. Choose a
snapshot from `tmp/pages/*.html` to inspect another page state. Previews apply
the selected dictionary with common/shared entries, disable scripts and
navigation, and report when no exact match exists. They are saved-page previews,
not a live signed-in session; site styles/images require network access.

**저장** preserves an entry's review status, **승인 후 다음** explicitly marks it
reviewed and advances to the next unreviewed entry within the current filters,
and **미검수로 변경** restores the draft marker. The next entry's saved page is
selected when available, and focus returns to the Korean editor. Use
Ctrl/⌘+Enter to approve and advance, or Ctrl/⌘+S to save and stay. Editing and
the Korean preview are displayed side by side on wider screens; expand
**일본어 원문 함께 보기** when you need the original alongside the translation. Named placeholders
must be retained. Concurrent dictionary changes are rejected to avoid overwrites.
Draft `📝 ` markers remain in dictionary files but are hidden by the extension
and page previews. Rebuild with `pnpm build` and reload the extension to apply
saved UI changes on yukicoder.

Open `http://127.0.0.1:4173/`. The page shows the saved Japanese statement,
rendered Korean translation, and editable Korean HTML source side by side.
Both previews render TeX locally with KaTeX and can be collapsed independently.
Scroll synchronization is off by default and can be enabled from the toolbar;
these display preferences are remembered in the browser.
Problem sources may be either legacy HTML or editable constrained MDX. MDX uses
frontmatter for document metadata, `##` headings for problem sections, fenced
code blocks for input/output formats, and `### Title {file="…"}` sample
headings. A sample ends at the next sample or section heading, so no component
or closing tag is needed. Ordinary newlines compile to `<br>`; no literal
`<br>` is needed. Consecutive non-empty lines remain in one paragraph, while an
empty line starts a new paragraph. Structural HTML, import, export, expression,
or JSX is not accepted. The editor previews compiled HTML live and can switch
to a read-only generated-HTML view.
Korean wording and notation follow
[`problem-translations/TRANSLATION_GUIDELINE.md`](problem-translations/TRANSLATION_GUIDELINE.md)
regardless of the Japanese source's writing style.
Editor changes update the Korean preview immediately but reach the repository
only through **Save**, **Approve**, or **Unapprove**. Save and approval require
valid metadata and the exact local Japanese source hash. Formula, sample, code,
attribute, and statement-structure differences are shown individually as
non-blocking warnings with the differing values, so the source can still be
saved and corrected in separate edits.

Problem HTML uses `data-review-status="unreviewed|approved"`. Existing machine
translations display `[기계 번역]` in the document title and `<h3>`; the first
human Save removes that label, while approval remains a separate action.

Compile the publishable problem tree with:

```sh
pnpm build:problems
```

This writes transient HTML-only output to the ignored
`.problem-translations-dist/` directory. GitHub Pages publishes that generated
tree, so neither a checked-in HTML counterpart nor an MDX runtime is needed by
the extension.

To try the extension in Firefox, first run `pnpm build`:

1. Open `about:debugging`.
2. Select **This Firefox**.
3. Select **Load Temporary Add-on**.
4. Choose this repository's `dist/manifest.json`.

## Goals

- Translate yukicoder's Japanese interface and problem content into Korean.
- Prefer native Firefox WebExtension behavior.
- Support Firefox and Chrome with the same extension package.
- Preserve code, formulas, examples, and competitive-programming terminology.

## GitHub Pages deployment

In [repository Pages settings](https://github.com/cologne1723/yuki-ko-der/settings/pages),
select **GitHub Actions** as the build and deployment source. The **Publish
problem translations** workflow validates the live canonical sources, compiles
the problem files, and deploys only `.problem-translations-dist/`. It runs on
relevant pushes to `main` and can also be started manually from **Actions**.

The published index is <https://cologne1723.github.io/yuki-ko-der/>.
The URL in `src/config.ts` and the exact GitHub Pages host in `manifest.json`
must stay in sync if the repository moves. GitHub Pages serves public files
with CORS enabled, allowing Firefox and Chrome content scripts to fetch them.
Only translated HTML is downloaded; executable extension code and UI
dictionaries are bundled in the extension. No review workbench or downloaded
Japanese corpus is published.

## Install and publish the extension

Run `pnpm package` to build `dist/` and create
`web-ext-artifacts/yukicoder-ko-0.1.0.zip` (requires the `zip` command).
The ZIP has `manifest.json` at its root. Each successful **Quality** workflow
also provides a **yukicoder-ko-extension** artifact containing the same build.

- **Firefox development:** load `dist/manifest.json` using the temporary add-on
  steps above. Temporary installations disappear when Firefox restarts.
- **Chrome development:** open `chrome://extensions`, enable **Developer mode**,
  choose **Load unpacked**, and select `dist/`.
- **Firefox distribution:** submit the ZIP through
  [Mozilla Add-on Developer Hub](https://addons.mozilla.org/developers/) for
  signing and listed or unlisted distribution.
- **Chrome distribution:** upload the ZIP to the
  [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

Grant access to yukicoder and the configured Pages host when the browser asks.
Visit a translated problem, such as <https://yukicoder.me/problems/no/1>, to
check loading. Source or protected-structure mismatches intentionally preserve
the Japanese statement and log a diagnostic in the browser console.

Store publication requires your developer account, listing details, and review;
a GitHub Pages deployment does not publish the extension to either store.
Increment `version` in both `package.json` and `manifest.json` for new releases.
See [PRIVACY.md](PRIVACY.md) for the extension's network and storage behavior.
