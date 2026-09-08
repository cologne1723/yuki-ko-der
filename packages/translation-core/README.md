# Translation core

Private shared domain package for catalog rules, page scopes, problem metadata,
Markdown tokens, sample comparison, sanitization/rendering and review status.
Import named subpaths through `translation-core/<module>` using an explicit
`workspace:*` dependency. Node-only file/config/build helpers have their own
modules. Importing this package does not install browser globals, run a translator,
start a server, download anything or write files.

`pnpm --filter translation-core build`, `typecheck`, and `test` are supported.
Schemas use Zod through `translation-core/validation`, configured without dynamic
code generation for extension CSP compatibility. Browser builds need no validator plugin.
