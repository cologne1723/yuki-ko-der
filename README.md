# yukicoder Korean Translator

A Firefox-first browser extension that adds Korean translations to
[yukicoder](https://yukicoder.me/).

Chrome support is planned where the WebExtensions APIs are compatible.

## Development

The fixed Japanese UI strings and their Korean translations live in
`translations/ko.json`. Every entry specifies both a CSS selector and an exact
source string. For example, `トップページ` is translated only in its sidebar
menu link, not everywhere it happens to appear.

To try the extension in Firefox:

1. Open `about:debugging`.
2. Select **This Firefox**.
3. Select **Load Temporary Add-on**.
4. Choose this repository's `manifest.json`.

## Goals

- Translate yukicoder's Japanese interface and problem content into Korean.
- Prefer native Firefox WebExtension behavior.
- Keep the extension compatible with Chrome where practical.
- Preserve code, formulas, examples, and competitive-programming terminology.
